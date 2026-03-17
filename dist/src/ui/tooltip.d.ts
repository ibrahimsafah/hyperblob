export declare class Tooltip {
    private el;
    constructor(parent: HTMLElement);
    show(x: number, y: number, label: string, members: string[]): void;
    showNode(x: number, y: number, nodeLabel: string, edges: string[]): void;
    hide(): void;
    private position;
    dispose(): void;
}
