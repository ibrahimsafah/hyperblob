// ── HIF (Hypergraph Interchange Format) types ──

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

// ── Internal data model (after parsing) ──

export interface NodeData {
  id: string;
  index: number;
  group: number; // for coloring
  attrs: Record<string, unknown>;
}

export interface HyperedgeData {
  id: number | string;
  index: number;
  memberIndices: number[]; // indices into nodes array
  attrs: Record<string, unknown>;
}

export interface HypergraphData {
  nodes: NodeData[];
  hyperedges: HyperedgeData[];
  nodeIdToIndex: Map<string, number>;
}

// ── Simulation parameters ──

export interface SimulationParams {
  repulsionStrength: number;
  attractionStrength: number;
  linkDistance: number;
  centerStrength: number;
  velocityDecay: number;
  alpha: number;
  alphaTarget: number;
  alphaDecay: number;
  alphaMin: number;
  theta: number; // Barnes-Hut opening angle
  running: boolean;
}

export function defaultSimulationParams(): SimulationParams {
  return {
    repulsionStrength: -300,
    attractionStrength: 0.03,
    linkDistance: 50,
    centerStrength: 0.01,
    velocityDecay: 0.6,
    alpha: 1.0,
    alphaTarget: 0.02,
    alphaDecay: 0.0228, // ~300 iterations to alphaMin
    alphaMin: 0.001,
    theta: 0.9,
    running: true,
  };
}

// ── Rendering parameters ──

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

export function defaultRenderParams(): RenderParams {
  return {
    nodeBaseSize: 10,
    edgeOpacity: 0.0,
    hullAlpha: 0.25,
    hullOutline: false,
    hullMargin: 3,
    hullSmoothing: 4,
    hullMode: 'convex',
    hullMetaballThreshold: 0.5,
    nodeDarkMode: true,
    backgroundColor: [0.97, 0.97, 0.98, 1.0],
  };
}
