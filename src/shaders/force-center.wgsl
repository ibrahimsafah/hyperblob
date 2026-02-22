// Centering force — prevents graph from drifting
// Computes mean position and applies gentle force toward origin

struct CenterParams {
  center_strength: f32,
  alpha: f32,
  node_count: u32,
  _pad: u32,
};

@group(0) @binding(0) var<storage, read_write> positions: array<f32>;  // [x, y, vx, vy]
@group(0) @binding(1) var<storage, read_write> center_sum: array<atomic<i32>>; // [sum_x, sum_y] fixed-point
@group(0) @binding(2) var<uniform> params: CenterParams;

const FP_SCALE: f32 = 256.0;

// Pass 1: accumulate center of mass
@compute @workgroup_size(256)
fn accumulate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.node_count) {
    return;
  }

  let base = idx * 4u;
  let px = positions[base + 0u];
  let py = positions[base + 1u];

  atomicAdd(&center_sum[0], i32(px * FP_SCALE));
  atomicAdd(&center_sum[1], i32(py * FP_SCALE));
}

// Pass 2: apply centering force
@compute @workgroup_size(256)
fn apply(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.node_count) {
    return;
  }

  let n = f32(params.node_count);
  let mean_x = f32(atomicLoad(&center_sum[0])) / (FP_SCALE * n);
  let mean_y = f32(atomicLoad(&center_sum[1])) / (FP_SCALE * n);

  let strength = params.center_strength * params.alpha;

  let base = idx * 4u;
  // Apply force toward origin (subtract mean * strength from velocity)
  positions[base + 2u] -= mean_x * strength;
  positions[base + 3u] -= mean_y * strength;
}
