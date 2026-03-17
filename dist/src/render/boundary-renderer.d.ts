import type { GPUContext } from '../gpu/device';
import type { Camera } from './camera';
/**
 * Renders a circular boundary ring around the graph.
 * Uses triangle-strip topology: alternating inner/outer vertices form a ring.
 */
export declare class BoundaryRenderer {
    private gpu;
    private camera;
    private pipeline;
    private bindGroup;
    private cameraBuffer;
    private vertexBuffer;
    private vertexCount;
    private lastCameraVersion;
    private centerX;
    private centerY;
    private radius;
    constructor(gpu: GPUContext, camera: Camera);
    /**
     * Recompute boundary circle from current node positions.
     * Finds the bounding circle (centroid + max distance) and adds padding.
     */
    updateFromPositions(positions: Float32Array, nodeCount: number, nodeBaseSize: number): void;
    private buildRing;
    render(renderPass: GPURenderPassEncoder): void;
}
