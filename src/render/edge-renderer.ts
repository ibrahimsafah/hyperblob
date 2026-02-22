// Edge renderer — renders lines connecting hyperedge members using star topology
// For each hyperedge: compute centroid, draw line from centroid to each member
// Uses pre-computed edge-draw-indices buffer mapping vertex pairs to (he_index, member_node_index)

import type { GPUContext } from '../gpu/device';
import type { BufferManager } from '../gpu/buffer-manager';
import type { Camera } from './camera';
import type { HypergraphData, RenderParams } from '../data/types';
import edgeShaderCode from '../shaders/edge-render.wgsl?raw';

export class EdgeRenderer {
  private gpu: GPUContext;
  private buffers: BufferManager;
  private camera: Camera;

  private pipeline: GPURenderPipeline | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private cameraBuffer: GPUBuffer | null = null;
  private edgeParamsBuffer: GPUBuffer | null = null;

  // Total number of line segments (each = 2 vertices)
  private totalLineSegments = 0;
  private lastCameraVersion = -1;
  private edgeParamsArray = new Float32Array(4);

  constructor(gpu: GPUContext, buffers: BufferManager, camera: Camera) {
    this.gpu = gpu;
    this.buffers = buffers;
    this.camera = camera;

    this.initPipeline();
  }

  private initPipeline(): void {
    const { device, format } = this.gpu;

    const shaderModule = device.createShaderModule({
      label: 'edge-render-shader',
      code: edgeShaderCode,
    });

    const bindGroupLayout = device.createBindGroupLayout({
      label: 'edge-bind-group-layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },           // camera
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },  // positions
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },  // edge_draw indices
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },  // he_offsets
        { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },  // he_members
        { binding: 5, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },            // edge params
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: 'edge-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    this.pipeline = device.createRenderPipeline({
      label: 'edge-render-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'line-list' },
    });

    // Camera uniform for edges
    this.cameraBuffer = this.buffers.createBuffer(
      'edge-camera-uniform', 64,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'edge-camera-uniform',
    );

    // Edge rendering params uniform (opacity + padding)
    this.edgeParamsBuffer = this.buffers.createBuffer(
      'edge-params-uniform', 16,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'edge-params-uniform',
    );
  }

  /**
   * Build the edge-draw-indices buffer from hypergraph data.
   * Each entry is a pair: (hyperedge_index, member_node_index).
   * One pair per line segment (centroid -> member).
   */
  setData(data: HypergraphData): void {
    // Count total line segments: sum of member counts across all hyperedges
    let totalSegments = 0;
    for (const he of data.hyperedges) {
      totalSegments += he.memberIndices.length;
    }

    this.totalLineSegments = totalSegments;

    if (totalSegments === 0) return;

    // Build edge-draw buffer: [he_index, member_node_index] pairs
    const drawData = new Uint32Array(totalSegments * 2);
    let offset = 0;

    for (const he of data.hyperedges) {
      for (const memberIdx of he.memberIndices) {
        drawData[offset++] = he.index;      // hyperedge index
        drawData[offset++] = memberIdx;      // member node index
      }
    }

    this.buffers.createBuffer(
      'edge-draw-indices', drawData.byteLength,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'edge-draw-indices',
    );
    this.buffers.uploadData('edge-draw-indices', drawData);

    // Recreate bind group with new buffers
    this.recreateBindGroup();
  }

  private recreateBindGroup(): void {
    if (!this.pipeline || !this.cameraBuffer || !this.edgeParamsBuffer) return;
    if (!this.buffers.hasBuffer('node-positions')) return;
    if (!this.buffers.hasBuffer('edge-draw-indices')) return;
    if (!this.buffers.hasBuffer('he-offsets')) return;
    if (!this.buffers.hasBuffer('he-members')) return;

    this.bindGroup = this.gpu.device.createBindGroup({
      label: 'edge-bind-group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: { buffer: this.buffers.getBuffer('node-positions') } },
        { binding: 2, resource: { buffer: this.buffers.getBuffer('edge-draw-indices') } },
        { binding: 3, resource: { buffer: this.buffers.getBuffer('he-offsets') } },
        { binding: 4, resource: { buffer: this.buffers.getBuffer('he-members') } },
        { binding: 5, resource: { buffer: this.edgeParamsBuffer } },
      ],
    });
  }

  render(renderPass: GPURenderPassEncoder, renderParams: RenderParams): void {
    if (!this.pipeline || !this.bindGroup || !this.cameraBuffer || !this.edgeParamsBuffer) return;
    if (this.totalLineSegments === 0) return;

    // Update camera uniform (only when camera has changed)
    if (this.camera.version !== this.lastCameraVersion) {
      this.lastCameraVersion = this.camera.version;
      this.gpu.device.queue.writeBuffer(this.cameraBuffer, 0, this.camera.getProjection());
    }

    // Update edge params (opacity) — reuse pre-allocated array
    this.edgeParamsArray[0] = renderParams.edgeOpacity;
    this.gpu.device.queue.writeBuffer(this.edgeParamsBuffer, 0, this.edgeParamsArray);

    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    // 2 vertices per line segment
    renderPass.draw(this.totalLineSegments * 2);
  }
}
