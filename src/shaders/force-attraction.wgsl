// Link spring force (attraction) for hyperedges
//
// For hyperedges we use a star-topology model: each hyperedge has a virtual
// center (mean of member positions), and spring forces attract members toward
// this center. This naturally handles k-uniform and non-uniform hyperedges.
//
// Each thread processes one member-pair from the CSR edge list.
// Uses atomic fixed-point accumulation since multiple edges may write to the
// same node concurrently.

struct AttractionParams {
  attraction_strength: f32,
  link_distance: f32,
  alpha: f32,
  total_pairs: u32,   // total number of member entries across all edges
  edge_count: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
};

@group(0) @binding(0) var<storage, read> positions: array<f32>;         // [x, y, vx, vy]
@group(0) @binding(1) var<storage, read_write> forces: array<atomic<i32>>; // fixed-point [fx, fy] per node
@group(0) @binding(2) var<storage, read> he_offsets: array<u32>;        // CSR offsets
@group(0) @binding(3) var<storage, read> he_members: array<u32>;        // CSR member indices
@group(0) @binding(4) var<uniform> params: AttractionParams;

const FP_SCALE: f32 = 65536.0;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let edge_idx = gid.x;
  if (edge_idx >= params.edge_count) {
    return;
  }

  let start = he_offsets[edge_idx];
  let end = he_offsets[edge_idx + 1u];
  let member_count = end - start;

  if (member_count < 2u) {
    return;
  }

  // Compute centroid of hyperedge members
  var cx: f32 = 0.0;
  var cy: f32 = 0.0;
  for (var i = start; i < end; i++) {
    let ni = he_members[i];
    let base = ni * 4u;
    cx += positions[base + 0u];
    cy += positions[base + 1u];
  }
  let inv_count = 1.0 / f32(member_count);
  cx *= inv_count;
  cy *= inv_count;

  // Apply spring force from each member toward centroid
  let strength = params.attraction_strength * params.alpha;

  for (var i = start; i < end; i++) {
    let ni = he_members[i];
    let base = ni * 4u;
    let px = positions[base + 0u];
    let py = positions[base + 1u];

    let dx = cx - px;
    let dy = cy - py;
    let dist = sqrt(dx * dx + dy * dy);

    if (dist < 1e-6) {
      continue;
    }

    // Spring force: strength * (dist - linkDistance) / dist * direction
    // Simplified: attract toward centroid proportional to distance
    let displacement = dist - params.link_distance * inv_count;
    let force = strength * displacement / dist;
    let fx = dx * force;
    let fy = dy * force;

    // Atomic fixed-point accumulation
    let ifx = i32(fx * FP_SCALE);
    let ify = i32(fy * FP_SCALE);
    atomicAdd(&forces[ni * 2u + 0u], ifx);
    atomicAdd(&forces[ni * 2u + 1u], ify);
  }
}
