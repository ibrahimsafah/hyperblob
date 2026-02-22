/**
 * WASM-accelerated metaball contour extraction.
 * Loads a minimal .wasm module that replaces the two hottest CPU functions:
 *   - addBridgeField  (Gaussian capsule field along MST edges)
 *   - marchingSquares (iso-contour line segment extraction)
 *
 * Falls back to the JS implementations if WASM fails to load.
 */

import type { Vec2 } from '../utils/math';
import type { ScalarGrid } from '../render/metaball-hull';
import {
  addBridgeField as addBridgeFieldJS,
  marchingSquares as marchingSquaresJS,
  computeMST,
} from '../render/metaball-hull';

// WASM module URL — Vite handles ?url imports for binary assets
import wasmUrl from './metaball-contour.wasm?url';

/** WASM exports interface */
interface MetaballContourExports {
  memory: WebAssembly.Memory;
  add_bridge_field(
    grid_ptr: number, cols: number, rows: number,
    origin_x: number, origin_y: number, cell_size: number,
    mst_ptr: number, num_mst_edges: number,
    base_sigma: number,
  ): void;
  marching_squares(
    grid_ptr: number, cols: number, rows: number,
    origin_x: number, origin_y: number, cell_size: number,
    threshold: number,
    seg_ptr: number,
  ): number;
  get_grid_ptr(): number;
  get_mst_ptr(): number;
  get_seg_ptr(): number;
}

// ── Memory layout constants ──
// Must match the WAT module's memory layout:
//   0x00000..0x03FFF  grid_values  (64*64*4 = 16384 bytes)
//   0x04000..0x07FFF  mst_edges    (up to 1024 edges * 16 bytes)
//   0x08000..0x27FFF  segments_out (63*63*2 segments * 16 bytes)
const MAX_MST_EDGES = 1024;

// ── Singleton WASM instance ──
let wasmInstance: MetaballContourExports | null = null;
let wasmLoadAttempted = false;
let wasmLoadPromise: Promise<boolean> | null = null;

/**
 * Attempt to load the WASM module. Returns true on success, false on failure.
 * Subsequent calls return the cached result.
 */
export async function loadWasm(): Promise<boolean> {
  if (wasmLoadAttempted) return wasmInstance !== null;
  if (wasmLoadPromise) return wasmLoadPromise;

  wasmLoadPromise = (async () => {
    try {
      wasmLoadAttempted = true;
      const response = await fetch(wasmUrl);
      const bytes = await response.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes, {});
      wasmInstance = instance.exports as unknown as MetaballContourExports;
      return true;
    } catch (e) {
      console.warn('WASM metaball-contour failed to load, falling back to JS:', e);
      wasmInstance = null;
      return false;
    }
  })();

  return wasmLoadPromise;
}

/**
 * Synchronous check: has WASM loaded successfully?
 */
export function isWasmReady(): boolean {
  return wasmInstance !== null;
}

/**
 * WASM-accelerated addBridgeField.
 * Overlays capsule-Gaussian field along MST edges onto the grid.
 * Falls back to JS if WASM is not loaded.
 *
 * Note: Modifies grid.values in-place, same as the JS version.
 */
export function addBridgeFieldWasm(grid: ScalarGrid, points: Vec2[], sigma: number): void {
  if (!wasmInstance) {
    addBridgeFieldJS(grid, points, sigma);
    return;
  }

  // Compute MST on JS side (Prim's algorithm — not worth porting to WASM)
  const mstEdges = computeMST(points);
  if (mstEdges.length === 0) return;
  if (mstEdges.length > MAX_MST_EDGES) {
    // Extremely unlikely, but fall back to JS for safety
    addBridgeFieldJS(grid, points, sigma);
    return;
  }

  const exports = wasmInstance;
  const gridPtr = exports.get_grid_ptr();
  const mstPtr = exports.get_mst_ptr();

  // Copy grid values into WASM memory
  const wasmMemory = new Float32Array(exports.memory.buffer);
  const gridFloatOffset = gridPtr >> 2; // byte offset to float index
  const gridLen = grid.cols * grid.rows;

  // Copy grid values in
  wasmMemory.set(grid.values.subarray(0, gridLen), gridFloatOffset);

  // Pack MST edges as flat [ax, ay, bx, by, ...]
  const mstFloatOffset = mstPtr >> 2;
  for (let i = 0; i < mstEdges.length; i++) {
    const [ai, bi] = mstEdges[i];
    wasmMemory[mstFloatOffset + i * 4 + 0] = points[ai][0];
    wasmMemory[mstFloatOffset + i * 4 + 1] = points[ai][1];
    wasmMemory[mstFloatOffset + i * 4 + 2] = points[bi][0];
    wasmMemory[mstFloatOffset + i * 4 + 3] = points[bi][1];
  }

  // Call WASM
  exports.add_bridge_field(
    gridPtr, grid.cols, grid.rows,
    grid.originX, grid.originY, grid.cellSize,
    mstPtr, mstEdges.length,
    sigma,
  );

  // Copy grid values back out
  grid.values.set(wasmMemory.subarray(gridFloatOffset, gridFloatOffset + gridLen));
}

/**
 * WASM-accelerated marchingSquares.
 * Extracts iso-contour line segments from the scalar grid.
 * Falls back to JS if WASM is not loaded.
 */
export function marchingSquaresWasm(grid: ScalarGrid, threshold: number): [Vec2, Vec2][] {
  if (!wasmInstance) {
    return marchingSquaresJS(grid, threshold);
  }

  const exports = wasmInstance;
  const gridPtr = exports.get_grid_ptr();
  const segPtr = exports.get_seg_ptr();

  // Copy grid values into WASM memory
  const wasmMemory = new Float32Array(exports.memory.buffer);
  const gridFloatOffset = gridPtr >> 2;
  const gridLen = grid.cols * grid.rows;
  wasmMemory.set(grid.values.subarray(0, gridLen), gridFloatOffset);

  // Call WASM
  const segCount = exports.marching_squares(
    gridPtr, grid.cols, grid.rows,
    grid.originX, grid.originY, grid.cellSize,
    threshold,
    segPtr,
  );

  if (segCount === 0) return [];

  // Read segments from WASM memory
  const segFloatOffset = segPtr >> 2;
  const segments: [Vec2, Vec2][] = new Array(segCount);
  for (let i = 0; i < segCount; i++) {
    const base = segFloatOffset + i * 4;
    segments[i] = [
      [wasmMemory[base + 0], wasmMemory[base + 1]],
      [wasmMemory[base + 2], wasmMemory[base + 3]],
    ];
  }

  return segments;
}
