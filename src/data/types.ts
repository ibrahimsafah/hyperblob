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
    alphaTarget: 0.0,
    alphaDecay: 0.0228, // ~300 iterations to alphaMin
    alphaMin: 0.001,
    theta: 0.9,
    running: true,
  };
}

// ── Rendering parameters ──

export interface RenderParams {
  nodeBaseSize: number;
  edgeOpacity: number;
  hullAlpha: number;
  hullOutline: boolean;
  hullMargin: number;
  backgroundColor: [number, number, number, number];
}

export function defaultRenderParams(): RenderParams {
  return {
    nodeBaseSize: 6,
    edgeOpacity: 0.3,
    hullAlpha: 0.15,
    hullOutline: true,
    hullMargin: 12,
    backgroundColor: [0.04, 0.04, 0.06, 1.0],
  };
}
