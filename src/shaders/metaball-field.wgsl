// Metaball scalar field evaluation — GPU compute shader
// Evaluates Gaussian field f(x,y) = Σ exp(-d²/2σ²) on a 64×64 grid per hyperedge
// All edges batched in a single dispatch

struct MetaballParams {
  sigma: f32,
  grid_size: u32,
  edge_count: u32,
  _pad: u32,
}

@group(0) @binding(0) var<storage, read> positions: array<f32>;       // [x, y, vx, vy] per node
@group(0) @binding(1) var<storage, read> he_offsets: array<u32>;      // CSR offsets
@group(0) @binding(2) var<storage, read> he_members: array<u32>;      // CSR member indices
@group(0) @binding(3) var<storage, read> edge_metas: array<f32>;      // [origin_x, origin_y, cell_size, pad] per edge
@group(0) @binding(4) var<storage, read_write> grid_out: array<f32>;  // output scalar field
@group(0) @binding(5) var<uniform> params: MetaballParams;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let tid = gid.x;
  let cells_per_edge = params.grid_size * params.grid_size;
  let edge_idx = tid / cells_per_edge;
  let local_cell = tid % cells_per_edge;

  if (edge_idx >= params.edge_count) {
    return;
  }

  // Decode grid row/col from local cell index
  let row = local_cell / params.grid_size;
  let col = local_cell % params.grid_size;

  // Read per-edge metadata: [origin_x, origin_y, cell_size, pad]
  let meta_base = edge_idx * 4u;
  let origin_x = edge_metas[meta_base];
  let origin_y = edge_metas[meta_base + 1u];
  let cell_size = edge_metas[meta_base + 2u];

  // World-space position of this grid cell center
  let px = origin_x + (f32(col) + 0.5) * cell_size;
  let py = origin_y + (f32(row) + 0.5) * cell_size;

  // Gaussian field evaluation: sum over all members of this hyperedge
  let inv_two_sigma_sq = 1.0 / (2.0 * params.sigma * params.sigma);
  let cutoff_sq = 9.0 * params.sigma * params.sigma; // 3-sigma cutoff

  let start = he_offsets[edge_idx];
  let end = he_offsets[edge_idx + 1u];

  var field_val = 0.0;
  for (var i = start; i < end; i = i + 1u) {
    let ni = he_members[i];
    let nx = positions[ni * 4u];
    let ny = positions[ni * 4u + 1u];
    let dx = px - nx;
    let dy = py - ny;
    let dist_sq = dx * dx + dy * dy;
    if (dist_sq < cutoff_sq) {
      field_val = field_val + exp(-dist_sq * inv_two_sigma_sq);
    }
  }

  // Write to output grid
  let out_idx = edge_idx * cells_per_edge + local_cell;
  grid_out[out_idx] = field_val;
}
