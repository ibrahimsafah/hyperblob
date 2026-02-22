// GPU-accelerated metaball hull computation
// Evaluates Gaussian scalar field on GPU, then runs marching squares + triangulation on CPU
// Uses double-buffered readback: dispatch frame N while processing frame N-1's data

import type { GPUContext } from '../gpu/device';
import type { BufferManager } from '../gpu/buffer-manager';
import type { HyperedgeData } from '../data/types';
import type { HullData } from './hull-compute';
import type { Vec2 } from '../utils/math';
import {
  type ScalarGrid,
  marchingSquares as marchingSquaresJS,
  stitchContours,
  chaikinSmooth,
  addBridgeField as addBridgeFieldJS,
  earClipTriangulate,
  fanTriangulateFromCentroid,
} from './metaball-hull';
import {
  addBridgeFieldWasm,
  marchingSquaresWasm,
  loadWasm,
  isWasmReady,
} from '../wasm/metaball-contour-wasm';
import shaderCode from '../shaders/metaball-field.wgsl?raw';

const GRID_SIZE = 64;
const CELLS_PER_EDGE = GRID_SIZE * GRID_SIZE; // 4096

/** Snapshot of state needed to process a readback on the CPU */
interface PendingReadback {
  promise: Promise<Float32Array>;
  gpuEdges: { he: HyperedgeData; points: Vec2[] }[];
  edgeMetas: Float32Array;
  edgeCount: number;
  threshold: number;
  smoothIters: number;
  sigma: number;
}

export class MetaballCompute {
  private gpu: GPUContext;
  private buffers: BufferManager;
  private pipeline: GPUComputePipeline;
  private bindGroupLayout: GPUBindGroupLayout;

  // Persistent buffers (recreated when edge count changes)
  private lastEdgeCount = 0;

  // Pre-allocated params buffer backing
  private paramsBackingBuffer = new ArrayBuffer(16);
  private paramsF32 = new Float32Array(this.paramsBackingBuffer, 0, 1);
  private paramsU32 = new Uint32Array(this.paramsBackingBuffer, 4, 3);
  private paramsView = new Uint8Array(this.paramsBackingBuffer);

  // Double-buffer: pending readback from previous dispatch
  private pending: PendingReadback | null = null;

  constructor(gpu: GPUContext, buffers: BufferManager) {
    this.gpu = gpu;
    this.buffers = buffers;

    const { device } = gpu;

    const module = device.createShaderModule({
      label: 'metaball-field-shader',
      code: shaderCode,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'metaball-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },  // positions
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },  // he_offsets
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },  // he_members
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },  // edge_metas
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },             // grid_out
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },             // params
      ],
    });

    this.pipeline = device.createComputePipeline({
      label: 'metaball-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      compute: { module, entryPoint: 'main' },
    });

    // Create persistent params buffer (16 bytes: sigma, grid_size, edge_count, pad)
    this.buffers.createBuffer(
      'metaball-params', 16,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      'metaball-params',
    );

    // Eagerly attempt WASM load (non-blocking; falls back to JS if it fails)
    loadWasm().catch(() => { /* fallback to JS — no action needed */ });
  }

  /**
   * Double-buffered metaball computation:
   * 1. If there's a pending readback from last call, process it (CPU marching squares)
   * 2. Dispatch new GPU work and start async readback (non-blocking)
   * 3. Return the results from step 1 (or empty on first call)
   */
  async computeMetaballHulls(
    positions: Float32Array,
    hyperedges: HyperedgeData[],
    margin: number,
    threshold: number,
    smoothIters: number,
  ): Promise<HullData[]> {
    // ── Phase 1: Process previous frame's readback (if any) ──
    const previousResults = this.pending
      ? await this.processPendingReadback(this.pending)
      : [];

    // ── Phase 2: Dispatch new GPU work ──
    this.pending = this.dispatchNewFrame(positions, hyperedges, margin, threshold, smoothIters);

    return previousResults;
  }

  /** Dispatch GPU field computation and start non-blocking readback */
  private dispatchNewFrame(
    positions: Float32Array,
    hyperedges: HyperedgeData[],
    margin: number,
    threshold: number,
    smoothIters: number,
  ): PendingReadback | null {
    // Filter to edges with 2+ members (singletons don't need hulls)
    const gpuEdges: { he: HyperedgeData; points: Vec2[] }[] = [];
    const sigma = Math.max(margin, 5);

    for (const he of hyperedges) {
      if (he.memberIndices.length < 2) continue;

      const points: Vec2[] = [];
      for (const ni of he.memberIndices) {
        points.push([positions[ni * 4], positions[ni * 4 + 1]]);
      }
      gpuEdges.push({ he, points });
    }

    if (gpuEdges.length === 0) return null;

    // ── CPU: compute bounding boxes & edge metadata ──
    const edgeCount = gpuEdges.length;
    const edgeMetas = new Float32Array(edgeCount * 4);

    for (let i = 0; i < edgeCount; i++) {
      const pts = gpuEdges[i].points;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
      }
      const padding = sigma * 3;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;
      const maxDim = Math.max(maxX - minX, maxY - minY, 1);
      const cellSize = maxDim / GRID_SIZE;

      edgeMetas[i * 4 + 0] = minX;
      edgeMetas[i * 4 + 1] = minY;
      edgeMetas[i * 4 + 2] = cellSize;
      edgeMetas[i * 4 + 3] = 0;
    }

    // ── GPU: allocate/resize buffers ──
    if (edgeCount !== this.lastEdgeCount) {
      this.buffers.createBuffer(
        'metaball-edge-metas',
        edgeCount * 4 * 4,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        'metaball-edge-metas',
      );
      this.buffers.createBuffer(
        'metaball-grid-out',
        edgeCount * CELLS_PER_EDGE * 4,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        'metaball-grid-out',
      );
      this.lastEdgeCount = edgeCount;
    }

    // Upload edge metadata
    this.buffers.uploadData('metaball-edge-metas', edgeMetas);

    // Write params (reuse pre-allocated backing buffer)
    this.paramsF32[0] = sigma;
    this.paramsU32[0] = GRID_SIZE;
    this.paramsU32[1] = edgeCount;
    this.paramsU32[2] = 0;
    this.buffers.uploadData('metaball-params', this.paramsView);

    // ── GPU: dispatch ──
    const totalThreads = edgeCount * CELLS_PER_EDGE;
    const workgroups = Math.ceil(totalThreads / 256);

    const bindGroup = this.gpu.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.buffers.getBuffer('node-positions') } },
        { binding: 1, resource: { buffer: this.buffers.getBuffer('he-offsets') } },
        { binding: 2, resource: { buffer: this.buffers.getBuffer('he-members') } },
        { binding: 3, resource: { buffer: this.buffers.getBuffer('metaball-edge-metas') } },
        { binding: 4, resource: { buffer: this.buffers.getBuffer('metaball-grid-out') } },
        { binding: 5, resource: { buffer: this.buffers.getBuffer('metaball-params') } },
      ],
    });

    const encoder = this.gpu.device.createCommandEncoder({ label: 'metaball-compute' });
    const pass = encoder.beginComputePass({ label: 'metaball-field' });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroups);
    pass.end();
    this.gpu.device.queue.submit([encoder.finish()]);

    // Start async readback (non-blocking — returns promise, doesn't await)
    const gridSize = edgeCount * CELLS_PER_EDGE * 4;
    const promise = this.buffers.readBuffer('metaball-grid-out', gridSize);

    return { promise, gpuEdges, edgeMetas, edgeCount, threshold, smoothIters, sigma };
  }

  /** Process a completed readback: marching squares + triangulation on CPU */
  private async processPendingReadback(pending: PendingReadback): Promise<HullData[]> {
    const { gpuEdges, edgeMetas, edgeCount, threshold, smoothIters, sigma } = pending;
    const results: HullData[] = [];

    const gridData = await pending.promise;

    for (let i = 0; i < edgeCount; i++) {
      const { he } = gpuEdges[i];
      const metaBase = i * 4;
      const originX = edgeMetas[metaBase];
      const originY = edgeMetas[metaBase + 1];
      const cellSize = edgeMetas[metaBase + 2];

      // Use subarray view instead of copying (avoid allocation)
      const gridOffset = i * CELLS_PER_EDGE;
      const values = gridData.subarray(gridOffset, gridOffset + CELLS_PER_EDGE);

      const grid: ScalarGrid = {
        values,
        cols: GRID_SIZE,
        rows: GRID_SIZE,
        originX,
        originY,
        cellSize,
      };

      // Overlay MST bridge field to keep blobs connected when nodes are far apart
      // Use WASM-accelerated version if available, JS fallback otherwise
      if (isWasmReady()) {
        addBridgeFieldWasm(grid, gpuEdges[i].points, sigma);
      } else {
        addBridgeFieldJS(grid, gpuEdges[i].points, sigma);
      }

      const segments = isWasmReady()
        ? marchingSquaresWasm(grid, threshold)
        : marchingSquaresJS(grid, threshold);
      if (segments.length === 0) continue;

      const contours = stitchContours(segments);
      if (contours.length === 0) continue;

      // Pick largest contour by area
      let best = contours[0];
      let bestArea = 0;
      for (const c of contours) {
        let a = 0;
        for (let j = 0; j < c.length; j++) {
          const k = (j + 1) % c.length;
          a += c[j][0] * c[k][1];
          a -= c[k][0] * c[j][1];
        }
        const area = Math.abs(a);
        if (area > bestArea) {
          bestArea = area;
          best = c;
        }
      }

      const smoothed = chaikinSmooth(best, smoothIters);

      let cx = 0, cy = 0;
      for (const p of smoothed) {
        cx += p[0];
        cy += p[1];
      }
      cx /= smoothed.length;
      cy /= smoothed.length;

      // Fast path: fan-triangulation O(n) for star-convex contours
      // Fallback: ear-clip O(n²) for concave bridge tendrils
      const triangles = fanTriangulateFromCentroid(smoothed) ?? earClipTriangulate(smoothed);
      results.push({
        vertices: smoothed,
        centroid: [cx, cy],
        hyperedgeIndex: he.index,
        triangles,
      });
    }

    return results;
  }

  destroy(): void {
    this.pending = null;
    this.buffers.destroyBuffer('metaball-edge-metas');
    this.buffers.destroyBuffer('metaball-grid-out');
    this.buffers.destroyBuffer('metaball-params');
    this.lastEdgeCount = 0;
  }
}

