import type { HypergraphData, NodeData, HyperedgeData } from './types';

/**
 * Generate a random hypergraph for stress testing.
 *
 * - Random hyperedge sizes between 2 and maxEdgeSize
 * - Every node appears in at least one hyperedge
 * - Group assigned based on first hyperedge membership (mod 16)
 */
export function generateRandomHypergraph(
  nodeCount: number,
  edgeCount: number,
  maxEdgeSize: number,
): HypergraphData {
  // Clamp inputs
  nodeCount = Math.max(1, nodeCount);
  edgeCount = Math.max(1, edgeCount);
  maxEdgeSize = Math.max(2, maxEdgeSize);

  const nodeIdToIndex = new Map<string, number>();
  const nodes: NodeData[] = [];
  const hyperedges: HyperedgeData[] = [];

  // Create nodes
  for (let i = 0; i < nodeCount; i++) {
    const id = `n${i}`;
    nodeIdToIndex.set(id, i);
    nodes.push({
      id,
      index: i,
      group: 0,
      attrs: {},
    });
  }

  // Track which nodes have been assigned to at least one edge
  const nodeInEdge = new Uint8Array(nodeCount);

  // Create random hyperedges
  for (let e = 0; e < edgeCount; e++) {
    const size = 2 + Math.floor(Math.random() * (maxEdgeSize - 1));
    const clampedSize = Math.min(size, nodeCount);
    const memberSet = new Set<number>();

    // Pick random unique members
    while (memberSet.size < clampedSize) {
      memberSet.add(Math.floor(Math.random() * nodeCount));
    }

    const memberIndices = Array.from(memberSet);
    for (const idx of memberIndices) {
      nodeInEdge[idx] = 1;
    }

    hyperedges.push({
      id: e,
      index: e,
      memberIndices,
      attrs: {},
    });
  }

  // Ensure every node is in at least one hyperedge
  for (let i = 0; i < nodeCount; i++) {
    if (!nodeInEdge[i]) {
      // Find an edge that hasn't exceeded maxEdgeSize, or pick a random one
      let heIdx = Math.floor(Math.random() * edgeCount);
      for (let attempt = 0; attempt < edgeCount; attempt++) {
        const candidate = (heIdx + attempt) % edgeCount;
        if (hyperedges[candidate].memberIndices.length < maxEdgeSize) {
          heIdx = candidate;
          break;
        }
      }
      hyperedges[heIdx].memberIndices.push(i);
      nodeInEdge[i] = 1;
    }
  }

  // Assign group to each node based on first hyperedge membership (mod 16)
  const nodeFirstEdge = new Int32Array(nodeCount).fill(-1);
  for (const he of hyperedges) {
    for (const ni of he.memberIndices) {
      if (nodeFirstEdge[ni] === -1) {
        nodeFirstEdge[ni] = he.index;
      }
    }
  }
  for (let i = 0; i < nodeCount; i++) {
    nodes[i].group = nodeFirstEdge[i] >= 0 ? nodeFirstEdge[i] % 16 : 0;
  }

  return { nodes, hyperedges, nodeIdToIndex };
}
