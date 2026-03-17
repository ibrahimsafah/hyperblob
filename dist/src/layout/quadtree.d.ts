import type { BufferManager } from '../gpu/buffer-manager';
import type { GPUProfiler } from '../gpu/gpu-profiler';
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
export declare class GPUQuadtree {
    private device;
    private bufferManager;
    private buildPipeline;
    private summarizePipeline;
    private buildBGL;
    private summarizeBGL;
    private profiler;
    private buildBindGroup;
    private summarizeBindGroup;
    private buildParamsArray;
    private summarizeParamsBuf;
    private summarizeParamsU32;
    private summarizeParamsF32;
    treeSize: number;
    leafOffset: number;
    numLevels: number;
    constructor(device: GPUDevice, bufferManager: BufferManager, profiler?: GPUProfiler);
    /**
     * Compute tree geometry for a given node count.
     * We choose a number of levels such that 4^L >= nodeCount for the leaf level.
     */
    computeTreeLayout(nodeCount: number): void;
    /**
     * Allocate/resize tree buffer.
     */
    ensureBuffers(nodeCount: number): void;
    private rebuildBindGroups;
    /**
     * Encode the tree build + summarize passes into the command encoder.
     * Assumes positions and sorted-indices buffers are ready.
     */
    encode(encoder: GPUCommandEncoder, nodeCount: number, rootSize: number): void;
    destroy(): void;
}
