// CPU convex hull computation using Andrew's monotone chain algorithm
// Computes convex hulls for each hyperedge, expanded by a configurable margin

import type { Vec2 } from '../utils/math';
import type { HyperedgeData } from '../data/types';

export interface HullData {
  /** Convex hull polygon vertices in CCW order */
  vertices: Vec2[];
  /** Centroid of the hull */
  centroid: Vec2;
  /** Index of the hyperedge this hull belongs to */
  hyperedgeIndex: number;
  /** Fan-triangulated triangles: [centroid, v0, v1, centroid, v1, v2, ...] */
  triangles: Vec2[];
}

/** Cross product of vectors OA and OB where O is origin point */
function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/**
 * Andrew's monotone chain convex hull algorithm.
 * Returns hull vertices in CCW order.
 * Input points are not modified.
 */
function convexHull(points: Vec2[]): Vec2[] {
  const n = points.length;
  if (n <= 1) return points.slice();

  // Sort by x, then by y
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

  // Remove last point of each half because it's repeated
  lower.pop();
  upper.pop();

  return lower.concat(upper);
}

/** Check if all points are approximately collinear */
function areCollinear(points: Vec2[]): boolean {
  if (points.length < 3) return true;
  const eps = 1e-6;
  for (let i = 2; i < points.length; i++) {
    if (Math.abs(cross(points[0], points[1], points[i])) > eps) {
      return false;
    }
  }
  return true;
}

/**
 * Create a thin rectangle around a line defined by collinear points.
 * Returns 4 vertices forming a rectangle with the given half-width.
 */
function collinearRect(points: Vec2[], halfWidth: number): Vec2[] {
  // Find the two extreme points along the line
  let minP = points[0];
  let maxP = points[0];
  // Use the first and last sorted points as endpoints
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  minP = sorted[0];
  maxP = sorted[sorted.length - 1];

  // Direction along the line
  const dx = maxP[0] - minP[0];
  const dy = maxP[1] - minP[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) {
    // All points are the same; create a small square
    return [
      [minP[0] - halfWidth, minP[1] - halfWidth],
      [minP[0] + halfWidth, minP[1] - halfWidth],
      [minP[0] + halfWidth, minP[1] + halfWidth],
      [minP[0] - halfWidth, minP[1] + halfWidth],
    ];
  }

  // Normal perpendicular to the line
  const nx = -dy / len * halfWidth;
  const ny = dx / len * halfWidth;

  // Extend endpoints slightly along the line direction
  const ex = dx / len * halfWidth;
  const ey = dy / len * halfWidth;

  return [
    [minP[0] - ex + nx, minP[1] - ey + ny],
    [maxP[0] + ex + nx, maxP[1] + ey + ny],
    [maxP[0] + ex - nx, maxP[1] + ey - ny],
    [minP[0] - ex - nx, minP[1] - ey - ny],
  ];
}

/** Expand hull vertices outward from centroid by the given margin */
function expandHull(vertices: Vec2[], centroid: Vec2, margin: number): Vec2[] {
  if (margin <= 0) return vertices;

  return vertices.map((v) => {
    const dx = v[0] - centroid[0];
    const dy = v[1] - centroid[1];
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1e-10) return v;
    const scale = margin / dist;
    return [v[0] + dx * scale, v[1] + dy * scale] as Vec2;
  });
}

/** Compute centroid of a set of points */
function computeCentroid(points: Vec2[]): Vec2 {
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p[0];
    cy += p[1];
  }
  const n = points.length;
  return [cx / n, cy / n];
}

/** Fan-triangulate a convex polygon from its centroid */
function fanTriangulate(centroid: Vec2, hull: Vec2[]): Vec2[] {
  const triangles: Vec2[] = [];
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    triangles.push(centroid, hull[i], hull[next]);
  }
  return triangles;
}

export class HullCompute {
  /**
   * Compute convex hulls for all hyperedges with 3+ members.
   * @param positions Float32Array with [x, y, vx, vy] per node
   * @param hyperedges Array of hyperedge data
   * @param margin Expansion margin in world-space units
   * @returns Array of HullData for each qualifying hyperedge
   */
  computeHulls(
    positions: Float32Array,
    hyperedges: HyperedgeData[],
    margin: number,
  ): HullData[] {
    const results: HullData[] = [];

    for (const he of hyperedges) {
      if (he.memberIndices.length < 3) continue;

      // Extract member positions
      const points: Vec2[] = [];
      for (const nodeIdx of he.memberIndices) {
        const base = nodeIdx * 4;
        points.push([positions[base], positions[base + 1]]);
      }

      let hull: Vec2[];
      if (areCollinear(points)) {
        // For collinear points, create a thin rectangle
        hull = collinearRect(points, Math.max(margin, 5));
      } else {
        hull = convexHull(points);
      }

      if (hull.length < 3) continue;

      const centroid = computeCentroid(points);

      // Expand hull outward by margin
      const expanded = expandHull(hull, centroid, margin);

      // Fan-triangulate from centroid
      const triangles = fanTriangulate(centroid, expanded);

      results.push({
        vertices: expanded,
        centroid,
        hyperedgeIndex: he.index,
        triangles,
      });
    }

    return results;
  }
}
