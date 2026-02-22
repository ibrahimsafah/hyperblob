import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import {
  type ScalarGrid,
  marchingSquares as marchingSquaresJS,
  addBridgeField as addBridgeFieldJS,
  computeMST,
} from '../../src/render/metaball-hull';
import type { Vec2 } from '../../src/utils/math';

// ── WASM module interface ──

interface WasmExports {
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

// ── Memory layout (must match WAT) ──
// 0x00000  grid_values   (64*64*4 = 16384 bytes)
// 0x04000  mst_edges     (up to 1024 edges * 16 bytes)
// 0x08000  segments_out  (~128KB)

let wasm: WasmExports;

beforeAll(async () => {
  const wasmPath = resolve(__dirname, '../../src/wasm/metaball-contour.wasm');
  const bytes = await readFile(wasmPath);
  const { instance } = await WebAssembly.instantiate(bytes, {});
  wasm = instance.exports as unknown as WasmExports;
});

// ── Helpers ──

/** Build a grid from a 2D value function (same as metaball-hull.test.ts) */
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

/** Copy grid values into WASM memory and return Float32 view */
function copyGridToWasm(grid: ScalarGrid): Float32Array {
  const mem = new Float32Array(wasm.memory.buffer);
  const gridPtr = wasm.get_grid_ptr();
  const offset = gridPtr >> 2;
  const len = grid.cols * grid.rows;
  mem.set(grid.values.subarray(0, len), offset);
  return mem;
}

/** Copy MST edges (as flat [ax, ay, bx, by, ...]) into WASM memory */
function copyMstToWasm(mstEdges: [number, number][], points: Vec2[]): number {
  const mem = new Float32Array(wasm.memory.buffer);
  const mstPtr = wasm.get_mst_ptr();
  const offset = mstPtr >> 2;
  for (let i = 0; i < mstEdges.length; i++) {
    const [ai, bi] = mstEdges[i];
    mem[offset + i * 4 + 0] = points[ai][0];
    mem[offset + i * 4 + 1] = points[ai][1];
    mem[offset + i * 4 + 2] = points[bi][0];
    mem[offset + i * 4 + 3] = points[bi][1];
  }
  return mstEdges.length;
}

/** Read grid values back from WASM memory */
function readGridFromWasm(cols: number, rows: number): Float32Array {
  const mem = new Float32Array(wasm.memory.buffer);
  const gridPtr = wasm.get_grid_ptr();
  const offset = gridPtr >> 2;
  return new Float32Array(mem.buffer, gridPtr, cols * rows);
}

/** Read segments from WASM memory */
function readSegmentsFromWasm(count: number): [Vec2, Vec2][] {
  const mem = new Float32Array(wasm.memory.buffer);
  const segPtr = wasm.get_seg_ptr();
  const offset = segPtr >> 2;
  const result: [Vec2, Vec2][] = [];
  for (let i = 0; i < count; i++) {
    const base = offset + i * 4;
    result.push([
      [mem[base + 0], mem[base + 1]],
      [mem[base + 2], mem[base + 3]],
    ]);
  }
  return result;
}

// ── marchingSquares tests ──

describe('WASM marchingSquares', () => {
  it('returns empty for all-below-threshold grid', () => {
    const grid = makeGrid(10, 10, () => 0);
    copyGridToWasm(grid);
    const count = wasm.marching_squares(
      wasm.get_grid_ptr(), 10, 10,
      0, 0, 1,
      0.5,
      wasm.get_seg_ptr(),
    );
    expect(count).toBe(0);
  });

  it('returns empty for all-above-threshold grid', () => {
    const grid = makeGrid(10, 10, () => 1.0);
    copyGridToWasm(grid);
    const count = wasm.marching_squares(
      wasm.get_grid_ptr(), 10, 10,
      0, 0, 1,
      0.5,
      wasm.get_seg_ptr(),
    );
    expect(count).toBe(0);
  });

  it('extracts contour from circular field', () => {
    const grid = makeGrid(11, 11, (x, y) => {
      const dx = x - 5, dy = y - 5;
      return Math.exp(-(dx * dx + dy * dy) / 8);
    });
    copyGridToWasm(grid);
    const count = wasm.marching_squares(
      wasm.get_grid_ptr(), 11, 11,
      0, 0, 1,
      0.3,
      wasm.get_seg_ptr(),
    );
    expect(count).toBeGreaterThan(4);
  });

  it('matches JS output for circular field', () => {
    const grid = makeGrid(11, 11, (x, y) => {
      const dx = x - 5, dy = y - 5;
      return Math.exp(-(dx * dx + dy * dy) / 8);
    });

    // JS reference
    const jsSegments = marchingSquaresJS(grid, 0.3);

    // WASM
    copyGridToWasm(grid);
    const wasmCount = wasm.marching_squares(
      wasm.get_grid_ptr(), 11, 11,
      0, 0, 1,
      0.3,
      wasm.get_seg_ptr(),
    );
    const wasmSegments = readSegmentsFromWasm(wasmCount);

    // Same number of segments
    expect(wasmCount).toBe(jsSegments.length);

    // Each segment should match within float32 precision
    for (let i = 0; i < jsSegments.length; i++) {
      expect(wasmSegments[i][0][0]).toBeCloseTo(jsSegments[i][0][0], 3);
      expect(wasmSegments[i][0][1]).toBeCloseTo(jsSegments[i][0][1], 3);
      expect(wasmSegments[i][1][0]).toBeCloseTo(jsSegments[i][1][0], 3);
      expect(wasmSegments[i][1][1]).toBeCloseTo(jsSegments[i][1][1], 3);
    }
  });

  it('matches JS for step function', () => {
    const grid = makeGrid(10, 10, (x) => x >= 5 ? 1 : 0);
    const jsSegments = marchingSquaresJS(grid, 0.5);

    copyGridToWasm(grid);
    const wasmCount = wasm.marching_squares(
      wasm.get_grid_ptr(), 10, 10,
      0, 0, 1,
      0.5,
      wasm.get_seg_ptr(),
    );
    const wasmSegments = readSegmentsFromWasm(wasmCount);

    expect(wasmCount).toBe(jsSegments.length);
    for (let i = 0; i < jsSegments.length; i++) {
      expect(wasmSegments[i][0][0]).toBeCloseTo(jsSegments[i][0][0], 3);
      expect(wasmSegments[i][0][1]).toBeCloseTo(jsSegments[i][0][1], 3);
      expect(wasmSegments[i][1][0]).toBeCloseTo(jsSegments[i][1][0], 3);
      expect(wasmSegments[i][1][1]).toBeCloseTo(jsSegments[i][1][1], 3);
    }
  });

  it('handles saddle cases (checkerboard)', () => {
    const grid = makeGrid(3, 3, (x, y) => {
      return ((x + y) % 2 === 0) ? 1.0 : 0.0;
    });
    const jsSegments = marchingSquaresJS(grid, 0.5);

    copyGridToWasm(grid);
    const wasmCount = wasm.marching_squares(
      wasm.get_grid_ptr(), 3, 3,
      0, 0, 1,
      0.5,
      wasm.get_seg_ptr(),
    );
    const wasmSegments = readSegmentsFromWasm(wasmCount);

    expect(wasmCount).toBe(jsSegments.length);
    for (let i = 0; i < jsSegments.length; i++) {
      expect(wasmSegments[i][0][0]).toBeCloseTo(jsSegments[i][0][0], 3);
      expect(wasmSegments[i][0][1]).toBeCloseTo(jsSegments[i][0][1], 3);
      expect(wasmSegments[i][1][0]).toBeCloseTo(jsSegments[i][1][0], 3);
      expect(wasmSegments[i][1][1]).toBeCloseTo(jsSegments[i][1][1], 3);
    }
  });

  it('matches JS for 64x64 Gaussian field (production grid size)', () => {
    // Simulate production grid: 64x64 with Gaussian blob
    const grid = makeGrid(64, 64, (x, y) => {
      const cx = 32, cy = 32;
      const dx = x - cx, dy = y - cy;
      return Math.exp(-(dx * dx + dy * dy) / 200);
    });
    const jsSegments = marchingSquaresJS(grid, 0.3);

    copyGridToWasm(grid);
    const wasmCount = wasm.marching_squares(
      wasm.get_grid_ptr(), 64, 64,
      0, 0, 1,
      0.3,
      wasm.get_seg_ptr(),
    );
    const wasmSegments = readSegmentsFromWasm(wasmCount);

    expect(wasmCount).toBe(jsSegments.length);
    for (let i = 0; i < jsSegments.length; i++) {
      expect(wasmSegments[i][0][0]).toBeCloseTo(jsSegments[i][0][0], 3);
      expect(wasmSegments[i][0][1]).toBeCloseTo(jsSegments[i][0][1], 3);
      expect(wasmSegments[i][1][0]).toBeCloseTo(jsSegments[i][1][0], 3);
      expect(wasmSegments[i][1][1]).toBeCloseTo(jsSegments[i][1][1], 3);
    }
  });

  it('matches JS with non-zero origin and non-unit cellSize', () => {
    const originX = -50, originY = -30, cellSize = 2.5;
    const grid = makeGrid(20, 20, (x, y) => {
      const dx = x - (-50 + 10 * 2.5), dy = y - (-30 + 10 * 2.5);
      return Math.exp(-(dx * dx + dy * dy) / 100);
    }, originX, originY, cellSize);
    const jsSegments = marchingSquaresJS(grid, 0.4);

    copyGridToWasm(grid);
    const wasmCount = wasm.marching_squares(
      wasm.get_grid_ptr(), 20, 20,
      originX, originY, cellSize,
      0.4,
      wasm.get_seg_ptr(),
    );
    const wasmSegments = readSegmentsFromWasm(wasmCount);

    expect(wasmCount).toBe(jsSegments.length);
    for (let i = 0; i < jsSegments.length; i++) {
      expect(wasmSegments[i][0][0]).toBeCloseTo(jsSegments[i][0][0], 2);
      expect(wasmSegments[i][0][1]).toBeCloseTo(jsSegments[i][0][1], 2);
      expect(wasmSegments[i][1][0]).toBeCloseTo(jsSegments[i][1][0], 2);
      expect(wasmSegments[i][1][1]).toBeCloseTo(jsSegments[i][1][1], 2);
    }
  });
});

// ── addBridgeField tests ──

describe('WASM addBridgeField', () => {
  it('raises field values along segment midpoints', () => {
    const pts: Vec2[] = [[10, 50], [90, 50]];
    const grid = makeGrid(100, 100, () => 0, 0, 0, 1);

    // WASM version
    const mstEdges = computeMST(pts);
    copyGridToWasm(grid);
    const numEdges = copyMstToWasm(mstEdges, pts);

    wasm.add_bridge_field(
      wasm.get_grid_ptr(), 100, 100,
      0, 0, 1,
      wasm.get_mst_ptr(), numEdges,
      5,
    );

    const wasmGrid = readGridFromWasm(100, 100);

    // Midpoint (50, 50) should be elevated
    const midVal = wasmGrid[50 * 100 + 50];
    expect(midVal).toBeGreaterThan(0.3); // slightly lower threshold due to exp approximation

    // Far point (50, 0) should be near zero
    const farVal = wasmGrid[0 * 100 + 50];
    expect(farVal).toBeLessThan(0.05);
  });

  it('does not modify grid for zero MST edges', () => {
    const grid = makeGrid(10, 10, () => 0);
    const gridCopy = new Float32Array(grid.values);
    copyGridToWasm(grid);

    wasm.add_bridge_field(
      wasm.get_grid_ptr(), 10, 10,
      0, 0, 1,
      wasm.get_mst_ptr(), 0,
      2,
    );

    const wasmGrid = readGridFromWasm(10, 10);
    for (let i = 0; i < 100; i++) {
      expect(wasmGrid[i]).toBeCloseTo(gridCopy[i], 5);
    }
  });

  it('produces qualitatively similar results to JS for 3 points', () => {
    const pts: Vec2[] = [[10, 50], [50, 50], [90, 50]];
    const sigma = 5;

    // JS reference
    const jsGrid = makeGrid(100, 100, () => 0, 0, 0, 1);
    addBridgeFieldJS(jsGrid, pts, sigma);

    // WASM
    const wasmGridInput = makeGrid(100, 100, () => 0, 0, 0, 1);
    const mstEdges = computeMST(pts);
    copyGridToWasm(wasmGridInput);
    copyMstToWasm(mstEdges, pts);

    wasm.add_bridge_field(
      wasm.get_grid_ptr(), 100, 100,
      0, 0, 1,
      wasm.get_mst_ptr(), mstEdges.length,
      sigma,
    );

    const wasmGrid = readGridFromWasm(100, 100);

    // Check key sample points match qualitatively:
    // The WASM uses a polynomial exp approximation, so we allow wider tolerance
    // Midpoint of segment 0-1 at (30, 50)
    expect(wasmGrid[50 * 100 + 30]).toBeGreaterThan(0.3);
    expect(jsGrid.values[50 * 100 + 30]).toBeGreaterThan(0.3);

    // Midpoint of segment 1-2 at (70, 50)
    expect(wasmGrid[50 * 100 + 70]).toBeGreaterThan(0.3);
    expect(jsGrid.values[50 * 100 + 70]).toBeGreaterThan(0.3);

    // Far point at (50, 0)
    expect(wasmGrid[0 * 100 + 50]).toBeLessThan(0.05);
    expect(jsGrid.values[0 * 100 + 50]).toBeLessThan(0.05);
  });

  it('field values are non-negative everywhere', () => {
    const pts: Vec2[] = [[20, 20], [80, 80]];
    const grid = makeGrid(100, 100, () => 0, 0, 0, 1);
    const mstEdges = computeMST(pts);
    copyGridToWasm(grid);
    copyMstToWasm(mstEdges, pts);

    wasm.add_bridge_field(
      wasm.get_grid_ptr(), 100, 100,
      0, 0, 1,
      wasm.get_mst_ptr(), mstEdges.length,
      8,
    );

    const wasmGrid = readGridFromWasm(100, 100);
    for (let i = 0; i < 100 * 100; i++) {
      expect(wasmGrid[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('bridge field with non-zero origin and non-unit cellSize', () => {
    const pts: Vec2[] = [[-20, 10], [30, 10]];
    const originX = -50, originY = -20, cellSize = 1.5;
    const sigma = 5;

    // JS reference
    const jsGrid = makeGrid(64, 64, () => 0, originX, originY, cellSize);
    addBridgeFieldJS(jsGrid, pts, sigma);

    // WASM
    const wasmGridInput = makeGrid(64, 64, () => 0, originX, originY, cellSize);
    const mstEdges = computeMST(pts);
    copyGridToWasm(wasmGridInput);
    copyMstToWasm(mstEdges, pts);

    wasm.add_bridge_field(
      wasm.get_grid_ptr(), 64, 64,
      originX, originY, cellSize,
      wasm.get_mst_ptr(), mstEdges.length,
      sigma,
    );

    const wasmGrid = readGridFromWasm(64, 64);

    // Both should have non-zero values along the bridge
    let jsMaxBridge = 0;
    let wasmMaxBridge = 0;
    // Check row corresponding to y=10: r = (10 - (-20)) / 1.5 = 20
    const bridgeRow = 20;
    for (let c = 0; c < 64; c++) {
      const jsVal = jsGrid.values[bridgeRow * 64 + c];
      const wasmVal = wasmGrid[bridgeRow * 64 + c];
      if (jsVal > jsMaxBridge) jsMaxBridge = jsVal;
      if (wasmVal > wasmMaxBridge) wasmMaxBridge = wasmVal;
    }
    expect(jsMaxBridge).toBeGreaterThan(0.5);
    expect(wasmMaxBridge).toBeGreaterThan(0.3);
  });
});

// ── End-to-end: addBridgeField + marchingSquares pipeline ──

describe('WASM pipeline (addBridgeField + marchingSquares)', () => {
  it('produces contour for two distant points (bridge connectivity)', () => {
    const pts: Vec2[] = [[10, 32], [54, 32]];
    const sigma = 5;
    const threshold = 0.3;

    // Build empty 64x64 grid centered on the two points
    const grid = makeGrid(64, 64, () => 0, 0, 0, 1);

    // Add some base Gaussian field from each node
    for (let r = 0; r < 64; r++) {
      for (let c = 0; c < 64; c++) {
        let val = 0;
        for (const pt of pts) {
          const dx = c - pt[0], dy = r - pt[1];
          val += Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        }
        grid.values[r * 64 + c] = val;
      }
    }

    // Run bridge + marching squares via WASM
    const mstEdges = computeMST(pts);
    copyGridToWasm(grid);
    copyMstToWasm(mstEdges, pts);

    wasm.add_bridge_field(
      wasm.get_grid_ptr(), 64, 64,
      0, 0, 1,
      wasm.get_mst_ptr(), mstEdges.length,
      sigma,
    );

    const count = wasm.marching_squares(
      wasm.get_grid_ptr(), 64, 64,
      0, 0, 1,
      threshold,
      wasm.get_seg_ptr(),
    );

    expect(count).toBeGreaterThan(0);
    const segments = readSegmentsFromWasm(count);

    // All segment coordinates should be within grid bounds
    for (const [p0, p1] of segments) {
      expect(p0[0]).toBeGreaterThanOrEqual(0);
      expect(p0[0]).toBeLessThanOrEqual(63);
      expect(p0[1]).toBeGreaterThanOrEqual(0);
      expect(p0[1]).toBeLessThanOrEqual(63);
      expect(p1[0]).toBeGreaterThanOrEqual(0);
      expect(p1[0]).toBeLessThanOrEqual(63);
      expect(p1[1]).toBeGreaterThanOrEqual(0);
      expect(p1[1]).toBeLessThanOrEqual(63);
    }
  });
});
