/** Pool of reusable MAP_READ staging buffers to avoid per-readback allocation */
class StagingRing {
  private device: GPUDevice;
  private available: { buffer: GPUBuffer; size: number }[] = [];
  private inFlight = 0;

  constructor(device: GPUDevice) {
    this.device = device;
  }

  /** Get a staging buffer of at least `size` bytes. Reuses from pool when possible. */
  acquire(size: number): GPUBuffer {
    // Find smallest available buffer that fits
    let bestIdx = -1;
    let bestSize = Infinity;
    for (let i = 0; i < this.available.length; i++) {
      const s = this.available[i].size;
      if (s >= size && s < bestSize) {
        bestIdx = i;
        bestSize = s;
      }
    }

    if (bestIdx >= 0) {
      const entry = this.available.splice(bestIdx, 1)[0];
      this.inFlight++;
      return entry.buffer;
    }

    // Allocate new — round up to 4KB alignment for reuse
    const allocSize = Math.max(alignUp(size, 4096), 4096);
    const buffer = this.device.createBuffer({
      label: `staging-ring-${allocSize}`,
      size: allocSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    this.inFlight++;
    return buffer;
  }

  /** Return a staging buffer to the pool after reading. */
  release(buffer: GPUBuffer, size: number): void {
    this.inFlight--;
    // Cap pool at 6 buffers to avoid unbounded growth
    if (this.available.length < 6) {
      this.available.push({ buffer, size });
    } else {
      buffer.destroy();
    }
  }

  destroy(): void {
    for (const entry of this.available) {
      entry.buffer.destroy();
    }
    this.available.length = 0;
  }
}

function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

export class BufferManager {
  private buffers = new Map<string, GPUBuffer>();
  private device: GPUDevice;
  private stagingRing: StagingRing;

  constructor(device: GPUDevice) {
    this.device = device;
    this.stagingRing = new StagingRing(device);
  }

  createBuffer(name: string, size: number, usage: GPUBufferUsageFlags, label?: string): GPUBuffer {
    this.destroyBuffer(name);
    const buffer = this.device.createBuffer({
      label: label ?? name,
      size: Math.max(size, 4), // WebGPU requires size > 0
      usage,
    });
    this.buffers.set(name, buffer);
    return buffer;
  }

  uploadData(name: string, data: ArrayBuffer | ArrayBufferView, offset = 0): void {
    const buffer = this.buffers.get(name);
    if (!buffer) throw new Error(`Buffer "${name}" not found`);
    if (ArrayBuffer.isView(data)) {
      this.device.queue.writeBuffer(buffer, offset, data.buffer, data.byteOffset, data.byteLength);
    } else {
      this.device.queue.writeBuffer(buffer, offset, data);
    }
  }

  getBuffer(name: string): GPUBuffer {
    const buffer = this.buffers.get(name);
    if (!buffer) throw new Error(`Buffer "${name}" not found`);
    return buffer;
  }

  hasBuffer(name: string): boolean {
    return this.buffers.has(name);
  }

  destroyBuffer(name: string): void {
    const existing = this.buffers.get(name);
    if (existing) {
      existing.destroy();
      this.buffers.delete(name);
    }
  }

  destroyAll(): void {
    for (const buffer of this.buffers.values()) {
      buffer.destroy();
    }
    this.buffers.clear();
    this.stagingRing.destroy();
  }

  async readBuffer(name: string, size: number): Promise<Float32Array> {
    const srcBuffer = this.getBuffer(name);
    const staging = this.stagingRing.acquire(size);

    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(srcBuffer, 0, staging, 0, size);
    this.device.queue.submit([encoder.finish()]);

    await staging.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(staging.getMappedRange(0, size).slice(0));
    staging.unmap();
    this.stagingRing.release(staging, staging.size);
    return result;
  }
}
