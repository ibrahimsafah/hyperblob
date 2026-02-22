// Metaball (implicit field) hull computation
// Produces concave Euler-diagram-style blobs via Gaussian scalar field + marching squares

import type { Vec2 } from '../utils/math';

export interface MetaballResult {
  vertices: Vec2[];
  triangles: Vec2[];
  centroid: Vec2;
}

// ── Scalar field ──

function evaluateField(px: number, py: number, nodes: Vec2[], sigma: number): number {
  const invTwoSigmaSq = 1 / (2 * sigma * sigma);
  const cutoffSq = 9 * sigma * sigma; // 3-sigma cutoff
  let sum = 0;
  for (let i = 0; i < nodes.length; i++) {
    const dx = px - nodes[i][0];
    const dy = py - nodes[i][1];
    const distSq = dx * dx + dy * dy;
    if (distSq < cutoffSq) {
      sum += Math.exp(-distSq * invTwoSigmaSq);
    }
  }
  return sum;
}

export interface ScalarGrid {
  values: Float32Array;
  cols: number;
  rows: number;
  originX: number;
  originY: number;
  cellSize: number;
}

function buildScalarGrid(nodes: Vec2[], sigma: number, resolution: number): ScalarGrid {
  // Bounding box with padding
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n[0] < minX) minX = n[0];
    if (n[1] < minY) minY = n[1];
    if (n[0] > maxX) maxX = n[0];
    if (n[1] > maxY) maxY = n[1];
  }

  const padding = sigma * 3;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  const width = maxX - minX;
  const height = maxY - minY;
  const maxDim = Math.max(width, height);

  // Adaptive resolution: coarser for larger bounding boxes, capped at 500
  const cellSize = maxDim / Math.min(resolution, 500);
  const cols = Math.ceil(width / cellSize) + 1;
  const rows = Math.ceil(height / cellSize) + 1;

  const values = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const py = minY + r * cellSize;
    for (let c = 0; c < cols; c++) {
      const px = minX + c * cellSize;
      values[r * cols + c] = evaluateField(px, py, nodes, sigma);
    }
  }

  return { values, cols, rows, originX: minX, originY: minY, cellSize };
}

// ── Marching squares ──

type Segment = [Vec2, Vec2];

// Lookup table: each of 16 cases maps to a list of edge pairs
// Edges numbered: 0=top, 1=right, 2=bottom, 3=left
const EDGE_TABLE: number[][][] = [
  [],           // 0: 0000
  [[3, 2]],     // 1: 0001
  [[2, 1]],     // 2: 0010
  [[3, 1]],     // 3: 0011
  [[1, 0]],     // 4: 0100
  [[3, 0], [1, 2]], // 5: 0101 (saddle - disambiguated below)
  [[2, 0]],     // 6: 0110
  [[3, 0]],     // 7: 0111
  [[0, 3]],     // 8: 1000
  [[0, 2]],     // 9: 1001
  [[0, 1], [2, 3]], // 10: 1010 (saddle - disambiguated below)
  [[0, 1]],     // 11: 1011
  [[1, 3]],     // 12: 1100
  [[1, 2]],     // 13: 1101
  [[2, 3]],     // 14: 1110
  [],           // 15: 1111
];

function lerp1d(v0: number, v1: number, threshold: number): number {
  const d = v1 - v0;
  if (Math.abs(d) < 1e-10) return 0.5;
  return (threshold - v0) / d;
}

function getEdgePoint(
  grid: ScalarGrid, r: number, c: number,
  edge: number, threshold: number,
): Vec2 {
  const { values, cols, originX, originY, cellSize } = grid;
  const tl = values[r * cols + c];
  const tr = values[r * cols + c + 1];
  const br = values[(r + 1) * cols + c + 1];
  const bl = values[(r + 1) * cols + c];

  const x0 = originX + c * cellSize;
  const y0 = originY + r * cellSize;
  const x1 = x0 + cellSize;
  const y1 = y0 + cellSize;

  switch (edge) {
    case 0: { // top edge (tl → tr)
      const t = lerp1d(tl, tr, threshold);
      return [x0 + t * cellSize, y0];
    }
    case 1: { // right edge (tr → br)
      const t = lerp1d(tr, br, threshold);
      return [x1, y0 + t * cellSize];
    }
    case 2: { // bottom edge (bl → br)
      const t = lerp1d(bl, br, threshold);
      return [x0 + t * cellSize, y1];
    }
    case 3: { // left edge (tl → bl)
      const t = lerp1d(tl, bl, threshold);
      return [x0, y0 + t * cellSize];
    }
    default:
      return [x0, y0];
  }
}

export function marchingSquares(grid: ScalarGrid, threshold: number): Segment[] {
  const { values, cols, rows } = grid;
  const segments: Segment[] = [];

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = values[r * cols + c] >= threshold ? 1 : 0;
      const tr = values[r * cols + c + 1] >= threshold ? 1 : 0;
      const br = values[(r + 1) * cols + c + 1] >= threshold ? 1 : 0;
      const bl = values[(r + 1) * cols + c] >= threshold ? 1 : 0;

      const caseIndex = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (caseIndex === 0 || caseIndex === 15) continue;

      let edgePairs = EDGE_TABLE[caseIndex];

      // Saddle disambiguation: use center value
      if (caseIndex === 5 || caseIndex === 10) {
        const center = (values[r * cols + c] + values[r * cols + c + 1] +
          values[(r + 1) * cols + c + 1] + values[(r + 1) * cols + c]) / 4;
        if (caseIndex === 5) {
          edgePairs = center >= threshold ? [[3, 2], [1, 0]] : [[3, 0], [1, 2]];
        } else {
          edgePairs = center >= threshold ? [[0, 3], [2, 1]] : [[0, 1], [2, 3]];
        }
      }

      for (const [e0, e1] of edgePairs) {
        const p0 = getEdgePoint(grid, r, c, e0, threshold);
        const p1 = getEdgePoint(grid, r, c, e1, threshold);
        segments.push([p0, p1]);
      }
    }
  }

  return segments;
}

// ── Contour stitching ──

const HASH_PRECISION = 1e4;

function hashPoint(p: Vec2): string {
  return `${Math.round(p[0] * HASH_PRECISION)},${Math.round(p[1] * HASH_PRECISION)}`;
}

export function stitchContours(segments: Segment[]): Vec2[][] {
  if (segments.length === 0) return [];

  // Build adjacency: endpoint → list of segment indices
  const adj = new Map<string, number[]>();
  for (let i = 0; i < segments.length; i++) {
    for (const pt of segments[i]) {
      const key = hashPoint(pt);
      const list = adj.get(key);
      if (list) list.push(i);
      else adj.set(key, [i]);
    }
  }

  const used = new Uint8Array(segments.length);
  const contours: Vec2[][] = [];

  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue;

    const chain: Vec2[] = [segments[start][0], segments[start][1]];
    used[start] = 1;

    // Walk forward from end of chain
    let maxIter = segments.length;
    while (maxIter-- > 0) {
      const endKey = hashPoint(chain[chain.length - 1]);
      const neighbors = adj.get(endKey);
      if (!neighbors) break;

      let found = false;
      for (const idx of neighbors) {
        if (used[idx]) continue;
        used[idx] = 1;
        const seg = segments[idx];
        const h0 = hashPoint(seg[0]);
        const h1 = hashPoint(seg[1]);

        if (h0 === endKey) {
          chain.push(seg[1]);
        } else if (h1 === endKey) {
          chain.push(seg[0]);
        }
        found = true;
        break;
      }
      if (!found) break;
    }

    // Check if chain is closed (start ≈ end)
    const startKey = hashPoint(chain[0]);
    const lastKey = hashPoint(chain[chain.length - 1]);
    if (startKey === lastKey && chain.length > 2) {
      chain.pop(); // remove duplicate closing point
    }

    if (chain.length >= 3) {
      contours.push(chain);
    }
  }

  return contours;
}

// ── Ear-clipping triangulation ──
// Uses a doubly-linked index list to avoid array allocations in the inner loop.

function cross2d(o: Vec2, a: Vec2, b: Vec2): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = cross2d(p, a, b);
  const d2 = cross2d(p, b, c);
  const d3 = cross2d(p, c, a);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

/**
 * Try fan-triangulation from centroid. Returns null if polygon is not star-convex.
 * O(n) — used as fast path before falling back to ear-clip.
 */
export function fanTriangulateFromCentroid(polygon: Vec2[]): Vec2[] | null {
  const n = polygon.length;
  if (n < 3) return null;

  // Compute centroid
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    cx += polygon[i][0];
    cy += polygon[i][1];
  }
  cx /= n;
  cy /= n;

  const triangles: Vec2[] = [];
  const centroid: Vec2 = [cx, cy];

  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    // Check winding: centroid → a → b should be CCW (positive cross product)
    const cross = (a[0] - cx) * (b[1] - cy) - (a[1] - cy) * (b[0] - cx);
    if (cross <= 0) return null; // Not star-convex from centroid
    triangles.push(centroid, a, b);
  }

  return triangles;
}

export function earClipTriangulate(polygon: Vec2[]): Vec2[] {
  const n = polygon.length;
  if (n < 3) return [];
  if (n === 3) return [polygon[0], polygon[1], polygon[2]];

  // Ensure CCW winding
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  const ccw = area >= 0;

  // Build doubly-linked list of polygon indices (no allocations during clipping)
  const prev = new Int32Array(n);
  const next = new Int32Array(n);
  if (ccw) {
    for (let i = 0; i < n; i++) {
      prev[i] = (i === 0) ? n - 1 : i - 1;
      next[i] = (i === n - 1) ? 0 : i + 1;
    }
  } else {
    // Reverse winding via reversed linked list
    for (let i = 0; i < n; i++) {
      next[i] = (i === 0) ? n - 1 : i - 1;
      prev[i] = (i === n - 1) ? 0 : i + 1;
    }
  }

  const triangles: Vec2[] = [];
  let remaining = n;
  let current = 0;
  let failCount = 0;

  while (remaining > 3 && failCount < remaining) {
    const pi = prev[current];
    const ni = next[current];
    const a = polygon[pi];
    const b = polygon[current];
    const c = polygon[ni];

    // Check if this vertex is an ear
    let isEar = cross2d(a, b, c) > 0; // must be convex (CCW turn)

    if (isEar) {
      // Check no other vertex falls inside the triangle
      let check = next[ni];
      while (check !== pi) {
        if (pointInTriangle(polygon[check], a, b, c)) {
          isEar = false;
          break;
        }
        check = next[check];
      }
    }

    if (isEar) {
      triangles.push(a, b, c);
      // Remove current from linked list
      next[pi] = ni;
      prev[ni] = pi;
      remaining--;
      current = ni;
      failCount = 0;
    } else {
      current = next[current];
      failCount++;
    }
  }

  // Last triangle
  if (remaining === 3) {
    const pi = prev[current];
    const ni = next[current];
    triangles.push(polygon[pi], polygon[current], polygon[ni]);
  }

  return triangles;
}

// ── Chaikin smoothing ──

export function chaikinSmooth(vertices: Vec2[], iterations: number): Vec2[] {
  if (iterations <= 0 || vertices.length < 3) return vertices;

  let current = vertices;
  for (let iter = 0; iter < iterations; iter++) {
    const next: Vec2[] = [];
    const n = current.length;
    for (let i = 0; i < n; i++) {
      const a = current[i];
      const b = current[(i + 1) % n];
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      next.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    current = next;
  }
  return current;
}

// ── MST Bridge Fields (connectivity guarantee) ──

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

/**
 * Overlay capsule-Gaussian field along MST edges onto an existing scalar grid.
 * This guarantees the metaball blob stays connected even when nodes are far apart.
 * Bridge sigma scales with edge length to prevent pinch-off during node drag.
 */
export function addBridgeField(grid: ScalarGrid, points: Vec2[], sigma: number): void {
  const mstEdges = computeMST(points);
  if (mstEdges.length === 0) return;

  const { values, cols, rows, originX, originY, cellSize } = grid;
  const baseSigma = Math.max(sigma, cellSize * 2.5);

  for (const [ai, bi] of mstEdges) {
    const ax = points[ai][0], ay = points[ai][1];
    const bx = points[bi][0], by = points[bi][1];

    // Scale bridge sigma with edge length so long bridges stay wide enough
    const edgeLen = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    const bridgeSigma = Math.max(baseSigma, edgeLen * 0.12);
    const invTwoSigmaSq = 1 / (2 * bridgeSigma * bridgeSigma);
    const cutoff = 3 * bridgeSigma;

    // Bounding box of segment + cutoff margin → grid cell range
    const segMinX = Math.min(ax, bx) - cutoff;
    const segMaxX = Math.max(ax, bx) + cutoff;
    const segMinY = Math.min(ay, by) - cutoff;
    const segMaxY = Math.max(ay, by) + cutoff;

    const rMin = Math.max(0, Math.floor((segMinY - originY) / cellSize));
    const rMax = Math.min(rows - 1, Math.ceil((segMaxY - originY) / cellSize));
    const cMin = Math.max(0, Math.floor((segMinX - originX) / cellSize));
    const cMax = Math.min(cols - 1, Math.ceil((segMaxX - originX) / cellSize));

    for (let r = rMin; r <= rMax; r++) {
      const py = originY + r * cellSize;
      for (let c = cMin; c <= cMax; c++) {
        const px = originX + c * cellSize;
        const dSq = distToSegmentSq(px, py, ax, ay, bx, by);
        if (dSq < cutoff * cutoff) {
          values[r * cols + c] += Math.exp(-dSq * invTwoSigmaSq);
        }
      }
    }
  }
}


// ── Main entry point ──

export function computeMetaballHull(
  nodes: Vec2[],
  sigma: number,
  threshold: number,
  resolution: number,
  smoothIters: number,
): MetaballResult | null {
  if (nodes.length < 2) return null;

  const grid = buildScalarGrid(nodes, sigma, resolution);
  addBridgeField(grid, nodes, sigma);
  const segments = marchingSquares(grid, threshold);
  if (segments.length === 0) return null;

  const contours = stitchContours(segments);
  if (contours.length === 0) return null;

  // Pick the largest contour
  let best = contours[0];
  let bestArea = 0;
  for (const c of contours) {
    let a = 0;
    for (let i = 0; i < c.length; i++) {
      const j = (i + 1) % c.length;
      a += c[i][0] * c[j][1];
      a -= c[j][0] * c[i][1];
    }
    const area = Math.abs(a);
    if (area > bestArea) {
      bestArea = area;
      best = c;
    }
  }

  // Smooth the contour
  const smoothed = chaikinSmooth(best, smoothIters);

  // Compute centroid
  let cx = 0, cy = 0;
  for (const p of smoothed) {
    cx += p[0];
    cy += p[1];
  }
  cx /= smoothed.length;
  cy /= smoothed.length;

  const triangles = fanTriangulateFromCentroid(smoothed) ?? earClipTriangulate(smoothed);
  return { vertices: smoothed, triangles, centroid: [cx, cy] };
}
