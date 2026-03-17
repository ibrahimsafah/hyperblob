export interface GPUStageTiming {
    stage: string;
    ms: number;
}
export declare class GPUProfiler {
    readonly enabled: boolean;
    private querySet;
    private resolveBuffer;
    private readbackBuffer;
    private queryIndex;
    private stages;
    private mapping;
    private latestTimings;
    private frameCount;
    constructor(device: GPUDevice, supportsTimestampQuery: boolean);
    beginFrame(): void;
    timestampWrites(stage: string): GPUComputePassTimestampWrites | undefined;
    resolve(encoder: GPUCommandEncoder): void;
    readback(): Promise<GPUStageTiming[] | null>;
    getLatestTimings(): GPUStageTiming[] | null;
    destroy(): void;
}
