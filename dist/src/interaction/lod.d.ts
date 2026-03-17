export interface LODState {
    showEdges: boolean;
    edgeSampleRate: number;
    showHulls: boolean;
    showLabels: boolean;
    nodeMinSize: number;
}
export declare class LODController {
    update(zoom: number, _nodeCount: number): LODState;
}
