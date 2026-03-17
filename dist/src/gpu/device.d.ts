export interface GPUContext {
    device: GPUDevice;
    context: GPUCanvasContext;
    format: GPUTextureFormat;
    canvas: HTMLCanvasElement;
    supportsTimestampQuery: boolean;
    features: ReadonlySet<string>;
}
export declare function initWebGPU(canvas: HTMLCanvasElement): Promise<GPUContext>;
