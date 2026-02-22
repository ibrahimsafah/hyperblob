import type { Mat4 } from '../utils/math';
import nodePickShaderCode from '../shaders/node-pick.wgsl?raw';

export class NodePicker {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline | null = null;
  private pickTexture: GPUTexture | null = null;
  private pickTextureView: GPUTextureView | null = null;
  private readBuffer: GPUBuffer | null = null;
  private cameraBuffer: GPUBuffer;
  private paramsBuffer: GPUBuffer;
  private width = 0;
  private height = 0;

  constructor(device: GPUDevice, _format: GPUTextureFormat) {
    this.device = device;

    // Create uniform buffers for pick pipeline
    this.cameraBuffer = device.createBuffer({
      label: 'pick-camera-uniform',
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.paramsBuffer = device.createBuffer({
      label: 'pick-params-uniform',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.createPipeline();
  }

  private createPipeline(): void {
    const shaderModule = this.device.createShaderModule({
      label: 'node-pick-shader',
      code: nodePickShaderCode,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'node-pick-bind-group-layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'node-pick-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    this.pipeline = this.device.createRenderPipeline({
      label: 'node-pick-pipeline',
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: 'rgba8unorm' }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  private ensureTextures(width: number, height: number): void {
    if (this.width === width && this.height === height && this.pickTexture) return;

    this.pickTexture?.destroy();
    this.readBuffer?.destroy();

    this.width = width;
    this.height = height;

    this.pickTexture = this.device.createTexture({
      label: 'pick-texture',
      size: [width, height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    this.pickTextureView = this.pickTexture.createView();

    // Buffer to read a single pixel (4 bytes, but aligned to 256 for copyBufferToBuffer)
    this.readBuffer = this.device.createBuffer({
      label: 'pick-read-buffer',
      size: 256,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
  }

  renderPickBuffer(
    encoder: GPUCommandEncoder,
    positions: GPUBuffer,
    nodeCount: number,
    camera: Mat4,
    viewport: [number, number],
  ): void {
    if (!this.pipeline) return;

    const [width, height] = viewport;
    this.ensureTextures(width, height);
    if (!this.pickTextureView) return;

    // Upload camera matrix
    this.device.queue.writeBuffer(this.cameraBuffer, 0, camera);

    // Upload params (node_size, viewport)
    const paramsData = new Float32Array([6.0, width, height, 0]);
    this.device.queue.writeBuffer(this.paramsBuffer, 0, paramsData);

    const bindGroup = this.device.createBindGroup({
      label: 'node-pick-bind-group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: { buffer: positions } },
        { binding: 2, resource: { buffer: this.paramsBuffer } },
      ],
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.pickTextureView,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(nodeCount * 6);
    pass.end();
  }

  async pickAt(x: number, y: number): Promise<number | null> {
    if (!this.pickTexture || !this.readBuffer) return null;

    // Clamp coordinates
    const px = Math.max(0, Math.min(Math.floor(x), this.width - 1));
    const py = Math.max(0, Math.min(Math.floor(y), this.height - 1));

    const encoder = this.device.createCommandEncoder();

    // Copy single pixel from texture to buffer
    encoder.copyTextureToBuffer(
      {
        texture: this.pickTexture,
        origin: [px, py, 0],
      },
      {
        buffer: this.readBuffer,
        bytesPerRow: 256,
      },
      [1, 1, 1],
    );

    this.device.queue.submit([encoder.finish()]);

    await this.readBuffer.mapAsync(GPUMapMode.READ);
    const data = new Uint8Array(this.readBuffer.getMappedRange(0, 4));
    const r = data[0];
    const g = data[1];
    const b = data[2];
    const a = data[3];
    this.readBuffer.unmap();

    if (a === 0) return null;

    const id = r | (g << 8) | (b << 16);
    if (id === 0) return null;
    return id - 1; // Reverse the +1 encoding
  }
}
