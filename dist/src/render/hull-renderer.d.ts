import type { GPUContext } from '../gpu/device';
import type { BufferManager } from '../gpu/buffer-manager';
import type { Camera } from './camera';
import type { HypergraphData, RenderParams, HullMode } from '../data/types';
export declare class HullRenderer {
    private gpu;
    private buffers;
    private camera;
    private pipeline;
    private outlinePipeline;
    private bindGroup;
    private cameraBuffer;
    private hullCompute;
    private metaballRenderer;
    private hypergraphData;
    private fillVertexBuffer;
    private fillBufferCapacity;
    private fillVertexCount;
    private outlineVertexBuffer;
    private outlineBufferCapacity;
    private outlineVertexCount;
    private visibleEdges;
    private dimmedEdgeSet;
    private lastHulls;
    private frameCounter;
    private readonly recomputeInterval;
    private needsRecompute;
    private lastCameraVersion;
    constructor(gpu: GPUContext, buffers: BufferManager, camera: Camera);
    private initPipelines;
    private updateBindGroup;
    setData(data: HypergraphData): void;
    setVisibleEdges(visibleEdges: Set<number> | null): void;
    /** Set dimmed edges — dimmed hulls render at reduced alpha. Pass null to clear. */
    setDimmedEdges(dimmedSet: Set<number> | null): void;
    /** Synchronous convex-hull recompute using CPU-side positions (no GPU readback). */
    private recomputeHullsSync;
    /** Synchronous metaball instance update — fragment shader evaluates field per-pixel. */
    private recomputeMetaballs;
    private buildFillVertices;
    private buildOutlineVertices;
    forceRecompute(): void;
    /** Point-in-polygon hit test against cached hulls (ray-casting algorithm).
     *  Tests in reverse order so the topmost (last-rendered) hull wins. */
    hitTest(worldX: number, worldY: number, hullMode?: HullMode): number | null;
    render(renderPass: GPURenderPassEncoder, renderParams: RenderParams, positions: Float32Array | null): void;
}
