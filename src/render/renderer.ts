// Main render orchestrator — coordinates edge, hull, and node rendering
// Manages the overall render loop ordering: hulls (back) -> edges -> nodes (front)

import type { GPUContext } from '../gpu/device';
import type { BufferManager } from '../gpu/buffer-manager';
import type { Camera } from './camera';
import type { HypergraphData, RenderParams } from '../data/types';
import { EdgeRenderer } from './edge-renderer';
import { HullCompute } from './hull-compute';
import { HullRenderer } from './hull-renderer';
import { NodeRenderer } from './node-renderer';
import { vec2Distance } from '../utils/math';

export class Renderer {
  private gpu: GPUContext;
  private buffers: BufferManager;
  private camera: Camera;

  private edgeRenderer: EdgeRenderer;
  private hullCompute: HullCompute;
  private hullRenderer: HullRenderer;
  private nodeRenderer: NodeRenderer;

  private graphData: HypergraphData | null = null;

  constructor(gpu: GPUContext, buffers: BufferManager, camera: Camera) {
    this.gpu = gpu;
    this.buffers = buffers;
    this.camera = camera;

    this.edgeRenderer = new EdgeRenderer(gpu, buffers, camera);
    this.hullCompute = new HullCompute();
    this.hullRenderer = new HullRenderer(gpu, buffers, camera);
    this.nodeRenderer = new NodeRenderer();
  }

  /**
   * Set the hypergraph data for all sub-renderers.
   */
  setData(data: HypergraphData): void {
    this.graphData = data;
    this.edgeRenderer.setData(data);
    this.hullRenderer.setData(data);
  }

  /**
   * Render all layers in back-to-front order.
   * Called from the app's render loop within an active render pass.
   */
  render(renderParams: RenderParams): void {
    if (!this.graphData) return;

    const { device, context } = this.gpu;

    // Update camera uniform (shared)
    const cameraBuffer = this.buffers.hasBuffer('camera-uniform')
      ? this.buffers.getBuffer('camera-uniform')
      : null;
    if (cameraBuffer) {
      device.queue.writeBuffer(cameraBuffer, 0, this.camera.getProjection());
    }

    const textureView = context.getCurrentTexture().createView();
    const bg = renderParams.backgroundColor;
    const commandEncoder = device.createCommandEncoder();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: bg[0], g: bg[1], b: bg[2], a: bg[3] },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    // 1. Draw hulls (back layer)
    if (renderParams.hullAlpha > 0) {
      this.hullRenderer.render(renderPass, renderParams);
    }

    // 2. Draw edges
    if (renderParams.edgeOpacity > 0) {
      this.edgeRenderer.render(renderPass, renderParams);
    }

    // 3. Nodes are rendered by app.ts directly (this orchestrator can be used standalone too)

    renderPass.end();
    device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * Pick the node closest to the given screen coordinates.
   * Returns the node index or null if no node is close enough.
   */
  async pickNodeAt(x: number, y: number): Promise<number | null> {
    if (!this.graphData || !this.buffers.hasBuffer('node-positions')) return null;

    const worldPos = this.camera.screenToWorld(x, y);
    const nodeCount = this.graphData.nodes.length;
    const positions = await this.buffers.readBuffer('node-positions', nodeCount * 16);

    // Pick radius in world space (based on node size and zoom)
    const pickRadius = 20 / this.camera.zoom;

    let bestIndex: number | null = null;
    let bestDist = pickRadius;

    for (let i = 0; i < nodeCount; i++) {
      const nx = positions[i * 4];
      const ny = positions[i * 4 + 1];
      const dist = vec2Distance(worldPos, [nx, ny]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }

    if (bestIndex !== null) {
      this.nodeRenderer.setHighlight(bestIndex);
    }

    return bestIndex;
  }

  getEdgeRenderer(): EdgeRenderer { return this.edgeRenderer; }
  getHullCompute(): HullCompute { return this.hullCompute; }
  getHullRenderer(): HullRenderer { return this.hullRenderer; }
  getNodeRenderer(): NodeRenderer { return this.nodeRenderer; }
}
