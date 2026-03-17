import type { HypergraphData } from '../../data/types';
export declare function createDataTab(onLoadFile: (data: HypergraphData) => void, onGenerate: (nodeCount: number, heCount: number, maxSize: number) => void): {
    el: HTMLElement;
    updateDataInfo(data: HypergraphData): void;
};
