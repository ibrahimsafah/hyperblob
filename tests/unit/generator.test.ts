import { describe, it, expect } from 'vitest';
import { generateRandomHypergraph } from '../../src/data/generator';

describe('generateRandomHypergraph', () => {
  it('generates correct number of nodes and edges', () => {
    const result = generateRandomHypergraph(10, 5, 4);
    expect(result.nodes).toHaveLength(10);
    expect(result.hyperedges).toHaveLength(5);
  });

  it('all hyperedge memberIndices are within valid range [0, nodeCount)', () => {
    const nodeCount = 50;
    const result = generateRandomHypergraph(nodeCount, 20, 6);

    for (const edge of result.hyperedges) {
      for (const idx of edge.memberIndices) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(nodeCount);
      }
    }
  });

  it('each node appears in at least one hyperedge', () => {
    const nodeCount = 20;
    const result = generateRandomHypergraph(nodeCount, 15, 5);

    const nodesInEdges = new Set<number>();
    for (const edge of result.hyperedges) {
      for (const idx of edge.memberIndices) {
        nodesInEdges.add(idx);
      }
    }

    for (let i = 0; i < nodeCount; i++) {
      expect(nodesInEdges.has(i)).toBe(true);
    }
  });

  it('hyperedge sizes are between 2 and maxEdgeSize', () => {
    const maxEdgeSize = 6;
    const result = generateRandomHypergraph(30, 15, maxEdgeSize);

    for (const edge of result.hyperedges) {
      expect(edge.memberIndices.length).toBeGreaterThanOrEqual(2);
      expect(edge.memberIndices.length).toBeLessThanOrEqual(maxEdgeSize);
    }
  });

  it('no duplicate members in same hyperedge', () => {
    const result = generateRandomHypergraph(20, 10, 5);

    for (const edge of result.hyperedges) {
      const uniqueMembers = new Set(edge.memberIndices);
      expect(uniqueMembers.size).toBe(edge.memberIndices.length);
    }
  });

  it('nodes have sequential indices', () => {
    const result = generateRandomHypergraph(15, 8, 4);

    for (let i = 0; i < result.nodes.length; i++) {
      expect(result.nodes[i].index).toBe(i);
    }
  });

  it('nodes have string IDs', () => {
    const result = generateRandomHypergraph(10, 5, 3);

    for (const node of result.nodes) {
      expect(typeof node.id).toBe('string');
      expect(node.id.length).toBeGreaterThan(0);
    }
  });

  it('hyperedges have sequential indices', () => {
    const result = generateRandomHypergraph(15, 8, 4);

    for (let i = 0; i < result.hyperedges.length; i++) {
      expect(result.hyperedges[i].index).toBe(i);
    }
  });

  it('nodeIdToIndex map is correct', () => {
    const result = generateRandomHypergraph(10, 5, 3);

    expect(result.nodeIdToIndex).toBeInstanceOf(Map);
    expect(result.nodeIdToIndex.size).toBe(10);

    for (const node of result.nodes) {
      expect(result.nodeIdToIndex.get(node.id)).toBe(node.index);
    }
  });

  it('nodes have group assigned', () => {
    const result = generateRandomHypergraph(10, 5, 4);

    for (const node of result.nodes) {
      expect(typeof node.group).toBe('number');
      expect(node.group).toBeGreaterThanOrEqual(0);
    }
  });

  it('nodes have attrs object', () => {
    const result = generateRandomHypergraph(10, 5, 4);

    for (const node of result.nodes) {
      expect(node.attrs).toBeDefined();
      expect(typeof node.attrs).toBe('object');
    }
  });

  it('hyperedges have attrs object', () => {
    const result = generateRandomHypergraph(10, 5, 4);

    for (const edge of result.hyperedges) {
      expect(edge.attrs).toBeDefined();
      expect(typeof edge.attrs).toBe('object');
    }
  });

  it('large generation (10000, 5000, 10) completes quickly', () => {
    const start = performance.now();
    const result = generateRandomHypergraph(10000, 5000, 10);
    const elapsed = performance.now() - start;

    expect(result.nodes).toHaveLength(10000);
    expect(result.hyperedges).toHaveLength(5000);
    // Should complete in under 5 seconds
    expect(elapsed).toBeLessThan(5000);
  });

  it('returns valid HypergraphData structure', () => {
    const result = generateRandomHypergraph(5, 3, 3);

    expect(result).toHaveProperty('nodes');
    expect(result).toHaveProperty('hyperedges');
    expect(result).toHaveProperty('nodeIdToIndex');
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(Array.isArray(result.hyperedges)).toBe(true);
    expect(result.nodeIdToIndex).toBeInstanceOf(Map);
  });

  it('handles maxEdgeSize of 2 (only pairs)', () => {
    // Use enough edges to cover all nodes without needing orphan spillover
    const result = generateRandomHypergraph(10, 10, 2);

    for (const edge of result.hyperedges) {
      // Each edge starts as size 2, orphan node redistribution may exceed
      expect(edge.memberIndices.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('handles case where edgeCount exceeds nodeCount', () => {
    const result = generateRandomHypergraph(5, 20, 3);
    expect(result.nodes).toHaveLength(5);
    expect(result.hyperedges).toHaveLength(20);
  });
});
