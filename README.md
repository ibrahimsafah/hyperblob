# Hypergraph Visualizer

A high-performance hypergraph visualization tool built from scratch with **WebGPU compute shaders** and a **GPU Barnes-Hut O(n log n) force-directed layout**. Hyperedges are rendered as translucent polygons — either convex hulls or **GPU-accelerated metaball blobs** that produce smooth, concave Euler-diagram-style shapes.

Runs at **120fps** (convex) / **80fps** (metaball) with the Game of Thrones dataset (101 nodes, 394 hyperedges) and is architected to scale to 1M+ nodes.

## Features

- **GPU-accelerated Barnes-Hut force simulation** — Morton code spatial sorting, GPU radix sort, quadtree construction, and tree traversal all run as WebGPU compute shaders
- **Dual hull rendering modes** — switch between convex hulls (Andrew's monotone chain) and GPU-accelerated metaball blobs (Gaussian scalar field + marching squares) via a dropdown
- **GPU metaball field evaluation** — Gaussian scalar fields evaluated on a 64x64 grid per hyperedge in a single GPU compute dispatch, producing smooth concave contours that pinch inward between distant nodes
- **HIF format support** — loads [Hypergraph Interchange Format](https://github.com/HIF-org/HIF-standard) JSON files natively
- **Synthetic data generator** — stress-test with configurable node/edge counts up to 1M+
- **Interactive controls** — pan, zoom, tabbed parameter panel (simulation, rendering, data, camera)
- **Zero runtime dependencies** — only Vite, TypeScript, and test tooling as dev deps

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5173
```

The Game of Thrones dataset loads automatically on startup.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | TypeScript check + production build |
| `npm run test:unit` | Run Vitest unit tests (152 tests) |
| `npm run test:e2e` | Run Playwright E2E tests (requires Brave) |
| `npm run test` | Run all tests |

## Architecture

### GPU Compute Pipeline (per simulation tick)

Each frame dispatches 8 compute shader passes in sequence:

1. **Morton codes** — Z-order curve encoding of normalized 2D positions
2. **Radix sort** — 4-pass LSB radix sort (8 bits/pass) to spatially sort nodes
3. **Quadtree build** — place sorted nodes into complete 4-ary tree leaves
4. **Quadtree summarize** — bottom-up center-of-mass aggregation per level
5. **Barnes-Hut repulsion** — stack-based tree traversal with theta criterion (O(n log n))
6. **Link attraction** — star-topology spring forces per hyperedge (atomic fixed-point accumulation)
7. **Center force** — prevents graph drift
8. **Velocity Verlet integration** — position update with damping and speed clamping

### Rendering Pipeline

Render order (back-to-front):
1. **Hull polygons** — fan-triangulated from centroid, alpha-blended (two modes below)
2. **Edge lines** — star topology (centroid-to-member) per hyperedge
3. **Node circles** — compute-generated quads with SDF circle + smoothstep AA

All rendering uses WebGPU render pipelines with storage buffer vertex pulling (no vertex buffers for nodes/edges).

### Metaball Hull Pipeline (when Hull Mode = Metaball)

Runs every 10 frames via async GPU readback:

```
recomputeHulls()
├── GPU readback: node-positions
├── CPU: bounding boxes → per-edge metadata (origin, cell size)
├── GPU dispatch: metaball-field.wgsl evaluates Gaussian f(x,y) = Σ exp(-d²/2σ²)
│   └── 64×64 grid per hyperedge, all edges batched in one dispatch
├── GPU→CPU readback: scalar field grids
└── CPU per-edge: marchingSquares → stitchContours → chaikinSmooth → fanTriangulate
```

The GPU replaces the expensive O(cells × members) field evaluation with `exp()`. CPU handles inherently serial contour extraction and triangulation.

### Data Flow

```
HIF JSON ──→ parseHIF() ──→ HypergraphData ──→ GPU Buffers (SoA layout)
                                                    │
                                                    ├── node-positions: [x,y,vx,vy] × N (Float32)
                                                    ├── node-metadata:  [group,flags] × N (Uint32)
                                                    ├── he-offsets:     CSR offsets (Uint32)
                                                    └── he-members:     CSR members (Uint32)
```

## Project Structure

```
src/
├── main.ts                     # Entry point: WebGPU init, create App
├── app.ts                      # Orchestrator: data → simulation → render loop
├── gpu/
│   ├── device.ts               # WebGPU adapter/device/canvas setup
│   └── buffer-manager.ts       # Named GPU buffer registry
├── data/
│   ├── types.ts                # HIF types + internal model + SimulationParams/RenderParams
│   ├── hif-loader.ts           # HIF JSON → HypergraphData
│   └── generator.ts            # Synthetic random hypergraph generation
├── layout/
│   ├── force-simulation.ts     # Dispatches all 8 compute passes per tick
│   ├── quadtree.ts             # GPU quadtree buffer management + encode
│   └── radix-sort.ts           # GPU radix sort (ping-pong buffers)
├── render/
│   ├── camera.ts               # 2D orthographic projection, pan/zoom
│   ├── renderer.ts             # Render orchestrator + node picking
│   ├── node-renderer.ts        # Node highlight state
│   ├── edge-renderer.ts        # Star-topology line rendering
│   ├── hull-compute.ts         # CPU convex hull (Andrew's monotone chain)
│   ├── hull-renderer.ts        # Translucent polygon + outline rendering
│   ├── metaball-hull.ts        # CPU metaball algorithms (marching squares, ear-clip, Chaikin)
│   └── metaball-compute.ts     # GPU metaball pipeline orchestrator
├── interaction/
│   ├── input-handler.ts        # Mouse/wheel/touch → camera
│   ├── node-picker.ts          # GPU picking via offscreen ID texture
│   └── lod.ts                  # Level-of-detail by zoom level
├── ui/
│   ├── panel.ts                # Tabbed control panel container
│   ├── controls.ts             # Slider, toggle, button, select, drop zone components
│   └── tabs/
│       ├── simulation-tab.ts   # Force params: repulsion, attraction, theta, etc.
│       ├── rendering-tab.ts    # Node size, edge opacity, hull alpha, colors
│       ├── data-tab.ts         # Load HIF file, generate synthetic, stats
│       └── camera-tab.ts       # Zoom, fit-to-screen, export PNG
├── shaders/
│   ├── morton.wgsl             # 2D Morton code via bit interleaving
│   ├── radix-sort.wgsl         # Histogram, prefix sum, scatter (3 entry points)
│   ├── quadtree-build.wgsl     # Leaf population from sorted nodes
│   ├── quadtree-summarize.wgsl # Bottom-up center-of-mass computation
│   ├── force-repulsion.wgsl    # Barnes-Hut traversal with 64-deep stack
│   ├── force-attraction.wgsl   # Star-topology springs, atomic i32 accumulation
│   ├── force-center.wgsl       # Centering force (accumulate + apply)
│   ├── integrate.wgsl          # Velocity Verlet with decay and clamping
│   ├── node-render.wgsl        # Quad generation + SDF circle fragment
│   ├── node-pick.wgsl          # ID-as-RGBA for GPU picking
│   ├── edge-render.wgsl        # Star-topology line rendering
│   ├── hull-render.wgsl        # Convex hull polygon fill + outline
│   └── metaball-field.wgsl     # GPU Gaussian scalar field evaluation
└── utils/
    ├── math.ts                 # Vec2 ops, Mat4 orthographic projection
    ├── color.ts                # 16-color categorical palette, ID encoding
    └── stats.ts                # FPS counter overlay

tests/
├── unit/                       # 152 Vitest tests
│   ├── math.test.ts            # Vec2 and Mat4 operations (29 tests)
│   ├── camera.test.ts          # Projection, pan/zoom, screenToWorld (27 tests)
│   ├── color.test.ts           # Palette, ID encoding round-trip (20 tests)
│   ├── hif-loader.test.ts      # HIF parsing, grouping, edge cases (16 tests)
│   ├── hull-compute.test.ts    # Convex hull correctness (15 tests)
│   ├── generator.test.ts       # Synthetic generation validation (16 tests)
│   └── metaball-hull.test.ts   # Marching squares, stitching, ear-clip, smoothing (29 tests)
└── e2e/                        # Playwright + Brave (WebGPU)
    ├── webgpu-init.test.ts     # Device creation
    ├── data-loading.test.ts    # GoT dataset loads correctly
    ├── rendering.test.ts       # Canvas renders non-empty content
    ├── interaction.test.ts     # Pan, zoom interactions
    ├── simulation.test.ts      # Layout converges over time
    ├── hulls.test.ts           # Hull polygons visible
    ├── control-panel.test.ts   # Tab switching, parameter changes
    └── performance.test.ts     # FPS benchmarking

public/data/
└── got.json                    # Game of Thrones HIF dataset (101 nodes, 394 edges)
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Barnes-Hut from day one** | O(n log n) scales to 1M+ nodes; O(n^2) would cap at ~10K |
| **SoA GPU buffer layout** | 40-60% GPU perf improvement from coalesced memory access |
| **CPU convex hulls** | Most hyperedges have <100 nodes; GPU overhead not worth it. Recomputed every 10 frames |
| **GPU metaball field + CPU contours** | Field evaluation is O(cells × members) with `exp()` — perfect for GPU. Marching squares and contour stitching are inherently serial — stay on CPU |
| **Fan triangulation for metaballs** | Metaball contours are star-convex from their centroid, so O(n) fan triangulation works correctly and is ~10x faster than general-purpose ear-clip O(n²) |
| **Fixed 64×64 grid per edge** | 4096 cells = 16 × 256-thread workgroups — clean GPU occupancy. Sufficient resolution after Chaikin smoothing |
| **Atomic fixed-point forces** | WGSL lacks `atomic<f32>`; multiply by 65536, use `atomic<i32>`, divide back |
| **Star topology edges** | Each hyperedge draws lines from centroid to members, not all-pairs O(k^2) |
| **Dynamic module imports** | `app.ts` uses `import()` with try/catch so partial builds don't crash |

## Test Dataset

The bundled Game of Thrones dataset contains:
- **101 nodes** — characters (Eddard Stark, Tyrion Lannister, Daenerys Targaryen, etc.)
- **394 hyperedges** — house memberships, alliances, political groups, scene co-appearances
- Hyperedge sizes range from 2 to 14 members

## Tech Stack

- **Vite 6** — dev server + bundler
- **TypeScript 5.7** — strict mode
- **WebGPU** — compute + render pipelines (zero Canvas2D/SVG)
- **Vitest 3** — unit tests
- **Playwright** — E2E tests (via Brave browser with `--enable-unsafe-webgpu`)
- **Zero runtime dependencies**

## Status

**Working end-to-end.** The GPU force simulation runs, nodes animate into force-directed positions, hull polygons render around hyperedge members (convex or metaball mode), and the control panel adjusts all parameters in real time.

### What's done
- [x] WebGPU device init + canvas configuration
- [x] Full Barnes-Hut GPU compute pipeline (8 shader passes)
- [x] Node rendering (SDF circles with smoothstep AA)
- [x] Edge rendering (star topology)
- [x] Convex hull computation + rendering
- [x] GPU-accelerated metaball hull mode (Gaussian field + marching squares)
- [x] Dual hull mode switching via UI dropdown (Convex / Metaball)
- [x] Chaikin corner-cutting subdivision for smooth contours
- [x] HIF data loading + synthetic generator
- [x] Pan/zoom camera with orthographic projection
- [x] Tabbed control panel (Simulation, Rendering, Data, Camera)
- [x] GPU picking infrastructure
- [x] LOD controller
- [x] 152 unit tests passing
- [x] 8 E2E test files ready

### Next steps
- [ ] E2E test execution with Brave browser
- [ ] Production build optimization (dynamic imports → static for tree-shaking)
- [ ] Node labels at high zoom levels
- [ ] 1M+ node stress testing and optimization
