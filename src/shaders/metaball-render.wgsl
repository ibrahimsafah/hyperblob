// Screen-space metaball rendering — evaluates Gaussian field per-pixel
// Each hyperedge rendered as a bounding-box quad (instanced)
// Fragment shader evaluates field from node positions + MST bridge capsules

struct Camera {
  projection: mat4x4<f32>,
};

struct MetaballParams {
  sigma: f32,
  threshold: f32,
  smoothing_band: f32,
  _pad: u32,
};

struct EdgeInstance {
  bbox_min: vec2<f32>,
  bbox_max: vec2<f32>,
  color: vec4<f32>,
  edge_index: u32,
  mst_offset: u32,
  mst_count: u32,
  _pad: u32,
};

struct VertexOutput {
  @builtin(position) clip_position: vec4<f32>,
  @location(0) world_pos: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) @interpolate(flat) instance_idx: u32,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> positions: array<f32>;
@group(0) @binding(2) var<storage, read> he_offsets: array<u32>;
@group(0) @binding(3) var<storage, read> he_members: array<u32>;
@group(0) @binding(4) var<storage, read> instances: array<EdgeInstance>;
@group(0) @binding(5) var<storage, read> mst_edges: array<u32>;
@group(0) @binding(6) var<uniform> params: MetaballParams;

// Quad vertices: 2 triangles = 6 vertices per instance
const QUAD_UV = array<vec2<f32>, 6>(
  vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0),
  vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0), vec2<f32>(0.0, 0.0),
);

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_id: u32,
  @builtin(instance_index) instance_id: u32,
) -> VertexOutput {
  let inst = instances[instance_id];
  let uv = QUAD_UV[vertex_id];

  let world = mix(inst.bbox_min, inst.bbox_max, uv);

  var out: VertexOutput;
  out.clip_position = camera.projection * vec4<f32>(world, 0.0, 1.0);
  out.world_pos = world;
  out.color = inst.color;
  out.instance_idx = instance_id;
  return out;
}

// Squared distance from point to line segment
fn dist_to_segment_sq(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let ab = b - a;
  let len_sq = dot(ab, ab);
  if (len_sq < 1e-12) {
    let d = p - a;
    return dot(d, d);
  }
  let t = clamp(dot(p - a, ab) / len_sq, 0.0, 1.0);
  let nearest = a + t * ab;
  let d = p - nearest;
  return dot(d, d);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let inst = instances[in.instance_idx];
  let sigma = params.sigma;
  let inv_two_sigma_sq = 1.0 / (2.0 * sigma * sigma);
  let cutoff_sq = 9.0 * sigma * sigma;

  let p = in.world_pos;

  // Evaluate Gaussian field from member nodes
  let start = he_offsets[inst.edge_index];
  let end = he_offsets[inst.edge_index + 1u];

  var field_val = 0.0;
  for (var i = start; i < end; i = i + 1u) {
    let ni = he_members[i];
    let nx = positions[ni * 4u];
    let ny = positions[ni * 4u + 1u];
    let dx = p.x - nx;
    let dy = p.y - ny;
    let dist_sq = dx * dx + dy * dy;
    if (dist_sq < cutoff_sq) {
      field_val += exp(-dist_sq * inv_two_sigma_sq);
    }
  }

  // Evaluate bridge field along MST edges (capsule Gaussians)
  for (var m = 0u; m < inst.mst_count; m = m + 1u) {
    let mst_idx = (inst.mst_offset + m) * 2u;
    let ai = mst_edges[mst_idx];
    let bi = mst_edges[mst_idx + 1u];

    let a = vec2<f32>(positions[ai * 4u], positions[ai * 4u + 1u]);
    let b = vec2<f32>(positions[bi * 4u], positions[bi * 4u + 1u]);

    let edge_len = length(b - a);
    let bridge_sigma = max(sigma, edge_len * 0.12);
    let bridge_inv = 1.0 / (2.0 * bridge_sigma * bridge_sigma);
    let bridge_cutoff = 9.0 * bridge_sigma * bridge_sigma;

    let d_sq = dist_to_segment_sq(p, a, b);
    if (d_sq < bridge_cutoff) {
      field_val += exp(-d_sq * bridge_inv);
    }
  }

  // Anti-aliased threshold via smoothstep
  let band = params.smoothing_band;
  let alpha_mult = smoothstep(params.threshold - band, params.threshold + band, field_val);

  if (alpha_mult < 0.005) {
    discard;
  }

  return vec4<f32>(in.color.rgb, in.color.a * alpha_mult);
}
