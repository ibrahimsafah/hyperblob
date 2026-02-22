// Bottom-up center-of-mass computation for quadtree internal nodes
//
// Each internal node summarizes its 4 children:
//   com = weighted average of child COMs
//   mass = sum of child masses
//   cell_size = computed from bounding box
//
// We process level by level, from leaves up to root.
// Each dispatch handles one level of the tree.

struct SummarizeParams {
  level_start: u32,   // first node index at this level
  level_count: u32,   // number of nodes at this level
  tree_size: u32,     // total tree nodes
  root_size: f32,     // bounding box size of root
};

// Tree node layout: 8 floats per node (same as build shader)
@group(0) @binding(0) var<storage, read_write> tree: array<f32>;
@group(0) @binding(1) var<uniform> params: SummarizeParams;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let tid = gid.x;
  if (tid >= params.level_count) {
    return;
  }

  let node_idx = params.level_start + tid;
  let node_base = node_idx * 8u;

  // Children indices: 4*i+1, 4*i+2, 4*i+3, 4*i+4
  let first_child = 4u * node_idx + 1u;

  var total_mass: f32 = 0.0;
  var com_x: f32 = 0.0;
  var com_y: f32 = 0.0;
  var child_mask: u32 = 0u;
  var min_x: f32 = 1e20;
  var min_y: f32 = 1e20;
  var max_x: f32 = -1e20;
  var max_y: f32 = -1e20;

  for (var c = 0u; c < 4u; c++) {
    let child_idx = first_child + c;
    if (child_idx >= params.tree_size) {
      continue;
    }

    let child_base = child_idx * 8u;
    let child_mass = tree[child_base + 2u];

    if (child_mass > 0.0) {
      child_mask |= (1u << c);
      let cx = tree[child_base + 0u];
      let cy = tree[child_base + 1u];

      com_x += cx * child_mass;
      com_y += cy * child_mass;
      total_mass += child_mass;

      // Expand bounding box
      let child_min_x = tree[child_base + 6u];
      let child_min_y = tree[child_base + 7u];
      min_x = min(min_x, child_min_x);
      min_y = min(min_y, child_min_y);
      max_x = max(max_x, cx);
      max_y = max(max_y, cy);
    }
  }

  if (total_mass > 0.0) {
    com_x /= total_mass;
    com_y /= total_mass;
  }

  let cell_size = max(max_x - min_x, max_y - min_y);

  tree[node_base + 0u] = com_x;
  tree[node_base + 1u] = com_y;
  tree[node_base + 2u] = total_mass;
  tree[node_base + 3u] = cell_size;
  tree[node_base + 4u] = bitcast<f32>(0xFFFFFFFFu); // internal node marker
  tree[node_base + 5u] = f32(child_mask);
  tree[node_base + 6u] = select(0.0, min_x, total_mass > 0.0);
  tree[node_base + 7u] = select(0.0, min_y, total_mass > 0.0);
}
