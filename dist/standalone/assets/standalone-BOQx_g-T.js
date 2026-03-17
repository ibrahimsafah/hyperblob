(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))n(i);new MutationObserver(i=>{for(const r of i)if(r.type==="childList")for(const s of r.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&n(s)}).observe(document,{childList:!0,subtree:!0});function t(i){const r={};return i.integrity&&(r.integrity=i.integrity),i.referrerPolicy&&(r.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?r.credentials="include":i.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function n(i){if(i.ep)return;i.ep=!0;const r=t(i);fetch(i.href,r)}})();async function le(l){if(!navigator.gpu)throw new Error("WebGPU not supported");const e=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!e)throw new Error("No WebGPU adapter found");const t={},n=(u,d)=>{const f=e.limits[u];t[u]=Math.min(d,f)};n("maxStorageBufferBindingSize",256*1024*1024),n("maxBufferSize",256*1024*1024),n("maxComputeWorkgroupSizeX",256),n("maxComputeInvocationsPerWorkgroup",256),n("maxStorageBuffersPerShaderStage",8);const i=[],r=e.features.has("timestamp-query");r&&i.push("timestamp-query"),e.features.has("subgroups")&&i.push("subgroups");const s=await e.requestDevice({requiredLimits:t,requiredFeatures:i});s.lost.then(u=>{console.error("WebGPU device lost:",u.message),u.reason!=="destroyed"&&console.warn("Attempting recovery would go here")});const a=l.getContext("webgpu");if(!a)throw new Error("Failed to get WebGPU canvas context");const o=navigator.gpu.getPreferredCanvasFormat();return a.configure({device:s,format:o,alphaMode:"premultiplied"}),{device:s,context:a,format:o,canvas:l,supportsTimestampQuery:r,features:s.features}}class de{device;available=[];inFlight=0;constructor(e){this.device=e}acquire(e){let t=-1,n=1/0;for(let s=0;s<this.available.length;s++){const a=this.available[s].size;a>=e&&a<n&&(t=s,n=a)}if(t>=0){const s=this.available.splice(t,1)[0];return this.inFlight++,s.buffer}const i=Math.max(fe(e,4096),4096),r=this.device.createBuffer({label:`staging-ring-${i}`,size:i,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});return this.inFlight++,r}release(e,t){this.inFlight--,this.available.length<6?this.available.push({buffer:e,size:t}):e.destroy()}destroy(){for(const e of this.available)e.buffer.destroy();this.available.length=0}}function fe(l,e){return Math.ceil(l/e)*e}class ce{buffers=new Map;device;stagingRing;constructor(e){this.device=e,this.stagingRing=new de(e)}createBuffer(e,t,n,i){this.destroyBuffer(e);const r=this.device.createBuffer({label:i??e,size:Math.max(t,4),usage:n});return this.buffers.set(e,r),r}uploadData(e,t,n=0){const i=this.buffers.get(e);if(!i)throw new Error(`Buffer "${e}" not found`);ArrayBuffer.isView(t)?this.device.queue.writeBuffer(i,n,t.buffer,t.byteOffset,t.byteLength):this.device.queue.writeBuffer(i,n,t)}getBuffer(e){const t=this.buffers.get(e);if(!t)throw new Error(`Buffer "${e}" not found`);return t}hasBuffer(e){return this.buffers.has(e)}destroyBuffer(e){const t=this.buffers.get(e);t&&(t.destroy(),this.buffers.delete(e))}destroyAll(){for(const e of this.buffers.values())e.destroy();this.buffers.clear(),this.stagingRing.destroy()}async readBuffer(e,t){const n=this.getBuffer(e),i=this.stagingRing.acquire(t),r=this.device.createCommandEncoder();r.copyBufferToBuffer(n,0,i,0,t),this.device.queue.submit([r.finish()]),await i.mapAsync(GPUMapMode.READ);const s=new Float32Array(i.getMappedRange(0,t).slice(0));return i.unmap(),this.stagingRing.release(i,i.size),s}}const q=64,he=60;class ge{enabled;querySet=null;resolveBuffer=null;readbackBuffer=null;queryIndex=0;stages=[];mapping=!1;latestTimings=null;frameCount=0;constructor(e,t){this.enabled=t,this.enabled&&(this.querySet=e.createQuerySet({type:"timestamp",count:q}),this.resolveBuffer=e.createBuffer({label:"profiler-resolve",size:q*8,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}),this.readbackBuffer=e.createBuffer({label:"profiler-readback",size:q*8,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}))}beginFrame(){this.enabled&&(this.queryIndex=0,this.stages.length=0)}timestampWrites(e){if(!this.enabled||!this.querySet||this.queryIndex+2>q)return;const t=this.queryIndex,n=this.queryIndex+1;return this.queryIndex+=2,this.stages.push(e),{querySet:this.querySet,beginningOfPassWriteIndex:t,endOfPassWriteIndex:n}}resolve(e){!this.enabled||!this.querySet||!this.resolveBuffer||!this.readbackBuffer||this.queryIndex!==0&&(e.resolveQuerySet(this.querySet,0,this.queryIndex,this.resolveBuffer,0),e.copyBufferToBuffer(this.resolveBuffer,0,this.readbackBuffer,0,this.queryIndex*8))}async readback(){if(!this.enabled||!this.readbackBuffer||this.mapping||this.queryIndex===0)return null;const e=this.stages.length,t=this.stages.slice();this.mapping=!0;try{await this.readbackBuffer.mapAsync(GPUMapMode.READ,0,e*2*8);const n=new BigUint64Array(this.readbackBuffer.getMappedRange(0,e*2*8)),i=new Map;for(let s=0;s<e;s++){const a=n[s*2],o=n[s*2+1],u=Number(o-a),d=t[s];i.set(d,(i.get(d)??0)+u)}this.readbackBuffer.unmap();const r=[];for(const[s,a]of i)r.push({stage:s,ms:a/1e6});if(this.latestTimings=r,this.frameCount++,this.frameCount%he===0){const s=r.map(a=>`${a.stage}: ${a.ms.toFixed(3)}ms`);console.log(`[GPUProfiler] ${s.join(" | ")}`)}return r}catch{return null}finally{this.mapping=!1}}getLatestTimings(){return this.latestTimings}destroy(){this.querySet?.destroy(),this.resolveBuffer?.destroy(),this.readbackBuffer?.destroy(),this.querySet=null,this.resolveBuffer=null,this.readbackBuffer=null}}function pe(l,e,t,n,i,r){const s=new Float32Array(16),a=e-l,o=n-t,u=r-i;return s[0]=2/a,s[5]=2/o,s[10]=-2/u,s[12]=-(e+l)/a,s[13]=-(n+t)/o,s[14]=-0/u,s[15]=1,s}class me{center=[0,0];zoom=1;minZoom=5e-4;maxZoom=50;width=1;height=1;projectionDirty=!0;cachedProjection=new Float32Array(16);version=0;resize(e,t){this.width=e,this.height=t,this.projectionDirty=!0,this.version++}getProjection(){if(this.projectionDirty){const e=this.width/2/this.zoom,t=this.height/2/this.zoom;this.cachedProjection=pe(this.center[0]-e,this.center[0]+e,this.center[1]-t,this.center[1]+t,-1,1),this.projectionDirty=!1}return this.cachedProjection}pan(e,t){this.center[0]-=e/this.zoom,this.center[1]+=t/this.zoom,this.projectionDirty=!0,this.version++}zoomAt(e,t,n){const i=this.screenToWorld(e,t);this.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.zoom*n));const r=this.screenToWorld(e,t);this.center[0]+=i[0]-r[0],this.center[1]+=i[1]-r[1],this.projectionDirty=!0,this.version++}screenToWorld(e,t){const n=this.center[0]+(e-this.width/2)/this.zoom,i=this.center[1]-(t-this.height/2)/this.zoom;return[n,i]}worldToScreen(e,t){const n=(e-this.center[0])*this.zoom+this.width/2,i=-(t-this.center[1])*this.zoom+this.height/2;return[n,i]}fitBounds(e,t,n,i,r=.1){const a=Math.max(n-e,100),o=Math.max(i-t,100);this.center=[(e+n)/2,(t+i)/2];const u=this.width/(a*(1+r)),d=this.height/(o*(1+r));this.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,Math.min(u,d))),this.projectionDirty=!0,this.version++}getViewportWidth(){return this.width}getViewportHeight(){return this.height}invalidate(){this.projectionDirty=!0}}const E=[[.4,.761,.647,1],[.988,.553,.384,1],[.553,.627,.796,1],[.906,.541,.765,1],[.651,.847,.329,1],[1,.851,.184,1],[.898,.769,.58,1],[.702,.702,.702,1],[.471,.808,.922,1],[.859,.439,.576,1],[.58,.863,.541,1],[.776,.569,.894,1],[.929,.682,.38,1],[.404,.694,.82,1],[.816,.78,.369,1],[.659,.471,.71,1]];function be(l){const e=new Float32Array(E.length*4);for(let t=0;t<E.length;t++)e[t*4+0]=E[t][0],e[t*4+1]=E[t][1],e[t*4+2]=E[t][2],e[t*4+3]=E[t][3];return e}function H(l){return E[l%E.length]}function V(l){return l.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}class ye{el;constructor(e){this.el=document.createElement("div"),this.el.className="hg-tooltip",this.el.style.cssText=`
      position: absolute;
      display: none;
      pointer-events: none;
      z-index: 100;
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid #d0d0d8;
      border-radius: 6px;
      padding: 8px 12px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 12px;
      color: #1a1a2e;
      line-height: 1.5;
      max-width: 280px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    `,e.appendChild(this.el)}show(e,t,n,i){const r=i.map(V),s=r.length<=5?r.join(", "):r.slice(0,3).join(", ")+`, +${i.length-3} more`;this.el.innerHTML=`<div style="font-weight:600;margin-bottom:2px">${V(n)}</div><div style="color:#666680">${s}</div>`,this.el.style.display="block",this.position(e,t)}showNode(e,t,n,i){const r=i.map(V),s=r.length===0?'<span style="color:#999">no edges</span>':r.length<=5?r.join(", "):r.slice(0,4).join(", ")+`, +${i.length-4} more`;this.el.innerHTML=`<div style="font-weight:600;margin-bottom:2px">${V(n)}</div><div style="color:#666680">${s}</div>`,this.el.style.display="block",this.position(e,t)}hide(){this.el.style.display="none"}position(e,t){const n=this.el.parentElement,i=n.clientWidth,r=n.clientHeight,s=this.el.offsetWidth,a=this.el.offsetHeight;let o=e+12,u=t+12;o+s>i&&(o=e-s-8),u+a>r&&(u=t-a-8),this.el.style.left=`${o}px`,this.el.style.top=`${u}px`}dispose(){this.el.remove()}}function ve(){return{repulsionStrength:-300,attractionStrength:.03,linkDistance:50,centerStrength:.015,velocityDecay:.6,energy:1,idleEnergy:.02,coolingRate:.0228,stopThreshold:.001,theta:.9,running:!0}}function _e(){return{nodeBaseSize:10,edgeOpacity:.15,hullAlpha:.25,hullOutline:!1,hullMargin:3,hullSmoothing:4,hullMode:"metaball",hullMetaballThreshold:.5,nodeDarkMode:!0,backgroundColor:[.97,.97,.98,1]}}const xe=`// Node rendering shader — generates quads from point data
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

  // Check visibility flag (bit 0 of flags = hidden)
  let flags = metadata[node_index * 2u + 1u];
  if ((flags & 1u) != 0u) {
    // Hidden node — move offscreen to avoid fragment shader work
    var out: VertexOutput;
    out.position = vec4<f32>(10000.0, 10000.0, 0.0, 1.0);
    out.uv = vec2<f32>(0.0, 0.0);
    out.color = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    out.node_index = node_index;
    return out;
  }

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

  // Dim flag (bit 1): reduce alpha for non-highlighted nodes
  if ((flags & 2u) != 0u) {
    color = vec4<f32>(color.rgb, color.a * 0.12);
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
`,Pe=`// GPU Radix Sort — single pass for one 8-bit digit
// Performs a prefix-sum (scan) based radix sort pass
// Called 4 times (for bits 0-7, 8-15, 16-23, 24-31) to fully sort 32-bit keys

struct SortParams {
  node_count: u32,
  bit_offset: u32,  // which 8-bit digit we're sorting (0, 8, 16, 24)
  _pad0: u32,
  _pad1: u32,
};

@group(0) @binding(0) var<storage, read> keys_in: array<u32>;
@group(0) @binding(1) var<storage, read> vals_in: array<u32>;
@group(0) @binding(2) var<storage, read_write> keys_out: array<u32>;
@group(0) @binding(3) var<storage, read_write> vals_out: array<u32>;
@group(0) @binding(4) var<storage, read_write> histograms: array<atomic<u32>>; // 256 bins per workgroup block
@group(0) @binding(5) var<uniform> params: SortParams;

// Workgroup-local histogram for counting sort
var<workgroup> local_hist: array<atomic<u32>, 256>;

@compute @workgroup_size(256)
fn histogram(@builtin(global_invocation_id) gid: vec3<u32>,
             @builtin(local_invocation_id) lid: vec3<u32>,
             @builtin(workgroup_id) wgid: vec3<u32>) {
  // Clear local histogram
  atomicStore(&local_hist[lid.x], 0u);
  workgroupBarrier();

  let idx = gid.x;
  if (idx < params.node_count) {
    let key = keys_in[idx];
    let digit = (key >> params.bit_offset) & 0xFFu;
    atomicAdd(&local_hist[digit], 1u);
  }
  workgroupBarrier();

  // Write local histogram to global histogram
  // Global layout: histograms[bin * num_workgroups + wgid]
  let num_workgroups = (params.node_count + 255u) / 256u;
  let count = atomicLoad(&local_hist[lid.x]);
  atomicStore(&histograms[lid.x * num_workgroups + wgid.x], count);
}

@compute @workgroup_size(256)
fn prefix_sum(@builtin(global_invocation_id) gid: vec3<u32>) {
  // Exclusive prefix sum over global histogram in-place
  // Each thread handles one bin across all workgroups
  // This runs with 256 threads (one per bin)
  let bin = gid.x;
  if (bin >= 256u) {
    return;
  }

  let num_workgroups = (params.node_count + 255u) / 256u;
  var running_sum = 0u;
  let base = bin * num_workgroups;
  for (var wg = 0u; wg < num_workgroups; wg++) {
    let count = atomicLoad(&histograms[base + wg]);
    atomicStore(&histograms[base + wg], running_sum);
    running_sum += count;
  }
}

@compute @workgroup_size(256)
fn scatter(@builtin(global_invocation_id) gid: vec3<u32>,
           @builtin(local_invocation_id) lid: vec3<u32>,
           @builtin(workgroup_id) wgid: vec3<u32>) {
  // Clear local_hist for per-digit rank counting
  atomicStore(&local_hist[lid.x], 0u);
  workgroupBarrier();

  let idx = gid.x;
  if (idx < params.node_count) {
    let key = keys_in[idx];
    let digit = (key >> params.bit_offset) & 0xFFu;

    // atomicAdd returns previous value = rank within workgroup for this digit
    let local_rank = atomicAdd(&local_hist[digit], 1u);

    // Global offset for this digit in this workgroup
    let num_workgroups = (params.node_count + 255u) / 256u;
    let global_offset = atomicLoad(&histograms[digit * num_workgroups + wgid.x]);

    let dest = global_offset + local_rank;
    if (dest < params.node_count) {
      keys_out[dest] = keys_in[idx];
      vals_out[dest] = vals_in[idx];
    }
  }
}
`,Be=`// GPU Radix Sort — subgroup-accelerated histogram variant
// Uses subgroup intrinsics to pre-reduce histogram counts,
// reducing atomic contention by ~subgroup_size (32x on NVIDIA, 64x on AMD)
//
// Requires 'subgroups' feature. prefix_sum and scatter are unchanged from scalar.

enable subgroups;

struct SortParams {
  node_count: u32,
  bit_offset: u32,
  _pad0: u32,
  _pad1: u32,
};

@group(0) @binding(0) var<storage, read> keys_in: array<u32>;
@group(0) @binding(1) var<storage, read> vals_in: array<u32>;
@group(0) @binding(2) var<storage, read_write> keys_out: array<u32>;
@group(0) @binding(3) var<storage, read_write> vals_out: array<u32>;
@group(0) @binding(4) var<storage, read_write> histograms: array<atomic<u32>>;
@group(0) @binding(5) var<uniform> params: SortParams;

var<workgroup> local_hist: array<atomic<u32>, 256>;

@compute @workgroup_size(256)
fn histogram(@builtin(global_invocation_id) gid: vec3<u32>,
             @builtin(local_invocation_id) lid: vec3<u32>,
             @builtin(workgroup_id) wgid: vec3<u32>) {
  atomicStore(&local_hist[lid.x], 0u);
  workgroupBarrier();

  let idx = gid.x;
  if (idx < params.node_count) {
    let key = keys_in[idx];
    let digit = (key >> params.bit_offset) & 0xFFu;

    // Subgroup pre-reduction: broadcast-and-match loop
    // Each iteration, one unique digit value is counted across the subgroup
    // and a single atomicAdd replaces up to subgroup_size individual ones
    var done = false;
    for (var iter = 0u; iter < 64u; iter++) {
      if (done) {
        continue;
      }
      let leader_digit = subgroupBroadcastFirst(digit);
      let matches = (digit == leader_digit);
      let count = subgroupAdd(select(0u, 1u, matches));
      if (matches) {
        if (subgroupElect()) {
          atomicAdd(&local_hist[leader_digit], count);
        }
        done = true;
      }
    }
  }
  workgroupBarrier();

  let num_workgroups = (params.node_count + 255u) / 256u;
  let count = atomicLoad(&local_hist[lid.x]);
  atomicStore(&histograms[lid.x * num_workgroups + wgid.x], count);
}

@compute @workgroup_size(256)
fn prefix_sum(@builtin(global_invocation_id) gid: vec3<u32>) {
  let bin = gid.x;
  if (bin >= 256u) {
    return;
  }

  let num_workgroups = (params.node_count + 255u) / 256u;
  var running_sum = 0u;
  let base = bin * num_workgroups;
  for (var wg = 0u; wg < num_workgroups; wg++) {
    let count = atomicLoad(&histograms[base + wg]);
    atomicStore(&histograms[base + wg], running_sum);
    running_sum += count;
  }
}

@compute @workgroup_size(256)
fn scatter(@builtin(global_invocation_id) gid: vec3<u32>,
           @builtin(local_invocation_id) lid: vec3<u32>,
           @builtin(workgroup_id) wgid: vec3<u32>) {
  atomicStore(&local_hist[lid.x], 0u);
  workgroupBarrier();

  let idx = gid.x;
  if (idx < params.node_count) {
    let key = keys_in[idx];
    let digit = (key >> params.bit_offset) & 0xFFu;

    let local_rank = atomicAdd(&local_hist[digit], 1u);

    let num_workgroups = (params.node_count + 255u) / 256u;
    let global_offset = atomicLoad(&histograms[digit * num_workgroups + wgid.x]);

    let dest = global_offset + local_rank;
    if (dest < params.node_count) {
      keys_out[dest] = keys_in[idx];
      vals_out[dest] = vals_in[idx];
    }
  }
}
`;class Se{device;bufferManager;histogramPipeline;prefixSumPipeline;scatterPipeline;bindGroupLayout;maxNodeCount;profiler=null;_hasSubgroups;paramsArray=new Uint32Array(4);evenBindGroup=null;oddBindGroup=null;get hasSubgroups(){return this._hasSubgroups}constructor(e,t,n,i,r=new Set){this.device=e,this.bufferManager=t,this.maxNodeCount=n,this.profiler=i??null,this._hasSubgroups=r.has("subgroups");const s=this._hasSubgroups?Be:Pe,a=e.createShaderModule({label:this._hasSubgroups?"radix-sort-subgroup-shader":"radix-sort-shader",code:s});this.bindGroupLayout=e.createBindGroupLayout({label:"radix-sort-bgl",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:5,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]});const o=e.createPipelineLayout({label:"radix-sort-pipeline-layout",bindGroupLayouts:[this.bindGroupLayout]});this.histogramPipeline=e.createComputePipeline({label:"radix-sort-histogram",layout:o,compute:{module:a,entryPoint:"histogram"}}),this.prefixSumPipeline=e.createComputePipeline({label:"radix-sort-prefix-sum",layout:o,compute:{module:a,entryPoint:"prefix_sum"}}),this.scatterPipeline=e.createComputePipeline({label:"radix-sort-scatter",layout:o,compute:{module:a,entryPoint:"scatter"}}),this.createBuffers(n)}createBuffers(e){const t=Math.ceil(e/256),n=256*t*4,i=e*4,r=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC;this.bufferManager.createBuffer("sort-keys-ping",i,r,"sort-keys-ping"),this.bufferManager.createBuffer("sort-vals-ping",i,r,"sort-vals-ping"),this.bufferManager.createBuffer("sort-keys-pong",i,r,"sort-keys-pong"),this.bufferManager.createBuffer("sort-vals-pong",i,r,"sort-vals-pong"),this.bufferManager.createBuffer("sort-histograms",Math.max(n,4),r,"sort-histograms"),this.bufferManager.createBuffer("sort-params",16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,"sort-params"),this.rebuildBindGroups(t)}rebuildBindGroups(e){const t=256*e*4;this.evenBindGroup=this.device.createBindGroup({label:"radix-sort-bg-even",layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.bufferManager.getBuffer("sort-keys-ping")}},{binding:1,resource:{buffer:this.bufferManager.getBuffer("sort-vals-ping")}},{binding:2,resource:{buffer:this.bufferManager.getBuffer("sort-keys-pong")}},{binding:3,resource:{buffer:this.bufferManager.getBuffer("sort-vals-pong")}},{binding:4,resource:{buffer:this.bufferManager.getBuffer("sort-histograms"),size:Math.max(t,4)}},{binding:5,resource:{buffer:this.bufferManager.getBuffer("sort-params")}}]}),this.oddBindGroup=this.device.createBindGroup({label:"radix-sort-bg-odd",layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.bufferManager.getBuffer("sort-keys-pong")}},{binding:1,resource:{buffer:this.bufferManager.getBuffer("sort-vals-pong")}},{binding:2,resource:{buffer:this.bufferManager.getBuffer("sort-keys-ping")}},{binding:3,resource:{buffer:this.bufferManager.getBuffer("sort-vals-ping")}},{binding:4,resource:{buffer:this.bufferManager.getBuffer("sort-histograms"),size:Math.max(t,4)}},{binding:5,resource:{buffer:this.bufferManager.getBuffer("sort-params")}}]})}encode(e,t){if(t<=1)return;t>this.maxNodeCount&&(this.maxNodeCount=t,this.createBuffers(t));const n=Math.ceil(t/256);e.copyBufferToBuffer(this.bufferManager.getBuffer("morton-codes"),0,this.bufferManager.getBuffer("sort-keys-ping"),0,t*4),e.copyBufferToBuffer(this.bufferManager.getBuffer("sorted-indices"),0,this.bufferManager.getBuffer("sort-vals-ping"),0,t*4);const i=this.bufferManager.getBuffer("sort-histograms");for(let r=0;r<4;r++){const s=r*8;this.paramsArray[0]=t,this.paramsArray[1]=s,this.device.queue.writeBuffer(this.bufferManager.getBuffer("sort-params"),0,this.paramsArray),e.clearBuffer(i);const a=r%2===0?this.evenBindGroup:this.oddBindGroup,o=e.beginComputePass({label:`radix-histogram-${r}`,timestampWrites:this.profiler?.timestampWrites("sort")});o.setPipeline(this.histogramPipeline),o.setBindGroup(0,a),o.dispatchWorkgroups(n),o.end();const u=e.beginComputePass({label:`radix-prefix-${r}`,timestampWrites:this.profiler?.timestampWrites("sort")});u.setPipeline(this.prefixSumPipeline),u.setBindGroup(0,a),u.dispatchWorkgroups(1),u.end();const d=e.beginComputePass({label:`radix-scatter-${r}`,timestampWrites:this.profiler?.timestampWrites("sort")});d.setPipeline(this.scatterPipeline),d.setBindGroup(0,a),d.dispatchWorkgroups(n),d.end()}e.copyBufferToBuffer(this.bufferManager.getBuffer("sort-keys-ping"),0,this.bufferManager.getBuffer("morton-codes"),0,t*4),e.copyBufferToBuffer(this.bufferManager.getBuffer("sort-vals-ping"),0,this.bufferManager.getBuffer("sorted-indices"),0,t*4)}destroy(){const e=["sort-keys-ping","sort-vals-ping","sort-keys-pong","sort-vals-pong","sort-histograms","sort-params"];for(const t of e)this.bufferManager.hasBuffer(t)&&this.bufferManager.destroyBuffer(t)}}const we=`// Bottom-up quadtree construction from Morton-sorted nodes
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
`,Ce=`// Bottom-up center-of-mass computation for quadtree internal nodes
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
      let child_size = tree[child_base + 3u];
      min_x = min(min_x, child_min_x);
      min_y = min(min_y, child_min_y);
      max_x = max(max_x, child_min_x + child_size);
      max_y = max(max_y, child_min_y + child_size);
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
  tree[node_base + 4u] = -1.0; // internal node marker (negative = not a leaf)
  tree[node_base + 5u] = f32(child_mask);
  tree[node_base + 6u] = select(0.0, min_x, total_mass > 0.0);
  tree[node_base + 7u] = select(0.0, min_y, total_mass > 0.0);
}
`;class Ge{device;bufferManager;buildPipeline;summarizePipeline;buildBGL;summarizeBGL;profiler=null;buildBindGroup=null;summarizeBindGroup=null;buildParamsArray=new Uint32Array(4);summarizeParamsBuf=new ArrayBuffer(16);summarizeParamsU32=new Uint32Array(this.summarizeParamsBuf);summarizeParamsF32=new Float32Array(this.summarizeParamsBuf);treeSize=0;leafOffset=0;numLevels=0;constructor(e,t,n){this.device=e,this.bufferManager=t,this.profiler=n??null;const i=e.createShaderModule({label:"quadtree-build-shader",code:we});this.buildBGL=e.createBindGroupLayout({label:"quadtree-build-bgl",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]}),this.buildPipeline=e.createComputePipeline({label:"quadtree-build",layout:e.createPipelineLayout({bindGroupLayouts:[this.buildBGL]}),compute:{module:i,entryPoint:"main"}});const r=e.createShaderModule({label:"quadtree-summarize-shader",code:Ce});this.summarizeBGL=e.createBindGroupLayout({label:"quadtree-summarize-bgl",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]}),this.summarizePipeline=e.createComputePipeline({label:"quadtree-summarize",layout:e.createPipelineLayout({bindGroupLayouts:[this.summarizeBGL]}),compute:{module:r,entryPoint:"main"}})}computeTreeLayout(e){let t=1,n=1;for(;n<e;)t++,n*=4;this.numLevels=t,t===1?(this.leafOffset=0,this.treeSize=Math.max(e,1)):(this.leafOffset=(n-1)/3,this.treeSize=this.leafOffset+n)}ensureBuffers(e){this.computeTreeLayout(e);const t=this.treeSize*8*4;this.bufferManager.createBuffer("quadtree",t,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC,"quadtree"),this.bufferManager.createBuffer("quadtree-build-params",16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,"quadtree-build-params"),this.bufferManager.createBuffer("quadtree-summarize-params",16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,"quadtree-summarize-params"),this.rebuildBindGroups()}rebuildBindGroups(){const e=this.bufferManager.getBuffer("quadtree");this.buildBindGroup=this.device.createBindGroup({label:"quadtree-build-bg",layout:this.buildBGL,entries:[{binding:0,resource:{buffer:this.bufferManager.getBuffer("node-positions")}},{binding:1,resource:{buffer:this.bufferManager.getBuffer("sorted-indices")}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:this.bufferManager.getBuffer("quadtree-build-params")}}]}),this.summarizeBindGroup=this.device.createBindGroup({label:"quadtree-summarize-bg",layout:this.summarizeBGL,entries:[{binding:0,resource:{buffer:e}},{binding:1,resource:{buffer:this.bufferManager.getBuffer("quadtree-summarize-params")}}]})}encode(e,t,n){if(t===0)return;e.clearBuffer(this.bufferManager.getBuffer("quadtree")),this.buildParamsArray[0]=t,this.buildParamsArray[1]=this.treeSize,this.buildParamsArray[2]=this.leafOffset,this.buildParamsArray[3]=0,this.device.queue.writeBuffer(this.bufferManager.getBuffer("quadtree-build-params"),0,this.buildParamsArray);const i=e.beginComputePass({label:"quadtree-build",timestampWrites:this.profiler?.timestampWrites("quadtree")});i.setPipeline(this.buildPipeline),i.setBindGroup(0,this.buildBindGroup),i.dispatchWorkgroups(Math.ceil(t/256)),i.end();for(let r=this.numLevels-2;r>=0;r--){const s=Math.pow(4,r),a=r===0?0:(s-1)/3;this.summarizeParamsU32[0]=a,this.summarizeParamsU32[1]=s,this.summarizeParamsU32[2]=this.treeSize,this.summarizeParamsF32[3]=n,this.device.queue.writeBuffer(this.bufferManager.getBuffer("quadtree-summarize-params"),0,this.summarizeParamsBuf);const o=e.beginComputePass({label:`quadtree-summarize-${r}`,timestampWrites:this.profiler?.timestampWrites("quadtree")});o.setPipeline(this.summarizePipeline),o.setBindGroup(0,this.summarizeBindGroup),o.dispatchWorkgroups(Math.ceil(s/256)),o.end()}}destroy(){const e=["quadtree","quadtree-build-params","quadtree-summarize-params"];for(const t of e)this.bufferManager.hasBuffer(t)&&this.bufferManager.destroyBuffer(t)}}const Ue=`// Morton code computation for 2D positions
// Converts normalized [0,1] x [0,1] positions to 32-bit Z-order (Morton) codes
// Used to spatially sort nodes for quadtree construction

struct BoundsParams {
  min_x: f32,
  min_y: f32,
  max_x: f32,
  max_y: f32,
  node_count: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
};

@group(0) @binding(0) var<storage, read> positions: array<f32>;      // [x, y, vx, vy] per node
@group(0) @binding(1) var<storage, read_write> morton_codes: array<u32>; // output morton codes
@group(0) @binding(2) var<storage, read_write> indices: array<u32>;     // output node indices (identity initially)
@group(0) @binding(3) var<uniform> params: BoundsParams;

// Interleave bits: spread 16-bit value into even bits of 32-bit value
fn expand_bits(v_in: u32) -> u32 {
  var v = v_in & 0xFFFFu;
  v = (v | (v << 8u)) & 0x00FF00FFu;
  v = (v | (v << 4u)) & 0x0F0F0F0Fu;
  v = (v | (v << 2u)) & 0x33333333u;
  v = (v | (v << 1u)) & 0x55555555u;
  return v;
}

// 2D Morton code: interleave x and y bits
fn morton2d(x: u32, y: u32) -> u32 {
  return expand_bits(x) | (expand_bits(y) << 1u);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.node_count) {
    return;
  }

  let base = idx * 4u;
  let px = positions[base];
  let py = positions[base + 1u];

  // Normalize to [0, 1] range within bounding box
  let range_x = params.max_x - params.min_x;
  let range_y = params.max_y - params.min_y;

  var nx: f32 = 0.5;
  var ny: f32 = 0.5;
  if (range_x > 1e-10) {
    nx = clamp((px - params.min_x) / range_x, 0.0, 1.0);
  }
  if (range_y > 1e-10) {
    ny = clamp((py - params.min_y) / range_y, 0.0, 1.0);
  }

  // Quantize to 16-bit integer grid
  let ix = u32(nx * 65535.0);
  let iy = u32(ny * 65535.0);

  morton_codes[idx] = morton2d(ix, iy);
  indices[idx] = idx;
}
`,Me=`// Barnes-Hut repulsion force computation
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
  energy: f32,
  idle_energy: f32,
  cooling_rate: f32,
  stop_threshold: f32,
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

  let strength = params.repulsion_strength * params.energy;
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
    let node_index_f = tree[tree_base + 4u];
    let child_mask = u32(tree[tree_base + 5u]);

    if (mass <= 0.0) {
      continue;
    }

    let dx = px - com_x;
    let dy = py - com_y;
    let dist_sq = dx * dx + dy * dy;

    // Is this a leaf? (node_index >= 0 means leaf; -1 means internal)
    let is_leaf = (node_index_f >= 0.0);

    // If leaf, check if it's the same node
    if (is_leaf) {
      if (u32(node_index_f) == idx) {
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
`,Ee=`// Link spring force (attraction) for hyperedges
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
  energy: f32,
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
  let strength = params.attraction_strength * params.energy;

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
`,De=`// Centering force — prevents graph from drifting
// Computes mean position and applies gentle force toward origin

struct CenterParams {
  center_strength: f32,
  energy: f32,
  node_count: u32,
  _pad: u32,
};

@group(0) @binding(0) var<storage, read_write> positions: array<f32>;  // [x, y, vx, vy]
@group(0) @binding(1) var<storage, read_write> center_sum: array<atomic<i32>>; // [sum_x, sum_y] fixed-point
@group(0) @binding(2) var<uniform> params: CenterParams;

const FP_SCALE: f32 = 256.0;

// Pass 1: accumulate center of mass
@compute @workgroup_size(256)
fn accumulate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.node_count) {
    return;
  }

  let base = idx * 4u;
  let px = positions[base + 0u];
  let py = positions[base + 1u];

  atomicAdd(&center_sum[0], i32(px * FP_SCALE));
  atomicAdd(&center_sum[1], i32(py * FP_SCALE));
}

// Pass 2: apply centering force
@compute @workgroup_size(256)
fn apply(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.node_count) {
    return;
  }

  let n = f32(params.node_count);
  let mean_x = f32(atomicLoad(&center_sum[0])) / (FP_SCALE * n);
  let mean_y = f32(atomicLoad(&center_sum[1])) / (FP_SCALE * n);

  let strength = params.center_strength * params.energy;

  let base = idx * 4u;
  // Apply force toward origin (subtract mean * strength from velocity)
  positions[base + 2u] -= mean_x * strength;
  positions[base + 3u] -= mean_y * strength;
}
`,Te=`// Velocity Verlet integration
// Updates positions from velocities, applies velocity decay and
// accumulates fixed-point attraction forces into velocities.

struct IntegrateParams {
  velocity_decay: f32,
  energy: f32,
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
`;class Re{device;bufferManager;nodeCount;edgeCount;radixSort;quadtree;mortonPipeline;repulsionPipeline;attractionPipeline;centerAccumPipeline;centerApplyPipeline;integratePipeline;mortonBGL;repulsionBGL;attractionBGL;centerBGL;integrateBGL;mortonBindGroup;repulsionBindGroup;attractionBindGroup;centerBindGroup;integrateBindGroup;mortonParams=new ArrayBuffer(32);mortonParamsF32=new Float32Array(this.mortonParams);mortonParamsU32=new Uint32Array(this.mortonParams);repulsionParams=new ArrayBuffer(48);repulsionParamsF32=new Float32Array(this.repulsionParams);repulsionParamsU32=new Uint32Array(this.repulsionParams);attractionParams=new ArrayBuffer(32);attractionParamsF32=new Float32Array(this.attractionParams);attractionParamsU32=new Uint32Array(this.attractionParams);centerParams=new ArrayBuffer(16);centerParamsF32=new Float32Array(this.centerParams);centerParamsU32=new Uint32Array(this.centerParams);integrateParams=new ArrayBuffer(16);integrateParamsF32=new Float32Array(this.integrateParams);integrateParamsU32=new Uint32Array(this.integrateParams);profiler=null;bounds={minX:-500,minY:-500,maxX:500,maxY:500};boundsFrameCounter=0;boundsUpdateInterval=5;constructor(e,t,n,i,r,s=new Set){this.device=e,this.bufferManager=t,this.nodeCount=n.nodes.length,this.edgeCount=n.hyperedges.length,this.allocateBuffers(),this.profiler=r??null,this.radixSort=new Se(e,t,this.nodeCount,r,s),this.quadtree=new Ge(e,t,r),this.quadtree.ensureBuffers(this.nodeCount);const a=e.createShaderModule({label:"morton-shader",code:Ue});this.mortonBGL=e.createBindGroupLayout({label:"morton-bgl",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]}),this.mortonPipeline=e.createComputePipeline({label:"morton-pipeline",layout:e.createPipelineLayout({bindGroupLayouts:[this.mortonBGL]}),compute:{module:a,entryPoint:"main"}});const o=e.createShaderModule({label:"repulsion-shader",code:Me});this.repulsionBGL=e.createBindGroupLayout({label:"repulsion-bgl",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]}),this.repulsionPipeline=e.createComputePipeline({label:"repulsion-pipeline",layout:e.createPipelineLayout({bindGroupLayouts:[this.repulsionBGL]}),compute:{module:o,entryPoint:"main"}});const u=e.createShaderModule({label:"attraction-shader",code:Ee});this.attractionBGL=e.createBindGroupLayout({label:"attraction-bgl",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]}),this.attractionPipeline=e.createComputePipeline({label:"attraction-pipeline",layout:e.createPipelineLayout({bindGroupLayouts:[this.attractionBGL]}),compute:{module:u,entryPoint:"main"}});const d=e.createShaderModule({label:"center-shader",code:De});this.centerBGL=e.createBindGroupLayout({label:"center-bgl",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]}),this.centerAccumPipeline=e.createComputePipeline({label:"center-accum-pipeline",layout:e.createPipelineLayout({bindGroupLayouts:[this.centerBGL]}),compute:{module:d,entryPoint:"accumulate"}}),this.centerApplyPipeline=e.createComputePipeline({label:"center-apply-pipeline",layout:e.createPipelineLayout({bindGroupLayouts:[this.centerBGL]}),compute:{module:d,entryPoint:"apply"}});const f=e.createShaderModule({label:"integrate-shader",code:Te});this.integrateBGL=e.createBindGroupLayout({label:"integrate-bgl",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]}),this.integratePipeline=e.createComputePipeline({label:"integrate-pipeline",layout:e.createPipelineLayout({bindGroupLayouts:[this.integrateBGL]}),compute:{module:f,entryPoint:"main"}}),this.rebuildBindGroups()}allocateBuffers(){const e=this.nodeCount,t=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC;this.bufferManager.createBuffer("morton-codes",e*4,t,"morton-codes"),this.bufferManager.createBuffer("sorted-indices",e*4,t,"sorted-indices"),this.bufferManager.createBuffer("morton-params",32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,"morton-params"),this.bufferManager.createBuffer("attraction-forces",Math.max(e*8,4),t,"attraction-forces"),this.bufferManager.createBuffer("attraction-params",32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,"attraction-params"),this.bufferManager.createBuffer("repulsion-params",48,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,"repulsion-params"),this.bufferManager.createBuffer("center-sum",8,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,"center-sum"),this.bufferManager.createBuffer("center-params",16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,"center-params"),this.bufferManager.createBuffer("integrate-params",16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,"integrate-params")}rebuildBindGroups(){this.mortonBindGroup=this.device.createBindGroup({layout:this.mortonBGL,entries:[{binding:0,resource:{buffer:this.bufferManager.getBuffer("node-positions")}},{binding:1,resource:{buffer:this.bufferManager.getBuffer("morton-codes")}},{binding:2,resource:{buffer:this.bufferManager.getBuffer("sorted-indices")}},{binding:3,resource:{buffer:this.bufferManager.getBuffer("morton-params")}}]}),this.repulsionBindGroup=this.device.createBindGroup({layout:this.repulsionBGL,entries:[{binding:0,resource:{buffer:this.bufferManager.getBuffer("node-positions")}},{binding:1,resource:{buffer:this.bufferManager.getBuffer("quadtree")}},{binding:2,resource:{buffer:this.bufferManager.getBuffer("repulsion-params")}}]}),this.attractionBindGroup=this.device.createBindGroup({layout:this.attractionBGL,entries:[{binding:0,resource:{buffer:this.bufferManager.getBuffer("node-positions")}},{binding:1,resource:{buffer:this.bufferManager.getBuffer("attraction-forces")}},{binding:2,resource:{buffer:this.bufferManager.getBuffer("he-offsets")}},{binding:3,resource:{buffer:this.bufferManager.getBuffer("he-members")}},{binding:4,resource:{buffer:this.bufferManager.getBuffer("attraction-params")}}]}),this.centerBindGroup=this.device.createBindGroup({layout:this.centerBGL,entries:[{binding:0,resource:{buffer:this.bufferManager.getBuffer("node-positions")}},{binding:1,resource:{buffer:this.bufferManager.getBuffer("center-sum")}},{binding:2,resource:{buffer:this.bufferManager.getBuffer("center-params")}}]}),this.integrateBindGroup=this.device.createBindGroup({layout:this.integrateBGL,entries:[{binding:0,resource:{buffer:this.bufferManager.getBuffer("node-positions")}},{binding:1,resource:{buffer:this.bufferManager.getBuffer("attraction-forces")}},{binding:2,resource:{buffer:this.bufferManager.getBuffer("integrate-params")}}]})}tick(e){if(this.nodeCount===0)return;const t=this.device.createCommandEncoder({label:"force-simulation-tick"}),n=Math.ceil(this.nodeCount/256);this.profiler?.beginFrame(),this.boundsFrameCounter++,this.boundsFrameCounter>=this.boundsUpdateInterval&&(this.boundsFrameCounter=0,this.updateBoundsAsync());const i=this.bounds.minX,r=this.bounds.minY,s=Math.max(this.bounds.maxX,i+1),a=Math.max(this.bounds.maxY,r+1),o=Math.max(s-i,a-r);this.mortonParamsF32[0]=i,this.mortonParamsF32[1]=r,this.mortonParamsF32[2]=s,this.mortonParamsF32[3]=a,this.mortonParamsU32[4]=this.nodeCount,this.mortonParamsU32[5]=0,this.mortonParamsU32[6]=0,this.mortonParamsU32[7]=0,this.device.queue.writeBuffer(this.bufferManager.getBuffer("morton-params"),0,this.mortonParams);{const u=t.beginComputePass({label:"morton",timestampWrites:this.profiler?.timestampWrites("morton")});u.setPipeline(this.mortonPipeline),u.setBindGroup(0,this.mortonBindGroup),u.dispatchWorkgroups(n),u.end()}this.radixSort.encode(t,this.nodeCount),this.quadtree.encode(t,this.nodeCount,o),this.repulsionParamsF32[0]=e.repulsionStrength,this.repulsionParamsF32[1]=e.attractionStrength,this.repulsionParamsF32[2]=e.linkDistance,this.repulsionParamsF32[3]=e.centerStrength,this.repulsionParamsF32[4]=e.velocityDecay,this.repulsionParamsF32[5]=e.energy,this.repulsionParamsF32[6]=e.idleEnergy,this.repulsionParamsF32[7]=e.coolingRate,this.repulsionParamsF32[8]=e.stopThreshold,this.repulsionParamsF32[9]=e.theta,this.repulsionParamsU32[10]=this.nodeCount,this.repulsionParamsU32[11]=this.quadtree.treeSize,this.device.queue.writeBuffer(this.bufferManager.getBuffer("repulsion-params"),0,this.repulsionParams);{const u=t.beginComputePass({label:"repulsion",timestampWrites:this.profiler?.timestampWrites("repulsion")});u.setPipeline(this.repulsionPipeline),u.setBindGroup(0,this.repulsionBindGroup),u.dispatchWorkgroups(n),u.end()}if(this.edgeCount>0){t.clearBuffer(this.bufferManager.getBuffer("attraction-forces")),this.attractionParamsF32[0]=e.attractionStrength,this.attractionParamsF32[1]=e.linkDistance,this.attractionParamsF32[2]=e.energy,this.attractionParamsU32[3]=0,this.attractionParamsU32[4]=this.edgeCount,this.attractionParamsU32[5]=0,this.attractionParamsU32[6]=0,this.attractionParamsU32[7]=0,this.device.queue.writeBuffer(this.bufferManager.getBuffer("attraction-params"),0,this.attractionParams);const u=Math.ceil(this.edgeCount/256),d=t.beginComputePass({label:"attraction",timestampWrites:this.profiler?.timestampWrites("attraction")});d.setPipeline(this.attractionPipeline),d.setBindGroup(0,this.attractionBindGroup),d.dispatchWorkgroups(u),d.end()}t.clearBuffer(this.bufferManager.getBuffer("center-sum")),this.centerParamsF32[0]=e.centerStrength,this.centerParamsF32[1]=e.energy,this.centerParamsU32[2]=this.nodeCount,this.centerParamsU32[3]=0,this.device.queue.writeBuffer(this.bufferManager.getBuffer("center-params"),0,this.centerParams);{const u=t.beginComputePass({label:"center-accumulate",timestampWrites:this.profiler?.timestampWrites("center")});u.setPipeline(this.centerAccumPipeline),u.setBindGroup(0,this.centerBindGroup),u.dispatchWorkgroups(n),u.end();const d=t.beginComputePass({label:"center-apply",timestampWrites:this.profiler?.timestampWrites("center")});d.setPipeline(this.centerApplyPipeline),d.setBindGroup(0,this.centerBindGroup),d.dispatchWorkgroups(n),d.end()}this.integrateParamsF32[0]=e.velocityDecay,this.integrateParamsF32[1]=e.energy,this.integrateParamsU32[2]=this.nodeCount,this.integrateParamsU32[3]=0,this.device.queue.writeBuffer(this.bufferManager.getBuffer("integrate-params"),0,this.integrateParams);{const u=t.beginComputePass({label:"integrate",timestampWrites:this.profiler?.timestampWrites("integrate")});u.setPipeline(this.integratePipeline),u.setBindGroup(0,this.integrateBindGroup),u.dispatchWorkgroups(n),u.end()}this.profiler?.resolve(t),this.device.queue.submit([t.finish()]),this.profiler?.readback()}updateBoundsAsync(){const e=this.nodeCount;e!==0&&this.bufferManager.readBuffer("node-positions",e*16).then(t=>{let n=1/0,i=1/0,r=-1/0,s=-1/0;for(let a=0;a<e;a++){const o=t[a*4],u=t[a*4+1];isFinite(o)&&isFinite(u)&&(n=Math.min(n,o),i=Math.min(i,u),r=Math.max(r,o),s=Math.max(s,u))}if(isFinite(n)){const a=(r-n)*.1+1,o=(s-i)*.1+1;this.bounds={minX:n-a,minY:i-o,maxX:r+a,maxY:s+o}}}).catch(()=>{})}destroy(){this.radixSort.destroy(),this.quadtree.destroy();const e=["morton-codes","sorted-indices","morton-params","attraction-forces","attraction-params","repulsion-params","center-sum","center-params","integrate-params"];for(const t of e)this.bufferManager.hasBuffer(t)&&this.bufferManager.destroyBuffer(t)}}class Ae{canvas;camera;dragging=!1;draggedNode=null;nodeDrag;mousedownPos=null;mousedownNodeIndex=null;lastTouchDist=0;lastTouchCenter=[0,0];boundHandlers=[];constructor(e,t,n){this.canvas=e,this.camera=t,this.nodeDrag=n??null,this.attachListeners()}attachListeners(){const e=(t,n,i)=>{const r=n;this.canvas.addEventListener(t,r,i),this.boundHandlers.push([t,r,i])};e("mousedown",t=>{if(t.button===0){if(this.mousedownPos={x:t.offsetX,y:t.offsetY},this.nodeDrag){const n=window.devicePixelRatio||1,[i,r]=this.camera.screenToWorld(t.offsetX*n,t.offsetY*n),s=this.nodeDrag.hitTest(i,r);if(s!==null){this.draggedNode=s,this.mousedownNodeIndex=s,this.nodeDrag.onDragStart(s),this.canvas.style.cursor="grabbing";return}}this.mousedownNodeIndex=null,this.dragging=!0}}),e("mousemove",t=>{if(this.draggedNode!==null&&this.nodeDrag){const n=window.devicePixelRatio||1,[i,r]=this.camera.screenToWorld(t.offsetX*n,t.offsetY*n);this.nodeDrag.onDrag(this.draggedNode,i,r)}else if(this.dragging){const n=window.devicePixelRatio||1;this.camera.pan(t.movementX*n,t.movementY*n)}else if(this.nodeDrag){const n=window.devicePixelRatio||1,[i,r]=this.camera.screenToWorld(t.offsetX*n,t.offsetY*n),s=this.nodeDrag.hitTest(i,r);if(s!==null)this.canvas.style.cursor="grab",this.nodeDrag.onHoverNode?.(s,t.offsetX,t.offsetY),this.nodeDrag.onHoverEdge?.(null,t.offsetX,t.offsetY);else{this.nodeDrag.onHoverNode?.(null,t.offsetX,t.offsetY);const a=this.nodeDrag.hitTestEdge?.(i,r)??null;this.canvas.style.cursor=a!==null?"pointer":"",this.nodeDrag.onHoverEdge?.(a,t.offsetX,t.offsetY)}}}),e("mouseup",t=>{const n=this.mousedownPos!==null&&Math.abs(t.offsetX-this.mousedownPos.x)<4&&Math.abs(t.offsetY-this.mousedownPos.y)<4;this.draggedNode!==null&&this.nodeDrag?(this.nodeDrag.onDragEnd(this.draggedNode),n&&this.nodeDrag.onClick?.(this.mousedownNodeIndex),this.draggedNode=null,this.canvas.style.cursor=""):n&&this.nodeDrag&&this.nodeDrag.onClick?.(null),this.dragging=!1,this.mousedownPos=null,this.mousedownNodeIndex=null}),e("mouseleave",()=>{this.draggedNode!==null&&this.nodeDrag&&(this.nodeDrag.onDragEnd(this.draggedNode),this.draggedNode=null,this.canvas.style.cursor=""),this.nodeDrag?.onHoverNode?.(null,0,0),this.nodeDrag?.onHoverEdge?.(null,0,0),this.dragging=!1}),e("wheel",t=>{t.preventDefault();const n=t.deltaY>0?.9:1.1,i=window.devicePixelRatio||1;this.camera.zoomAt(t.offsetX*i,t.offsetY*i,n)},{passive:!1}),e("touchstart",t=>{t.preventDefault(),t.touches.length===1?(this.dragging=!0,this.lastTouchCenter=[t.touches[0].clientX,t.touches[0].clientY]):t.touches.length===2&&(this.dragging=!1,this.lastTouchDist=this.touchDistance(t.touches[0],t.touches[1]),this.lastTouchCenter=this.touchCenter(t.touches[0],t.touches[1]))},{passive:!1}),e("touchmove",t=>{if(t.preventDefault(),t.touches.length===1&&this.dragging){const n=t.touches[0].clientX-this.lastTouchCenter[0],i=t.touches[0].clientY-this.lastTouchCenter[1],r=window.devicePixelRatio||1;this.camera.pan(n*r,i*r),this.lastTouchCenter=[t.touches[0].clientX,t.touches[0].clientY]}else if(t.touches.length===2){const n=this.touchDistance(t.touches[0],t.touches[1]),i=this.touchCenter(t.touches[0],t.touches[1]),r=this.canvas.getBoundingClientRect();if(this.lastTouchDist>0){const u=n/this.lastTouchDist,d=window.devicePixelRatio||1,f=(i[0]-r.left)*d,c=(i[1]-r.top)*d;this.camera.zoomAt(f,c,u)}const s=window.devicePixelRatio||1,a=i[0]-this.lastTouchCenter[0],o=i[1]-this.lastTouchCenter[1];this.camera.pan(a*s,o*s),this.lastTouchDist=n,this.lastTouchCenter=i}},{passive:!1}),e("touchend",t=>{t.touches.length===0?(this.dragging=!1,this.lastTouchDist=0):t.touches.length===1&&(this.dragging=!0,this.lastTouchCenter=[t.touches[0].clientX,t.touches[0].clientY],this.lastTouchDist=0)})}touchDistance(e,t){const n=e.clientX-t.clientX,i=e.clientY-t.clientY;return Math.sqrt(n*n+i*i)}touchCenter(e,t){return[(e.clientX+t.clientX)/2,(e.clientY+t.clientY)/2]}dispose(){for(const[e,t,n]of this.boundHandlers)this.canvas.removeEventListener(e,t,n);this.boundHandlers=[]}}const Ie=`// Edge rendering shader — star topology lines for hyperedges
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
@group(0) @binding(6) var<storage, read> edge_flags: array<u32>;  // per-hyperedge flags (bit 0 = dimmed)

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

  // Compute base alpha — centroid endpoints slightly more transparent
  var base_alpha = select(edge_params.opacity * 0.5, edge_params.opacity, is_member == 1u);

  // Per-edge dim flag: reduce alpha for dimmed edges
  let flags = edge_flags[he_index];
  if ((flags & 1u) != 0u) {
    base_alpha = base_alpha * 0.12;
  }

  var out: VertexOutput;
  out.position = clip_pos;
  out.alpha = base_alpha;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(0.4, 0.4, 0.45, in.alpha);
}
`;class Le{gpu;buffers;camera;pipeline=null;bindGroup=null;cameraBuffer=null;edgeParamsBuffer=null;totalLineSegments=0;lastCameraVersion=-1;edgeParamsArray=new Float32Array(4);edgeCount=0;constructor(e,t,n){this.gpu=e,this.buffers=t,this.camera=n,this.initPipeline()}initPipeline(){const{device:e,format:t}=this.gpu,n=e.createShaderModule({label:"edge-render-shader",code:Ie}),i=e.createBindGroupLayout({label:"edge-bind-group-layout",entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.VERTEX,buffer:{type:"uniform"}},{binding:6,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}}]}),r=e.createPipelineLayout({label:"edge-pipeline-layout",bindGroupLayouts:[i]});this.pipeline=e.createRenderPipeline({label:"edge-render-pipeline",layout:r,vertex:{module:n,entryPoint:"vs_main"},fragment:{module:n,entryPoint:"fs_main",targets:[{format:t,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"line-list"}}),this.cameraBuffer=this.buffers.createBuffer("edge-camera-uniform",64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,"edge-camera-uniform"),this.edgeParamsBuffer=this.buffers.createBuffer("edge-params-uniform",16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,"edge-params-uniform")}setData(e){this.edgeCount=e.hyperedges.length;let t=0;for(const s of e.hyperedges)t+=s.memberIndices.length;if(this.totalLineSegments=t,t===0)return;const n=new Uint32Array(t*2);let i=0;for(const s of e.hyperedges)for(const a of s.memberIndices)n[i++]=s.index,n[i++]=a;this.buffers.createBuffer("edge-draw-indices",n.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,"edge-draw-indices"),this.buffers.uploadData("edge-draw-indices",n);const r=Math.max(e.hyperedges.length*4,4);this.buffers.createBuffer("edge-flags",r,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,"edge-flags"),this.buffers.uploadData("edge-flags",new Uint32Array(e.hyperedges.length)),this.recreateBindGroup()}setVisibleEdges(e,t){let n=0;for(const s of e.hyperedges)(t===null||t.has(s.index))&&(n+=s.memberIndices.length);if(this.totalLineSegments=n,n===0)return;const i=new Uint32Array(n*2);let r=0;for(const s of e.hyperedges)if(!(t!==null&&!t.has(s.index)))for(const a of s.memberIndices)i[r++]=s.index,i[r++]=a;(!this.buffers.hasBuffer("edge-draw-indices")||i.byteLength>this.buffers.getBuffer("edge-draw-indices").size)&&(this.buffers.createBuffer("edge-draw-indices",i.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,"edge-draw-indices"),this.recreateBindGroup()),this.buffers.uploadData("edge-draw-indices",i)}setDimmedEdges(e){if(!this.buffers.hasBuffer("edge-flags")||this.edgeCount===0)return;const t=new Uint32Array(this.edgeCount);if(e)for(const n of e)n<this.edgeCount&&(t[n]=1);this.buffers.uploadData("edge-flags",t)}recreateBindGroup(){!this.pipeline||!this.cameraBuffer||!this.edgeParamsBuffer||this.buffers.hasBuffer("node-positions")&&this.buffers.hasBuffer("edge-draw-indices")&&this.buffers.hasBuffer("he-offsets")&&this.buffers.hasBuffer("he-members")&&this.buffers.hasBuffer("edge-flags")&&(this.bindGroup=this.gpu.device.createBindGroup({label:"edge-bind-group",layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.cameraBuffer}},{binding:1,resource:{buffer:this.buffers.getBuffer("node-positions")}},{binding:2,resource:{buffer:this.buffers.getBuffer("edge-draw-indices")}},{binding:3,resource:{buffer:this.buffers.getBuffer("he-offsets")}},{binding:4,resource:{buffer:this.buffers.getBuffer("he-members")}},{binding:5,resource:{buffer:this.edgeParamsBuffer}},{binding:6,resource:{buffer:this.buffers.getBuffer("edge-flags")}}]}))}render(e,t){!this.pipeline||!this.bindGroup||!this.cameraBuffer||!this.edgeParamsBuffer||this.totalLineSegments!==0&&(this.camera.version!==this.lastCameraVersion&&(this.lastCameraVersion=this.camera.version,this.gpu.device.queue.writeBuffer(this.cameraBuffer,0,this.camera.getProjection())),this.edgeParamsArray[0]=t.edgeOpacity,this.gpu.device.queue.writeBuffer(this.edgeParamsBuffer,0,this.edgeParamsArray),e.setPipeline(this.pipeline),e.setBindGroup(0,this.bindGroup),e.draw(this.totalLineSegments*2))}}function Q(l,e,t){return(e[0]-l[0])*(t[1]-l[1])-(e[1]-l[1])*(t[0]-l[0])}function Fe(l){const e=l.length;if(e<=1)return l.slice();const t=l.slice().sort((r,s)=>r[0]-s[0]||r[1]-s[1]);if(e===2)return t;const n=[];for(const r of t){for(;n.length>=2&&Q(n[n.length-2],n[n.length-1],r)<=0;)n.pop();n.push(r)}const i=[];for(let r=t.length-1;r>=0;r--){const s=t[r];for(;i.length>=2&&Q(i[i.length-2],i[i.length-1],s)<=0;)i.pop();i.push(s)}return n.pop(),i.pop(),n.concat(i)}function ke(l,e){if(e<=0||l.length<3)return l;const t=l.length,n=t*(1<<e);let i=new Float32Array(n*2),r=new Float32Array(n*2);for(let o=0;o<t;o++)i[o*2]=l[o][0],i[o*2+1]=l[o][1];let s=t;for(let o=0;o<e;o++){const u=s*2;for(let f=0;f<s;f++){const c=(f+1)%s,h=i[f*2],b=i[f*2+1],v=i[c*2],P=i[c*2+1],x=f*4;r[x]=.75*h+.25*v,r[x+1]=.75*b+.25*P,r[x+2]=.25*h+.75*v,r[x+3]=.25*b+.75*P}s=u;const d=i;i=r,r=d}const a=new Array(s);for(let o=0;o<s;o++)a[o]=[i[o*2],i[o*2+1]];return a}function Oe(l){let e=0,t=0;for(const n of l)e+=n[0],t+=n[1];return[e/l.length,t/l.length]}function ze(l,e){const t=[],n=e.length;for(let i=0;i<n;i++)t.push(l,e[i],e[(i+1)%n]);return t}const O=8,te=new Float64Array(O),ne=new Float64Array(O);for(let l=0;l<O;l++){const e=Math.PI*2*l/O;te[l]=Math.cos(e),ne[l]=Math.sin(e)}function qe(l,e){const t=[];for(const n of l)for(let i=0;i<O;i++)t.push([n[0]+e*te[i],n[1]+e*ne[i]]);return Fe(t)}class Ve{computeHulls(e,t,n,i=0){const r=[],s=Math.max(n,1);for(const a of t){if(a.memberIndices.length<2)continue;const o=[];for(const h of a.memberIndices){const b=h*4;o.push([e[b],e[b+1]])}const u=Oe(o),d=qe(o,s);if(d.length<3)continue;const f=ke(d,i),c=ze(u,f);r.push({vertices:f,centroid:u,hyperedgeIndex:a.index,triangles:c})}return r}}function Ne(l,e,t,n,i,r){const s=i-t,a=r-n,o=s*s+a*a;if(o<1e-12){const b=l-t,v=e-n;return b*b+v*v}const u=Math.max(0,Math.min(1,((l-t)*s+(e-n)*a)/o)),d=t+u*s,f=n+u*a,c=l-d,h=e-f;return c*c+h*h}function Z(l){const e=l.length;if(e<2)return[];const t=new Uint8Array(e),n=new Float64Array(e).fill(1/0),i=new Int32Array(e).fill(-1),r=[];t[0]=1;for(let s=1;s<e;s++){const a=l[s][0]-l[0][0],o=l[s][1]-l[0][1];n[s]=a*a+o*o,i[s]=0}for(let s=1;s<e;s++){let a=-1,o=1/0;for(let u=0;u<e;u++)!t[u]&&n[u]<o&&(o=n[u],a=u);if(a===-1)break;t[a]=1,r.push([i[a],a]);for(let u=0;u<e;u++){if(t[u])continue;const d=l[u][0]-l[a][0],f=l[u][1]-l[a][1],c=d*d+f*f;c<n[u]&&(n[u]=c,i[u]=a)}}return r}const Ye=`// Screen-space metaball rendering — evaluates Gaussian field per-pixel
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
`,ie=12,K=ie*4;class He{gpu;buffers;camera;pipeline;bindGroupLayout;bindGroup=null;cameraBuffer;paramsBuffer;instanceCapacity=0;mstCapacity=0;instanceCount=0;lastCameraVersion=-1;lastEdges=[];lastSigma=5;lastThreshold=.5;lastPositions=null;paramsArray=new Float32Array(4);constructor(e,t,n){this.gpu=e,this.buffers=t,this.camera=n;const{device:i,format:r}=e,s=i.createShaderModule({label:"metaball-render-shader",code:Ye});this.bindGroupLayout=i.createBindGroupLayout({label:"metaball-render-bgl",entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:6,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}}]}),this.pipeline=i.createRenderPipeline({label:"metaball-render-pipeline",layout:i.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]}),vertex:{module:s,entryPoint:"vs_main"},fragment:{module:s,entryPoint:"fs_main",targets:[{format:r,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"triangle-list"}}),this.cameraBuffer=t.createBuffer("metaball-camera",64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,"metaball-camera"),this.paramsBuffer=t.createBuffer("metaball-render-params",16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,"metaball-render-params")}updateInstances(e,t,n,i,r,s){this.lastEdges=t,this.lastSigma=n,this.lastThreshold=i,this.lastPositions=e;const a=[];for(const g of t)g.memberIndices.length>=2&&a.push(g);if(a.length===0){this.instanceCount=0;return}const o=n*3,u=a.length,d=new ArrayBuffer(u*K),f=new Float32Array(d),c=new Uint32Array(d),h=[];let b=0;for(const g of a){const m=g.memberIndices.map(B=>[e[B*4],e[B*4+1]]),_=Z(m).map(([B,G])=>[g.memberIndices[B],g.memberIndices[G]]);h.push(_),b+=_.length}const v=new Uint32Array(Math.max(b*2,1));let P=0;for(let g=0;g<u;g++){const m=a[g],y=h[g],_=H(m.index),G=s!==null&&s.has(m.index)?r*.08:r;let R=1/0,U=1/0,A=-1/0,I=-1/0;for(const D of m.memberIndices){const M=e[D*4],F=e[D*4+1];M<R&&(R=M),F<U&&(U=F),M>A&&(A=M),F>I&&(I=F)}let L=n;for(const[D,M]of y){const F=e[D*4],se=e[D*4+1],ae=e[M*4],oe=e[M*4+1],j=ae-F,$=oe-se,ue=Math.sqrt(j*j+$*$);L=Math.max(L,ue*.12)}const z=Math.max(o,L*3);R-=z,U-=z,A+=z,I+=z;const S=g*ie;f[S+0]=R,f[S+1]=U,f[S+2]=A,f[S+3]=I,f[S+4]=_[0],f[S+5]=_[1],f[S+6]=_[2],f[S+7]=G,c[S+8]=m.index,c[S+9]=P,c[S+10]=y.length,c[S+11]=0;for(const[D,M]of y)v[P*2]=D,v[P*2+1]=M,P++}this.instanceCount=u;const x=u*K;x>this.instanceCapacity&&(this.instanceCapacity=x*2,this.buffers.destroyBuffer("metaball-instances"),this.buffers.createBuffer("metaball-instances",this.instanceCapacity,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,"metaball-instances"),this.bindGroup=null),this.buffers.uploadData("metaball-instances",new Uint8Array(d));const T=Math.max(v.byteLength,4);T>this.mstCapacity&&(this.mstCapacity=Math.max(T*2,16),this.buffers.destroyBuffer("metaball-mst"),this.buffers.createBuffer("metaball-mst",this.mstCapacity,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,"metaball-mst"),this.bindGroup=null),this.buffers.uploadData("metaball-mst",v),this.paramsArray[0]=n,this.paramsArray[1]=i,this.paramsArray[2]=i*.15,this.paramsArray[3]=0,this.gpu.device.queue.writeBuffer(this.paramsBuffer,0,this.paramsArray),this.bindGroup||this.rebuildBindGroup()}rebuildBindGroup(){!this.buffers.hasBuffer("node-positions")||!this.buffers.hasBuffer("he-offsets")||!this.buffers.hasBuffer("he-members")||!this.buffers.hasBuffer("metaball-instances")||!this.buffers.hasBuffer("metaball-mst")||(this.bindGroup=this.gpu.device.createBindGroup({label:"metaball-render-bind-group",layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.cameraBuffer}},{binding:1,resource:{buffer:this.buffers.getBuffer("node-positions")}},{binding:2,resource:{buffer:this.buffers.getBuffer("he-offsets")}},{binding:3,resource:{buffer:this.buffers.getBuffer("he-members")}},{binding:4,resource:{buffer:this.buffers.getBuffer("metaball-instances")}},{binding:5,resource:{buffer:this.buffers.getBuffer("metaball-mst")}},{binding:6,resource:{buffer:this.paramsBuffer}}]}))}render(e){this.instanceCount===0||!this.bindGroup||(this.camera.version!==this.lastCameraVersion&&(this.lastCameraVersion=this.camera.version,this.gpu.device.queue.writeBuffer(this.cameraBuffer,0,this.camera.getProjection())),e.setPipeline(this.pipeline),e.setBindGroup(0,this.bindGroup),e.draw(6,this.instanceCount))}hitTest(e,t){const n=this.lastPositions;if(!n||this.lastEdges.length===0)return null;const i=this.lastSigma,r=this.lastThreshold,s=1/(2*i*i),a=9*i*i;for(let o=this.lastEdges.length-1;o>=0;o--){const u=this.lastEdges[o];if(u.memberIndices.length<2)continue;const d=u.memberIndices.map(g=>[n[g*4],n[g*4+1]]),f=Z(d);let c=1/0,h=1/0,b=-1/0,v=-1/0;for(const g of u.memberIndices){const m=n[g*4],y=n[g*4+1];m<c&&(c=m),y<h&&(h=y),m>b&&(b=m),y>v&&(v=y)}let P=i;for(const[g,m]of f){const y=d[m][0]-d[g][0],_=d[m][1]-d[g][1],B=Math.sqrt(y*y+_*_);P=Math.max(P,B*.12)}const x=Math.max(i*3,P*3);if(e<c-x||e>b+x||t<h-x||t>v+x)continue;let T=0;for(const g of u.memberIndices){const m=n[g*4],y=n[g*4+1],_=e-m,B=t-y,G=_*_+B*B;G<a&&(T+=Math.exp(-G*s))}for(const[g,m]of f){const y=d[g][0],_=d[g][1],B=d[m][0],G=d[m][1],R=Math.sqrt((B-y)**2+(G-_)**2),U=Math.max(i,R*.12),A=1/(2*U*U),I=9*U*U,L=Ne(e,t,y,_,B,G);L<I&&(T+=Math.exp(-L*A))}if(T>=r)return u.index}return null}invalidateBindGroup(){this.bindGroup=null}destroy(){this.buffers.destroyBuffer("metaball-instances"),this.buffers.destroyBuffer("metaball-mst"),this.buffers.destroyBuffer("metaball-camera"),this.buffers.destroyBuffer("metaball-render-params"),this.instanceCount=0,this.instanceCapacity=0,this.mstCapacity=0}}const We=`// Hull rendering shader — semi-transparent convex hull polygons
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
`,W=6,Xe=W*4;class je{gpu;buffers;camera;pipeline=null;outlinePipeline=null;bindGroup=null;cameraBuffer=null;hullCompute=new Ve;metaballRenderer=null;hypergraphData=null;fillVertexBuffer=null;fillBufferCapacity=0;fillVertexCount=0;outlineVertexBuffer=null;outlineBufferCapacity=0;outlineVertexCount=0;visibleEdges=null;dimmedEdgeSet=null;lastHulls=[];frameCounter=0;recomputeInterval=10;needsRecompute=!0;lastCameraVersion=-1;constructor(e,t,n){this.gpu=e,this.buffers=t,this.camera=n,this.initPipelines()}initPipelines(){const{device:e,format:t}=this.gpu,n=e.createShaderModule({label:"hull-render-shader",code:We}),i=e.createBindGroupLayout({label:"hull-bind-group-layout",entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:"uniform"}}]}),r=e.createPipelineLayout({label:"hull-pipeline-layout",bindGroupLayouts:[i]}),s={arrayStride:Xe,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"float32x4"}]};this.pipeline=e.createRenderPipeline({label:"hull-fill-pipeline",layout:r,vertex:{module:n,entryPoint:"vs_main",buffers:[s]},fragment:{module:n,entryPoint:"fs_main",targets:[{format:t,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"triangle-list"}}),this.outlinePipeline=e.createRenderPipeline({label:"hull-outline-pipeline",layout:r,vertex:{module:n,entryPoint:"vs_main",buffers:[s]},fragment:{module:n,entryPoint:"fs_main",targets:[{format:t,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"line-list"}}),this.cameraBuffer=this.buffers.createBuffer("hull-camera-uniform",64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,"hull-camera-uniform"),this.updateBindGroup()}updateBindGroup(){!this.pipeline||!this.cameraBuffer||(this.bindGroup=this.gpu.device.createBindGroup({label:"hull-bind-group",layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.cameraBuffer}}]}))}setData(e){this.hypergraphData=e,this.visibleEdges=null,this.needsRecompute=!0,this.frameCounter=0,this.metaballRenderer?.invalidateBindGroup()}setVisibleEdges(e){this.visibleEdges=e,this.forceRecompute()}setDimmedEdges(e){this.dimmedEdgeSet=e,this.forceRecompute()}recomputeHullsSync(e,t){if(!this.hypergraphData)return;const n=this.visibleEdges!==null?this.hypergraphData.hyperedges.filter(r=>this.visibleEdges.has(r.index)):this.hypergraphData.hyperedges,i=this.hullCompute.computeHulls(e,n,t.hullMargin,t.hullSmoothing);this.lastHulls=i,this.buildFillVertices(i,t.hullAlpha),t.hullOutline?this.buildOutlineVertices(i):this.outlineVertexCount=0,this.needsRecompute=!1}recomputeMetaballs(e,t){if(!this.hypergraphData)return;this.metaballRenderer??=new He(this.gpu,this.buffers,this.camera);const n=this.visibleEdges!==null?this.hypergraphData.hyperedges.filter(r=>this.visibleEdges.has(r.index)):this.hypergraphData.hyperedges,i=Math.max(t.hullMargin,5);this.metaballRenderer.updateInstances(e,n,i,t.hullMetaballThreshold,t.hullAlpha,this.dimmedEdgeSet),this.needsRecompute=!1}buildFillVertices(e,t){let n=0;for(const s of e)n+=s.triangles.length;if(n===0){this.fillVertexCount=0;return}const i=new Float32Array(n*W);let r=0;for(const s of e){const a=H(s.hyperedgeIndex),u=this.dimmedEdgeSet!==null&&this.dimmedEdgeSet.has(s.hyperedgeIndex)?t*.08:t;for(const d of s.triangles)i[r++]=d[0],i[r++]=d[1],i[r++]=a[0],i[r++]=a[1],i[r++]=a[2],i[r++]=u}this.fillVertexCount=n,i.byteLength>this.fillBufferCapacity&&(this.fillVertexBuffer&&this.fillVertexBuffer.destroy(),this.fillBufferCapacity=i.byteLength*2,this.fillVertexBuffer=this.gpu.device.createBuffer({label:"hull-fill-vertices",size:this.fillBufferCapacity,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST})),this.gpu.device.queue.writeBuffer(this.fillVertexBuffer,0,i)}buildOutlineVertices(e){let t=0;for(const s of e)t+=s.vertices.length*2;if(t===0){this.outlineVertexCount=0;return}const n=new Float32Array(t*W);let i=0;const r=.5;for(const s of e){const a=H(s.hyperedgeIndex),u=this.dimmedEdgeSet!==null&&this.dimmedEdgeSet.has(s.hyperedgeIndex)?r*.15:r,d=s.vertices.length;for(let f=0;f<d;f++){const c=(f+1)%d;n[i++]=s.vertices[f][0],n[i++]=s.vertices[f][1],n[i++]=a[0],n[i++]=a[1],n[i++]=a[2],n[i++]=u,n[i++]=s.vertices[c][0],n[i++]=s.vertices[c][1],n[i++]=a[0],n[i++]=a[1],n[i++]=a[2],n[i++]=u}}this.outlineVertexCount=t,n.byteLength>this.outlineBufferCapacity&&(this.outlineVertexBuffer&&this.outlineVertexBuffer.destroy(),this.outlineBufferCapacity=n.byteLength*2,this.outlineVertexBuffer=this.gpu.device.createBuffer({label:"hull-outline-vertices",size:this.outlineBufferCapacity,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST})),this.gpu.device.queue.writeBuffer(this.outlineVertexBuffer,0,n)}forceRecompute(){this.needsRecompute=!0}hitTest(e,t,n="convex"){if(n==="metaball"&&this.metaballRenderer)return this.metaballRenderer.hitTest(e,t);for(let i=this.lastHulls.length-1;i>=0;i--){const r=this.lastHulls[i].vertices,s=r.length;if(s<3)continue;let a=!1;for(let o=0,u=s-1;o<s;u=o++){const d=r[o][0],f=r[o][1],c=r[u][0],h=r[u][1];f>t!=h>t&&e<(c-d)*(t-f)/(h-f)+d&&(a=!a)}if(a)return this.lastHulls[i].hyperedgeIndex}return null}render(e,t,n){if(!this.hypergraphData)return;const i=t.hullMode==="metaball";if(this.frameCounter++,n&&(this.needsRecompute||this.frameCounter>=this.recomputeInterval)&&(this.frameCounter=0,i?this.recomputeMetaballs(n,t):this.recomputeHullsSync(n,t)),i)this.metaballRenderer?.render(e);else{if(!this.pipeline||!this.bindGroup||!this.cameraBuffer)return;this.camera.version!==this.lastCameraVersion&&(this.lastCameraVersion=this.camera.version,this.gpu.device.queue.writeBuffer(this.cameraBuffer,0,this.camera.getProjection())),this.fillVertexCount>0&&this.fillVertexBuffer&&(e.setPipeline(this.pipeline),e.setBindGroup(0,this.bindGroup),e.setVertexBuffer(0,this.fillVertexBuffer),e.draw(this.fillVertexCount)),t.hullOutline&&this.outlineVertexCount>0&&this.outlineVertexBuffer&&this.outlinePipeline&&(e.setPipeline(this.outlinePipeline),e.setBindGroup(0,this.bindGroup),e.setVertexBuffer(0,this.outlineVertexBuffer),e.draw(this.outlineVertexCount))}}}const $e=`struct Camera {
  projection: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> camera: Camera;

struct VertexInput {
  @location(0) position: vec2<f32>,
  @location(1) color: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.position = camera.projection * vec4<f32>(in.position, 0.0, 1.0);
  out.color = in.color;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  return in.color;
}
`,k=128,N=6,Qe=(k+1)*2,Ze=Qe*N*4;class Ke{gpu;camera;pipeline;bindGroup;cameraBuffer;vertexBuffer;vertexCount=0;lastCameraVersion=-1;centerX=0;centerY=0;radius=0;constructor(e,t){this.gpu=e,this.camera=t;const{device:n,format:i}=e;this.cameraBuffer=n.createBuffer({label:"boundary-camera",size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.vertexBuffer=n.createBuffer({label:"boundary-vertices",size:Ze,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});const r=n.createShaderModule({label:"boundary-shader",code:$e}),s=n.createBindGroupLayout({label:"boundary-bgl",entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:"uniform"}}]}),a={arrayStride:N*4,attributes:[{shaderLocation:0,offset:0,format:"float32x2"},{shaderLocation:1,offset:8,format:"float32x4"}]};this.pipeline=n.createRenderPipeline({label:"boundary-pipeline",layout:n.createPipelineLayout({bindGroupLayouts:[s]}),vertex:{module:r,entryPoint:"vs_main",buffers:[a]},fragment:{module:r,entryPoint:"fs_main",targets:[{format:i,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"triangle-strip"}}),this.bindGroup=n.createBindGroup({label:"boundary-bind-group",layout:s,entries:[{binding:0,resource:{buffer:this.cameraBuffer}}]})}updateFromPositions(e,t,n){if(t===0){this.vertexCount=0;return}let i=0,r=0;for(let o=0;o<t;o++)i+=e[o*4],r+=e[o*4+1];i/=t,r/=t;let s=0;for(let o=0;o<t;o++){const u=e[o*4]-i,d=e[o*4+1]-r,f=Math.sqrt(u*u+d*d);f>s&&(s=f)}const a=s+n*2+s*.15;Math.abs(a-this.radius)<1&&Math.abs(i-this.centerX)<1&&Math.abs(r-this.centerY)<1||(this.centerX=i,this.centerY=r,this.radius=a,this.buildRing(i,r,a))}buildRing(e,t,n){const i=Math.max(n*.004,.5),r=n-i,s=[.7,.7,.75,.25],a=new Float32Array((k+1)*2*N);for(let o=0;o<=k;o++){const u=o/k*Math.PI*2,d=Math.cos(u),f=Math.sin(u),c=o*2*N;a[c+0]=e+d*n,a[c+1]=t+f*n,a[c+2]=s[0],a[c+3]=s[1],a[c+4]=s[2],a[c+5]=s[3],a[c+6]=e+d*r,a[c+7]=t+f*r,a[c+8]=s[0],a[c+9]=s[1],a[c+10]=s[2],a[c+11]=s[3]}this.gpu.device.queue.writeBuffer(this.vertexBuffer,0,a),this.vertexCount=(k+1)*2}render(e){this.vertexCount!==0&&(this.camera.version!==this.lastCameraVersion&&(this.lastCameraVersion=this.camera.version,this.gpu.device.queue.writeBuffer(this.cameraBuffer,0,this.camera.getProjection())),e.setPipeline(this.pipeline),e.setBindGroup(0,this.bindGroup),e.setVertexBuffer(0,this.vertexBuffer),e.draw(this.vertexCount))}}class X{gpu;buffers;camera;options;simParams;renderParams;graphData=null;nodeCount=0;selectedNode=null;visibleNodes=null;highlightedNodes=null;nodeFilterPredicate=null;cpuPositions=null;cpuPositionsPending=!1;positionCacheCounter=0;draggedNodeIndex=null;dragTargetPos=null;dragSmoothPos=null;dragPrevPos=null;nodeRenderPipeline=null;nodeBindGroup=null;cameraBuffer=null;paramsBuffer=null;paletteBuffer=null;dragUploadArray=new Float32Array(4);renderParamsArray=new Float32Array(4);lastCameraVersion=-1;inputHandlerInstance=null;edgeRendererInstance=null;hullRendererInstance=null;boundaryRendererInstance=null;simulation=null;tooltip=null;lastHoveredNode=null;lastHoveredEdge=null;profiler;running=!1;disposed=!1;static async create(e,t){const n=await le(e),i=new X(n,t??{});return await i.init(),i}constructor(e,t){this.gpu=e,this.buffers=new ce(e.device),this.camera=new me,this.options=t,this.profiler=new ge(e.device,e.supportsTimestampQuery),this.simParams={...ve(),...t.simParams},this.renderParams={..._e(),...t.renderParams},t.tooltip!==!1&&(this.tooltip=new ye(e.canvas.parentElement))}async init(){this.handleResize(),window.addEventListener("resize",()=>this.handleResize());const e=this.options.palette??be();this.paletteBuffer=this.buffers.createBuffer("palette",e.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,"palette"),this.buffers.uploadData("palette",e),this.cameraBuffer=this.buffers.createBuffer("camera-uniform",64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,"camera-uniform"),this.paramsBuffer=this.buffers.createBuffer("render-params",16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,"render-params"),this.createNodePipeline(),this.setupInputHandler()}setupInputHandler(){const e=this.options;this.inputHandlerInstance=new Ae(this.gpu.canvas,this.camera,{hitTest:(t,n)=>this.hitTestNode(t,n),onDragStart:t=>{if(this.draggedNodeIndex=t,this.cpuPositions){const n=this.cpuPositions[t*4],i=this.cpuPositions[t*4+1];this.dragSmoothPos=[n,i],this.dragTargetPos=[n,i],this.dragPrevPos=[n,i]}this.simParams.energy<.08&&(this.simParams.energy=.08),this.simParams.running=!0},onDrag:(t,n,i)=>{this.dragTargetPos=[n,i],this.cpuPositions&&this.draggedNodeIndex!==null&&(this.cpuPositions[this.draggedNodeIndex*4]=n,this.cpuPositions[this.draggedNodeIndex*4+1]=i)},onDragEnd:()=>{if(this.draggedNodeIndex!==null&&this.dragSmoothPos&&this.dragPrevPos&&this.buffers.hasBuffer("node-positions")){const t=(this.dragSmoothPos[0]-this.dragPrevPos[0])*4,n=(this.dragSmoothPos[1]-this.dragPrevPos[1])*4,i=new Float32Array([this.dragSmoothPos[0],this.dragSmoothPos[1],t,n]);this.buffers.uploadData("node-positions",i,this.draggedNodeIndex*16)}this.draggedNodeIndex=null,this.dragTargetPos=null,this.dragSmoothPos=null,this.dragPrevPos=null},onClick:t=>{e.onNodeClick&&t!==null&&this.graphData?e.onNodeClick(t,this.graphData.nodes[t]):e.onEdgeClick&&t===null||(t===null||t===this.selectedNode?this.selectedNode=null:this.selectedNode=t,this.applySelection()),e.onNodeClick},onHoverNode:(t,n,i)=>{if(t!==this.lastHoveredNode){if(this.lastHoveredNode=t,e.onNodeHover&&this.graphData){const r=t!==null?this.graphData.nodes[t]:null;e.onNodeHover(t,r,n,i)}if(this.tooltip){if(t===null||!this.graphData){this.lastHoveredEdge===null&&this.tooltip.hide();return}const r=this.graphData.nodes[t],s=this.graphData.hyperedges.filter(o=>o.memberIndices.includes(t)).map(o=>String(o.attrs?.name??o.attrs?.label??`Edge ${o.id}`)),a=String(r?.attrs?.name??r?.attrs?.label??r?.id??`#${t}`);this.tooltip.showNode(n,i,a,s)}}},hitTestEdge:(t,n)=>this.hitTestEdge(t,n),onHoverEdge:(t,n,i)=>{if(t!==this.lastHoveredEdge){if(this.lastHoveredEdge=t,e.onEdgeHover&&this.graphData){const r=t!==null?this.graphData.hyperedges[t]:null;e.onEdgeHover(t,r,n,i)}if(this.tooltip){if(t===null||!this.graphData){this.lastHoveredNode===null&&this.tooltip.hide();return}const r=this.graphData.hyperedges[t];if(!r){this.tooltip.hide();return}const s=String(r.attrs?.name??r.attrs?.label??`Edge ${r.id}`),a=r.memberIndices.map(o=>this.graphData.nodes[o]?.id??`#${o}`);this.tooltip.show(n,i,s,a)}}}})}createNodePipeline(){const{device:e,format:t}=this.gpu,n=e.createShaderModule({label:"node-render-shader",code:xe}),i=e.createBindGroupLayout({label:"node-render-bind-group-layout",entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.VERTEX,buffer:{type:"uniform"}},{binding:4,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}}]}),r=e.createPipelineLayout({label:"node-render-pipeline-layout",bindGroupLayouts:[i]});this.nodeRenderPipeline=e.createRenderPipeline({label:"node-render-pipeline",layout:r,vertex:{module:n,entryPoint:"vs_main"},fragment:{module:n,entryPoint:"fs_main",targets:[{format:t,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"triangle-list"}})}createNodeBindGroup(){!this.nodeRenderPipeline||!this.cameraBuffer||!this.paramsBuffer||!this.paletteBuffer||!this.buffers.hasBuffer("node-positions")||!this.buffers.hasBuffer("node-metadata")||(this.nodeBindGroup=this.gpu.device.createBindGroup({label:"node-render-bind-group",layout:this.nodeRenderPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.cameraBuffer}},{binding:1,resource:{buffer:this.buffers.getBuffer("node-positions")}},{binding:2,resource:{buffer:this.buffers.getBuffer("node-metadata")}},{binding:3,resource:{buffer:this.paramsBuffer}},{binding:4,resource:{buffer:this.paletteBuffer}}]}))}setData(e){this.graphData=e,this.nodeCount=e.nodes.length,this.selectedNode=null,this.visibleNodes=null,this.highlightedNodes=null;const t=new Float32Array(e.nodes.length*4),n=Math.sqrt(e.nodes.length)*10;for(let r=0;r<e.nodes.length;r++)t[r*4+0]=(Math.random()-.5)*n,t[r*4+1]=(Math.random()-.5)*n,t[r*4+2]=0,t[r*4+3]=0;this.buffers.createBuffer("node-positions",t.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC,"node-positions"),this.buffers.uploadData("node-positions",t),this.cpuPositions=new Float32Array(t);const i=new Uint32Array(e.nodes.length*2);for(let r=0;r<e.nodes.length;r++)i[r*2+0]=e.nodes[r].group,i[r*2+1]=0;this.buffers.createBuffer("node-metadata",i.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,"node-metadata"),this.buffers.uploadData("node-metadata",i),this.uploadHyperedgeBuffers(e),this.createNodeBindGroup(),this.edgeRendererInstance||(this.edgeRendererInstance=new Le(this.gpu,this.buffers,this.camera)),this.edgeRendererInstance.setData(e),this.hullRendererInstance||(this.hullRendererInstance=new je(this.gpu,this.buffers,this.camera)),this.hullRendererInstance.setData(e),this.boundaryRendererInstance||(this.boundaryRendererInstance=new Ke(this.gpu,this.camera)),this.simulation=new Re(this.gpu.device,this.buffers,e,this.simParams,this.profiler,this.gpu.features),this.simParams.energy=1,this.simParams.running=!0,this.camera.fitBounds(-n/2,-n/2,n/2,n/2)}start(){this.running||(this.running=!0,this.tick())}dispose(){this.disposed=!0,this.running=!1,this.inputHandlerInstance?.dispose(),this.profiler.destroy(),this.buffers.destroyAll()}getCamera(){return this.camera}getNodeCount(){return this.nodeCount}getGraphData(){return this.graphData}getBufferManager(){return this.buffers}getGPU(){return this.gpu}getGPUTimings(){return this.profiler.getLatestTimings()}handleResize(){const e=this.gpu.canvas,t=e.parentElement;if(!t)return;const n=window.devicePixelRatio||1,i=Math.max(t.clientWidth,1),r=Math.max(t.clientHeight,1);e.width=i*n,e.height=r*n,e.style.width=`${i}px`,e.style.height=`${r}px`,this.gpu.context.configure({device:this.gpu.device,format:this.gpu.format,alphaMode:"premultiplied"}),this.camera.resize(i*n,r*n)}highlightNodes(e){if(!this.graphData||!this.buffers.hasBuffer("node-metadata"))return;const t=new Set(e);this.highlightedNodes=t;const n=new Set,i=new Set;for(const s of this.graphData.hyperedges)s.memberIndices.some(o=>t.has(o))?n.add(s.index):i.add(s.index);const r=new Uint32Array(this.nodeCount*2);for(let s=0;s<this.nodeCount;s++){r[s*2]=this.graphData.nodes[s].group;let a=0;this.nodeFilterPredicate&&!this.nodeFilterPredicate(this.graphData.nodes[s],s)&&(a|=1),t.has(s)||(a|=2),r[s*2+1]=a}this.buffers.uploadData("node-metadata",r),this.edgeRendererInstance?.setDimmedEdges&&this.edgeRendererInstance.setDimmedEdges(i),this.hullRendererInstance?.setDimmedEdges&&this.hullRendererInstance.setDimmedEdges(i)}highlightEdge(e){if(!this.graphData)return;const t=this.graphData.hyperedges[e];t&&this.highlightNodes(t.memberIndices)}clearHighlight(){if(!this.graphData||!this.buffers.hasBuffer("node-metadata"))return;this.highlightedNodes=null;const e=new Uint32Array(this.nodeCount*2);for(let t=0;t<this.nodeCount;t++){e[t*2]=this.graphData.nodes[t].group;let n=0;this.nodeFilterPredicate&&!this.nodeFilterPredicate(this.graphData.nodes[t],t)&&(n|=1),e[t*2+1]=n}this.buffers.uploadData("node-metadata",e),this.edgeRendererInstance?.setDimmedEdges&&this.edgeRendererInstance.setDimmedEdges(null),this.hullRendererInstance?.setDimmedEdges&&this.hullRendererInstance.setDimmedEdges(null)}setNodeFilter(e){if(!(!this.graphData||!this.buffers.hasBuffer("node-metadata")))if(this.nodeFilterPredicate=e,e===null){this.visibleNodes=null;const t=new Uint32Array(this.nodeCount*2);for(let n=0;n<this.nodeCount;n++){t[n*2]=this.graphData.nodes[n].group;let i=0;this.highlightedNodes&&!this.highlightedNodes.has(n)&&(i|=2),t[n*2+1]=i}this.buffers.uploadData("node-metadata",t),this.edgeRendererInstance&&this.edgeRendererInstance.setVisibleEdges(this.graphData,null),this.hullRendererInstance&&this.hullRendererInstance.setVisibleEdges(null)}else{const t=new Set;for(let r=0;r<this.nodeCount;r++)e(this.graphData.nodes[r],r)&&t.add(r);this.visibleNodes=t;const n=new Set;for(const r of this.graphData.hyperedges)r.memberIndices.some(s=>t.has(s))&&n.add(r.index);const i=new Uint32Array(this.nodeCount*2);for(let r=0;r<this.nodeCount;r++){i[r*2]=this.graphData.nodes[r].group;let s=0;t.has(r)||(s|=1),this.highlightedNodes&&!this.highlightedNodes.has(r)&&(s|=2),i[r*2+1]=s}this.buffers.uploadData("node-metadata",i),this.edgeRendererInstance&&this.edgeRendererInstance.setVisibleEdges(this.graphData,n),this.hullRendererInstance&&this.hullRendererInstance.setVisibleEdges(n)}}setPalette(e){this.paletteBuffer&&this.buffers.uploadData("palette",e)}async converge(){if(!this.simulation||!this.graphData)return;const{energy:e,idleEnergy:t,coolingRate:n,stopThreshold:i}=this.simParams,r=e-t,s=Math.max(i,t*.05);let a;r<=s||n<=0?a=50:a=Math.ceil(Math.log(s/r)/Math.log(1-n)),a=Math.min(Math.max(a,50),1e3);const o=this.simParams.running;this.simParams.running=!1;for(let u=0;u<a;u++)this.simulation.tick(this.simParams),this.simParams.energy+=(this.simParams.idleEnergy-this.simParams.energy)*this.simParams.coolingRate;await this.gpu.device.queue.onSubmittedWorkDone(),this.buffers.hasBuffer("node-positions")&&(this.cpuPositions=await this.buffers.readBuffer("node-positions",this.nodeCount*16)),this.hullRendererInstance&&this.hullRendererInstance.forceRecompute(),this.cpuPositions&&this.boundaryRendererInstance?.updateFromPositions(this.cpuPositions,this.nodeCount,this.renderParams.nodeBaseSize),await this.fitToScreen(),this.simParams.running=o}resetSimulation(){if(!this.graphData)return;this.simParams.energy=1,this.simParams.running=!0;const e=Math.sqrt(this.graphData.nodes.length)*10,t=new Float32Array(this.graphData.nodes.length*4);for(let n=0;n<this.graphData.nodes.length;n++)t[n*4+0]=(Math.random()-.5)*e,t[n*4+1]=(Math.random()-.5)*e;this.buffers.uploadData("node-positions",t),this.cpuPositions=new Float32Array(t)}async fitToScreen(){if(!this.graphData||this.nodeCount===0)return;const e=await this.buffers.readBuffer("node-positions",this.nodeCount*16);let t=1/0,n=1/0,i=-1/0,r=-1/0;for(let s=0;s<this.nodeCount;s++){const a=e[s*4],o=e[s*4+1];t=Math.min(t,a),i=Math.max(i,a),n=Math.min(n,o),r=Math.max(r,o)}this.camera.fitBounds(t,n,i,r)}tick=()=>{if(!(this.disposed||!this.running)){if(this.draggedNodeIndex!==null&&this.simParams.energy<.08&&(this.simParams.energy=.08,this.simParams.running=!0),this.draggedNodeIndex!==null&&this.dragSmoothPos&&this.buffers.hasBuffer("node-positions")&&(this.dragUploadArray[0]=this.dragSmoothPos[0],this.dragUploadArray[1]=this.dragSmoothPos[1],this.dragUploadArray[2]=0,this.dragUploadArray[3]=0,this.buffers.uploadData("node-positions",this.dragUploadArray,this.draggedNodeIndex*16)),this.simulation&&this.simParams.running&&this.simParams.energy>this.simParams.stopThreshold&&(this.simulation.tick(this.simParams),this.simParams.energy+=(this.simParams.idleEnergy-this.simParams.energy)*this.simParams.coolingRate),this.draggedNodeIndex!==null&&this.dragTargetPos&&this.dragSmoothPos&&this.buffers.hasBuffer("node-positions")){this.dragPrevPos=[this.dragSmoothPos[0],this.dragSmoothPos[1]];const e=.55;this.dragSmoothPos[0]+=(this.dragTargetPos[0]-this.dragSmoothPos[0])*e,this.dragSmoothPos[1]+=(this.dragTargetPos[1]-this.dragSmoothPos[1])*e,this.dragUploadArray[0]=this.dragSmoothPos[0],this.dragUploadArray[1]=this.dragSmoothPos[1],this.buffers.uploadData("node-positions",this.dragUploadArray,this.draggedNodeIndex*16)}this.positionCacheCounter++,this.positionCacheCounter>=10&&this.nodeCount>0&&!this.cpuPositionsPending&&this.buffers.hasBuffer("node-positions")&&(this.positionCacheCounter=0,this.cpuPositionsPending=!0,this.buffers.readBuffer("node-positions",this.nodeCount*16).then(e=>{this.cpuPositions=e,this.cpuPositionsPending=!1,this.boundaryRendererInstance?.updateFromPositions(e,this.nodeCount,this.renderParams.nodeBaseSize)})),this.hullRendererInstance&&(this.draggedNodeIndex!==null||this.simParams.energy>.05)&&this.hullRendererInstance.forceRecompute();try{this.render()}catch(e){console.error("WebGPU render error — stopping render loop:",e),this.running=!1;return}requestAnimationFrame(this.tick)}};render(){const{device:e,context:t,canvas:n}=this.gpu;if(n.width===0||n.height===0)return;this.cameraBuffer&&this.camera.version!==this.lastCameraVersion&&(this.lastCameraVersion=this.camera.version,e.queue.writeBuffer(this.cameraBuffer,0,this.camera.getProjection())),this.paramsBuffer&&(this.renderParamsArray[0]=this.renderParams.nodeBaseSize,this.renderParamsArray[1]=this.camera.getViewportWidth(),this.renderParamsArray[2]=this.camera.getViewportHeight(),this.renderParamsArray[3]=this.renderParams.nodeDarkMode?1:0,e.queue.writeBuffer(this.paramsBuffer,0,this.renderParamsArray));const i=t.getCurrentTexture();if(i.width===0||i.height===0)return;const r=i.createView(),s=this.renderParams.backgroundColor,a=e.createCommandEncoder(),o=a.beginRenderPass({colorAttachments:[{view:r,clearValue:{r:s[0],g:s[1],b:s[2],a:s[3]},loadOp:"clear",storeOp:"store"}]});this.boundaryRendererInstance&&this.boundaryRendererInstance.render(o),this.hullRendererInstance&&this.renderParams.hullAlpha>0&&this.hullRendererInstance.render(o,this.renderParams,this.cpuPositions),this.edgeRendererInstance&&this.renderParams.edgeOpacity>0&&this.edgeRendererInstance.render(o,this.renderParams),this.nodeRenderPipeline&&this.nodeBindGroup&&this.nodeCount>0&&(o.setPipeline(this.nodeRenderPipeline),o.setBindGroup(0,this.nodeBindGroup),o.draw(this.nodeCount*6)),o.end(),e.queue.submit([a.finish()])}applySelection(){if(!(!this.graphData||!this.buffers.hasBuffer("node-metadata"))){if(this.selectedNode===null){this.visibleNodes=null;const e=new Uint32Array(this.nodeCount*2);for(let t=0;t<this.nodeCount;t++)e[t*2]=this.graphData.nodes[t].group,e[t*2+1]=0;this.buffers.uploadData("node-metadata",e),this.edgeRendererInstance&&this.edgeRendererInstance.setVisibleEdges(this.graphData,null),this.hullRendererInstance&&this.hullRendererInstance.setVisibleEdges(null)}else{const e=new Set,t=new Set;t.add(this.selectedNode);for(const i of this.graphData.hyperedges)if(i.memberIndices.includes(this.selectedNode)){e.add(i.index);for(const r of i.memberIndices)t.add(r)}this.visibleNodes=t;const n=new Uint32Array(this.nodeCount*2);for(let i=0;i<this.nodeCount;i++)n[i*2]=this.graphData.nodes[i].group,n[i*2+1]=t.has(i)?0:1;this.buffers.uploadData("node-metadata",n),this.edgeRendererInstance&&this.edgeRendererInstance.setVisibleEdges(this.graphData,e),this.hullRendererInstance&&this.hullRendererInstance.setVisibleEdges(e)}this.tooltip&&(this.tooltip.hide(),this.lastHoveredEdge=null)}}uploadHyperedgeBuffers(e){const t=new Uint32Array(e.hyperedges.length+1);let n=0;for(let s=0;s<e.hyperedges.length;s++)t[s]=n,n+=e.hyperedges[s].memberIndices.length;t[e.hyperedges.length]=n;const i=new Uint32Array(n);let r=0;for(const s of e.hyperedges)for(const a of s.memberIndices)i[r++]=a;this.buffers.createBuffer("he-offsets",t.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,"he-offsets"),this.buffers.uploadData("he-offsets",t),this.buffers.createBuffer("he-members",Math.max(i.byteLength,4),GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,"he-members"),i.byteLength>0&&this.buffers.uploadData("he-members",i)}hitTestEdge(e,t){return this.hullRendererInstance?.hitTest(e,t,this.renderParams.hullMode)??null}hitTestNode(e,t){if(!this.cpuPositions||this.nodeCount===0)return null;let i=this.renderParams.nodeBaseSize*1.5/this.camera.zoom,r=null;for(let s=0;s<this.nodeCount;s++){if(this.visibleNodes!==null&&!this.visibleNodes.has(s))continue;const a=this.cpuPositions[s*4],o=this.cpuPositions[s*4+1],u=e-a,d=t-o,f=Math.sqrt(u*u+d*d);f<i&&(i=f,r=s)}return r}}function Je(l){const e=l.split(/\r?\n/);if(e.length===0)return{headers:[],rows:[]};const t=J(e[0]),n=[];for(let i=1;i<e.length;i++){const r=e[i].trim();if(r==="")continue;const s=J(r);for(;s.length<t.length;)s.push("");n.push(s.slice(0,t.length))}return{headers:t,rows:n}}function J(l){const e=[];let t="",n=!1;for(let i=0;i<l.length;i++){const r=l[i];n?r==='"'?i+1<l.length&&l[i+1]==='"'?(t+='"',i++):n=!1:t+=r:r==='"'?n=!0:r===","?(e.push(t.trim()),t=""):t+=r}return e.push(t.trim()),e}function et(l,e){const t=new Map,n=[],i=[];for(const a of l.rows){const o=a[e.nodeColumn];if(!o||t.has(o))continue;const u=n.length;t.set(o,u);const d={};for(let f=0;f<l.headers.length;f++)f!==e.nodeColumn&&(d[l.headers[f]]=a[f]);n.push({id:o,index:u,group:0,attrs:d})}let r=0;for(const a of e.edgeColumns){const o=new Map;for(const u of l.rows){const d=u[e.nodeColumn],f=u[a];if(!d||!f)continue;const c=t.get(d);c!==void 0&&(o.has(f)||o.set(f,new Set),o.get(f).add(c))}for(const[u,d]of o)d.size<2||i.push({id:`${l.headers[a]}:${u}`,index:r++,memberIndices:Array.from(d),attrs:{name:u,column:l.headers[a]}})}const s=new Int32Array(n.length).fill(-1);for(const a of i)for(const o of a.memberIndices)s[o]===-1&&(s[o]=a.index);for(let a=0;a<n.length;a++)n[a].group=s[a]>=0?s[a]%16:0;return{nodes:n,hyperedges:i,nodeIdToIndex:t}}let C=null,w=null;async function tt(){const l=document.getElementById("gpu-canvas");if(!l)throw new Error("Canvas not found");try{C=await X.create(l,{tooltip:!0}),C.start(),nt()}catch(e){console.error("Init failed:",e);const t=document.getElementById("error-overlay");t&&t.classList.add("visible")}}function nt(){const l=document.getElementById("panel");l.innerHTML="";const e=p("div","sa-title","Hyperblob");l.appendChild(e);const t=p("div","sa-scroll");l.appendChild(t),t.appendChild(Y("Load Data"));const n=p("div","sa-drop-zone"),i=p("div","sa-drop-label","Drop CSV here or click to upload"),r=p("div","sa-drop-hint","Comma-separated with a header row"),s=document.createElement("input");s.type="file",s.accept=".csv,.tsv,.txt",s.className="sa-file-input",n.append(i,r,s),t.appendChild(n),n.addEventListener("click",()=>s.click()),n.addEventListener("dragover",f=>{f.preventDefault(),n.classList.add("dragover")}),n.addEventListener("dragleave",()=>n.classList.remove("dragover")),n.addEventListener("drop",f=>{f.preventDefault(),n.classList.remove("dragover");const c=f.dataTransfer?.files[0];c&&ee(c)}),s.addEventListener("change",()=>{s.files?.[0]&&ee(s.files[0])});const a=document.createElement("textarea");a.className="sa-paste",a.placeholder="Or paste CSV data here...",a.rows=4,t.appendChild(a);const o=p("button","sa-btn sa-btn-default","Parse pasted data");o.addEventListener("click",()=>{a.value.trim()&&re(a.value)}),t.appendChild(o);const u=p("div","sa-mapper-section");u.style.display="none",t.appendChild(u);const d=p("div","sa-ctrl-section");d.style.display="none",t.appendChild(d),l.__mapper=u,l.__ctrls=d}function ee(l){const e=new FileReader;e.onload=()=>{typeof e.result=="string"&&re(e.result)},e.readAsText(l)}function re(l){if(w=Je(l),w.headers.length===0||w.rows.length===0){alert("No data found. Ensure CSV has a header row and at least one data row.");return}it()}function it(){if(!w)return;const l=document.getElementById("panel"),e=l.__mapper,t=l.__ctrls;e.innerHTML="",e.style.display="",e.appendChild(Y(`Columns (${w.headers.length} cols, ${w.rows.length} rows)`));const n=p("div","sa-field"),i=p("label","sa-label","Node ID column"),r=document.createElement("select");r.className="sa-select";for(let u=0;u<w.headers.length;u++){const d=document.createElement("option");d.value=String(u),d.textContent=w.headers[u],r.appendChild(d)}n.append(i,r),e.appendChild(n),e.appendChild(Y("Hyperedge columns"));const s=p("div","sa-hint","Each unique value in a selected column becomes a hyperedge grouping its rows.");e.appendChild(s);const a=[];for(let u=0;u<w.headers.length;u++){const d=p("div","sa-check-row"),f=document.createElement("input");f.type="checkbox",f.id=`col-${u}`,f.dataset.col=String(u);const c=document.createElement("label");c.htmlFor=`col-${u}`,c.className="sa-check-label";const h=new Set(w.rows.map(x=>x[u]).filter(Boolean)),b=Array.from(h).slice(0,3).join(", "),v=h.size>3?` +${h.size-3}`:"";c.textContent=`${w.headers[u]}`;const P=p("span","sa-sample",`${h.size} unique: ${b}${v}`);d.append(f,c,P),e.appendChild(d),a.push(f)}const o=p("button","sa-btn sa-btn-primary","Visualize");o.addEventListener("click",()=>{const u=parseInt(r.value),d=a.filter(h=>h.checked).map(h=>parseInt(h.dataset.col)).filter(h=>h!==u);if(d.length===0){alert("Select at least one hyperedge column (different from the node column).");return}const c=et(w,{nodeColumn:u,edgeColumns:d});rt(c,t)}),e.appendChild(o)}async function rt(l,e){if(!C)return;C.setData(l),await C.converge(),e.innerHTML="",e.style.display="",e.appendChild(Y(`Graph: ${l.nodes.length} nodes, ${l.hyperedges.length} edges`));const t=p("div","sa-btn-row"),n=p("button","sa-btn sa-btn-default","Re-converge");n.addEventListener("click",()=>C.converge());const i=p("button","sa-btn sa-btn-danger","Reset layout");i.addEventListener("click",()=>{C.resetSimulation()});const r=p("button","sa-btn sa-btn-default","Fit to screen");r.addEventListener("click",()=>C.fitToScreen()),t.append(n,i,r),e.appendChild(t);const s=p("div","sa-field"),a=p("label","sa-label","Hull mode"),o=document.createElement("select");o.className="sa-select";for(const u of["metaball","convex"]){const d=document.createElement("option");d.value=u,d.textContent=u,u===C.renderParams.hullMode&&(d.selected=!0),o.appendChild(d)}o.addEventListener("change",()=>{C.renderParams.hullMode=o.value}),s.append(a,o),e.appendChild(s)}function p(l,e,t){const n=document.createElement(l);return n.className=e,t&&(n.textContent=t),n}function Y(l){return p("div","sa-section-header",l)}tt();
