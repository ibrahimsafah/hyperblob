import type { GPUContext } from '../gpu/device';
import type { BufferManager } from '../gpu/buffer-manager';
import type { Camera } from './camera';
import type { HyperedgeData } from '../data/types';
export declare class MetaballRenderer {
    private gpu;
    private buffers;
    private camera;
    private pipeline;
    private bindGroupLayout;
    private bindGroup;
    private cameraBuffer;
    private paramsBuffer;
    private instanceCapacity;
    private mstCapacity;
    private instanceCount;
    private lastCameraVersion;
    private lastEdges;
    private lastSigma;
    private lastThreshold;
    private lastPositions;
    private paramsArray;
    constructor(gpu: GPUContext, buffers: BufferManager, camera: Camera);
    /**
     * Recompute instance data (bounding boxes + MSTs) from CPU positions.
     * Called every N frames — the fragment shader reads live GPU positions each frame.
     */
    updateInstances(positions: Float32Array, edges: HyperedgeData[], sigma: number, threshold: number, alpha: number, dimmedEdges: Set<number> | null): void;
    private rebuildBindGroup;
    render(renderPass: GPURenderPassEncoder): void;
    /**
     * CPU-side field evaluation at a single point for hit testing.
     * Evaluates Gaussian field + MST bridge field for each visible edge.
     */
    hitTest(worldX: number, worldY: number): number | null;
    /** Force bind group recreation (e.g. when graph data changes) */
    invalidateBindGroup(): void;
    destroy(): void;
}
