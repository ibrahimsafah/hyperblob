// GPU Radix Sort — single pass for one 8-bit digit
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
var<workgroup> local_offsets: array<u32, 256>;

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
  // Build local histogram to compute local rank
  atomicStore(&local_hist[lid.x], 0u);
  workgroupBarrier();

  let idx = gid.x;
  var digit = 0u;
  if (idx < params.node_count) {
    let key = keys_in[idx];
    digit = (key >> params.bit_offset) & 0xFFu;
    atomicAdd(&local_hist[digit], 1u);
  }
  workgroupBarrier();

  // Compute exclusive prefix sum within workgroup for local offsets
  // Simple sequential scan per workgroup (thread 0 does it)
  if (lid.x == 0u) {
    var sum = 0u;
    for (var i = 0u; i < 256u; i++) {
      let c = atomicLoad(&local_hist[i]);
      local_offsets[i] = sum;
      sum += c;
    }
  }
  workgroupBarrier();

  // Reset local_hist for use as per-digit counter
  atomicStore(&local_hist[lid.x], 0u);
  workgroupBarrier();

  if (idx < params.node_count) {
    // Compute rank within workgroup: local_offsets[digit] + atomicAdd(counter)
    let local_rank = atomicAdd(&local_hist[digit], 1u);
    _ = local_rank; // used below through re-read

    // Global offset for this digit in this workgroup
    let num_workgroups = (params.node_count + 255u) / 256u;
    let global_offset = atomicLoad(&histograms[digit * num_workgroups + wgid.x]);

    // We need the exact per-thread rank. Use a different approach:
    // Scan threads with the same digit to determine rank
    // Since atomicAdd returns previous value, local_rank IS the rank
    let dest = global_offset + local_rank;

    if (dest < params.node_count) {
      keys_out[dest] = keys_in[idx];
      vals_out[dest] = vals_in[idx];
    }
  }
}
