import { describe, it, expect } from 'vitest';
import { parseHIF } from '../../src/data/hif-loader';
import type { HIFDocument } from '../../src/data/types';

describe('parseHIF', () => {
  it('parses simple HIF with 3 nodes and 1 hyperedge', () => {
    const doc: HIFDocument = {
      incidences: [
        { node: 'A', edge: 0 },
        { node: 'B', edge: 0 },
        { node: 'C', edge: 0 },
      ],
    };

    const result = parseHIF(doc);
    expect(result.nodes).toHaveLength(3);
    expect(result.hyperedges).toHaveLength(1);
    expect(result.hyperedges[0].memberIndices).toHaveLength(3);
  });

  it('assigns sequential numeric indices to string node IDs', () => {
    const doc: HIFDocument = {
      incidences: [
        { node: 'Alice', edge: 0 },
        { node: 'Bob', edge: 0 },
        { node: 'Charlie', edge: 1 },
      ],
    };

    const result = parseHIF(doc);
    expect(result.nodes[0].id).toBe('Alice');
    expect(result.nodes[0].index).toBe(0);
    expect(result.nodes[1].id).toBe('Bob');
    expect(result.nodes[1].index).toBe(1);
    expect(result.nodes[2].id).toBe('Charlie');
    expect(result.nodes[2].index).toBe(2);
  });

  it('groups incidences by edge correctly for multiple hyperedges', () => {
    const doc: HIFDocument = {
      incidences: [
        { node: 'A', edge: 0 },
        { node: 'B', edge: 0 },
        { node: 'C', edge: 1 },
        { node: 'D', edge: 1 },
        { node: 'E', edge: 1 },
      ],
    };

    const result = parseHIF(doc);
    expect(result.hyperedges).toHaveLength(2);

    const edge0 = result.hyperedges.find(e => e.id === 0);
    const edge1 = result.hyperedges.find(e => e.id === 1);
    expect(edge0).toBeDefined();
    expect(edge1).toBeDefined();
    expect(edge0!.memberIndices).toHaveLength(2);
    expect(edge1!.memberIndices).toHaveLength(3);
  });

  it('handles node appearing in multiple hyperedges', () => {
    const doc: HIFDocument = {
      incidences: [
        { node: 'A', edge: 0 },
        { node: 'B', edge: 0 },
        { node: 'A', edge: 1 },
        { node: 'C', edge: 1 },
      ],
    };

    const result = parseHIF(doc);
    // Node 'A' should appear in both edges
    expect(result.nodes).toHaveLength(3); // A, B, C

    const nodeAIndex = result.nodeIdToIndex.get('A');
    expect(nodeAIndex).toBeDefined();

    const edge0 = result.hyperedges.find(e => e.id === 0);
    const edge1 = result.hyperedges.find(e => e.id === 1);
    expect(edge0!.memberIndices).toContain(nodeAIndex);
    expect(edge1!.memberIndices).toContain(nodeAIndex);
  });

  it('returns empty result for empty incidences array', () => {
    const doc: HIFDocument = {
      incidences: [],
    };

    const result = parseHIF(doc);
    expect(result.nodes).toHaveLength(0);
    expect(result.hyperedges).toHaveLength(0);
    expect(result.nodeIdToIndex.size).toBe(0);
  });

  it('works with missing nodes array (derives from incidences)', () => {
    const doc: HIFDocument = {
      incidences: [
        { node: 'X', edge: 0 },
        { node: 'Y', edge: 0 },
      ],
    };

    const result = parseHIF(doc);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodeIdToIndex.has('X')).toBe(true);
    expect(result.nodeIdToIndex.has('Y')).toBe(true);
  });

  it('works with missing edges array (derives from incidences)', () => {
    const doc: HIFDocument = {
      incidences: [
        { node: 'A', edge: 'e1' },
        { node: 'B', edge: 'e1' },
        { node: 'C', edge: 'e2' },
      ],
    };

    const result = parseHIF(doc);
    expect(result.hyperedges).toHaveLength(2);
  });

  it('handles string edge IDs', () => {
    const doc: HIFDocument = {
      incidences: [
        { node: 'A', edge: 'house-stark' },
        { node: 'B', edge: 'house-stark' },
        { node: 'C', edge: 'house-lannister' },
      ],
    };

    const result = parseHIF(doc);
    expect(result.hyperedges).toHaveLength(2);
    const ids = result.hyperedges.map(e => e.id);
    expect(ids).toContain('house-stark');
    expect(ids).toContain('house-lannister');
  });

  it('deduplicates nodes within same edge', () => {
    const doc: HIFDocument = {
      incidences: [
        { node: 'A', edge: 0 },
        { node: 'A', edge: 0 }, // duplicate
        { node: 'B', edge: 0 },
      ],
    };

    const result = parseHIF(doc);
    // Should only have 2 unique nodes
    expect(result.nodes).toHaveLength(2);
    // Edge should not have duplicate member indices
    const edge = result.hyperedges[0];
    const uniqueMembers = new Set(edge.memberIndices);
    expect(uniqueMembers.size).toBe(edge.memberIndices.length);
  });

  it('assigns node group based on first hyperedge membership', () => {
    const doc: HIFDocument = {
      incidences: [
        { node: 'A', edge: 0 },
        { node: 'B', edge: 0 },
        { node: 'A', edge: 1 },
        { node: 'C', edge: 1 },
      ],
    };

    const result = parseHIF(doc);
    // Node 'A' first appears in edge 0
    const nodeA = result.nodes.find(n => n.id === 'A');
    expect(nodeA).toBeDefined();
    // Group should be based on first edge membership
    expect(typeof nodeA!.group).toBe('number');
  });

  it('builds correct nodeIdToIndex map', () => {
    const doc: HIFDocument = {
      incidences: [
        { node: 'Alice', edge: 0 },
        { node: 'Bob', edge: 0 },
        { node: 'Charlie', edge: 1 },
      ],
    };

    const result = parseHIF(doc);
    expect(result.nodeIdToIndex).toBeInstanceOf(Map);
    expect(result.nodeIdToIndex.size).toBe(3);
    expect(result.nodeIdToIndex.get('Alice')).toBe(0);
    expect(result.nodeIdToIndex.get('Bob')).toBe(1);
    expect(result.nodeIdToIndex.get('Charlie')).toBe(2);
  });

  it('preserves node attrs from nodes array', () => {
    const doc: HIFDocument = {
      incidences: [
        { node: 'A', edge: 0 },
        { node: 'B', edge: 0 },
      ],
      nodes: [
        { node: 'A', attrs: { house: 'Stark' } },
        { node: 'B', attrs: { house: 'Lannister' } },
      ],
    };

    const result = parseHIF(doc);
    const nodeA = result.nodes.find(n => n.id === 'A');
    expect(nodeA!.attrs).toBeDefined();
    expect(nodeA!.attrs.house).toBe('Stark');
  });

  it('preserves edge attrs from edges array', () => {
    const doc: HIFDocument = {
      incidences: [
        { node: 'A', edge: 0 },
        { node: 'B', edge: 0 },
      ],
      edges: [
        { edge: 0, attrs: { type: 'alliance' } },
      ],
    };

    const result = parseHIF(doc);
    const edge0 = result.hyperedges.find(e => e.id === 0);
    expect(edge0!.attrs).toBeDefined();
    expect(edge0!.attrs.type).toBe('alliance');
  });

  it('assigns sequential indices to hyperedges', () => {
    const doc: HIFDocument = {
      incidences: [
        { node: 'A', edge: 10 },
        { node: 'B', edge: 10 },
        { node: 'C', edge: 20 },
        { node: 'D', edge: 20 },
        { node: 'E', edge: 30 },
      ],
    };

    const result = parseHIF(doc);
    const indices = result.hyperedges.map(e => e.index);
    expect(indices).toContain(0);
    expect(indices).toContain(1);
    expect(indices).toContain(2);
  });

  it('handles network-type and metadata fields', () => {
    const doc: HIFDocument = {
      'network-type': 'undirected',
      metadata: { name: 'test graph' },
      incidences: [
        { node: 'A', edge: 0 },
        { node: 'B', edge: 0 },
      ],
    };

    // Should parse without errors
    const result = parseHIF(doc);
    expect(result.nodes).toHaveLength(2);
    expect(result.hyperedges).toHaveLength(1);
  });

  it('handles incidences with weights', () => {
    const doc: HIFDocument = {
      incidences: [
        { node: 'A', edge: 0, weight: 1.5 },
        { node: 'B', edge: 0, weight: 2.0 },
      ],
    };

    // Should parse without errors
    const result = parseHIF(doc);
    expect(result.nodes).toHaveLength(2);
    expect(result.hyperedges).toHaveLength(1);
  });
});
