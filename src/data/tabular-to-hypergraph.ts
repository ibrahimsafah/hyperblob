import type { HypergraphData, NodeData, HyperedgeData } from './types';
import type { ParsedCSV } from './csv-parser';

export interface ColumnMapping {
  nodeColumn: number;     // index of column used as node ID
  edgeColumns: number[];  // indices of columns used as hyperedge groupings
}

/**
 * Convert tabular CSV data + column role assignments into a HypergraphData.
 *
 * - The nodeColumn determines node identity (each unique value = one node)
 * - Each edgeColumn creates hyperedges: every unique value in that column
 *   becomes a hyperedge containing all nodes from rows with that value
 * - Singleton hyperedges (size < 2) are dropped
 */
export function tabularToHypergraph(csv: ParsedCSV, mapping: ColumnMapping): HypergraphData {
  const nodeIdToIndex = new Map<string, number>();
  const nodes: NodeData[] = [];
  const hyperedges: HyperedgeData[] = [];

  // Build nodes from the node column (first occurrence wins attrs)
  for (const row of csv.rows) {
    const nodeId = row[mapping.nodeColumn];
    if (!nodeId || nodeIdToIndex.has(nodeId)) continue;

    const index = nodes.length;
    nodeIdToIndex.set(nodeId, index);

    const attrs: Record<string, unknown> = {};
    for (let c = 0; c < csv.headers.length; c++) {
      if (c !== mapping.nodeColumn) {
        attrs[csv.headers[c]] = row[c];
      }
    }

    nodes.push({ id: nodeId, index, group: 0, attrs });
  }

  // Build hyperedges from each edge column
  let edgeIndex = 0;
  for (const colIdx of mapping.edgeColumns) {
    const groups = new Map<string, Set<number>>();

    for (const row of csv.rows) {
      const nodeId = row[mapping.nodeColumn];
      const groupValue = row[colIdx];
      if (!nodeId || !groupValue) continue;

      const ni = nodeIdToIndex.get(nodeId);
      if (ni === undefined) continue;

      if (!groups.has(groupValue)) {
        groups.set(groupValue, new Set());
      }
      groups.get(groupValue)!.add(ni);
    }

    for (const [value, members] of groups) {
      if (members.size < 2) continue;

      hyperedges.push({
        id: `${csv.headers[colIdx]}:${value}`,
        index: edgeIndex++,
        memberIndices: Array.from(members),
        attrs: { name: value, column: csv.headers[colIdx] },
      });
    }
  }

  // Assign group based on first hyperedge membership (mod 16)
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
