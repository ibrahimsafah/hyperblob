import { HyperblobEngine } from './lib';
export declare class App {
    engine: HyperblobEngine;
    private stats;
    private panelInstance;
    private disposed;
    private constructor();
    static create(canvas: HTMLCanvasElement): Promise<App>;
    private setupPanel;
    private loadDefaultDataset;
    private startStatsLoop;
    dispose(): void;
}
