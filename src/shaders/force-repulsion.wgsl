// Barnes-Hut repulsion force computation
//
// Each thread handles one node, traversing the quadtree to compute
// repulsive forces. Uses theta criterion: if cell_size / distance < theta,
// treat the cell as a single body (center of mass approximation).

struct SimParams {
  repulsion_strength: f32,  // negative = repulsive
  attraction_strength: f32,
  link_distance: f32,
  center_strength: f32,
  velocity_decay: f32,
  alpha: f32,
  alpha_target: f32,
  alpha_decay: f32,
  alpha_min: f32,
  theta: f32,
  node_count: u32,
  tree_size: u32,
};

@group(0) @binding(0) var<storage, read_write> positions: array<f32>;  // [x, y, vx, vy] per node
@group(0) @binding(1) var<storage, read> tree: array<f32>;             // quadtree nodes (8 floats each)
@group(0) @binding(2) var<uniform> params: SimParams;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.node_count) {
    return;
  }

  let base = idx * 4u;
  let px = positions[base + 0u];
  let py = positions[base + 1u];

  var fx: f32 = 0.0;
  var fy: f32 = 0.0;

  let strength = params.repulsion_strength * params.alpha;
  let theta_sq = params.theta * params.theta;

  // Stack-based tree traversal
  var stack: array<u32, 64>;
  var sp: i32 = 0;
  stack[0] = 0u; // start at root
  sp = 1;

  loop {
    if (sp <= 0) {
      break;
    }
    sp -= 1;
    let node = stack[sp];

    if (node >= params.tree_size) {
      continue;
    }

    let tree_base = node * 8u;
    let com_x = tree[tree_base + 0u];
    let com_y = tree[tree_base + 1u];
    let mass = tree[tree_base + 2u];
    let cell_size = tree[tree_base + 3u];
    let node_index_bits = bitcast<u32>(tree[tree_base + 4u]);
    let child_mask = u32(tree[tree_base + 5u]);

    if (mass <= 0.0) {
      continue;
    }

    let dx = px - com_x;
    let dy = py - com_y;
    let dist_sq = dx * dx + dy * dy;

    // Is this a leaf? (node_index_bits != 0xFFFFFFFF)
    let is_leaf = (node_index_bits != 0xFFFFFFFFu);

    // If leaf, check if it's the same node
    if (is_leaf) {
      if (node_index_bits == idx) {
        continue; // skip self
      }
      // Apply direct force
      let dist = max(sqrt(dist_sq), 1.0);
      let force = strength * mass / (dist * dist);
      fx += (dx / dist) * force;
      fy += (dy / dist) * force;
      continue;
    }

    // Barnes-Hut criterion for internal nodes
    // If cell_size^2 / dist_sq < theta^2, use approximation
    if (cell_size * cell_size < theta_sq * dist_sq) {
      let dist = max(sqrt(dist_sq), 1.0);
      let force = strength * mass / (dist * dist);
      fx += (dx / dist) * force;
      fy += (dy / dist) * force;
    } else {
      // Open the cell — push children onto stack
      let first_child = 4u * node + 1u;
      for (var c = 0u; c < 4u; c++) {
        if ((child_mask & (1u << c)) != 0u) {
          let child_idx = first_child + c;
          if (sp < 64 && child_idx < params.tree_size) {
            stack[sp] = child_idx;
            sp += 1;
          }
        }
      }
    }
  }

  // Accumulate force as velocity change
  positions[base + 2u] += fx;
  positions[base + 3u] += fy;
}
