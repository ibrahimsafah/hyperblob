// GPU-accelerated metaball hull computation
// Evaluates Gaussian scalar field on GPU, then runs marching squares + triangulation on CPU
// Produces HullData[] compatible with the existing hull rendering pipeline

import type { GPUContext } from '../gpu/device';
import type { BufferManager } from '../gpu/buffer-manager';
import type { HyperedgeData } from '../data/types';
import type { HullData } from './hull-compute';
import type { Vec2 } from '../utils/math';
import {
  type ScalarGrid,
  marchingSquares,
  stitchContours,
  chaikinSmooth,
  circlePolygon,
  addBridgeField,
  earClipTriangulate,
} from './metaball-hull';
import shaderCode from '../shaders/metaball-field.wgsl?raw';

const GRID_SIZE = 64;
const CELLS_PER_EDGE = GRID_SIZE * GRID_SIZE; // 4096

export class MetaballCompute {
  private gpu: GPUContext;
  private buffers: BufferManager;
  private pipeline: GPUComputePipeline;
  private bindGroupLayout: GPUBindGroupLayout;

  // Persistent buffers (recreated when edge count changes)
  private lastEdgeCount = 0;

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
  }

  async computeMetaballHulls(
    positions: Float32Array,
    hyperedges: HyperedgeData[],
    margin: number,
    threshold: number,
    smoothIters: number,
  ): Promise<HullData[]> {
    // Filter to non-empty edges and separate singletons
    const gpuEdges: { he: HyperedgeData; points: Vec2[] }[] = [];
    const results: HullData[] = [];

    for (const he of hyperedges) {
      if (he.memberIndices.length === 0) continue;

      const points: Vec2[] = [];
      for (const ni of he.memberIndices) {
        points.push([positions[ni * 4], positions[ni * 4 + 1]]);
      }

      if (he.memberIndices.length === 1) {
        // Singleton → analytical circle (CPU, no GPU needed)
        const r = (threshold > 0 && threshold < 1)
          ? margin * Math.sqrt(-2 * Math.log(threshold))
          : margin;
        const verts = circlePolygon(points[0], Math.max(r, 5));
        const centroid: Vec2 = [points[0][0], points[0][1]];
        const triangles = fanTriangulate(centroid, verts);
        results.push({ vertices: verts, centroid, hyperedgeIndex: he.index, triangles });
      } else {
        gpuEdges.push({ he, points });
      }
    }

    if (gpuEdges.length === 0) return results;

    // ── CPU: compute bounding boxes & edge metadata ──
    const sigma = Math.max(margin, 5);
    const edgeCount = gpuEdges.length;
    const edgeMetas = new Float32Array(edgeCount * 4); // [origin_x, origin_y, cell_size, pad]

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
      edgeMetas[i * 4 + 3] = 0; // pad
    }

    // ── GPU: allocate/resize buffers ──
    if (edgeCount !== this.lastEdgeCount) {
      this.buffers.createBuffer(
        'metaball-edge-metas',
        edgeCount * 4 * 4, // 4 floats × 4 bytes each
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

    // Write params: [sigma: f32, grid_size: u32, edge_count: u32, _pad: u32]
    const paramsData = new ArrayBuffer(16);
    new Float32Array(paramsData, 0, 1)[0] = sigma;
    new Uint32Array(paramsData, 4, 3).set([GRID_SIZE, edgeCount, 0]);
    this.buffers.uploadData('metaball-params', new Uint8Array(paramsData));

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

    // ── GPU→CPU: readback ──
    const gridSize = edgeCount * CELLS_PER_EDGE * 4;
    const gridData = await this.buffers.readBuffer('metaball-grid-out', gridSize);

    // ── CPU: marching squares per edge ──
    for (let i = 0; i < edgeCount; i++) {
      const { he } = gpuEdges[i];
      const metaBase = i * 4;
      const originX = edgeMetas[metaBase];
      const originY = edgeMetas[metaBase + 1];
      const cellSize = edgeMetas[metaBase + 2];

      // Build ScalarGrid from GPU output slice
      const gridOffset = i * CELLS_PER_EDGE;
      const values = new Float32Array(CELLS_PER_EDGE);
      for (let j = 0; j < CELLS_PER_EDGE; j++) {
        values[j] = gridData[gridOffset + j];
      }

      const grid: ScalarGrid = {
        values,
        cols: GRID_SIZE,
        rows: GRID_SIZE,
        originX,
        originY,
        cellSize,
      };

      // Overlay MST bridge field to keep blobs connected when nodes are far apart
      addBridgeField(grid, gpuEdges[i].points, sigma);

      const segments = marchingSquares(grid, threshold);
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

      // Smooth the contour
      const smoothed = chaikinSmooth(best, smoothIters);

      // Compute centroid
      let cx = 0, cy = 0;
      for (const p of smoothed) {
        cx += p[0];
        cy += p[1];
      }
      cx /= smoothed.length;
      cy /= smoothed.length;

      // Ear-clip handles concave bridge tendrils correctly (fan-triangulate
      // only works for star-convex shapes, which bridges break)
      const triangles = earClipTriangulate(smoothed);
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
    this.buffers.destroyBuffer('metaball-edge-metas');
    this.buffers.destroyBuffer('metaball-grid-out');
    this.buffers.destroyBuffer('metaball-params');
    this.lastEdgeCount = 0;
  }
}

// Fan-triangulate a polygon from its centroid (same as hull-compute.ts)
function fanTriangulate(centroid: Vec2, hull: Vec2[]): Vec2[] {
  const triangles: Vec2[] = [];
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    triangles.push(centroid, hull[i], hull[(i + 1) % n]);
  }
  return triangles;
}
