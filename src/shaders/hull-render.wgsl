// Hull rendering shader — semi-transparent convex hull polygons
// Triangles are pre-computed (fan-triangulated from centroid)
// Vertices come from a vertex buffer: [x, y, r, g, b, a] per vertex

struct Camera {
  projection: mat4x4<f32>,
};

struct VertexInput {
  @location(0) position: vec2<f32>,
  @location(1) color: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) clip_position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: Camera;

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.clip_position = camera.projection * vec4<f32>(in.position, 0.0, 1.0);
  out.color = in.color;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  return in.color;
}
