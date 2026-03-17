# Hyperblob

A GPU-accelerated hypergraph visualizer. Hyperedges are rendered as overlapping translucent shapes — either **convex hulls** or **metaball blobs** — producing Euler-diagram-style visualizations that reveal set membership at a glance.

Built from scratch with WebGPU compute shaders. Zero runtime dependencies.

![Metaball mode rendering](docs/hero.png)

## What's a hypergraph?

A regular graph connects pairs of nodes with edges. A **hypergraph** generalizes this: each *hyperedge* can connect any number of nodes. Think Venn diagrams — overlapping groups where each node can belong to multiple sets simultaneously.

This tool renders each hyperedge as a colored region that envelops its member nodes, with overlapping regions showing shared membership.

## Features

- **GPU Barnes-Hut force layout** — O(n log n) force simulation running entirely in WebGPU compute shaders (Morton codes, radix sort, quadtree, tree traversal — 8 passes per frame)
- **Two hull modes** — convex hulls (fast, angular) or metaball blobs (smooth, concave shapes that pinch between distant nodes)
- **Screen-space metaballs** — per-pixel Gaussian field evaluation + MST bridge capsule SDFs in a single fragment shader dispatch, no CPU readback
- **HIF format** — loads [Hypergraph Interchange Format](https://github.com/HIF-org/HIF-standard) JSON files, or generate synthetic datasets up to 1M+ nodes
- **Interactive** — pan, zoom, drag nodes, and tune all parameters in real time via a tabbed control panel
- **120 fps** on the bundled Game of Thrones dataset (101 nodes, 394 hyperedges)

## Requirements

WebGPU is required. Supported browsers:

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | 113+ | Works out of the box |
| Edge | 113+ | Works out of the box |
| Brave | Any | Enable `brave://flags/#enable-unsafe-webgpu` |
| Firefox | Nightly | Enable `dom.webgpu.enabled` in `about:config` |
| Safari | 18+ | Technology Preview recommended |

## Quick start

```bash
git clone <repo-url>
cd hyperblob
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). The Game of Thrones dataset loads automatically.

### Build

```bash
npm run build          # TypeScript check + Vite production build
```

### Test

```bash
npm run test:unit      # Vitest unit tests
npm run test:e2e       # Playwright E2E tests (requires Brave)
```

## Usage

**Hull Mode** — switch between Convex and Metaball in the Rendering tab. Metaball mode produces smooth blob shapes that merge when nodes are close and pinch apart when they're far.

**Load your own data** — drag a [HIF JSON](https://github.com/HIF-org/HIF-standard) file onto the Data tab, or use the synthetic generator to stress-test with large graphs.

**Tune parameters** — the Simulation tab controls force layout (repulsion strength, Barnes-Hut theta, damping). The Rendering tab controls appearance (node size, hull opacity, blob threshold, smoothing iterations).

## How it works

### Force simulation (GPU)

Each frame dispatches 8 WebGPU compute passes:

1. **Morton codes** — Z-order encoding of 2D positions
2. **Radix sort** — 4-pass LSB sort to spatially order nodes
3. **Quadtree build** — sorted nodes placed into a complete 4-ary tree
4. **Quadtree summarize** — bottom-up center-of-mass aggregation
5. **Barnes-Hut repulsion** — stack-based tree traversal, O(n log n)
6. **Link attraction** — star-topology springs with atomic fixed-point accumulation
7. **Center force** — prevents drift
8. **Velocity Verlet** — integration with damping and speed clamping

### Metaball pipeline

Screen-space fragment shader — no CPU readback:

```
CPU:  compute MST bridge edges per hyperedge (Prim's algorithm)
        ↓
GPU:  instanced bounding-box quads → per-pixel Gaussian field + MST capsule SDF
        ↓
GPU:  smoothstep threshold → alpha-blended output
```

Each fragment evaluates `f(x,y) = sum( exp(-d^2 / 2σ²) )` across member nodes plus capsule SDFs along MST edges, all in a single fragment shader pass.

### Rendering

All rendering uses WebGPU render pipelines with **storage buffer vertex pulling** (no vertex attributes):

1. Hull polygons — fan-triangulated from centroid, alpha-blended
2. Edge lines — star topology (centroid to each member)
3. Nodes — SDF circles with smoothstep anti-aliasing

## Project structure

```
src/
├── app.ts                      # Main orchestrator
├── gpu/                        # WebGPU device + buffer manager
├── data/                       # HIF loader, types, synthetic generator
├── layout/                     # Force simulation, quadtree, radix sort
├── render/                     # Camera, renderers, hull computation
│   ├── hull-compute.ts         # Convex hulls (Andrew's monotone chain)
│   └── metaball-hull.ts        # MST computation and segment distance (for metaball-renderer)
├── interaction/                # Mouse/touch input, node picking, LOD
├── ui/                         # Tabbed control panel
├── shaders/                    # WGSL compute + render shaders
└── utils/                      # Math, colors, FPS counter

tests/
├── unit/                       # Vitest tests
└── e2e/                        # Playwright + Brave
```

## Tech stack

- **TypeScript** — strict mode, zero `any`
- **WebGPU** — compute + render pipelines (no Canvas2D, no SVG, no WebGL)
- **Vite** — dev server + bundler
- **Vitest** + **Playwright** — unit + E2E tests
- **Zero runtime dependencies**

## License

MIT
