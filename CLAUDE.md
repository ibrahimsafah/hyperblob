# CLAUDE.md

## Project Overview

WebGPU hypergraph visualizer with GPU Barnes-Hut force-directed layout. Hyperedges rendered as convex hull polygons or screen-space fragment shader metaball blobs (Euler-diagram style). Zero runtime deps, Vite + TypeScript.

## Commands

```bash
npm run dev          # Dev server at localhost:5173
npm run build        # tsc + vite build
npm run test:unit    # Vitest (178 tests)
npm run test:e2e     # Playwright + Brave
```

## Architecture

- `src/app.ts` — Main orchestrator. Uses dynamic imports (`import(/* @vite-ignore */ path)`) for subsystems so partial builds don't crash.
- `src/layout/force-simulation.ts` — Dispatches 8 GPU compute passes per tick (morton → radix sort → quadtree → repulsion → attraction → center → integrate).
- `src/render/hull-compute.ts` — CPU-side Andrew's monotone chain (convex mode). Runs every 10 frames.
- `src/render/hull-renderer.ts` — Must call `.setData(data)` after construction or hulls won't render. Branches on `renderParams.hullMode` (convex vs metaball).
- `src/render/metaball-renderer.ts` — Screen-space fragment shader metaballs. Instanced bounding-box quads with per-pixel Gaussian field evaluation + MST bridge capsule SDFs.
- `src/render/metaball-hull.ts` — CPU algorithms: marching squares, contour stitching, ear-clip triangulation, Chaikin smoothing. Used for hit testing and CPU-only fallback.
- `src/render/metaball-compute.ts` — **DEAD CODE** (legacy GPU compute → CPU readback pipeline, replaced by metaball-renderer.ts).

## Simulation Parameters

Parameters use physics-inspired names (not D3-style alpha):
- `energy` — simulation temperature, starts at 1.0, decays over time
- `coolingRate` — how fast energy dissipates per tick (0.0228 ≈ 300 iterations)
- `idleEnergy` — steady-state minimum energy (0.02, keeps things slightly alive)
- `stopThreshold` — below this energy, simulation stops entirely (0.001)

## WGSL Gotchas (learned the hard way)

- **Atomic types require `atomicStore()`** — cannot use `=` assignment on `atomic<u32>` workgroup vars.
- **No NaN constants** — `bitcast<f32>(0xFFFFFFFFu)` rejected because it produces NaN. Use a float sentinel like `-1.0` instead.
- **Struct trailing semicolons** — `};` is accepted by current parsers but not spec-required.

## GPU Buffer Layout (SoA)

- `node-positions`: `[x, y, vx, vy]` per node — 16 bytes (Float32)
- `node-metadata`: `[group, flags]` per node — 8 bytes (Uint32)
- `he-offsets` + `he-members`: CSR format for hyperedge membership (Uint32)
- `quadtree`: 8 floats per tree node (COM x/y, mass, cell_size, node_index, child_mask, min_x, min_y)
- `metaball-instances`: `[bbox_min, bbox_max, color, edge_index, mst_offset, mst_count, pad]` per edge — 48 bytes
- `metaball-mst`: flat `[node_a, node_b]` u32 pairs for MST bridge field
- `metaball-render-params`: uniform `[sigma, threshold, smoothing_band, pad]` — 16 bytes

## Key Conventions

- Internal node marker in quadtree: `-1.0` in slot [4] (not NaN/bitcast)
- Attraction forces use atomic i32 fixed-point (×65536) since WGSL lacks atomic f32
- Palette: 16 categorical colors in `src/utils/color.ts`
- All rendering uses storage buffer vertex pulling (no vertex attributes for nodes/edges)

## Test Data

- GoT dataset: `public/data/got.json` — 101 nodes, 394 hyperedges, HIF format
- Synthetic: `generateRandomHypergraph(nodeCount, edgeCount, maxEdgeSize)`

## Known Issues / Next Steps

- Production build only bundles 13 modules (dynamic imports with @vite-ignore bypass Vite bundling)
- E2E tests need Brave browser at `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`
- Legacy `metaball-compute.ts` and `metaball-field.wgsl` can be deleted (dead code)
