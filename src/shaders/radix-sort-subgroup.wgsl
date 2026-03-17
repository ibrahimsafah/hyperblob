// GPU Radix Sort — subgroup-accelerated histogram variant
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
