// Bottom-up quadtree construction from Morton-sorted nodes
//
// Tree layout in memory (array-based complete quadtree):
// - Internal nodes: indices [0, internalCount)
// - Leaves: indices [internalCount, internalCount + leafCount)
// - Each internal node has 4 children: node i -> children at 4*i+1, 4*i+2, 4*i+3, 4*i+4
//
// We use a flat array representation. The tree is built by:
// 1. Placing sorted nodes into leaf cells
// 2. Each leaf stores: (node_index, mass=1, com_x, com_y, bbox)
// 3. Internal nodes are built bottom-up in the summarize pass

struct BuildParams {
  node_count: u32,
  tree_size: u32,     // total nodes in tree (internal + leaves)
  leaf_offset: u32,   // index of first leaf in tree array
  _pad: u32,
};

// Tree node layout: 8 floats per node
// [0]: center_of_mass_x
// [1]: center_of_mass_y
// [2]: total_mass (number of nodes in subtree)
// [3]: cell_size (width of this cell's bounding region)
// [4]: node_index (for leaves: original node index, for internal: 0xFFFFFFFF)
// [5]: child_mask (which children exist: bit 0-3)
// [6]: min_x of bounding box
// [7]: min_y of bounding box

@group(0) @binding(0) var<storage, read> positions: array<f32>;         // node positions [x,y,vx,vy]
@group(0) @binding(1) var<storage, read> sorted_indices: array<u32>;    // Morton-sorted node indices
@group(0) @binding(2) var<storage, read_write> tree: array<f32>;        // quadtree nodes
@group(0) @binding(3) var<uniform> params: BuildParams;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let tid = gid.x;
  if (tid >= params.node_count) {
    return;
  }

  // Map sorted index to leaf position in tree
  let leaf_idx = params.leaf_offset + tid;
  let node_idx = sorted_indices[tid];
  let base_pos = node_idx * 4u;

  let px = positions[base_pos];
  let py = positions[base_pos + 1u];

  let tree_base = leaf_idx * 8u;
  tree[tree_base + 0u] = px;        // com_x
  tree[tree_base + 1u] = py;        // com_y
  tree[tree_base + 2u] = 1.0;       // mass
  tree[tree_base + 3u] = 0.0;       // cell_size (leaves have 0)
  tree[tree_base + 4u] = f32(node_idx);  // node_index for leaf
  tree[tree_base + 5u] = 0.0;       // child_mask = 0 (leaf)
  tree[tree_base + 6u] = px;        // min_x
  tree[tree_base + 7u] = py;        // min_y
}
