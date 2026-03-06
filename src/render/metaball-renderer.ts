// Screen-space metaball renderer — evaluates Gaussian field per-pixel in fragment shader
// Replaces the GPU compute → CPU readback → marching squares → triangulation pipeline
// Each hyperedge rendered as a bounding-box quad with instanced draw

import type { GPUContext } from '../gpu/device';
import type { BufferManager } from '../gpu/buffer-manager';
import type { Camera } from './camera';
import type { HyperedgeData } from '../data/types';
import { computeMST, distToSegmentSq } from './metaball-hull';
import { getPaletteColor } from '../utils/color';
import shaderCode from '../shaders/metaball-render.wgsl?raw';

// Instance layout: 12 floats/u32s = 48 bytes per edge (matches WGSL EdgeInstance struct)
const FLOATS_PER_INSTANCE = 12;
const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;

export class MetaballRenderer {
  private gpu: GPUContext;
  private buffers: BufferManager;
  private camera: Camera;

  private pipeline: GPURenderPipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private bindGroup: GPUBindGroup | null = null;

  private cameraBuffer: GPUBuffer;
  private paramsBuffer: GPUBuffer;
  private instanceCapacity = 0;
  private mstCapacity = 0;
  private instanceCount = 0;

  private lastCameraVersion = -1;

  // Cached for hit testing
  private lastEdges: HyperedgeData[] = [];
  private lastSigma = 5;
  private lastThreshold = 0.5;
  private lastPositions: Float32Array | null = null;

  // Pre-allocated params backing (16 bytes: sigma, threshold, band, pad)
  private paramsArray = new Float32Array(4);

  constructor(gpu: GPUContext, buffers: BufferManager, camera: Camera) {
    this.gpu = gpu;
    this.buffers = buffers;
    this.camera = camera;

    const { device, format } = gpu;

    const module = device.createShaderModule({
      label: 'metaball-render-shader',
      code: shaderCode,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'metaball-render-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },        // camera
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },  // positions
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },  // he_offsets
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },  // he_members
        { binding: 4, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },   // instances
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },  // mst_edges
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },            // params
      ],
    });

    this.pipeline = device.createRenderPipeline({
      label: 'metaball-render-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      vertex: { module, entryPoint: 'vs_main' },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.cameraBuffer = buffers.createBuffer(
      'metaball-camera', 64,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'metaball-camera',
    );

    this.paramsBuffer = buffers.createBuffer(
      'metaball-render-params', 16,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'metaball-render-params',
    );
  }

  /**
   * Recompute instance data (bounding boxes + MSTs) from CPU positions.
   * Called every N frames — the fragment shader reads live GPU positions each frame.
   */
  updateInstances(
    positions: Float32Array,
    edges: HyperedgeData[],
    sigma: number,
    threshold: number,
    alpha: number,
    dimmedEdges: Set<number> | null,
  ): void {
    // Cache for hit testing
    this.lastEdges = edges;
    this.lastSigma = sigma;
    this.lastThreshold = threshold;
    this.lastPositions = positions;

    // Filter to edges with 2+ members
    const validEdges: HyperedgeData[] = [];
    for (const he of edges) {
      if (he.memberIndices.length >= 2) validEdges.push(he);
    }

    if (validEdges.length === 0) {
      this.instanceCount = 0;
      return;
    }

    const padding = sigma * 3;
    const edgeCount = validEdges.length;

    // Build instance data + MST edges
    const instanceBuf = new ArrayBuffer(edgeCount * BYTES_PER_INSTANCE);
    const instF32 = new Float32Array(instanceBuf);
    const instU32 = new Uint32Array(instanceBuf);

    // First pass: compute MSTs to know total MST edge count
    const allMstEdges: [number, number][][] = [];
    let totalMstEdges = 0;
    for (const he of validEdges) {
      const pts = he.memberIndices.map(ni => [
        positions[ni * 4], positions[ni * 4 + 1],
      ] as [number, number]);
      const mst = computeMST(pts);
      // Remap MST indices (local → global node indices)
      const globalMst: [number, number][] = mst.map(([a, b]) => [
        he.memberIndices[a], he.memberIndices[b],
      ]);
      allMstEdges.push(globalMst);
      totalMstEdges += globalMst.length;
    }

    // Build flat MST edges array
    const mstData = new Uint32Array(Math.max(totalMstEdges * 2, 1));
    let mstOffset = 0;

    for (let i = 0; i < edgeCount; i++) {
      const he = validEdges[i];
      const globalMst = allMstEdges[i];
      const color = getPaletteColor(he.index);
      const isDimmed = dimmedEdges !== null && dimmedEdges.has(he.index);
      const a = isDimmed ? alpha * 0.08 : alpha;

      // Compute bounding box from member positions + bridge endpoints
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const ni of he.memberIndices) {
        const x = positions[ni * 4];
        const y = positions[ni * 4 + 1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }

      // Expand bbox for bridge sigma (bridges can be wider than node sigma)
      let maxBridgeSigma = sigma;
      for (const [ai, bi] of globalMst) {
        const ax = positions[ai * 4], ay = positions[ai * 4 + 1];
        const bx = positions[bi * 4], by = positions[bi * 4 + 1];
        const dx = bx - ax, dy = by - ay;
        const edgeLen = Math.sqrt(dx * dx + dy * dy);
        maxBridgeSigma = Math.max(maxBridgeSigma, edgeLen * 0.12);
      }
      const effectivePadding = Math.max(padding, maxBridgeSigma * 3);

      minX -= effectivePadding;
      minY -= effectivePadding;
      maxX += effectivePadding;
      maxY += effectivePadding;

      // Pack instance data (12 values = 48 bytes)
      const base = i * FLOATS_PER_INSTANCE;
      instF32[base + 0] = minX;           // bbox_min.x
      instF32[base + 1] = minY;           // bbox_min.y
      instF32[base + 2] = maxX;           // bbox_max.x
      instF32[base + 3] = maxY;           // bbox_max.y
      instF32[base + 4] = color[0];       // color.r
      instF32[base + 5] = color[1];       // color.g
      instF32[base + 6] = color[2];       // color.b
      instF32[base + 7] = a;              // color.a
      instU32[base + 8] = he.index;       // edge_index (into he_offsets/he_members)
      instU32[base + 9] = mstOffset;      // mst_offset
      instU32[base + 10] = globalMst.length; // mst_count
      instU32[base + 11] = 0;             // _pad

      // Pack MST edges
      for (const [ai, bi] of globalMst) {
        mstData[mstOffset * 2] = ai;
        mstData[mstOffset * 2 + 1] = bi;
        mstOffset++;
      }
    }

    this.instanceCount = edgeCount;

    // Upload instance buffer (grow with 2× amortization)
    const instanceBytes = edgeCount * BYTES_PER_INSTANCE;
    if (instanceBytes > this.instanceCapacity) {
      this.instanceCapacity = instanceBytes * 2;
      this.buffers.destroyBuffer('metaball-instances');
      this.buffers.createBuffer(
        'metaball-instances', this.instanceCapacity,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'metaball-instances',
      );
      this.bindGroup = null; // force rebind
    }
    this.buffers.uploadData('metaball-instances', new Uint8Array(instanceBuf));

    // Upload MST buffer
    const mstBytes = Math.max(mstData.byteLength, 4);
    if (mstBytes > this.mstCapacity) {
      this.mstCapacity = Math.max(mstBytes * 2, 16);
      this.buffers.destroyBuffer('metaball-mst');
      this.buffers.createBuffer(
        'metaball-mst', this.mstCapacity,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'metaball-mst',
      );
      this.bindGroup = null; // force rebind
    }
    this.buffers.uploadData('metaball-mst', mstData);

    // Upload params
    this.paramsArray[0] = sigma;
    this.paramsArray[1] = threshold;
    this.paramsArray[2] = threshold * 0.15; // smoothing band
    this.paramsArray[3] = 0;
    this.gpu.device.queue.writeBuffer(this.paramsBuffer, 0, this.paramsArray);

    // Rebuild bind group if needed
    if (!this.bindGroup) {
      this.rebuildBindGroup();
    }
  }

  private rebuildBindGroup(): void {
    if (!this.buffers.hasBuffer('node-positions') ||
        !this.buffers.hasBuffer('he-offsets') ||
        !this.buffers.hasBuffer('he-members') ||
        !this.buffers.hasBuffer('metaball-instances') ||
        !this.buffers.hasBuffer('metaball-mst')) {
      return;
    }

    this.bindGroup = this.gpu.device.createBindGroup({
      label: 'metaball-render-bind-group',
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: { buffer: this.buffers.getBuffer('node-positions') } },
        { binding: 2, resource: { buffer: this.buffers.getBuffer('he-offsets') } },
        { binding: 3, resource: { buffer: this.buffers.getBuffer('he-members') } },
        { binding: 4, resource: { buffer: this.buffers.getBuffer('metaball-instances') } },
        { binding: 5, resource: { buffer: this.buffers.getBuffer('metaball-mst') } },
        { binding: 6, resource: { buffer: this.paramsBuffer } },
      ],
    });
  }

  render(renderPass: GPURenderPassEncoder): void {
    if (this.instanceCount === 0 || !this.bindGroup) return;

    // Update camera uniform
    if (this.camera.version !== this.lastCameraVersion) {
      this.lastCameraVersion = this.camera.version;
      this.gpu.device.queue.writeBuffer(this.cameraBuffer, 0, this.camera.getProjection());
    }

    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    renderPass.draw(6, this.instanceCount);
  }

  /**
   * CPU-side field evaluation at a single point for hit testing.
   * Evaluates Gaussian field + MST bridge field for each visible edge.
   */
  hitTest(worldX: number, worldY: number): number | null {
    const positions = this.lastPositions;
    if (!positions || this.lastEdges.length === 0) return null;

    const sigma = this.lastSigma;
    const threshold = this.lastThreshold;
    const invTwoSigmaSq = 1 / (2 * sigma * sigma);
    const cutoffSq = 9 * sigma * sigma;

    // Test in reverse order (topmost = last rendered)
    for (let e = this.lastEdges.length - 1; e >= 0; e--) {
      const edge = this.lastEdges[e];
      if (edge.memberIndices.length < 2) continue;

      // Quick bounding-box rejection
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const ni of edge.memberIndices) {
        const x = positions[ni * 4], y = positions[ni * 4 + 1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      const pad = sigma * 3;
      if (worldX < minX - pad || worldX > maxX + pad ||
          worldY < minY - pad || worldY > maxY + pad) {
        continue;
      }

      // Evaluate Gaussian field
      let fieldVal = 0;
      for (const ni of edge.memberIndices) {
        const nx = positions[ni * 4], ny = positions[ni * 4 + 1];
        const dx = worldX - nx, dy = worldY - ny;
        const dSq = dx * dx + dy * dy;
        if (dSq < cutoffSq) {
          fieldVal += Math.exp(-dSq * invTwoSigmaSq);
        }
      }

      // Evaluate bridge field (MST)
      const pts = edge.memberIndices.map(ni => [
        positions[ni * 4], positions[ni * 4 + 1],
      ] as [number, number]);
      const mstEdges = computeMST(pts);
      for (const [ai, bi] of mstEdges) {
        const ax = pts[ai][0], ay = pts[ai][1];
        const bx = pts[bi][0], by = pts[bi][1];
        const edgeLen = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
        const bridgeSigma = Math.max(sigma, edgeLen * 0.12);
        const bridgeInv = 1 / (2 * bridgeSigma * bridgeSigma);
        const bridgeCutoff = 9 * bridgeSigma * bridgeSigma;
        const dSq = distToSegmentSq(worldX, worldY, ax, ay, bx, by);
        if (dSq < bridgeCutoff) {
          fieldVal += Math.exp(-dSq * bridgeInv);
        }
      }

      if (fieldVal >= threshold) return edge.index;
    }

    return null;
  }

  /** Force bind group recreation (e.g. when graph data changes) */
  invalidateBindGroup(): void {
    this.bindGroup = null;
  }

  destroy(): void {
    this.buffers.destroyBuffer('metaball-instances');
    this.buffers.destroyBuffer('metaball-mst');
    this.buffers.destroyBuffer('metaball-camera');
    this.buffers.destroyBuffer('metaball-render-params');
    this.instanceCount = 0;
    this.instanceCapacity = 0;
    this.mstCapacity = 0;
  }
}
