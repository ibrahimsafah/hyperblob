export declare class Stats {
    private el;
    private frames;
    private lastTime;
    private nodeCount;
    private edgeCount;
    constructor(container: HTMLElement);
    setDataInfo(nodes: number, edges: number): void;
    update(): void;
}
