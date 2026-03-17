export declare class BufferManager {
    private buffers;
    private device;
    private stagingRing;
    constructor(device: GPUDevice);
    createBuffer(name: string, size: number, usage: GPUBufferUsageFlags, label?: string): GPUBuffer;
    uploadData(name: string, data: ArrayBuffer | ArrayBufferView, offset?: number): void;
    getBuffer(name: string): GPUBuffer;
    hasBuffer(name: string): boolean;
    destroyBuffer(name: string): void;
    destroyAll(): void;
    readBuffer(name: string, size: number): Promise<Float32Array>;
}
