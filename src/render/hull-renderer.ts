// Hull renderer — renders semi-transparent convex hull polygons for hyperedges
// Uses fan-triangulated geometry computed by HullCompute
// Recomputes hulls periodically (not every frame) for performance

import type { GPUContext } from '../gpu/device';
import type { BufferManager } from '../gpu/buffer-manager';
import type { Camera } from './camera';
import type { HypergraphData, RenderParams } from '../data/types';
import type { HullData } from './hull-compute';
import { HullCompute } from './hull-compute';
import { getPaletteColor } from '../utils/color';
import hullShaderCode from '../shaders/hull-render.wgsl?raw';

// Vertex layout: [x, y, r, g, b, a] per vertex = 6 floats = 24 bytes
const FLOATS_PER_VERTEX = 6;
const BYTES_PER_VERTEX = FLOATS_PER_VERTEX * 4;

export class HullRenderer {
  private gpu: GPUContext;
  private buffers: BufferManager;
  private camera: Camera;

  private pipeline: GPURenderPipeline | null = null;
  private outlinePipeline: GPURenderPipeline | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private cameraBuffer: GPUBuffer | null = null;

  private hullCompute = new HullCompute();
  private hypergraphData: HypergraphData | null = null;

  // Hull vertex buffers
  private fillVertexBuffer: GPUBuffer | null = null;
  private fillVertexCount = 0;
  private outlineVertexBuffer: GPUBuffer | null = null;
  private outlineVertexCount = 0;

  // Recompute throttling
  private frameCounter = 0;
  private readonly recomputeInterval = 10;
  private needsRecompute = true;

  constructor(gpu: GPUContext, buffers: BufferManager, camera: Camera) {
    this.gpu = gpu;
    this.buffers = buffers;
    this.camera = camera;

    this.initPipelines();
  }

  private initPipelines(): void {
    const { device, format } = this.gpu;

    const shaderModule = device.createShaderModule({
      label: 'hull-render-shader',
      code: hullShaderCode,
    });

    const bindGroupLayout = device.createBindGroupLayout({
      label: 'hull-bind-group-layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: 'hull-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    const vertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: BYTES_PER_VERTEX,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x2' },   // position
        { shaderLocation: 1, offset: 8, format: 'float32x4' },   // color
      ],
    };

    // Fill pipeline (triangles with alpha blending)
    this.pipeline = device.createRenderPipeline({
      label: 'hull-fill-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [vertexBufferLayout],
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
      primitive: { topology: 'triangle-list' },
    });

    // Outline pipeline (line-strip with alpha blending)
    this.outlinePipeline = device.createRenderPipeline({
      label: 'hull-outline-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [vertexBufferLayout],
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

    // Create camera uniform buffer for hull rendering
    this.cameraBuffer = this.buffers.createBuffer(
      'hull-camera-uniform', 64,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'hull-camera-uniform',
    );

    this.updateBindGroup();
  }

  private updateBindGroup(): void {
    if (!this.pipeline || !this.cameraBuffer) return;

    this.bindGroup = this.gpu.device.createBindGroup({
      label: 'hull-bind-group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
      ],
    });
  }

  setData(data: HypergraphData): void {
    this.hypergraphData = data;
    this.needsRecompute = true;
    this.frameCounter = 0;
  }

  private async recomputeHulls(renderParams: RenderParams): Promise<void> {
    if (!this.hypergraphData || !this.buffers.hasBuffer('node-positions')) return;

    const nodeCount = this.hypergraphData.nodes.length;
    const positionData = await this.buffers.readBuffer('node-positions', nodeCount * 16);

    const hulls = this.hullCompute.computeHulls(
      positionData,
      this.hypergraphData.hyperedges,
      renderParams.hullMargin,
    );

    this.buildFillVertices(hulls, renderParams.hullAlpha);
    if (renderParams.hullOutline) {
      this.buildOutlineVertices(hulls);
    } else {
      this.outlineVertexCount = 0;
    }

    this.needsRecompute = false;
  }

  private buildFillVertices(hulls: HullData[], alpha: number): void {
    // Count total triangle vertices
    let totalVertices = 0;
    for (const hull of hulls) {
      totalVertices += hull.triangles.length;
    }

    if (totalVertices === 0) {
      this.fillVertexCount = 0;
      return;
    }

    const data = new Float32Array(totalVertices * FLOATS_PER_VERTEX);
    let offset = 0;

    for (const hull of hulls) {
      const color = getPaletteColor(hull.hyperedgeIndex);

      for (const vertex of hull.triangles) {
        data[offset++] = vertex[0]; // x
        data[offset++] = vertex[1]; // y
        data[offset++] = color[0];  // r
        data[offset++] = color[1];  // g
        data[offset++] = color[2];  // b
        data[offset++] = alpha;     // a
      }
    }

    this.fillVertexCount = totalVertices;

    // Create/recreate vertex buffer
    if (this.fillVertexBuffer) {
      this.fillVertexBuffer.destroy();
    }
    this.fillVertexBuffer = this.gpu.device.createBuffer({
      label: 'hull-fill-vertices',
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.gpu.device.queue.writeBuffer(this.fillVertexBuffer, 0, data);
  }

  private buildOutlineVertices(hulls: HullData[]): void {
    // Count total outline line segments (each hull edge = 2 vertices for line-list)
    let totalVertices = 0;
    for (const hull of hulls) {
      totalVertices += hull.vertices.length * 2; // line-list: 2 verts per segment
    }

    if (totalVertices === 0) {
      this.outlineVertexCount = 0;
      return;
    }

    const data = new Float32Array(totalVertices * FLOATS_PER_VERTEX);
    let offset = 0;
    const outlineAlpha = 0.5;

    for (const hull of hulls) {
      const color = getPaletteColor(hull.hyperedgeIndex);
      const n = hull.vertices.length;

      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        // Start vertex of line segment
        data[offset++] = hull.vertices[i][0];
        data[offset++] = hull.vertices[i][1];
        data[offset++] = color[0];
        data[offset++] = color[1];
        data[offset++] = color[2];
        data[offset++] = outlineAlpha;

        // End vertex of line segment
        data[offset++] = hull.vertices[next][0];
        data[offset++] = hull.vertices[next][1];
        data[offset++] = color[0];
        data[offset++] = color[1];
        data[offset++] = color[2];
        data[offset++] = outlineAlpha;
      }
    }

    this.outlineVertexCount = totalVertices;

    // Create/recreate vertex buffer
    if (this.outlineVertexBuffer) {
      this.outlineVertexBuffer.destroy();
    }
    this.outlineVertexBuffer = this.gpu.device.createBuffer({
      label: 'hull-outline-vertices',
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.gpu.device.queue.writeBuffer(this.outlineVertexBuffer, 0, data);
  }

  render(renderPass: GPURenderPassEncoder, renderParams: RenderParams): void {
    if (!this.pipeline || !this.bindGroup || !this.cameraBuffer) return;
    if (!this.hypergraphData) return;

    // Update camera uniform
    this.gpu.device.queue.writeBuffer(this.cameraBuffer, 0, this.camera.getProjection());

    // Throttled hull recompute
    this.frameCounter++;
    if (this.needsRecompute || this.frameCounter >= this.recomputeInterval) {
      this.frameCounter = 0;
      // Fire and forget - hulls update asynchronously
      this.recomputeHulls(renderParams).catch(() => {
        // Ignore errors during recompute (e.g., buffer destroyed)
      });
    }

    // Draw filled hulls
    if (this.fillVertexCount > 0 && this.fillVertexBuffer) {
      renderPass.setPipeline(this.pipeline);
      renderPass.setBindGroup(0, this.bindGroup);
      renderPass.setVertexBuffer(0, this.fillVertexBuffer);
      renderPass.draw(this.fillVertexCount);
    }

    // Draw hull outlines
    if (renderParams.hullOutline && this.outlineVertexCount > 0 && this.outlineVertexBuffer && this.outlinePipeline) {
      renderPass.setPipeline(this.outlinePipeline);
      renderPass.setBindGroup(0, this.bindGroup);
      renderPass.setVertexBuffer(0, this.outlineVertexBuffer);
      renderPass.draw(this.outlineVertexCount);
    }
  }
}
