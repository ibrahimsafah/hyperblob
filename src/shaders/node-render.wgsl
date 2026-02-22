// Node rendering shader — generates quads from point data
// Each node = 6 vertices (2 triangles forming a quad)
// Positions stored in storage buffer, camera as uniform

struct Camera {
  projection: mat4x4<f32>,
};

struct RenderParams {
  node_size: f32,
  viewport_width: f32,
  viewport_height: f32,
  node_dark_mode: f32,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> positions: array<f32>;    // [x, y, vx, vy] per node
@group(0) @binding(2) var<storage, read> metadata: array<u32>;      // [group, flags] per node
@group(0) @binding(3) var<uniform> params: RenderParams;
@group(0) @binding(4) var<storage, read> palette: array<vec4<f32>>; // color palette

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) @interpolate(flat) node_index: u32,
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

  // Color from palette (or dark mode override)
  let group = metadata[node_index * 2u];
  let palette_size = arrayLength(&palette);
  let color_index = group % palette_size;
  var color = palette[color_index];
  if (params.node_dark_mode > 0.5) {
    color = vec4<f32>(0.12, 0.12, 0.14, 1.0);
  }

  var out: VertexOutput;
  out.position = vec4<f32>(clip_pos.xy + ndc_offset, clip_pos.z, clip_pos.w);
  out.uv = uv;
  out.color = color;
  out.node_index = node_index;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let dist = length(in.uv);
  if (dist > 1.0) {
    discard;
  }

  // Smoothstep antialiasing at the circle edge
  let aa = 1.0 - smoothstep(0.85, 1.0, dist);
  return vec4<f32>(in.color.rgb, in.color.a * aa);
}
