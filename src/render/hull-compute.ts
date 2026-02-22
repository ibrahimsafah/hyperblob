// CPU convex hull computation using Andrew's monotone chain algorithm
// Computes padded convex hulls for each hyperedge, smoothed with Chaikin subdivision

import type { Vec2 } from '../utils/math';
import type { HyperedgeData } from '../data/types';

export interface HullData {
  /** Hull polygon vertices (smoothed) */
  vertices: Vec2[];
  /** Centroid of the hull */
  centroid: Vec2;
  /** Index of the hyperedge this hull belongs to */
  hyperedgeIndex: number;
  /** Fan-triangulated triangles: [centroid, v0, v1, centroid, v1, v2, ...] */
  triangles: Vec2[];
}

// ── Geometry primitives ──

/** Cross product of vectors OA and OB where O is origin point */
function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/**
 * Andrew's monotone chain convex hull algorithm.
 * Returns hull vertices in CCW order.
 */
function convexHull(points: Vec2[]): Vec2[] {
  const n = points.length;
  if (n <= 1) return points.slice();

  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (n === 2) return sorted;

  // Build lower hull
  const lower: Vec2[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Build upper hull
  const upper: Vec2[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// ── Shape generators ──


/**
 * Chaikin corner-cutting subdivision for closed polygons.
 * Each iteration replaces each edge AB with two points at 25% and 75%.
 * Doubles the vertex count per iteration → smooth organic curves.
 */
function chaikinSmooth(vertices: Vec2[], iterations: number): Vec2[] {
  if (iterations <= 0 || vertices.length < 3) return vertices;

  const n0 = vertices.length;
  const finalN = n0 * (1 << iterations);
  let src = new Float32Array(finalN * 2);
  let dst = new Float32Array(finalN * 2);

  for (let i = 0; i < n0; i++) {
    src[i * 2] = vertices[i][0];
    src[i * 2 + 1] = vertices[i][1];
  }

  let count = n0;
  for (let iter = 0; iter < iterations; iter++) {
    const newCount = count * 2;
    for (let i = 0; i < count; i++) {
      const j = ((i + 1) % count);
      const ax = src[i * 2], ay = src[i * 2 + 1];
      const bx = src[j * 2], by = src[j * 2 + 1];
      const out = i * 4;
      dst[out]     = 0.75 * ax + 0.25 * bx;
      dst[out + 1] = 0.75 * ay + 0.25 * by;
      dst[out + 2] = 0.25 * ax + 0.75 * bx;
      dst[out + 3] = 0.25 * ay + 0.75 * by;
    }
    count = newCount;
    const tmp = src; src = dst; dst = tmp;
  }

  const result: Vec2[] = new Array(count);
  for (let i = 0; i < count; i++) {
    result[i] = [src[i * 2], src[i * 2 + 1]];
  }
  return result;
}

// ── Helpers ──

function computeCentroid(points: Vec2[]): Vec2 {
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p[0];
    cy += p[1];
  }
  return [cx / points.length, cy / points.length];
}

/** Fan-triangulate a convex polygon from its centroid */
function fanTriangulate(centroid: Vec2, hull: Vec2[]): Vec2[] {
  const triangles: Vec2[] = [];
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    triangles.push(centroid, hull[i], hull[(i + 1) % n]);
  }
  return triangles;
}

// Precomputed unit circle offsets for 8-segment disc padding (eliminates trig in hot loop)
const DISC_SEGMENTS = 8;
const DISC_COS = new Float64Array(DISC_SEGMENTS);
const DISC_SIN = new Float64Array(DISC_SEGMENTS);
for (let i = 0; i < DISC_SEGMENTS; i++) {
  const angle = (Math.PI * 2 * i) / DISC_SEGMENTS;
  DISC_COS[i] = Math.cos(angle);
  DISC_SIN[i] = Math.sin(angle);
}

/**
 * Pad each point with circle-offset points, then compute convex hull.
 * This is equivalent to the Minkowski sum of the point set with a disc,
 * creating a hull that "hugs" each node with a uniform buffer zone.
 */
function paddedConvexHull(points: Vec2[], margin: number): Vec2[] {
  const padded: Vec2[] = [];
  for (const p of points) {
    for (let a = 0; a < DISC_SEGMENTS; a++) {
      padded.push([
        p[0] + margin * DISC_COS[a],
        p[1] + margin * DISC_SIN[a],
      ]);
    }
  }
  return convexHull(padded);
}

// ── Main class ──

export class HullCompute {
  /**
   * Compute hulls for all hyperedges.
   *  - 2 members → capsule (stadium)
   *  - 3+ members → padded convex hull + Chaikin smoothing
   */
  computeHulls(
    positions: Float32Array,
    hyperedges: HyperedgeData[],
    margin: number,
    smoothIterations = 0,
  ): HullData[] {
    const results: HullData[] = [];
    const effectiveMargin = Math.max(margin, 1);

    for (const he of hyperedges) {
      if (he.memberIndices.length < 2) continue;

      // Extract member positions
      const points: Vec2[] = [];
      for (const nodeIdx of he.memberIndices) {
        const base = nodeIdx * 4;
        points.push([positions[base], positions[base + 1]]);
      }

      const centroid = computeCentroid(points);

      // 2+ members → padded convex hull + smoothing
      const hull = paddedConvexHull(points, effectiveMargin);
      if (hull.length < 3) continue;
      const shape = chaikinSmooth(hull, smoothIterations);

      const triangles = fanTriangulate(centroid, shape);
      results.push({
        vertices: shape,
        centroid,
        hyperedgeIndex: he.index,
        triangles,
      });
    }

    return results;
  }
}
