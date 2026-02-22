// Morton code computation for 2D positions
// Converts normalized [0,1] x [0,1] positions to 32-bit Z-order (Morton) codes
// Used to spatially sort nodes for quadtree construction

struct BoundsParams {
  min_x: f32,
  min_y: f32,
  max_x: f32,
  max_y: f32,
  node_count: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
};

@group(0) @binding(0) var<storage, read> positions: array<f32>;      // [x, y, vx, vy] per node
@group(0) @binding(1) var<storage, read_write> morton_codes: array<u32>; // output morton codes
@group(0) @binding(2) var<storage, read_write> indices: array<u32>;     // output node indices (identity initially)
@group(0) @binding(3) var<uniform> params: BoundsParams;

// Interleave bits: spread 16-bit value into even bits of 32-bit value
fn expand_bits(v_in: u32) -> u32 {
  var v = v_in & 0xFFFFu;
  v = (v | (v << 8u)) & 0x00FF00FFu;
  v = (v | (v << 4u)) & 0x0F0F0F0Fu;
  v = (v | (v << 2u)) & 0x33333333u;
  v = (v | (v << 1u)) & 0x55555555u;
  return v;
}

// 2D Morton code: interleave x and y bits
fn morton2d(x: u32, y: u32) -> u32 {
  return expand_bits(x) | (expand_bits(y) << 1u);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.node_count) {
    return;
  }

  let base = idx * 4u;
  let px = positions[base];
  let py = positions[base + 1u];

  // Normalize to [0, 1] range within bounding box
  let range_x = params.max_x - params.min_x;
  let range_y = params.max_y - params.min_y;

  var nx: f32 = 0.5;
  var ny: f32 = 0.5;
  if (range_x > 1e-10) {
    nx = clamp((px - params.min_x) / range_x, 0.0, 1.0);
  }
  if (range_y > 1e-10) {
    ny = clamp((py - params.min_y) / range_y, 0.0, 1.0);
  }

  // Quantize to 16-bit integer grid
  let ix = u32(nx * 65535.0);
  let iy = u32(ny * 65535.0);

  morton_codes[idx] = morton2d(ix, iy);
  indices[idx] = idx;
}
