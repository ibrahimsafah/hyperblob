// Edge rendering shader — star topology lines for hyperedges
// Each line segment connects a hyperedge centroid to a member node
// Vertex pairs: even vertex = centroid, odd vertex = member node

struct Camera {
  projection: mat4x4<f32>,
};

struct EdgeParams {
  opacity: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> positions: array<f32>;       // [x, y, vx, vy] per node
@group(0) @binding(2) var<storage, read> edge_draw: array<u32>;       // pairs: [he_index, member_node_index, ...]
@group(0) @binding(3) var<storage, read> he_offsets: array<u32>;      // CSR offsets
@group(0) @binding(4) var<storage, read> he_members: array<u32>;      // CSR members
@group(0) @binding(5) var<uniform> edge_params: EdgeParams;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) alpha: f32,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
  // Each line = 2 vertices. Pair index = vertex_index / 2, sub = vertex_index % 2
  let pair_index = vertex_index / 2u;
  let is_member = vertex_index % 2u; // 0 = centroid endpoint, 1 = member endpoint

  let he_index = edge_draw[pair_index * 2u];
  let member_node_index = edge_draw[pair_index * 2u + 1u];

  var world_pos: vec2<f32>;

  if (is_member == 1u) {
    // Member node position
    let base = member_node_index * 4u;
    world_pos = vec2<f32>(positions[base], positions[base + 1u]);
  } else {
    // Centroid: average of all members in this hyperedge
    let start = he_offsets[he_index];
    let end = he_offsets[he_index + 1u];
    let count = end - start;
    var cx = 0.0;
    var cy = 0.0;
    for (var i = start; i < end; i = i + 1u) {
      let node_idx = he_members[i];
      let base = node_idx * 4u;
      cx = cx + positions[base];
      cy = cy + positions[base + 1u];
    }
    let fc = f32(count);
    world_pos = vec2<f32>(cx / fc, cy / fc);
  }

  let clip_pos = camera.projection * vec4<f32>(world_pos, 0.0, 1.0);

  var out: VertexOutput;
  out.position = clip_pos;
  // Centroid vertices are slightly more transparent than member endpoints
  out.alpha = select(edge_params.opacity * 0.5, edge_params.opacity, is_member == 1u);
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(0.4, 0.4, 0.45, in.alpha);
}
