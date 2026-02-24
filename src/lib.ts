// HyperblobEngine — reusable WebGPU hypergraph visualization library
// Extracted from App: contains all GPU, simulation, rendering, and interaction logic.
// Demo-specific concerns (Panel, Stats, dataset loading) stay in App.

import { initWebGPU, type GPUContext } from './gpu/device';
import { BufferManager } from './gpu/buffer-manager';
import { Camera } from './render/camera';
import { getPaletteColors } from './utils/color';
import { Tooltip } from './ui/tooltip';
import {
  type HypergraphData, type NodeData, type HyperedgeData,
  type SimulationParams, type RenderParams,
  defaultSimulationParams, defaultRenderParams,
} from './data/types';
import nodeShaderCode from './shaders/node-render.wgsl?raw';

// Static imports for all engine-required modules (bundled into library)
import { ForceSimulation } from './layout/force-simulation';
import { InputHandler } from './interaction/input-handler';
import { EdgeRenderer } from './render/edge-renderer';
import { HullRenderer } from './render/hull-renderer';

// ── Public option types ──

export interface HyperblobOptions {
  tooltip?: boolean;
  palette?: Float32Array;
  simParams?: Partial<SimulationParams>;
  renderParams?: Partial<RenderParams>;
  onNodeClick?: (nodeIndex: number, node: NodeData) => void;
  onNodeHover?: (nodeIndex: number | null, node: NodeData | null, screenX: number, screenY: number) => void;
  onEdgeClick?: (edgeIndex: number, edge: HyperedgeData) => void;
  onEdgeHover?: (edgeIndex: number | null, edge: HyperedgeData | null, screenX: number, screenY: number) => void;
}

export class HyperblobEngine {
  private gpu: GPUContext;
  private buffers: BufferManager;
  camera: Camera;
  private options: HyperblobOptions;

  simParams: SimulationParams;
  renderParams: RenderParams;

  private graphData: HypergraphData | null = null;
  private nodeCount = 0;

  // Selection state (neighborhood filter — default click behavior)
  private selectedNode: number | null = null;
  private visibleNodes: Set<number> | null = null;

  // Highlight state (library API — dim-based, not hide-based)
  private highlightedNodes: Set<number> | null = null;

  // Node filter state (search)
  private nodeFilterPredicate: ((node: NodeData, index: number) => boolean) | null = null;

  // Node drag state
  private cpuPositions: Float32Array | null = null;
  private cpuPositionsPending = false;
  private positionCacheCounter = 0;
  private draggedNodeIndex: number | null = null;
  private dragTargetPos: [number, number] | null = null;
  private dragSmoothPos: [number, number] | null = null;
  private dragPrevPos: [number, number] | null = null;

  // Render pipeline state
  private nodeRenderPipeline: GPURenderPipeline | null = null;
  private nodeBindGroup: GPUBindGroup | null = null;
  private cameraBuffer: GPUBuffer | null = null;
  private paramsBuffer: GPUBuffer | null = null;
  private paletteBuffer: GPUBuffer | null = null;

  // Pre-allocated typed arrays for per-frame GPU uploads (avoid GC pressure)
  private dragUploadArray = new Float32Array(4);
  private renderParamsArray = new Float32Array(4);
  private lastCameraVersion = -1;

  // Sub-module instances (statically imported, instantiated on setData)
  private inputHandlerInstance: InputHandler | null = null;
  private edgeRendererInstance: EdgeRenderer | null = null;
  private hullRendererInstance: HullRenderer | null = null;
  private simulation: ForceSimulation | null = null;
  private tooltip: Tooltip | null = null;
  private lastHoveredNode: number | null = null;
  private lastHoveredEdge: number | null = null;

  private running = false;
  private disposed = false;

  // ── Static factory (hides async GPU init) ──

  static async create(canvas: HTMLCanvasElement, options?: HyperblobOptions): Promise<HyperblobEngine> {
    const gpu = await initWebGPU(canvas);
    const engine = new HyperblobEngine(gpu, options ?? {});
    await engine.init();
    return engine;
  }

  private constructor(gpu: GPUContext, options: HyperblobOptions) {
    this.gpu = gpu;
    this.buffers = new BufferManager(gpu.device);
    this.camera = new Camera();
    this.options = options;
    this.simParams = { ...defaultSimulationParams(), ...options.simParams };
    this.renderParams = { ...defaultRenderParams(), ...options.renderParams };

    if (options.tooltip !== false) {
      this.tooltip = new Tooltip(gpu.canvas.parentElement!);
    }
  }

  private async init(): Promise<void> {
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());

    // Setup palette buffer (custom or default)
    const paletteData = this.options.palette ?? getPaletteColors();
    this.paletteBuffer = this.buffers.createBuffer(
      'palette', paletteData.byteLength,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'palette'
    );
    this.buffers.uploadData('palette', paletteData);

    // Camera & render params uniform buffers
    this.cameraBuffer = this.buffers.createBuffer(
      'camera-uniform', 64,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'camera-uniform'
    );
    this.paramsBuffer = this.buffers.createBuffer(
      'render-params', 16,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'render-params'
    );

    this.createNodePipeline();
    this.setupInputHandler();
  }

  private setupInputHandler(): void {
    const opts = this.options;

    this.inputHandlerInstance = new InputHandler(this.gpu.canvas, this.camera, {
      hitTest: (wx: number, wy: number) => this.hitTestNode(wx, wy),
      onDragStart: (nodeIndex: number) => {
        this.draggedNodeIndex = nodeIndex;
        if (this.cpuPositions) {
          const x = this.cpuPositions[nodeIndex * 4];
          const y = this.cpuPositions[nodeIndex * 4 + 1];
          this.dragSmoothPos = [x, y];
          this.dragTargetPos = [x, y];
          this.dragPrevPos = [x, y];
        }
        if (this.simParams.alpha < 0.08) {
          this.simParams.alpha = 0.08;
        }
        this.simParams.running = true;
      },
      onDrag: (_nodeIndex: number, wx: number, wy: number) => {
        this.dragTargetPos = [wx, wy];
        if (this.cpuPositions && this.draggedNodeIndex !== null) {
          this.cpuPositions[this.draggedNodeIndex * 4] = wx;
          this.cpuPositions[this.draggedNodeIndex * 4 + 1] = wy;
        }
      },
      onDragEnd: () => {
        if (this.draggedNodeIndex !== null && this.dragSmoothPos && this.dragPrevPos && this.buffers.hasBuffer('node-positions')) {
          const vx = (this.dragSmoothPos[0] - this.dragPrevPos[0]) * 4;
          const vy = (this.dragSmoothPos[1] - this.dragPrevPos[1]) * 4;
          const data = new Float32Array([this.dragSmoothPos[0], this.dragSmoothPos[1], vx, vy]);
          this.buffers.uploadData('node-positions', data, this.draggedNodeIndex * 16);
        }
        this.draggedNodeIndex = null;
        this.dragTargetPos = null;
        this.dragSmoothPos = null;
        this.dragPrevPos = null;
      },
      onClick: (nodeIndex: number | null) => {
        if (opts.onNodeClick && nodeIndex !== null && this.graphData) {
          // Custom callback — let consumer handle selection
          opts.onNodeClick(nodeIndex, this.graphData.nodes[nodeIndex]);
        } else if (opts.onEdgeClick && nodeIndex === null) {
          // Click on empty space — consumer might want to clear
          // (no action needed — consumer handles via onNodeClick(null))
        } else {
          // Default behavior: neighborhood selection toggle
          if (nodeIndex === null || nodeIndex === this.selectedNode) {
            this.selectedNode = null;
          } else {
            this.selectedNode = nodeIndex;
          }
          this.applySelection();
        }

        // Also fire the callback if defined, even for null clicks
        if (opts.onNodeClick && nodeIndex === null) {
          // Signal "click empty space" by not calling — consumer can detect via clearHighlight or separate mechanism
        }
      },
      onHoverNode: (nodeIndex: number | null, screenX: number, screenY: number) => {
        if (nodeIndex === this.lastHoveredNode) return;
        this.lastHoveredNode = nodeIndex;

        // Fire custom callback if provided
        if (opts.onNodeHover && this.graphData) {
          const node = nodeIndex !== null ? this.graphData.nodes[nodeIndex] : null;
          opts.onNodeHover(nodeIndex, node, screenX, screenY);
        }

        // Built-in tooltip
        if (this.tooltip) {
          if (nodeIndex === null || !this.graphData) {
            if (this.lastHoveredEdge === null) this.tooltip.hide();
            return;
          }
          const node = this.graphData.nodes[nodeIndex];
          const edgeLabels = this.graphData.hyperedges
            .filter(he => he.memberIndices.includes(nodeIndex))
            .map(he => String(he.attrs?.name ?? he.attrs?.label ?? `Edge ${he.id}`));
          const nodeLabel = String(node?.attrs?.name ?? node?.attrs?.label ?? node?.id ?? `#${nodeIndex}`);
          this.tooltip.showNode(screenX, screenY, nodeLabel, edgeLabels);
        }
      },
      hitTestEdge: (wx: number, wy: number) => this.hitTestEdge(wx, wy),
      onHoverEdge: (edgeIndex: number | null, screenX: number, screenY: number) => {
        if (edgeIndex === this.lastHoveredEdge) return;
        this.lastHoveredEdge = edgeIndex;

        // Fire custom callback if provided
        if (opts.onEdgeHover && this.graphData) {
          const edge = edgeIndex !== null ? this.graphData.hyperedges[edgeIndex] : null;
          opts.onEdgeHover(edgeIndex, edge, screenX, screenY);
        }

        // Built-in tooltip
        if (this.tooltip) {
          if (edgeIndex === null || !this.graphData) {
            if (this.lastHoveredNode === null) this.tooltip.hide();
            return;
          }
          const he = this.graphData.hyperedges[edgeIndex];
          if (!he) { this.tooltip.hide(); return; }
          const label = String(he.attrs?.name ?? he.attrs?.label ?? `Edge ${he.id}`);
          const members = he.memberIndices.map(i => this.graphData!.nodes[i]?.id ?? `#${i}`);
          this.tooltip.show(screenX, screenY, label, members);
        }
      },
    });
  }

  private createNodePipeline(): void {
    const { device, format } = this.gpu;

    const shaderModule = device.createShaderModule({
      label: 'node-render-shader',
      code: nodeShaderCode,
    });

    const bindGroupLayout = device.createBindGroupLayout({
      label: 'node-render-bind-group-layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: 'node-render-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    this.nodeRenderPipeline = device.createRenderPipeline({
      label: 'node-render-pipeline',
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
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
  }

  private createNodeBindGroup(): void {
    if (!this.nodeRenderPipeline || !this.cameraBuffer || !this.paramsBuffer || !this.paletteBuffer) return;
    if (!this.buffers.hasBuffer('node-positions') || !this.buffers.hasBuffer('node-metadata')) return;

    this.nodeBindGroup = this.gpu.device.createBindGroup({
      label: 'node-render-bind-group',
      layout: this.nodeRenderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: { buffer: this.buffers.getBuffer('node-positions') } },
        { binding: 2, resource: { buffer: this.buffers.getBuffer('node-metadata') } },
        { binding: 3, resource: { buffer: this.paramsBuffer } },
        { binding: 4, resource: { buffer: this.paletteBuffer } },
      ],
    });
  }

  // ── Public API ──

  setData(data: HypergraphData): void {
    this.graphData = data;
    this.nodeCount = data.nodes.length;
    this.selectedNode = null;
    this.visibleNodes = null;
    this.highlightedNodes = null;
    // dimmed state is tracked by edge/hull renderers

    // Upload positions: [x, y, vx, vy] per node — random initial positions
    const positions = new Float32Array(data.nodes.length * 4);
    const spread = Math.sqrt(data.nodes.length) * 10;
    for (let i = 0; i < data.nodes.length; i++) {
      positions[i * 4 + 0] = (Math.random() - 0.5) * spread;
      positions[i * 4 + 1] = (Math.random() - 0.5) * spread;
      positions[i * 4 + 2] = 0;
      positions[i * 4 + 3] = 0;
    }
    this.buffers.createBuffer('node-positions', positions.byteLength,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, 'node-positions');
    this.buffers.uploadData('node-positions', positions);

    this.cpuPositions = new Float32Array(positions);

    // Upload metadata: [group, flags] per node
    const metadata = new Uint32Array(data.nodes.length * 2);
    for (let i = 0; i < data.nodes.length; i++) {
      metadata[i * 2 + 0] = data.nodes[i].group;
      metadata[i * 2 + 1] = 0;
    }
    this.buffers.createBuffer('node-metadata', metadata.byteLength,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'node-metadata');
    this.buffers.uploadData('node-metadata', metadata);

    this.uploadHyperedgeBuffers(data);
    this.createNodeBindGroup();

    // Setup edge renderer
    if (!this.edgeRendererInstance) {
      this.edgeRendererInstance = new EdgeRenderer(this.gpu, this.buffers, this.camera);
    }
    this.edgeRendererInstance.setData(data);

    // Setup hull renderer
    if (!this.hullRendererInstance) {
      this.hullRendererInstance = new HullRenderer(this.gpu, this.buffers, this.camera);
    }
    this.hullRendererInstance.setData(data);

    // Setup force simulation
    this.simulation = new ForceSimulation(this.gpu.device, this.buffers, data, this.simParams);

    this.simParams.alpha = 1.0;
    this.simParams.running = true;

    this.camera.fitBounds(-spread / 2, -spread / 2, spread / 2, spread / 2);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  dispose(): void {
    this.disposed = true;
    this.running = false;
    this.inputHandlerInstance?.dispose();
    this.buffers.destroyAll();
  }

  getCamera(): Camera { return this.camera; }
  getNodeCount(): number { return this.nodeCount; }
  getGraphData(): HypergraphData | null { return this.graphData; }
  getBufferManager(): BufferManager { return this.buffers; }
  getGPU(): GPUContext { return this.gpu; }

  handleResize(): void {
    const canvas = this.gpu.canvas;
    const container = canvas.parentElement!;
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    this.camera.resize(width * dpr, height * dpr);
  }

  // ── Highlight API (dim-based: non-highlighted → 12% alpha) ──

  highlightNodes(indices: number[]): void {
    if (!this.graphData || !this.buffers.hasBuffer('node-metadata')) return;

    const highlightSet = new Set(indices);
    this.highlightedNodes = highlightSet;

    // Find edges containing any highlighted node
    const activeEdges = new Set<number>();
    const dimmedEdges = new Set<number>();

    for (const he of this.graphData.hyperedges) {
      const hasHighlighted = he.memberIndices.some(idx => highlightSet.has(idx));
      if (hasHighlighted) {
        activeEdges.add(he.index);
      } else {
        dimmedEdges.add(he.index);
      }
    }
    // dimmedEdges state is tracked by edge/hull renderers below

    // Update node metadata: bit 1 = dimmed
    const metadata = new Uint32Array(this.nodeCount * 2);
    for (let i = 0; i < this.nodeCount; i++) {
      metadata[i * 2] = this.graphData.nodes[i].group;
      // Preserve bit 0 (hidden from filter), set/clear bit 1 (dimmed)
      let flags = 0;
      if (this.nodeFilterPredicate && !this.nodeFilterPredicate(this.graphData.nodes[i], i)) {
        flags |= 1; // hidden
      }
      if (!highlightSet.has(i)) {
        flags |= 2; // dimmed
      }
      metadata[i * 2 + 1] = flags;
    }
    this.buffers.uploadData('node-metadata', metadata);

    // Dim edges via edge renderer
    if (this.edgeRendererInstance?.setDimmedEdges) {
      this.edgeRendererInstance.setDimmedEdges(dimmedEdges);
    }

    // Dim hulls via hull renderer
    if (this.hullRendererInstance?.setDimmedEdges) {
      this.hullRendererInstance.setDimmedEdges(dimmedEdges);
    }
  }

  highlightEdge(edgeIndex: number): void {
    if (!this.graphData) return;
    const he = this.graphData.hyperedges[edgeIndex];
    if (!he) return;
    this.highlightNodes(he.memberIndices);
  }

  clearHighlight(): void {
    if (!this.graphData || !this.buffers.hasBuffer('node-metadata')) return;

    this.highlightedNodes = null;
    // dimmed state is tracked by edge/hull renderers

    // Reset all metadata flags (preserving filter state)
    const metadata = new Uint32Array(this.nodeCount * 2);
    for (let i = 0; i < this.nodeCount; i++) {
      metadata[i * 2] = this.graphData.nodes[i].group;
      let flags = 0;
      if (this.nodeFilterPredicate && !this.nodeFilterPredicate(this.graphData.nodes[i], i)) {
        flags |= 1; // hidden
      }
      metadata[i * 2 + 1] = flags;
    }
    this.buffers.uploadData('node-metadata', metadata);

    if (this.edgeRendererInstance?.setDimmedEdges) {
      this.edgeRendererInstance.setDimmedEdges(null);
    }
    if (this.hullRendererInstance?.setDimmedEdges) {
      this.hullRendererInstance.setDimmedEdges(null);
    }
  }

  // ── Search/Filter API ──

  setNodeFilter(predicate: ((node: NodeData, index: number) => boolean) | null): void {
    if (!this.graphData || !this.buffers.hasBuffer('node-metadata')) return;

    this.nodeFilterPredicate = predicate;

    if (predicate === null) {
      // Clear filter — show all
      this.visibleNodes = null;
      const metadata = new Uint32Array(this.nodeCount * 2);
      for (let i = 0; i < this.nodeCount; i++) {
        metadata[i * 2] = this.graphData.nodes[i].group;
        let flags = 0;
        if (this.highlightedNodes && !this.highlightedNodes.has(i)) {
          flags |= 2; // dimmed
        }
        metadata[i * 2 + 1] = flags;
      }
      this.buffers.uploadData('node-metadata', metadata);

      if (this.edgeRendererInstance) {
        this.edgeRendererInstance.setVisibleEdges(this.graphData, null);
      }
      if (this.hullRendererInstance) {
        this.hullRendererInstance.setVisibleEdges(null);
      }
    } else {
      // Apply filter
      const visibleNodes = new Set<number>();
      for (let i = 0; i < this.nodeCount; i++) {
        if (predicate(this.graphData.nodes[i], i)) {
          visibleNodes.add(i);
        }
      }
      this.visibleNodes = visibleNodes;

      // Determine visible edges (at least one member visible)
      const visibleEdges = new Set<number>();
      for (const he of this.graphData.hyperedges) {
        if (he.memberIndices.some(idx => visibleNodes.has(idx))) {
          visibleEdges.add(he.index);
        }
      }

      const metadata = new Uint32Array(this.nodeCount * 2);
      for (let i = 0; i < this.nodeCount; i++) {
        metadata[i * 2] = this.graphData.nodes[i].group;
        let flags = 0;
        if (!visibleNodes.has(i)) flags |= 1; // hidden
        if (this.highlightedNodes && !this.highlightedNodes.has(i)) flags |= 2; // dimmed
        metadata[i * 2 + 1] = flags;
      }
      this.buffers.uploadData('node-metadata', metadata);

      if (this.edgeRendererInstance) {
        this.edgeRendererInstance.setVisibleEdges(this.graphData, visibleEdges);
      }
      if (this.hullRendererInstance) {
        this.hullRendererInstance.setVisibleEdges(visibleEdges);
      }
    }
  }

  // ── Palette API ──

  setPalette(palette: Float32Array): void {
    if (this.paletteBuffer) {
      this.buffers.uploadData('palette', palette);
    }
  }

  // ── Simulation control ──

  resetSimulation(): void {
    if (!this.graphData) return;
    this.simParams.alpha = 1.0;
    this.simParams.running = true;
    const spread = Math.sqrt(this.graphData.nodes.length) * 10;
    const positions = new Float32Array(this.graphData.nodes.length * 4);
    for (let i = 0; i < this.graphData.nodes.length; i++) {
      positions[i * 4 + 0] = (Math.random() - 0.5) * spread;
      positions[i * 4 + 1] = (Math.random() - 0.5) * spread;
    }
    this.buffers.uploadData('node-positions', positions);
  }

  async fitToScreen(): Promise<void> {
    if (!this.graphData || this.nodeCount === 0) return;
    const posData = await this.buffers.readBuffer('node-positions', this.nodeCount * 16);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < this.nodeCount; i++) {
      const x = posData[i * 4];
      const y = posData[i * 4 + 1];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    this.camera.fitBounds(minX, minY, maxX, maxY);
  }

  // ── Internal: per-frame loop ──

  private tick = (): void => {
    if (this.disposed || !this.running) return;

    if (this.draggedNodeIndex !== null && this.simParams.alpha < 0.08) {
      this.simParams.alpha = 0.08;
      this.simParams.running = true;
    }

    if (this.draggedNodeIndex !== null && this.dragSmoothPos && this.buffers.hasBuffer('node-positions')) {
      this.dragUploadArray[0] = this.dragSmoothPos[0];
      this.dragUploadArray[1] = this.dragSmoothPos[1];
      this.dragUploadArray[2] = 0;
      this.dragUploadArray[3] = 0;
      this.buffers.uploadData('node-positions', this.dragUploadArray, this.draggedNodeIndex * 16);
    }

    if (this.simulation && this.simParams.running && this.simParams.alpha > this.simParams.alphaMin) {
      this.simulation.tick(this.simParams);
      this.simParams.alpha += (this.simParams.alphaTarget - this.simParams.alpha) * this.simParams.alphaDecay;
    }

    if (this.draggedNodeIndex !== null && this.dragTargetPos && this.dragSmoothPos && this.buffers.hasBuffer('node-positions')) {
      this.dragPrevPos = [this.dragSmoothPos[0], this.dragSmoothPos[1]];
      const t = 0.55;
      this.dragSmoothPos[0] += (this.dragTargetPos[0] - this.dragSmoothPos[0]) * t;
      this.dragSmoothPos[1] += (this.dragTargetPos[1] - this.dragSmoothPos[1]) * t;
      this.dragUploadArray[0] = this.dragSmoothPos[0];
      this.dragUploadArray[1] = this.dragSmoothPos[1];
      this.buffers.uploadData('node-positions', this.dragUploadArray, this.draggedNodeIndex * 16);
    }

    this.positionCacheCounter++;
    if (this.positionCacheCounter >= 10 && this.nodeCount > 0 && !this.cpuPositionsPending && this.buffers.hasBuffer('node-positions')) {
      this.positionCacheCounter = 0;
      this.cpuPositionsPending = true;
      this.buffers.readBuffer('node-positions', this.nodeCount * 16).then(data => {
        this.cpuPositions = data;
        this.cpuPositionsPending = false;
      });
    }

    if (this.hullRendererInstance && (this.draggedNodeIndex !== null || this.simParams.alpha > 0.05)) {
      this.hullRendererInstance.forceRecompute();
    }

    this.render();
    requestAnimationFrame(this.tick);
  };

  private render(): void {
    const { device, context } = this.gpu;

    if (this.cameraBuffer && this.camera.version !== this.lastCameraVersion) {
      this.lastCameraVersion = this.camera.version;
      device.queue.writeBuffer(this.cameraBuffer, 0, this.camera.getProjection());
    }

    if (this.paramsBuffer) {
      this.renderParamsArray[0] = this.renderParams.nodeBaseSize;
      this.renderParamsArray[1] = this.camera.getViewportWidth();
      this.renderParamsArray[2] = this.camera.getViewportHeight();
      this.renderParamsArray[3] = this.renderParams.nodeDarkMode ? 1.0 : 0.0;
      device.queue.writeBuffer(this.paramsBuffer, 0, this.renderParamsArray);
    }

    const textureView = context.getCurrentTexture().createView();
    const bg = this.renderParams.backgroundColor;
    const commandEncoder = device.createCommandEncoder();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: bg[0], g: bg[1], b: bg[2], a: bg[3] },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    if (this.hullRendererInstance && this.renderParams.hullAlpha > 0) {
      this.hullRendererInstance.render(renderPass, this.renderParams);
    }

    if (this.edgeRendererInstance && this.renderParams.edgeOpacity > 0) {
      this.edgeRendererInstance.render(renderPass, this.renderParams);
    }

    if (this.nodeRenderPipeline && this.nodeBindGroup && this.nodeCount > 0) {
      renderPass.setPipeline(this.nodeRenderPipeline);
      renderPass.setBindGroup(0, this.nodeBindGroup);
      renderPass.draw(this.nodeCount * 6);
    }

    renderPass.end();
    device.queue.submit([commandEncoder.finish()]);
  }

  // ── Internal: neighborhood selection (default click behavior) ──

  private applySelection(): void {
    if (!this.graphData || !this.buffers.hasBuffer('node-metadata')) return;

    if (this.selectedNode === null) {
      this.visibleNodes = null;
      const metadata = new Uint32Array(this.nodeCount * 2);
      for (let i = 0; i < this.nodeCount; i++) {
        metadata[i * 2] = this.graphData.nodes[i].group;
        metadata[i * 2 + 1] = 0;
      }
      this.buffers.uploadData('node-metadata', metadata);

      if (this.edgeRendererInstance) {
        this.edgeRendererInstance.setVisibleEdges(this.graphData, null);
      }
      if (this.hullRendererInstance) {
        this.hullRendererInstance.setVisibleEdges(null);
      }
    } else {
      const visibleEdges = new Set<number>();
      const visibleNodes = new Set<number>();
      visibleNodes.add(this.selectedNode);

      for (const he of this.graphData.hyperedges) {
        if (he.memberIndices.includes(this.selectedNode)) {
          visibleEdges.add(he.index);
          for (const idx of he.memberIndices) {
            visibleNodes.add(idx);
          }
        }
      }
      this.visibleNodes = visibleNodes;

      const metadata = new Uint32Array(this.nodeCount * 2);
      for (let i = 0; i < this.nodeCount; i++) {
        metadata[i * 2] = this.graphData.nodes[i].group;
        metadata[i * 2 + 1] = visibleNodes.has(i) ? 0 : 1;
      }
      this.buffers.uploadData('node-metadata', metadata);

      if (this.edgeRendererInstance) {
        this.edgeRendererInstance.setVisibleEdges(this.graphData, visibleEdges);
      }
      if (this.hullRendererInstance) {
        this.hullRendererInstance.setVisibleEdges(visibleEdges);
      }
    }

    if (this.tooltip) {
      this.tooltip.hide();
      this.lastHoveredEdge = null;
    }
  }

  // ── Internal: hyperedge buffer upload ──

  private uploadHyperedgeBuffers(data: HypergraphData): void {
    const offsets = new Uint32Array(data.hyperedges.length + 1);
    let totalMembers = 0;
    for (let i = 0; i < data.hyperedges.length; i++) {
      offsets[i] = totalMembers;
      totalMembers += data.hyperedges[i].memberIndices.length;
    }
    offsets[data.hyperedges.length] = totalMembers;

    const members = new Uint32Array(totalMembers);
    let offset = 0;
    for (const he of data.hyperedges) {
      for (const idx of he.memberIndices) {
        members[offset++] = idx;
      }
    }

    this.buffers.createBuffer('he-offsets', offsets.byteLength,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'he-offsets');
    this.buffers.uploadData('he-offsets', offsets);

    this.buffers.createBuffer('he-members', Math.max(members.byteLength, 4),
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'he-members');
    if (members.byteLength > 0) {
      this.buffers.uploadData('he-members', members);
    }
  }

  // ── Internal: hit testing ──

  private hitTestEdge(worldX: number, worldY: number): number | null {
    return this.hullRendererInstance?.hitTest(worldX, worldY) ?? null;
  }

  private hitTestNode(worldX: number, worldY: number): number | null {
    if (!this.cpuPositions || this.nodeCount === 0) return null;
    const hitRadius = (this.renderParams.nodeBaseSize * 1.5) / this.camera.zoom;
    let bestDist = hitRadius;
    let bestIndex: number | null = null;
    for (let i = 0; i < this.nodeCount; i++) {
      if (this.visibleNodes !== null && !this.visibleNodes.has(i)) continue;
      const nx = this.cpuPositions[i * 4];
      const ny = this.cpuPositions[i * 4 + 1];
      const dx = worldX - nx;
      const dy = worldY - ny;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }
    return bestIndex;
  }
}
