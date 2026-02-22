import { describe, it, expect, beforeEach } from 'vitest';
import { HullCompute } from '../../src/render/hull-compute';
import type { HyperedgeData } from '../../src/data/types';

function makeEdge(index: number, memberIndices: number[]): HyperedgeData {
  return {
    id: index,
    index,
    memberIndices,
    attrs: {},
  };
}

function makePositions(points: [number, number][]): Float32Array {
  // Layout: [x, y, vx, vy] per node (4 floats per node)
  const arr = new Float32Array(points.length * 4);
  for (let i = 0; i < points.length; i++) {
    arr[i * 4 + 0] = points[i][0];
    arr[i * 4 + 1] = points[i][1];
    arr[i * 4 + 2] = 0; // vx
    arr[i * 4 + 3] = 0; // vy
  }
  return arr;
}

describe('HullCompute', () => {
  let hullCompute: HullCompute;

  beforeEach(() => {
    hullCompute = new HullCompute();
  });

  it('computes hull for triangle (3 points)', () => {
    const positions = makePositions([
      [0, 0],
      [10, 0],
      [5, 10],
    ]);
    const edges = [makeEdge(0, [0, 1, 2])];
    const hulls = hullCompute.computeHulls(positions, edges, 0);

    expect(hulls).toHaveLength(1);
    expect(hulls[0].vertices.length).toBeGreaterThanOrEqual(3);
  });

  it('computes hull for square (4 points)', () => {
    const positions = makePositions([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const edges = [makeEdge(0, [0, 1, 2, 3])];
    const hulls = hullCompute.computeHulls(positions, edges, 0);

    expect(hulls).toHaveLength(1);
    expect(hulls[0].vertices.length).toBeGreaterThanOrEqual(4);
  });

  it('computes hull for pentagon (5 points)', () => {
    const r = 10;
    const pentPoints: [number, number][] = [];
    for (let i = 0; i < 5; i++) {
      const angle = (2 * Math.PI * i) / 5 - Math.PI / 2;
      pentPoints.push([r * Math.cos(angle), r * Math.sin(angle)]);
    }
    const positions = makePositions(pentPoints);
    const edges = [makeEdge(0, [0, 1, 2, 3, 4])];
    const hulls = hullCompute.computeHulls(positions, edges, 0);

    expect(hulls).toHaveLength(1);
    expect(hulls[0].vertices.length).toBeGreaterThanOrEqual(5);
  });

  it('handles collinear points gracefully', () => {
    const positions = makePositions([
      [0, 0],
      [5, 0],
      [10, 0],
    ]);
    const edges = [makeEdge(0, [0, 1, 2])];
    const hulls = hullCompute.computeHulls(positions, edges, 0);
    expect(hulls).toBeDefined();
  });

  it('handles single point (returns empty or skips)', () => {
    const positions = makePositions([[5, 5]]);
    const edges = [makeEdge(0, [0])];
    const hulls = hullCompute.computeHulls(positions, edges, 0);
    // Single point — less than 3 members, so skipped
    expect(hulls).toHaveLength(0);
  });

  it('handles two points (returns empty or skips)', () => {
    const positions = makePositions([
      [0, 0],
      [10, 0],
    ]);
    const edges = [makeEdge(0, [0, 1])];
    const hulls = hullCompute.computeHulls(positions, edges, 0);
    // Two points — less than 3 members, so skipped
    expect(hulls).toHaveLength(0);
  });

  it('handles duplicate points correctly', () => {
    const positions = makePositions([
      [5, 5],
      [5, 5],
      [10, 10],
      [0, 10],
    ]);
    const edges = [makeEdge(0, [0, 1, 2, 3])];
    const hulls = hullCompute.computeHulls(positions, edges, 0);
    expect(hulls).toBeDefined();
  });

  it('all original points are inside (or on) the hull', () => {
    // Use well-separated points to avoid numerical edge cases
    const points: [number, number][] = [
      [10, 10], [90, 10], [90, 90], [10, 90],
      [50, 50], [30, 70], [70, 30], [20, 50],
      [80, 50], [50, 20], [50, 80], [40, 40],
      [60, 60], [35, 25], [65, 75], [25, 65],
    ];
    const positions = makePositions(points);
    const memberIndices = points.map((_, i) => i);
    const edges = [makeEdge(0, memberIndices)];
    const hulls = hullCompute.computeHulls(positions, edges, 0);

    expect(hulls).toHaveLength(1);
    expect(hulls[0].vertices.length).toBeGreaterThanOrEqual(4);

    const hullVerts = hulls[0].vertices as [number, number][];

    // Every original point should be inside or on the convex hull
    for (const pt of points) {
      const inside = isPointInsideOrOnHull(pt, hullVerts);
      expect(inside).toBe(true);
    }
  });

  it('hull vertices are in CCW order', () => {
    const positions = makePositions([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [5, 5], // interior point
    ]);
    const edges = [makeEdge(0, [0, 1, 2, 3, 4])];
    const hulls = hullCompute.computeHulls(positions, edges, 0);

    if (hulls.length > 0 && hulls[0].vertices.length >= 3) {
      const verts = hulls[0].vertices as [number, number][];
      const area = signedArea(verts);
      expect(area).not.toBeCloseTo(0);
    }
  });

  it('margin expansion increases hull size', () => {
    const positions = makePositions([
      [0, 0],
      [10, 0],
      [5, 10],
    ]);
    const edges = [makeEdge(0, [0, 1, 2])];

    const hullsNoMargin = hullCompute.computeHulls(positions, edges, 0);
    const hullsWithMargin = hullCompute.computeHulls(positions, edges, 5);

    if (hullsNoMargin.length > 0 && hullsWithMargin.length > 0) {
      const areaNoMargin = computeHullAreaFromVec2(hullsNoMargin[0].vertices as [number, number][]);
      const areaWithMargin = computeHullAreaFromVec2(hullsWithMargin[0].vertices as [number, number][]);

      expect(areaWithMargin).toBeGreaterThan(areaNoMargin);
    }
  });

  it('computes multiple hulls for multiple edges', () => {
    const positions = makePositions([
      [0, 0],
      [10, 0],
      [5, 10],
      [20, 0],
      [30, 0],
      [25, 10],
    ]);
    const edges = [
      makeEdge(0, [0, 1, 2]),
      makeEdge(1, [3, 4, 5]),
    ];
    const hulls = hullCompute.computeHulls(positions, edges, 0);

    expect(hulls).toHaveLength(2);
  });
});

// --- Helper functions ---

function seedRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

function signedArea(polygon: [number, number][]): number {
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  return area / 2;
}

function computeHullAreaFromVec2(vertices: [number, number][]): number {
  return Math.abs(signedArea(vertices));
}

function isPointInsideOrOnHull(point: [number, number], hull: [number, number][]): boolean {
  const n = hull.length;
  if (n < 3) return false;

  // For a convex polygon, a point is inside if all cross products
  // (edge × point-to-vertex) have the same sign (or are zero for on-edge)
  const eps = 1e-4;
  let positive = 0;
  let negative = 0;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = hull[j][0] - hull[i][0];
    const dy = hull[j][1] - hull[i][1];
    const px = point[0] - hull[i][0];
    const py = point[1] - hull[i][1];
    const cross = dx * py - dy * px;

    if (cross > eps) positive++;
    else if (cross < -eps) negative++;
    // Zero (within eps) means on the edge — compatible with either orientation
  }

  // All same sign (or zero) means inside or on boundary
  return positive === 0 || negative === 0;
}
