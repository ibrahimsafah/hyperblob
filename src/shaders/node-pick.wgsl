// Node picking shader — renders node IDs as colors to an offscreen texture
// Each node = 6 vertices (2 triangles forming a quad)

struct Camera {
  projection: mat4x4<f32>,
};

struct RenderParams {
  node_size: f32,
  viewport_width: f32,
  viewport_height: f32,
  _pad: f32,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> positions: array<f32>;    // [x, y, vx, vy] per node
@group(0) @binding(2) var<uniform> params: RenderParams;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) @interpolate(flat) node_index: u32,
};

// Quad corners: 2 triangles forming a square [-1,-1] to [1,1]
const QUAD_UVS = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>(-1.0,  1.0),
  vec2<f32>(-1.0,  1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
);

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
  let node_index = vertex_index / 6u;
  let corner_index = vertex_index % 6u;

  let base = node_index * 4u; // 4 floats per node: x, y, vx, vy
  let world_pos = vec2<f32>(positions[base], positions[base + 1u]);

  let uv = QUAD_UVS[corner_index];
  let size = params.node_size;

  // Offset in clip space (constant screen size)
  let clip_pos = camera.projection * vec4<f32>(world_pos, 0.0, 1.0);
  let pixel_offset = uv * size;
  let ndc_offset = vec2<f32>(
    pixel_offset.x * 2.0 / params.viewport_width,
    pixel_offset.y * 2.0 / params.viewport_height,
  );

  var out: VertexOutput;
  out.position = vec4<f32>(clip_pos.xy + ndc_offset, clip_pos.z, clip_pos.w);
  out.uv = uv;
  out.node_index = node_index;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let dist = length(in.uv);
  if (dist > 1.0) {
    discard;
  }

  // Encode node_index as RGB color
  // +1 so that background (0,0,0,0) means "no node"
  let id = in.node_index + 1u;
  let r = f32(id & 0xFFu) / 255.0;
  let g = f32((id >> 8u) & 0xFFu) / 255.0;
  let b = f32((id >> 16u) & 0xFFu) / 255.0;
  return vec4<f32>(r, g, b, 1.0);
}
