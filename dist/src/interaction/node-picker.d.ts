import type { Mat4 } from '../utils/math';
export declare class NodePicker {
    private device;
    private pipeline;
    private pickTexture;
    private pickTextureView;
    private readBuffer;
    private cameraBuffer;
    private paramsBuffer;
    private width;
    private height;
    constructor(device: GPUDevice, _format: GPUTextureFormat);
    private createPipeline;
    private ensureTextures;
    renderPickBuffer(encoder: GPUCommandEncoder, positions: GPUBuffer, nodeCount: number, camera: Mat4, viewport: [number, number]): void;
    pickAt(x: number, y: number): Promise<number | null>;
}
