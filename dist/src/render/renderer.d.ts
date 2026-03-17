import type { GPUContext } from '../gpu/device';
import type { BufferManager } from '../gpu/buffer-manager';
import type { Camera } from './camera';
import type { HypergraphData, RenderParams } from '../data/types';
import { EdgeRenderer } from './edge-renderer';
import { HullCompute } from './hull-compute';
import { HullRenderer } from './hull-renderer';
import { NodeRenderer } from './node-renderer';
export declare class Renderer {
    private gpu;
    private buffers;
    private camera;
    private edgeRenderer;
    private hullCompute;
    private hullRenderer;
    private nodeRenderer;
    private graphData;
    constructor(gpu: GPUContext, buffers: BufferManager, camera: Camera);
    /**
     * Set the hypergraph data for all sub-renderers.
     */
    setData(data: HypergraphData): void;
    /**
     * Render all layers in back-to-front order.
     * Called from the app's render loop within an active render pass.
     */
    render(renderParams: RenderParams): void;
    /**
     * Pick the node closest to the given screen coordinates.
     * Returns the node index or null if no node is close enough.
     */
    pickNodeAt(x: number, y: number): Promise<number | null>;
    getEdgeRenderer(): EdgeRenderer;
    getHullCompute(): HullCompute;
    getHullRenderer(): HullRenderer;
    getNodeRenderer(): NodeRenderer;
}
