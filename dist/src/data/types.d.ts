export interface HIFIncidence {
    node: string;
    edge: number | string;
    weight?: number;
}
export interface HIFNodeEntry {
    node: string;
    attrs?: Record<string, unknown>;
}
export interface HIFEdgeEntry {
    edge: number | string;
    attrs?: Record<string, unknown>;
}
export interface HIFDocument {
    'network-type'?: string;
    metadata?: Record<string, unknown>;
    incidences: HIFIncidence[];
    nodes?: HIFNodeEntry[];
    edges?: HIFEdgeEntry[];
}
export interface NodeData {
    id: string;
    index: number;
    group: number;
    attrs: Record<string, unknown>;
}
export interface HyperedgeData {
    id: number | string;
    index: number;
    memberIndices: number[];
    attrs: Record<string, unknown>;
}
export interface HypergraphData {
    nodes: NodeData[];
    hyperedges: HyperedgeData[];
    nodeIdToIndex: Map<string, number>;
}
export interface SimulationParams {
    repulsionStrength: number;
    attractionStrength: number;
    linkDistance: number;
    centerStrength: number;
    velocityDecay: number;
    energy: number;
    idleEnergy: number;
    coolingRate: number;
    stopThreshold: number;
    theta: number;
    running: boolean;
}
export declare function defaultSimulationParams(): SimulationParams;
export type HullMode = 'convex' | 'metaball';
export interface RenderParams {
    nodeBaseSize: number;
    edgeOpacity: number;
    hullAlpha: number;
    hullOutline: boolean;
    hullMargin: number;
    hullSmoothing: number;
    hullMode: HullMode;
    hullMetaballThreshold: number;
    nodeDarkMode: boolean;
    backgroundColor: [number, number, number, number];
}
export declare function defaultRenderParams(): RenderParams;
