// Metaball hull utilities — MST and distance computations
// Used by metaball-renderer.ts for bridge field computation and hit testing

import type { Vec2 } from '../utils/math';

/** Squared distance from point (px,py) to nearest point on segment (ax,ay)→(bx,by) */
export function distToSegmentSq(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) {
    // Degenerate segment (a ≈ b)
    const ex = px - ax, ey = py - ay;
    return ex * ex + ey * ey;
  }
  // Project point onto line, clamp t to [0,1]
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const nearX = ax + t * dx;
  const nearY = ay + t * dy;
  const ex = px - nearX, ey = py - nearY;
  return ex * ex + ey * ey;
}

/** Prim's MST on a set of 2D points. Returns index pairs. */
export function computeMST(points: Vec2[]): [number, number][] {
  const n = points.length;
  if (n < 2) return [];

  const inTree = new Uint8Array(n);
  const minDist = new Float64Array(n).fill(Infinity);
  const minFrom = new Int32Array(n).fill(-1);
  const edges: [number, number][] = [];

  // Start from node 0
  inTree[0] = 1;
  for (let j = 1; j < n; j++) {
    const dx = points[j][0] - points[0][0];
    const dy = points[j][1] - points[0][1];
    minDist[j] = dx * dx + dy * dy;
    minFrom[j] = 0;
  }

  for (let added = 1; added < n; added++) {
    // Find closest non-tree node
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (!inTree[j] && minDist[j] < bestDist) {
        bestDist = minDist[j];
        best = j;
      }
    }
    if (best === -1) break;

    inTree[best] = 1;
    edges.push([minFrom[best], best]);

    // Update distances from the newly added node
    for (let j = 0; j < n; j++) {
      if (inTree[j]) continue;
      const dx = points[j][0] - points[best][0];
      const dy = points[j][1] - points[best][1];
      const d = dx * dx + dy * dy;
      if (d < minDist[j]) {
        minDist[j] = d;
        minFrom[j] = best;
      }
    }
  }

  return edges;
}
