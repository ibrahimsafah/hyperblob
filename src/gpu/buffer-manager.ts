export class BufferManager {
  private buffers = new Map<string, GPUBuffer>();
  private device: GPUDevice;

  constructor(device: GPUDevice) {
    this.device = device;
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
  }

  async readBuffer(name: string, size: number): Promise<Float32Array> {
    const srcBuffer = this.getBuffer(name);
    const stagingBuffer = this.device.createBuffer({
      label: `staging-read-${name}`,
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(srcBuffer, 0, stagingBuffer, 0, size);
    this.device.queue.submit([encoder.finish()]);
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(stagingBuffer.getMappedRange().slice(0));
    stagingBuffer.unmap();
    stagingBuffer.destroy();
    return result;
  }
}
