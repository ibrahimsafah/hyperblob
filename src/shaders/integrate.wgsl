// Velocity Verlet integration
// Updates positions from velocities, applies velocity decay and
// accumulates fixed-point attraction forces into velocities.

struct IntegrateParams {
  velocity_decay: f32,
  alpha: f32,
  node_count: u32,
  _pad: u32,
};

@group(0) @binding(0) var<storage, read_write> positions: array<f32>;       // [x, y, vx, vy]
@group(0) @binding(1) var<storage, read> attraction_forces: array<i32>;     // fixed-point [fx, fy] per node
@group(0) @binding(2) var<uniform> params: IntegrateParams;

const FP_SCALE_INV: f32 = 1.0 / 65536.0;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.node_count) {
    return;
  }

  let base = idx * 4u;
  var vx = positions[base + 2u];
  var vy = positions[base + 3u];

  // Add fixed-point attraction forces
  let fx = f32(attraction_forces[idx * 2u + 0u]) * FP_SCALE_INV;
  let fy = f32(attraction_forces[idx * 2u + 1u]) * FP_SCALE_INV;
  vx += fx;
  vy += fy;

  // Apply velocity decay (damping)
  vx *= params.velocity_decay;
  vy *= params.velocity_decay;

  // Clamp velocity to prevent explosions
  let speed = sqrt(vx * vx + vy * vy);
  let max_speed = 100.0;
  if (speed > max_speed) {
    let scale = max_speed / speed;
    vx *= scale;
    vy *= scale;
  }

  // Update position
  positions[base + 0u] += vx;
  positions[base + 1u] += vy;

  // Store updated velocity
  positions[base + 2u] = vx;
  positions[base + 3u] = vy;
}
