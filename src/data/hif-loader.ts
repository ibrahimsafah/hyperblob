import type { HIFDocument, HypergraphData, NodeData, HyperedgeData } from './types';

/**
 * Parse a HIF (Hypergraph Interchange Format) JSON document into our internal
 * HypergraphData representation.
 *
 * - Groups incidences by edge to build hyperedge membership lists
 * - Assigns stable numeric indices to string node IDs (insertion order)
 * - Assigns group based on first hyperedge membership (mod 16)
 * - Handles empty incidences, duplicate nodes in same edge, missing nodes/edges arrays
 */
export function parseHIF(doc: HIFDocument): HypergraphData {
  const nodeIdToIndex = new Map<string, number>();
  const nodes: NodeData[] = [];
  const hyperedges: HyperedgeData[] = [];

  // Collect node attrs from optional nodes array for later merging
  const nodeAttrMap = new Map<string, Record<string, unknown>>();
  if (doc.nodes) {
    for (const entry of doc.nodes) {
      nodeAttrMap.set(entry.node, entry.attrs ?? {});
    }
  }

  // Collect edge attrs from optional edges array for later merging
  const edgeAttrMap = new Map<string | number, Record<string, unknown>>();
  if (doc.edges) {
    for (const entry of doc.edges) {
      edgeAttrMap.set(entry.edge, entry.attrs ?? {});
    }
  }

  // Group incidences by edge to build membership lists
  // Use string key for consistent map lookup (edge can be number or string)
  const edgeMembersMap = new Map<string, { edgeId: number | string; nodeIds: string[] }>();
  const edgeOrder: string[] = []; // preserve insertion order

  for (const inc of doc.incidences ?? []) {
    const edgeKey = String(inc.edge);

    // Ensure node exists
    if (!nodeIdToIndex.has(inc.node)) {
      const index = nodes.length;
      nodeIdToIndex.set(inc.node, index);
      nodes.push({
        id: inc.node,
        index,
        group: 0, // will be assigned after hyperedges are built
        attrs: nodeAttrMap.get(inc.node) ?? {},
      });
    }

    // Add to edge membership
    let entry = edgeMembersMap.get(edgeKey);
    if (!entry) {
      entry = { edgeId: inc.edge, nodeIds: [] };
      edgeMembersMap.set(edgeKey, entry);
      edgeOrder.push(edgeKey);
    }

    // Prevent duplicate node in same edge
    const nodeIndex = nodeIdToIndex.get(inc.node)!;
    if (!entry.nodeIds.includes(inc.node)) {
      entry.nodeIds.push(inc.node);
    } else {
      // Node already in this edge — skip duplicate but nodeIndex is valid
      void nodeIndex;
    }
  }

  // Also ensure nodes from the nodes array that aren't in any incidence get created
  if (doc.nodes) {
    for (const entry of doc.nodes) {
      if (!nodeIdToIndex.has(entry.node)) {
        const index = nodes.length;
        nodeIdToIndex.set(entry.node, index);
        nodes.push({
          id: entry.node,
          index,
          group: 0,
          attrs: entry.attrs ?? {},
        });
      }
    }
  }

  // Build hyperedges
  for (let i = 0; i < edgeOrder.length; i++) {
    const edgeKey = edgeOrder[i];
    const entry = edgeMembersMap.get(edgeKey)!;
    const memberIndices = entry.nodeIds.map((nid) => nodeIdToIndex.get(nid)!);

    hyperedges.push({
      id: entry.edgeId,
      index: i,
      memberIndices,
      attrs: edgeAttrMap.get(entry.edgeId) ?? {},
    });
  }

  // Assign group to each node based on first hyperedge membership (mod 16)
  // Build a lookup: nodeIndex -> first hyperedge index
  const nodeFirstEdge = new Int32Array(nodes.length).fill(-1);
  for (const he of hyperedges) {
    for (const ni of he.memberIndices) {
      if (nodeFirstEdge[ni] === -1) {
        nodeFirstEdge[ni] = he.index;
      }
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].group = nodeFirstEdge[i] >= 0 ? nodeFirstEdge[i] % 16 : 0;
  }

  return { nodes, hyperedges, nodeIdToIndex };
}
