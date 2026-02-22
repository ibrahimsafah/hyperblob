import type { BufferManager } from '../gpu/buffer-manager';
import type { HypergraphData, SimulationParams } from '../data/types';
import { RadixSort } from './radix-sort';
import { GPUQuadtree } from './quadtree';

import mortonShader from '../shaders/morton.wgsl?raw';
import forceRepulsionShader from '../shaders/force-repulsion.wgsl?raw';
import forceAttractionShader from '../shaders/force-attraction.wgsl?raw';
import forceCenterShader from '../shaders/force-center.wgsl?raw';
import integrateShader from '../shaders/integrate.wgsl?raw';

/**
 * GPU Force-Directed Layout Simulation
 *
 * Runs entirely on the GPU using compute shaders. Per-tick dispatch sequence:
 * 1. Compute bounding box (CPU readback, amortized)
 * 2. Morton codes — Z-order encoding of normalized positions
 * 3. GPU radix sort — Sort nodes by Morton code
 * 4. Bottom-up quadtree build — Morton-sorted leaves
 * 5. Summarize — Bottom-up center-of-mass per cell
 * 6. Barnes-Hut repulsion — Each thread traverses tree
 * 7. Link attraction — Parallel over edges
 * 8. Center force — Prevents drift
 * 9. Velocity Verlet integration — Update positions with damping
 */
export class ForceSimulation {
  private device: GPUDevice;
  private bufferManager: BufferManager;

  private nodeCount: number;
  private edgeCount: number;

  // Sub-systems
  private radixSort: RadixSort;
  private quadtree: GPUQuadtree;

  // Pipelines
  private mortonPipeline: GPUComputePipeline;
  private repulsionPipeline: GPUComputePipeline;
  private attractionPipeline: GPUComputePipeline;
  private centerAccumPipeline: GPUComputePipeline;
  private centerApplyPipeline: GPUComputePipeline;
  private integratePipeline: GPUComputePipeline;

  // Bind group layouts
  private mortonBGL: GPUBindGroupLayout;
  private repulsionBGL: GPUBindGroupLayout;
  private attractionBGL: GPUBindGroupLayout;
  private centerBGL: GPUBindGroupLayout;
  private integrateBGL: GPUBindGroupLayout;

  // Bounding box tracking (updated from CPU periodically)
  private bounds = { minX: -500, minY: -500, maxX: 500, maxY: 500 };
  private boundsFrameCounter = 0;
  private boundsUpdateInterval = 5; // update bounds every N frames

  constructor(
    device: GPUDevice,
    bufferManager: BufferManager,
    data: HypergraphData,
    _params: SimulationParams,
  ) {
    this.device = device;
    this.bufferManager = bufferManager;
    this.nodeCount = data.nodes.length;
    this.edgeCount = data.hyperedges.length;

    // Allocate work buffers
    this.allocateBuffers();

    // Create sub-systems
    this.radixSort = new RadixSort(device, bufferManager, this.nodeCount);
    this.quadtree = new GPUQuadtree(device, bufferManager);
    this.quadtree.ensureBuffers(this.nodeCount);

    // Create pipelines
    // Morton code pipeline
    const mortonModule = device.createShaderModule({ label: 'morton-shader', code: mortonShader });
    this.mortonBGL = device.createBindGroupLayout({
      label: 'morton-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });
    this.mortonPipeline = device.createComputePipeline({
      label: 'morton-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.mortonBGL] }),
      compute: { module: mortonModule, entryPoint: 'main' },
    });

    // Repulsion pipeline
    const repulsionModule = device.createShaderModule({ label: 'repulsion-shader', code: forceRepulsionShader });
    this.repulsionBGL = device.createBindGroupLayout({
      label: 'repulsion-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });
    this.repulsionPipeline = device.createComputePipeline({
      label: 'repulsion-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.repulsionBGL] }),
      compute: { module: repulsionModule, entryPoint: 'main' },
    });

    // Attraction pipeline
    const attractionModule = device.createShaderModule({ label: 'attraction-shader', code: forceAttractionShader });
    this.attractionBGL = device.createBindGroupLayout({
      label: 'attraction-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });
    this.attractionPipeline = device.createComputePipeline({
      label: 'attraction-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.attractionBGL] }),
      compute: { module: attractionModule, entryPoint: 'main' },
    });

    // Center force pipeline (two entry points)
    const centerModule = device.createShaderModule({ label: 'center-shader', code: forceCenterShader });
    this.centerBGL = device.createBindGroupLayout({
      label: 'center-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });
    this.centerAccumPipeline = device.createComputePipeline({
      label: 'center-accum-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.centerBGL] }),
      compute: { module: centerModule, entryPoint: 'accumulate' },
    });
    this.centerApplyPipeline = device.createComputePipeline({
      label: 'center-apply-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.centerBGL] }),
      compute: { module: centerModule, entryPoint: 'apply' },
    });

    // Integration pipeline
    const integrateModule = device.createShaderModule({ label: 'integrate-shader', code: integrateShader });
    this.integrateBGL = device.createBindGroupLayout({
      label: 'integrate-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });
    this.integratePipeline = device.createComputePipeline({
      label: 'integrate-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.integrateBGL] }),
      compute: { module: integrateModule, entryPoint: 'main' },
    });
  }

  private allocateBuffers(): void {
    const n = this.nodeCount;
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;

    // Morton codes and sorted indices
    this.bufferManager.createBuffer('morton-codes', n * 4, usage, 'morton-codes');
    this.bufferManager.createBuffer('sorted-indices', n * 4, usage, 'sorted-indices');

    // Morton params uniform
    this.bufferManager.createBuffer('morton-params', 32,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'morton-params');

    // Attraction force accumulation buffer (fixed-point, 2 i32 per node)
    this.bufferManager.createBuffer('attraction-forces', Math.max(n * 8, 4), usage, 'attraction-forces');

    // Attraction params uniform
    this.bufferManager.createBuffer('attraction-params', 32,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'attraction-params');

    // Repulsion params uniform (SimParams struct = 12 floats = 48 bytes, pad to 48)
    this.bufferManager.createBuffer('repulsion-params', 48,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'repulsion-params');

    // Center force buffers
    this.bufferManager.createBuffer('center-sum', 8,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'center-sum');
    this.bufferManager.createBuffer('center-params', 16,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'center-params');

    // Integration params uniform
    this.bufferManager.createBuffer('integrate-params', 16,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'integrate-params');
  }

  /**
   * Perform one simulation tick. Dispatches all compute passes.
   */
  tick(params: SimulationParams): void {
    if (this.nodeCount === 0) return;

    const encoder = this.device.createCommandEncoder({ label: 'force-simulation-tick' });
    const workgroups = Math.ceil(this.nodeCount / 256);

    // --- Periodically update bounding box from CPU ---
    this.boundsFrameCounter++;
    // We can't read back every frame, so we use a generous estimate
    // that grows with the simulation. Initial bounds are set in constructor.
    if (this.boundsFrameCounter >= this.boundsUpdateInterval) {
      this.boundsFrameCounter = 0;
      // Schedule async readback for next frame's bounds
      this.updateBoundsAsync();
    }

    // Ensure bounds have non-zero extent
    const bMinX = this.bounds.minX;
    const bMinY = this.bounds.minY;
    const bMaxX = Math.max(this.bounds.maxX, bMinX + 1);
    const bMaxY = Math.max(this.bounds.maxY, bMinY + 1);
    const rootSize = Math.max(bMaxX - bMinX, bMaxY - bMinY);

    // --- 1. Morton code computation ---
    {
      const paramsData = new ArrayBuffer(32);
      const f32 = new Float32Array(paramsData);
      const u32 = new Uint32Array(paramsData);
      f32[0] = bMinX;
      f32[1] = bMinY;
      f32[2] = bMaxX;
      f32[3] = bMaxY;
      u32[4] = this.nodeCount;
      u32[5] = 0;
      u32[6] = 0;
      u32[7] = 0;
      this.device.queue.writeBuffer(this.bufferManager.getBuffer('morton-params'), 0, paramsData);

      const bg = this.device.createBindGroup({
        layout: this.mortonBGL,
        entries: [
          { binding: 0, resource: { buffer: this.bufferManager.getBuffer('node-positions') } },
          { binding: 1, resource: { buffer: this.bufferManager.getBuffer('morton-codes') } },
          { binding: 2, resource: { buffer: this.bufferManager.getBuffer('sorted-indices') } },
          { binding: 3, resource: { buffer: this.bufferManager.getBuffer('morton-params') } },
        ],
      });

      const pass = encoder.beginComputePass({ label: 'morton' });
      pass.setPipeline(this.mortonPipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(workgroups);
      pass.end();
    }

    // --- 2. GPU radix sort ---
    this.radixSort.encode(encoder, this.nodeCount);

    // --- 3 & 4. Quadtree build + summarize ---
    this.quadtree.encode(encoder, this.nodeCount, rootSize);

    // --- 5. Barnes-Hut repulsion ---
    {
      const paramsData = new ArrayBuffer(48);
      const f32 = new Float32Array(paramsData);
      const u32 = new Uint32Array(paramsData);
      f32[0] = params.repulsionStrength;
      f32[1] = params.attractionStrength;
      f32[2] = params.linkDistance;
      f32[3] = params.centerStrength;
      f32[4] = params.velocityDecay;
      f32[5] = params.alpha;
      f32[6] = params.alphaTarget;
      f32[7] = params.alphaDecay;
      f32[8] = params.alphaMin;
      f32[9] = params.theta;
      u32[10] = this.nodeCount;
      u32[11] = this.quadtree.treeSize;

      this.device.queue.writeBuffer(this.bufferManager.getBuffer('repulsion-params'), 0, paramsData);

      const bg = this.device.createBindGroup({
        layout: this.repulsionBGL,
        entries: [
          { binding: 0, resource: { buffer: this.bufferManager.getBuffer('node-positions') } },
          { binding: 1, resource: { buffer: this.bufferManager.getBuffer('quadtree') } },
          { binding: 2, resource: { buffer: this.bufferManager.getBuffer('repulsion-params') } },
        ],
      });

      const pass = encoder.beginComputePass({ label: 'repulsion' });
      pass.setPipeline(this.repulsionPipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(workgroups);
      pass.end();
    }

    // --- 6. Link attraction ---
    if (this.edgeCount > 0) {
      // Clear attraction forces buffer
      const clearData = new Int32Array(this.nodeCount * 2);
      this.device.queue.writeBuffer(this.bufferManager.getBuffer('attraction-forces'), 0, clearData);

      // Compute total pairs for the params
      const paramsData = new ArrayBuffer(32);
      const f32 = new Float32Array(paramsData);
      const u32 = new Uint32Array(paramsData);
      f32[0] = params.attractionStrength;
      f32[1] = params.linkDistance;
      f32[2] = params.alpha;
      u32[3] = 0; // total_pairs (unused, kept for alignment)
      u32[4] = this.edgeCount;
      u32[5] = 0;
      u32[6] = 0;
      u32[7] = 0;

      this.device.queue.writeBuffer(this.bufferManager.getBuffer('attraction-params'), 0, paramsData);

      const bg = this.device.createBindGroup({
        layout: this.attractionBGL,
        entries: [
          { binding: 0, resource: { buffer: this.bufferManager.getBuffer('node-positions') } },
          { binding: 1, resource: { buffer: this.bufferManager.getBuffer('attraction-forces') } },
          { binding: 2, resource: { buffer: this.bufferManager.getBuffer('he-offsets') } },
          { binding: 3, resource: { buffer: this.bufferManager.getBuffer('he-members') } },
          { binding: 4, resource: { buffer: this.bufferManager.getBuffer('attraction-params') } },
        ],
      });

      const edgeWorkgroups = Math.ceil(this.edgeCount / 256);
      const pass = encoder.beginComputePass({ label: 'attraction' });
      pass.setPipeline(this.attractionPipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(edgeWorkgroups);
      pass.end();
    }

    // --- 7. Center force ---
    {
      // Clear center sum
      const clearData = new Int32Array(2);
      this.device.queue.writeBuffer(this.bufferManager.getBuffer('center-sum'), 0, clearData);

      const paramsData = new ArrayBuffer(16);
      const f32 = new Float32Array(paramsData);
      const u32 = new Uint32Array(paramsData);
      f32[0] = params.centerStrength;
      f32[1] = params.alpha;
      u32[2] = this.nodeCount;
      u32[3] = 0;

      this.device.queue.writeBuffer(this.bufferManager.getBuffer('center-params'), 0, paramsData);

      const bg = this.device.createBindGroup({
        layout: this.centerBGL,
        entries: [
          { binding: 0, resource: { buffer: this.bufferManager.getBuffer('node-positions') } },
          { binding: 1, resource: { buffer: this.bufferManager.getBuffer('center-sum') } },
          { binding: 2, resource: { buffer: this.bufferManager.getBuffer('center-params') } },
        ],
      });

      // Accumulate pass
      const accumPass = encoder.beginComputePass({ label: 'center-accumulate' });
      accumPass.setPipeline(this.centerAccumPipeline);
      accumPass.setBindGroup(0, bg);
      accumPass.dispatchWorkgroups(workgroups);
      accumPass.end();

      // Apply pass
      const applyPass = encoder.beginComputePass({ label: 'center-apply' });
      applyPass.setPipeline(this.centerApplyPipeline);
      applyPass.setBindGroup(0, bg);
      applyPass.dispatchWorkgroups(workgroups);
      applyPass.end();
    }

    // --- 8. Velocity Verlet integration ---
    {
      const paramsData = new ArrayBuffer(16);
      const f32 = new Float32Array(paramsData);
      const u32 = new Uint32Array(paramsData);
      f32[0] = params.velocityDecay;
      f32[1] = params.alpha;
      u32[2] = this.nodeCount;
      u32[3] = 0;

      this.device.queue.writeBuffer(this.bufferManager.getBuffer('integrate-params'), 0, paramsData);

      const bg = this.device.createBindGroup({
        layout: this.integrateBGL,
        entries: [
          { binding: 0, resource: { buffer: this.bufferManager.getBuffer('node-positions') } },
          { binding: 1, resource: { buffer: this.bufferManager.getBuffer('attraction-forces') } },
          { binding: 2, resource: { buffer: this.bufferManager.getBuffer('integrate-params') } },
        ],
      });

      const pass = encoder.beginComputePass({ label: 'integrate' });
      pass.setPipeline(this.integratePipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(workgroups);
      pass.end();
    }

    // Submit all compute work
    this.device.queue.submit([encoder.finish()]);
  }

  /**
   * Asynchronously read back positions to update bounding box estimate.
   * This happens off the critical path and updates bounds for the next frame.
   */
  private updateBoundsAsync(): void {
    const n = this.nodeCount;
    if (n === 0) return;

    this.bufferManager.readBuffer('node-positions', n * 16).then((data) => {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (let i = 0; i < n; i++) {
        const x = data[i * 4];
        const y = data[i * 4 + 1];
        if (isFinite(x) && isFinite(y)) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }

      if (isFinite(minX)) {
        // Add 10% padding
        const padX = (maxX - minX) * 0.1 + 1;
        const padY = (maxY - minY) * 0.1 + 1;
        this.bounds = {
          minX: minX - padX,
          minY: minY - padY,
          maxX: maxX + padX,
          maxY: maxY + padY,
        };
      }
    }).catch(() => {
      // GPU readback can fail if device is lost; ignore
    });
  }

  destroy(): void {
    this.radixSort.destroy();
    this.quadtree.destroy();

    const names = [
      'morton-codes', 'sorted-indices', 'morton-params',
      'attraction-forces', 'attraction-params',
      'repulsion-params', 'center-sum', 'center-params',
      'integrate-params',
    ];
    for (const name of names) {
      if (this.bufferManager.hasBuffer(name)) {
        this.bufferManager.destroyBuffer(name);
      }
    }
  }
}
