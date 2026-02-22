import { describe, it, expect } from 'vitest';
import {
  type ScalarGrid,
  marchingSquares,
  stitchContours,
  earClipTriangulate,
  chaikinSmooth,
  computeMetaballHull,
  computeMST,
  distToSegmentSq,
  addBridgeField,
} from '../../src/render/metaball-hull';
import type { Vec2 } from '../../src/utils/math';

// ── Helpers ──

/** Build a grid from a 2D value function */
function makeGrid(
  cols: number, rows: number,
  fn: (x: number, y: number) => number,
  originX = 0, originY = 0, cellSize = 1,
): ScalarGrid {
  const values = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = originX + c * cellSize;
      const y = originY + r * cellSize;
      values[r * cols + c] = fn(x, y);
    }
  }
  return { values, cols, rows, originX, originY, cellSize };
}

function signedArea(polygon: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  return area / 2;
}

// ── marchingSquares ──

describe('marchingSquares', () => {
  it('returns empty for all-below-threshold grid', () => {
    const grid = makeGrid(10, 10, () => 0);
    const segments = marchingSquares(grid, 0.5);
    expect(segments).toHaveLength(0);
  });

  it('returns empty for all-above-threshold grid', () => {
    const grid = makeGrid(10, 10, () => 1.0);
    const segments = marchingSquares(grid, 0.5);
    expect(segments).toHaveLength(0);
  });

  it('extracts contour from circular field', () => {
    // Gaussian centered at (5,5) on a 11×11 grid
    const grid = makeGrid(11, 11, (x, y) => {
      const dx = x - 5, dy = y - 5;
      return Math.exp(-(dx * dx + dy * dy) / 8);
    });
    const segments = marchingSquares(grid, 0.3);
    expect(segments.length).toBeGreaterThan(4);
  });

  it('handles threshold at exact grid values', () => {
    // Step function: left half = 0, right half = 1
    const grid = makeGrid(10, 10, (x) => x >= 5 ? 1 : 0);
    const segments = marchingSquares(grid, 0.5);
    // Should produce vertical line segments
    expect(segments.length).toBeGreaterThan(0);
  });

  it('handles saddle case (case 5 / case 10)', () => {
    // Checkerboard pattern triggers saddle disambiguation
    const grid = makeGrid(3, 3, (x, y) => {
      return ((x + y) % 2 === 0) ? 1.0 : 0.0;
    });
    const segments = marchingSquares(grid, 0.5);
    // Should produce segments without crashing
    expect(segments).toBeDefined();
  });
});

// ── stitchContours ──

describe('stitchContours', () => {
  it('returns empty for no segments', () => {
    expect(stitchContours([])).toHaveLength(0);
  });

  it('stitches a triangle from 3 segments', () => {
    const a: Vec2 = [0, 0];
    const b: Vec2 = [1, 0];
    const c: Vec2 = [0.5, 1];
    const segments: [Vec2, Vec2][] = [[a, b], [b, c], [c, a]];
    const contours = stitchContours(segments);
    expect(contours).toHaveLength(1);
    expect(contours[0].length).toBe(3);
  });

  it('stitches two disjoint loops', () => {
    // Two separate triangles
    const seg1: [Vec2, Vec2][] = [
      [[0, 0], [1, 0]], [[1, 0], [0.5, 1]], [[0.5, 1], [0, 0]],
    ];
    const seg2: [Vec2, Vec2][] = [
      [[10, 10], [11, 10]], [[11, 10], [10.5, 11]], [[10.5, 11], [10, 10]],
    ];
    const contours = stitchContours([...seg1, ...seg2]);
    expect(contours).toHaveLength(2);
  });

  it('handles reversed segments', () => {
    const a: Vec2 = [0, 0];
    const b: Vec2 = [1, 0];
    const c: Vec2 = [0.5, 1];
    // b→a instead of a→b
    const segments: [Vec2, Vec2][] = [[b, a], [b, c], [c, a]];
    const contours = stitchContours(segments);
    expect(contours.length).toBeGreaterThanOrEqual(1);
    // Should still form a valid polygon
    expect(contours[0].length).toBeGreaterThanOrEqual(3);
  });

  it('produces closed polygon from circular field', () => {
    const grid = makeGrid(21, 21, (x, y) => {
      const dx = x - 10, dy = y - 10;
      return Math.exp(-(dx * dx + dy * dy) / 18);
    });
    const segments = marchingSquares(grid, 0.3);
    const contours = stitchContours(segments);
    expect(contours.length).toBeGreaterThanOrEqual(1);
    // Largest contour should have many vertices (roughly circular)
    const largest = contours.reduce((a, b) => a.length > b.length ? a : b);
    expect(largest.length).toBeGreaterThanOrEqual(8);
  });
});

// ── earClipTriangulate ──

describe('earClipTriangulate', () => {
  it('returns empty for degenerate input', () => {
    expect(earClipTriangulate([])).toHaveLength(0);
    expect(earClipTriangulate([[0, 0]])).toHaveLength(0);
    expect(earClipTriangulate([[0, 0], [1, 0]])).toHaveLength(0);
  });

  it('returns 1 triangle for triangle input', () => {
    const tri: Vec2[] = [[0, 0], [1, 0], [0.5, 1]];
    const result = earClipTriangulate(tri);
    expect(result).toHaveLength(3); // 1 triangle × 3 vertices
  });

  it('returns 2 triangles for quad', () => {
    const quad: Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const result = earClipTriangulate(quad);
    expect(result).toHaveLength(6); // 2 triangles × 3 vertices
  });

  it('returns n-2 triangles for convex polygon', () => {
    // Regular hexagon
    const n = 6;
    const hex: Vec2[] = [];
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n;
      hex.push([Math.cos(angle), Math.sin(angle)]);
    }
    const result = earClipTriangulate(hex);
    expect(result).toHaveLength((n - 2) * 3);
  });

  it('handles concave polygon (L-shape)', () => {
    // L-shaped polygon (concave)
    const L: Vec2[] = [
      [0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2],
    ];
    const result = earClipTriangulate(L);
    expect(result).toHaveLength((L.length - 2) * 3);
  });

  it('handles CW-wound polygon (auto-reverses)', () => {
    // CW quad
    const quad: Vec2[] = [[0, 0], [0, 1], [1, 1], [1, 0]];
    const result = earClipTriangulate(quad);
    expect(result).toHaveLength(6);
  });
});

// ── chaikinSmooth ──

describe('chaikinSmooth', () => {
  it('returns original for 0 iterations', () => {
    const verts: Vec2[] = [[0, 0], [1, 0], [0.5, 1]];
    const result = chaikinSmooth(verts, 0);
    expect(result).toEqual(verts);
  });

  it('returns original for < 3 vertices', () => {
    const verts: Vec2[] = [[0, 0], [1, 0]];
    const result = chaikinSmooth(verts, 3);
    expect(result).toEqual(verts);
  });

  it('doubles vertex count per iteration', () => {
    const verts: Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const r1 = chaikinSmooth(verts, 1);
    const r2 = chaikinSmooth(verts, 2);
    expect(r1).toHaveLength(verts.length * 2);
    expect(r2).toHaveLength(verts.length * 4);
  });

  it('smoothed vertices stay within original bounding box', () => {
    const verts: Vec2[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const smoothed = chaikinSmooth(verts, 3);
    for (const p of smoothed) {
      expect(p[0]).toBeGreaterThanOrEqual(0);
      expect(p[0]).toBeLessThanOrEqual(10);
      expect(p[1]).toBeGreaterThanOrEqual(0);
      expect(p[1]).toBeLessThanOrEqual(10);
    }
  });
});


// ── computeMetaballHull (full CPU pipeline) ──

describe('computeMetaballHull', () => {
  it('returns null for empty nodes', () => {
    const result = computeMetaballHull([], 10, 0.5, 64, 2);
    expect(result).toBeNull();
  });

  it('returns null for singleton (no hull for single-member edges)', () => {
    const result = computeMetaballHull([[5, 5]], 10, 0.5, 64, 2);
    expect(result).toBeNull();
  });

  it('produces hull for cluster of nodes', () => {
    const nodes: Vec2[] = [
      [0, 0], [10, 0], [5, 8],
    ];
    const result = computeMetaballHull(nodes, 8, 0.3, 64, 2);
    expect(result).not.toBeNull();
    expect(result!.vertices.length).toBeGreaterThan(3);
    expect(result!.triangles.length).toBeGreaterThan(0);
  });

  it('produces valid triangulation (multiple of 3 vertices)', () => {
    const nodes: Vec2[] = [
      [0, 0], [10, 0], [10, 10], [0, 10],
    ];
    const result = computeMetaballHull(nodes, 8, 0.3, 64, 2);
    expect(result).not.toBeNull();
    expect(result!.triangles.length % 3).toBe(0);
  });

  it('higher threshold can eliminate contour', () => {
    // Very spread out nodes with high threshold → might not form contour
    const nodes: Vec2[] = [
      [0, 0], [1000, 1000],
    ];
    // Very high threshold: each node's field may not reach 5.0
    const result = computeMetaballHull(nodes, 10, 5.0, 64, 2);
    // Either null or very small contour
    // (the field max for a single Gaussian is 1.0, so threshold=5 should give null)
    expect(result).toBeNull();
  });

  it('centroid is within bounding box of vertices', () => {
    const nodes: Vec2[] = [
      [0, 0], [20, 0], [10, 15],
    ];
    const result = computeMetaballHull(nodes, 10, 0.3, 64, 2);
    if (result) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const v of result.vertices) {
        if (v[0] < minX) minX = v[0];
        if (v[1] < minY) minY = v[1];
        if (v[0] > maxX) maxX = v[0];
        if (v[1] > maxY) maxY = v[1];
      }
      expect(result.centroid[0]).toBeGreaterThanOrEqual(minX);
      expect(result.centroid[0]).toBeLessThanOrEqual(maxX);
      expect(result.centroid[1]).toBeGreaterThanOrEqual(minY);
      expect(result.centroid[1]).toBeLessThanOrEqual(maxY);
    }
  });
});

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

// ── addBridgeField ──

describe('addBridgeField', () => {
  it('raises field values along segment midpoints', () => {
    // Two points far apart on a grid
    const pts: Vec2[] = [[10, 50], [90, 50]];
    const grid = makeGrid(100, 100, () => 0, 0, 0, 1);
    addBridgeField(grid, pts, 5);

    // Midpoint of segment (50, 50) should have elevated field
    const midVal = grid.values[50 * 100 + 50];
    expect(midVal).toBeGreaterThan(0.5);

    // Far-off point (50, 0) should be near zero (well outside bridge)
    const farVal = grid.values[0 * 100 + 50];
    expect(farVal).toBeLessThan(0.01);
  });

  it('does not modify grid for single point (no MST edges)', () => {
    const grid = makeGrid(10, 10, () => 0);
    const before = new Float32Array(grid.values);
    addBridgeField(grid, [[5, 5]], 2);
    expect(grid.values).toEqual(before);
  });

  it('bridges cover all MST edges for 3+ points', () => {
    const pts: Vec2[] = [[10, 50], [50, 50], [90, 50]];
    const grid = makeGrid(100, 100, () => 0, 0, 0, 1);
    addBridgeField(grid, pts, 5);

    // Check midpoint of each MST segment has elevated field
    // Segment 0→1 midpoint: (30, 50)
    expect(grid.values[50 * 100 + 30]).toBeGreaterThan(0.5);
    // Segment 1→2 midpoint: (70, 50)
    expect(grid.values[50 * 100 + 70]).toBeGreaterThan(0.5);
  });
});

// ── computeMetaballHull with bridge connectivity ──

describe('computeMetaballHull bridge connectivity', () => {
  it('produces a single connected contour for distant nodes', () => {
    // Two nodes far apart — without bridges, field between them drops to zero
    const sigma = 10;
    const nodes: Vec2[] = [[0, 0], [100, 0]];
    const result = computeMetaballHull(nodes, sigma, 0.3, 64, 2);

    // With bridges, we should get a non-null hull
    expect(result).not.toBeNull();
    expect(result!.vertices.length).toBeGreaterThan(3);
    expect(result!.triangles.length).toBeGreaterThan(0);
  });

  it('produces hull for 3 distant nodes', () => {
    const sigma = 8;
    const nodes: Vec2[] = [[0, 0], [80, 0], [40, 70]];
    const result = computeMetaballHull(nodes, sigma, 0.3, 64, 2);
    expect(result).not.toBeNull();
    expect(result!.vertices.length).toBeGreaterThan(3);
  });
});
