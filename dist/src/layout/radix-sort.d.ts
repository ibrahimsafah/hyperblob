import type { BufferManager } from '../gpu/buffer-manager';
import type { GPUProfiler } from '../gpu/gpu-profiler';
/**
 * GPU Radix Sort for 32-bit unsigned integer keys with associated values.
 * Sorts by performing 4 passes of 8-bit radix sort (LSB to MSB).
 *
 * Each pass: histogram -> prefix sum -> scatter
 */
export declare class RadixSort {
    private device;
    private bufferManager;
    private histogramPipeline;
    private prefixSumPipeline;
    private scatterPipeline;
    private bindGroupLayout;
    private maxNodeCount;
    private profiler;
    private _hasSubgroups;
    private paramsArray;
    private evenBindGroup;
    private oddBindGroup;
    get hasSubgroups(): boolean;
    constructor(device: GPUDevice, bufferManager: BufferManager, maxNodeCount: number, profiler?: GPUProfiler, features?: ReadonlySet<string>);
    private createBuffers;
    private rebuildBindGroups;
    /**
     * Encode sort commands into the given command encoder.
     * Assumes morton_codes and sorted_indices buffers are already populated with input data.
     * After sorting, sorted_indices will contain indices sorted by morton_codes.
     *
     * Input: 'morton-codes' buffer (keys), 'sorted-indices' buffer (values)
     * Output: 'sorted-indices' buffer is sorted by morton code order
     */
    encode(encoder: GPUCommandEncoder, nodeCount: number): void;
    destroy(): void;
}
