import type { SimulationParams, RenderParams, HypergraphData } from '../data/types';
import type { Camera } from '../render/camera';
export interface PanelConfig {
    simParams: SimulationParams;
    renderParams: RenderParams;
    camera: Camera;
    onLoadFile: (data: HypergraphData) => void;
    onGenerate: (nodeCount: number, heCount: number, maxSize: number) => void;
    onSimulationToggle: (running: boolean) => void;
    onSimulationReset: () => void;
    onSimulationConverge: () => void;
    onFitToScreen: () => void;
}
export declare class Panel {
    private container;
    private dataTabHandle;
    private disposers;
    constructor(container: HTMLElement, config: PanelConfig);
    private build;
    updateDataInfo(data: HypergraphData): void;
    dispose(): void;
    private disposeTabTimers;
    private injectStyles;
}
