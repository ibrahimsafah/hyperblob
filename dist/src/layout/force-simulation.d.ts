import type { BufferManager } from '../gpu/buffer-manager';
import type { HypergraphData, SimulationParams } from '../data/types';
import type { GPUProfiler } from '../gpu/gpu-profiler';
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
export declare class ForceSimulation {
    private device;
    private bufferManager;
    private nodeCount;
    private edgeCount;
    private radixSort;
    private quadtree;
    private mortonPipeline;
    private repulsionPipeline;
    private attractionPipeline;
    private centerAccumPipeline;
    private centerApplyPipeline;
    private integratePipeline;
    private mortonBGL;
    private repulsionBGL;
    private attractionBGL;
    private centerBGL;
    private integrateBGL;
    private mortonBindGroup;
    private repulsionBindGroup;
    private attractionBindGroup;
    private centerBindGroup;
    private integrateBindGroup;
    private mortonParams;
    private mortonParamsF32;
    private mortonParamsU32;
    private repulsionParams;
    private repulsionParamsF32;
    private repulsionParamsU32;
    private attractionParams;
    private attractionParamsF32;
    private attractionParamsU32;
    private centerParams;
    private centerParamsF32;
    private centerParamsU32;
    private integrateParams;
    private integrateParamsF32;
    private integrateParamsU32;
    private profiler;
    private bounds;
    private boundsFrameCounter;
    private boundsUpdateInterval;
    constructor(device: GPUDevice, bufferManager: BufferManager, data: HypergraphData, _params: SimulationParams, profiler?: GPUProfiler, features?: ReadonlySet<string>);
    private allocateBuffers;
    private rebuildBindGroups;
    /**
     * Perform one simulation tick. Dispatches all compute passes.
     */
    tick(params: SimulationParams): void;
    /**
     * Asynchronously read back positions to update bounding box estimate.
     * This happens off the critical path and updates bounds for the next frame.
     */
    private updateBoundsAsync;
    destroy(): void;
}
