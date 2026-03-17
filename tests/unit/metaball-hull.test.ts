import { describe, it, expect } from 'vitest';
import {
  computeMST,
  distToSegmentSq,
} from '../../src/render/metaball-hull';
import type { Vec2 } from '../../src/utils/math';

// ── distToSegmentSq ──

describe('distToSegmentSq', () => {
  it('returns 0 for point on segment endpoint', () => {
    expect(distToSegmentSq(0, 0, 0, 0, 10, 0)).toBeCloseTo(0);
    expect(distToSegmentSq(10, 0, 0, 0, 10, 0)).toBeCloseTo(0);
  });

  it('returns 0 for point on segment midpoint', () => {
    expect(distToSegmentSq(5, 0, 0, 0, 10, 0)).toBeCloseTo(0);
  });

  it('returns perpendicular distance squared for point beside segment', () => {
    // Point (5,3) is 3 units above segment (0,0)→(10,0)
    expect(distToSegmentSq(5, 3, 0, 0, 10, 0)).toBeCloseTo(9);
  });

  it('returns endpoint distance when projection is outside segment', () => {
    // Point (-5,0) is 5 units from (0,0), projection falls before segment start
    expect(distToSegmentSq(-5, 0, 0, 0, 10, 0)).toBeCloseTo(25);
    // Point (15,0) is 5 units from (10,0), projection falls past segment end
    expect(distToSegmentSq(15, 0, 0, 0, 10, 0)).toBeCloseTo(25);
  });

  it('handles degenerate (zero-length) segment', () => {
    expect(distToSegmentSq(3, 4, 0, 0, 0, 0)).toBeCloseTo(25);
  });
});

// ── computeMST ──

describe('computeMST', () => {
  it('returns empty for 0 or 1 points', () => {
    expect(computeMST([])).toHaveLength(0);
    expect(computeMST([[5, 5]])).toHaveLength(0);
  });

  it('returns 1 edge for 2 points', () => {
    const edges = computeMST([[0, 0], [10, 0]]);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual([0, 1]);
  });

  it('returns n-1 edges for n points', () => {
    const pts: Vec2[] = [[0, 0], [10, 0], [5, 8], [20, 5]];
    const edges = computeMST(pts);
    expect(edges).toHaveLength(3);
  });

  it('connects all nodes (forms a spanning tree)', () => {
    const pts: Vec2[] = [[0, 0], [100, 0], [50, 80], [25, 40]];
    const edges = computeMST(pts);
    // Verify connectivity via union-find
    const parent = pts.map((_, i) => i);
    function find(x: number): number {
      return parent[x] === x ? x : (parent[x] = find(parent[x]));
    }
    for (const [a, b] of edges) {
      parent[find(a)] = find(b);
    }
    const root = find(0);
    for (let i = 1; i < pts.length; i++) {
      expect(find(i)).toBe(root);
    }
  });

  it('picks shortest edges (MST property)', () => {
    // Collinear points: MST should connect consecutive neighbors
    const pts: Vec2[] = [[0, 0], [10, 0], [20, 0]];
    const edges = computeMST(pts);
    // Total MST weight should be 200 (10² + 10²), not 500 (10² + 20²)
    let totalWeight = 0;
    for (const [a, b] of edges) {
      const dx = pts[a][0] - pts[b][0];
      const dy = pts[a][1] - pts[b][1];
      totalWeight += dx * dx + dy * dy;
    }
    expect(totalWeight).toBeCloseTo(200);
  });
});
