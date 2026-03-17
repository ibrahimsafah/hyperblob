import type { Camera } from '../render/camera';
export interface NodeDragCallbacks {
    hitTest(worldX: number, worldY: number): number | null;
    onDragStart(nodeIndex: number): void;
    onDrag(nodeIndex: number, worldX: number, worldY: number): void;
    onDragEnd(nodeIndex: number): void;
    onClick?(nodeIndex: number | null): void;
    onHoverNode?(nodeIndex: number | null, screenX: number, screenY: number): void;
    hitTestEdge?(worldX: number, worldY: number): number | null;
    onHoverEdge?(edgeIndex: number | null, screenX: number, screenY: number): void;
}
export declare class InputHandler {
    private canvas;
    private camera;
    private dragging;
    private draggedNode;
    private nodeDrag;
    private mousedownPos;
    private mousedownNodeIndex;
    private lastTouchDist;
    private lastTouchCenter;
    private boundHandlers;
    constructor(canvas: HTMLCanvasElement, camera: Camera, nodeDrag?: NodeDragCallbacks);
    private attachListeners;
    private touchDistance;
    private touchCenter;
    dispose(): void;
}
