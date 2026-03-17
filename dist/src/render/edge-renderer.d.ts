import type { GPUContext } from '../gpu/device';
import type { BufferManager } from '../gpu/buffer-manager';
import type { Camera } from './camera';
import type { HypergraphData, RenderParams } from '../data/types';
export declare class EdgeRenderer {
    private gpu;
    private buffers;
    private camera;
    private pipeline;
    private bindGroup;
    private cameraBuffer;
    private edgeParamsBuffer;
    private totalLineSegments;
    private lastCameraVersion;
    private edgeParamsArray;
    private edgeCount;
    constructor(gpu: GPUContext, buffers: BufferManager, camera: Camera);
    private initPipeline;
    /**
     * Build the edge-draw-indices buffer from hypergraph data.
     * Each entry is a pair: (hyperedge_index, member_node_index).
     * One pair per line segment (centroid -> member).
     */
    setData(data: HypergraphData): void;
    /**
     * Rebuild edge-draw-indices with only the visible edges.
     * When visibleEdges is null, all edges are shown (same as setData).
     */
    setVisibleEdges(data: HypergraphData, visibleEdges: Set<number> | null): void;
    /** Set dimmed edges — dimmed edges render at 12% alpha. Pass null to clear. */
    setDimmedEdges(dimmedSet: Set<number> | null): void;
    private recreateBindGroup;
    render(renderPass: GPURenderPassEncoder, renderParams: RenderParams): void;
}
