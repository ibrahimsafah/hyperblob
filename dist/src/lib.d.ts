import { type GPUContext } from './gpu/device';
import { BufferManager } from './gpu/buffer-manager';
import { type GPUStageTiming } from './gpu/gpu-profiler';
import { Camera } from './render/camera';
import { type HypergraphData, type NodeData, type HyperedgeData, type SimulationParams, type RenderParams } from './data/types';
export interface HyperblobOptions {
    tooltip?: boolean;
    palette?: Float32Array;
    simParams?: Partial<SimulationParams>;
    renderParams?: Partial<RenderParams>;
    onNodeClick?: (nodeIndex: number, node: NodeData) => void;
    onNodeHover?: (nodeIndex: number | null, node: NodeData | null, screenX: number, screenY: number) => void;
    onEdgeClick?: (edgeIndex: number, edge: HyperedgeData) => void;
    onEdgeHover?: (edgeIndex: number | null, edge: HyperedgeData | null, screenX: number, screenY: number) => void;
}
export declare class HyperblobEngine {
    private gpu;
    private buffers;
    camera: Camera;
    private options;
    simParams: SimulationParams;
    renderParams: RenderParams;
    private graphData;
    private nodeCount;
    private selectedNode;
    private visibleNodes;
    private highlightedNodes;
    private nodeFilterPredicate;
    private cpuPositions;
    private cpuPositionsPending;
    private positionCacheCounter;
    private draggedNodeIndex;
    private dragTargetPos;
    private dragSmoothPos;
    private dragPrevPos;
    private nodeRenderPipeline;
    private nodeBindGroup;
    private cameraBuffer;
    private paramsBuffer;
    private paletteBuffer;
    private dragUploadArray;
    private renderParamsArray;
    private lastCameraVersion;
    private inputHandlerInstance;
    private edgeRendererInstance;
    private hullRendererInstance;
    private boundaryRendererInstance;
    private simulation;
    private tooltip;
    private lastHoveredNode;
    private lastHoveredEdge;
    private profiler;
    private running;
    private disposed;
    static create(canvas: HTMLCanvasElement, options?: HyperblobOptions): Promise<HyperblobEngine>;
    private constructor();
    private init;
    private setupInputHandler;
    private createNodePipeline;
    private createNodeBindGroup;
    setData(data: HypergraphData): void;
    start(): void;
    dispose(): void;
    getCamera(): Camera;
    getNodeCount(): number;
    getGraphData(): HypergraphData | null;
    getBufferManager(): BufferManager;
    getGPU(): GPUContext;
    getGPUTimings(): GPUStageTiming[] | null;
    handleResize(): void;
    highlightNodes(indices: number[]): void;
    highlightEdge(edgeIndex: number): void;
    clearHighlight(): void;
    setNodeFilter(predicate: ((node: NodeData, index: number) => boolean) | null): void;
    setPalette(palette: Float32Array): void;
    /**
     * Run the simulation to convergence without rendering.
     * Submits ~N GPU ticks in a tight loop, waits for completion,
     * then updates CPU positions and fits the camera.
     */
    converge(): Promise<void>;
    resetSimulation(): void;
    fitToScreen(): Promise<void>;
    private tick;
    private render;
    private applySelection;
    private uploadHyperedgeBuffers;
    private hitTestEdge;
    private hitTestNode;
}
