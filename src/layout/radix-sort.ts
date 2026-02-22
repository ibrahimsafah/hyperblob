import type { BufferManager } from '../gpu/buffer-manager';
import radixSortShader from '../shaders/radix-sort.wgsl?raw';

/**
 * GPU Radix Sort for 32-bit unsigned integer keys with associated values.
 * Sorts by performing 4 passes of 8-bit radix sort (LSB to MSB).
 *
 * Each pass: histogram -> prefix sum -> scatter
 */
export class RadixSort {
  private device: GPUDevice;
  private bufferManager: BufferManager;

  private histogramPipeline: GPUComputePipeline;
  private prefixSumPipeline: GPUComputePipeline;
  private scatterPipeline: GPUComputePipeline;
  private bindGroupLayout: GPUBindGroupLayout;

  private maxNodeCount: number;

  // Pre-allocated to avoid per-frame GC pressure
  private paramsArray = new Uint32Array(4);

  // Cached bind groups for even/odd passes (ping→pong vs pong→ping)
  private evenBindGroup: GPUBindGroup | null = null;
  private oddBindGroup: GPUBindGroup | null = null;

  constructor(device: GPUDevice, bufferManager: BufferManager, maxNodeCount: number) {
    this.device = device;
    this.bufferManager = bufferManager;
    this.maxNodeCount = maxNodeCount;

    const shaderModule = device.createShaderModule({
      label: 'radix-sort-shader',
      code: radixSortShader,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'radix-sort-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: 'radix-sort-pipeline-layout',
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.histogramPipeline = device.createComputePipeline({
      label: 'radix-sort-histogram',
      layout: pipelineLayout,
      compute: { module: shaderModule, entryPoint: 'histogram' },
    });

    this.prefixSumPipeline = device.createComputePipeline({
      label: 'radix-sort-prefix-sum',
      layout: pipelineLayout,
      compute: { module: shaderModule, entryPoint: 'prefix_sum' },
    });

    this.scatterPipeline = device.createComputePipeline({
      label: 'radix-sort-scatter',
      layout: pipelineLayout,
      compute: { module: shaderModule, entryPoint: 'scatter' },
    });

    // Create ping-pong buffers for keys and values
    this.createBuffers(maxNodeCount);
  }

  private createBuffers(nodeCount: number): void {
    const numWorkgroups = Math.ceil(nodeCount / 256);
    const histogramSize = 256 * numWorkgroups * 4; // 256 bins * numWorkgroups * 4 bytes

    const bufferSize = nodeCount * 4;
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;

    this.bufferManager.createBuffer('sort-keys-ping', bufferSize, usage, 'sort-keys-ping');
    this.bufferManager.createBuffer('sort-vals-ping', bufferSize, usage, 'sort-vals-ping');
    this.bufferManager.createBuffer('sort-keys-pong', bufferSize, usage, 'sort-keys-pong');
    this.bufferManager.createBuffer('sort-vals-pong', bufferSize, usage, 'sort-vals-pong');
    this.bufferManager.createBuffer('sort-histograms', Math.max(histogramSize, 4), usage, 'sort-histograms');
    this.bufferManager.createBuffer('sort-params', 16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'sort-params');

    // Rebuild cached bind groups when buffers change
    this.rebuildBindGroups(numWorkgroups);
  }

  private rebuildBindGroups(numWorkgroups: number): void {
    const histSize = 256 * numWorkgroups * 4;

    // Even passes: read ping → write pong
    this.evenBindGroup = this.device.createBindGroup({
      label: 'radix-sort-bg-even',
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.bufferManager.getBuffer('sort-keys-ping') } },
        { binding: 1, resource: { buffer: this.bufferManager.getBuffer('sort-vals-ping') } },
        { binding: 2, resource: { buffer: this.bufferManager.getBuffer('sort-keys-pong') } },
        { binding: 3, resource: { buffer: this.bufferManager.getBuffer('sort-vals-pong') } },
        { binding: 4, resource: { buffer: this.bufferManager.getBuffer('sort-histograms'), size: Math.max(histSize, 4) } },
        { binding: 5, resource: { buffer: this.bufferManager.getBuffer('sort-params') } },
      ],
    });

    // Odd passes: read pong → write ping
    this.oddBindGroup = this.device.createBindGroup({
      label: 'radix-sort-bg-odd',
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.bufferManager.getBuffer('sort-keys-pong') } },
        { binding: 1, resource: { buffer: this.bufferManager.getBuffer('sort-vals-pong') } },
        { binding: 2, resource: { buffer: this.bufferManager.getBuffer('sort-keys-ping') } },
        { binding: 3, resource: { buffer: this.bufferManager.getBuffer('sort-vals-ping') } },
        { binding: 4, resource: { buffer: this.bufferManager.getBuffer('sort-histograms'), size: Math.max(histSize, 4) } },
        { binding: 5, resource: { buffer: this.bufferManager.getBuffer('sort-params') } },
      ],
    });
  }

  /**
   * Encode sort commands into the given command encoder.
   * Assumes morton_codes and sorted_indices buffers are already populated with input data.
   * After sorting, sorted_indices will contain indices sorted by morton_codes.
   *
   * Input: 'morton-codes' buffer (keys), 'sorted-indices' buffer (values)
   * Output: 'sorted-indices' buffer is sorted by morton code order
   */
  encode(encoder: GPUCommandEncoder, nodeCount: number): void {
    if (nodeCount <= 1) return;

    if (nodeCount > this.maxNodeCount) {
      this.maxNodeCount = nodeCount;
      this.createBuffers(nodeCount);
    }

    const numWorkgroups = Math.ceil(nodeCount / 256);

    // Copy initial data into ping buffers
    encoder.copyBufferToBuffer(
      this.bufferManager.getBuffer('morton-codes'), 0,
      this.bufferManager.getBuffer('sort-keys-ping'), 0,
      nodeCount * 4,
    );
    encoder.copyBufferToBuffer(
      this.bufferManager.getBuffer('sorted-indices'), 0,
      this.bufferManager.getBuffer('sort-vals-ping'), 0,
      nodeCount * 4,
    );

    const histBuffer = this.bufferManager.getBuffer('sort-histograms');

    // 4 passes for 32-bit keys (8 bits per pass)
    for (let pass = 0; pass < 4; pass++) {
      const bitOffset = pass * 8;

      // Upload params for this pass (reuse pre-allocated array)
      this.paramsArray[0] = nodeCount;
      this.paramsArray[1] = bitOffset;
      this.device.queue.writeBuffer(this.bufferManager.getBuffer('sort-params'), 0, this.paramsArray);

      // Clear histogram buffer on GPU (no CPU allocation needed)
      encoder.clearBuffer(histBuffer);

      const bindGroup = pass % 2 === 0 ? this.evenBindGroup! : this.oddBindGroup!;

      // Pass 1: Histogram
      const histPass = encoder.beginComputePass({ label: `radix-histogram-${pass}` });
      histPass.setPipeline(this.histogramPipeline);
      histPass.setBindGroup(0, bindGroup);
      histPass.dispatchWorkgroups(numWorkgroups);
      histPass.end();

      // Pass 2: Prefix sum (1 workgroup of 256 threads, one per bin)
      const prefixPass = encoder.beginComputePass({ label: `radix-prefix-${pass}` });
      prefixPass.setPipeline(this.prefixSumPipeline);
      prefixPass.setBindGroup(0, bindGroup);
      prefixPass.dispatchWorkgroups(1);
      prefixPass.end();

      // Pass 3: Scatter
      const scatterPass = encoder.beginComputePass({ label: `radix-scatter-${pass}` });
      scatterPass.setPipeline(this.scatterPipeline);
      scatterPass.setBindGroup(0, bindGroup);
      scatterPass.dispatchWorkgroups(numWorkgroups);
      scatterPass.end();
    }

    // After 4 passes (even number), result is in ping buffers
    // Copy sorted values back to sorted-indices
    encoder.copyBufferToBuffer(
      this.bufferManager.getBuffer('sort-keys-ping'), 0,
      this.bufferManager.getBuffer('morton-codes'), 0,
      nodeCount * 4,
    );
    encoder.copyBufferToBuffer(
      this.bufferManager.getBuffer('sort-vals-ping'), 0,
      this.bufferManager.getBuffer('sorted-indices'), 0,
      nodeCount * 4,
    );
  }

  destroy(): void {
    const names = [
      'sort-keys-ping', 'sort-vals-ping',
      'sort-keys-pong', 'sort-vals-pong',
      'sort-histograms', 'sort-params',
    ];
    for (const name of names) {
      if (this.bufferManager.hasBuffer(name)) {
        this.bufferManager.destroyBuffer(name);
      }
    }
  }
}
