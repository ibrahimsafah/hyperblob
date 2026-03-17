import type { SimulationParams } from '../../data/types';
export declare function createSimulationTab(simParams: SimulationParams, onToggle: (running: boolean) => void, onReset: () => void, onConverge: () => void): {
    el: HTMLElement;
    dispose: () => void;
};
