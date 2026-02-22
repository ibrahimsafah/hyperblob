import type { BufferManager } from '../gpu/buffer-manager';
import quadtreeBuildShader from '../shaders/quadtree-build.wgsl?raw';
import quadtreeSummarizeShader from '../shaders/quadtree-summarize.wgsl?raw';

/**
 * GPU Quadtree for Barnes-Hut force approximation.
 *
 * Uses a complete 4-ary tree stored in a flat array.
 * Leaves are placed at the bottom, then internal nodes are summarized
 * bottom-up level by level.
 *
 * Tree layout (complete 4-ary tree):
 * - Level 0: 1 node (root, index 0)
 * - Level 1: 4 nodes (indices 1-4)
 * - Level 2: 16 nodes (indices 5-20)
 * - ...
 * - Level L: 4^L nodes
 * - Children of node i: 4*i+1, 4*i+2, 4*i+3, 4*i+4
 *
 * We compute the number of levels needed to hold all nodes as leaves,
 * then build bottom-up.
 */
export class GPUQuadtree {
  private device: GPUDevice;
  private bufferManager: BufferManager;

  private buildPipeline: GPUComputePipeline;
  private summarizePipeline: GPUComputePipeline;

  private buildBGL: GPUBindGroupLayout;
  private summarizeBGL: GPUBindGroupLayout;

  // Tree parameters
  treeSize = 0;       // total nodes in tree
  leafOffset = 0;     // first leaf index
  numLevels = 0;      // number of levels in tree

  constructor(device: GPUDevice, bufferManager: BufferManager) {
    this.device = device;
    this.bufferManager = bufferManager;

    // Build pipeline
    const buildModule = device.createShaderModule({
      label: 'quadtree-build-shader',
      code: quadtreeBuildShader,
    });

    this.buildBGL = device.createBindGroupLayout({
      label: 'quadtree-build-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });

    this.buildPipeline = device.createComputePipeline({
      label: 'quadtree-build',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.buildBGL] }),
      compute: { module: buildModule, entryPoint: 'main' },
    });

    // Summarize pipeline
    const summarizeModule = device.createShaderModule({
      label: 'quadtree-summarize-shader',
      code: quadtreeSummarizeShader,
    });

    this.summarizeBGL = device.createBindGroupLayout({
      label: 'quadtree-summarize-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });

    this.summarizePipeline = device.createComputePipeline({
      label: 'quadtree-summarize',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.summarizeBGL] }),
      compute: { module: summarizeModule, entryPoint: 'main' },
    });
  }

  /**
   * Compute tree geometry for a given node count.
   * We choose a number of levels such that 4^L >= nodeCount for the leaf level.
   */
  computeTreeLayout(nodeCount: number): void {
    // Determine levels: we need at least enough leaves to hold all nodes
    // A complete 4-ary tree with L levels has 4^(L-1) leaves at the bottom level
    // Total nodes = (4^L - 1) / 3
    let levels = 1;
    let leafCapacity = 1;
    while (leafCapacity < nodeCount) {
      levels++;
      leafCapacity *= 4;
    }

    this.numLevels = levels;

    // Internal nodes (levels 0 to L-2): (4^(L-1) - 1) / 3
    // Leaf level (level L-1): 4^(L-1)
    if (levels === 1) {
      this.leafOffset = 0;
      this.treeSize = Math.max(nodeCount, 1);
    } else {
      // Sum of 4^0 + 4^1 + ... + 4^(L-2) = (4^(L-1) - 1) / 3
      this.leafOffset = (leafCapacity - 1) / 3;
      this.treeSize = this.leafOffset + leafCapacity;
    }
  }

  /**
   * Allocate/resize tree buffer.
   */
  ensureBuffers(nodeCount: number): void {
    this.computeTreeLayout(nodeCount);

    // 8 floats per tree node
    const treeBufSize = this.treeSize * 8 * 4;
    this.bufferManager.createBuffer(
      'quadtree',
      treeBufSize,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      'quadtree',
    );

    // Build params uniform
    this.bufferManager.createBuffer(
      'quadtree-build-params', 16,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      'quadtree-build-params',
    );

    // Summarize params uniform
    this.bufferManager.createBuffer(
      'quadtree-summarize-params', 16,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      'quadtree-summarize-params',
    );
  }

  /**
   * Encode the tree build + summarize passes into the command encoder.
   * Assumes positions and sorted-indices buffers are ready.
   */
  encode(encoder: GPUCommandEncoder, nodeCount: number, rootSize: number): void {
    if (nodeCount === 0) return;

    // Clear tree buffer to zeros
    const treeBuffer = this.bufferManager.getBuffer('quadtree');
    const zeros = new Float32Array(this.treeSize * 8);
    this.device.queue.writeBuffer(treeBuffer, 0, zeros);

    // Step 1: Build leaves from sorted nodes
    const buildParams = new Uint32Array([nodeCount, this.treeSize, this.leafOffset, 0]);
    this.device.queue.writeBuffer(
      this.bufferManager.getBuffer('quadtree-build-params'), 0, buildParams,
    );

    const buildBG = this.device.createBindGroup({
      label: 'quadtree-build-bg',
      layout: this.buildBGL,
      entries: [
        { binding: 0, resource: { buffer: this.bufferManager.getBuffer('node-positions') } },
        { binding: 1, resource: { buffer: this.bufferManager.getBuffer('sorted-indices') } },
        { binding: 2, resource: { buffer: treeBuffer } },
        { binding: 3, resource: { buffer: this.bufferManager.getBuffer('quadtree-build-params') } },
      ],
    });

    const buildPass = encoder.beginComputePass({ label: 'quadtree-build' });
    buildPass.setPipeline(this.buildPipeline);
    buildPass.setBindGroup(0, buildBG);
    buildPass.dispatchWorkgroups(Math.ceil(nodeCount / 256));
    buildPass.end();

    // Step 2: Summarize bottom-up, level by level
    // Process from level (numLevels-2) up to level 0
    for (let level = this.numLevels - 2; level >= 0; level--) {
      // Nodes at this level start at index (4^level - 1) / 3
      // and there are 4^level of them
      const nodesAtLevel = Math.pow(4, level);
      const levelStart = level === 0 ? 0 : (nodesAtLevel - 1) / 3;

      const summarizeParams = new Float32Array(4);
      const u32View = new Uint32Array(summarizeParams.buffer);
      u32View[0] = levelStart;
      u32View[1] = nodesAtLevel;
      u32View[2] = this.treeSize;
      summarizeParams[3] = rootSize;

      this.device.queue.writeBuffer(
        this.bufferManager.getBuffer('quadtree-summarize-params'), 0, summarizeParams,
      );

      const summarizeBG = this.device.createBindGroup({
        label: `quadtree-summarize-bg-level${level}`,
        layout: this.summarizeBGL,
        entries: [
          { binding: 0, resource: { buffer: treeBuffer } },
          { binding: 1, resource: { buffer: this.bufferManager.getBuffer('quadtree-summarize-params') } },
        ],
      });

      const sumPass = encoder.beginComputePass({ label: `quadtree-summarize-${level}` });
      sumPass.setPipeline(this.summarizePipeline);
      sumPass.setBindGroup(0, summarizeBG);
      sumPass.dispatchWorkgroups(Math.ceil(nodesAtLevel / 256));
      sumPass.end();
    }
  }

  destroy(): void {
    const names = ['quadtree', 'quadtree-build-params', 'quadtree-summarize-params'];
    for (const name of names) {
      if (this.bufferManager.hasBuffer(name)) {
        this.bufferManager.destroyBuffer(name);
      }
    }
  }
}
