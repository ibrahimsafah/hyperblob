import { type GPUContext } from './gpu/device';
import { BufferManager } from './gpu/buffer-manager';
import { Camera } from './render/camera';
import { Stats } from './utils/stats';
import { getPaletteColors } from './utils/color';
import { type HypergraphData, type SimulationParams, type RenderParams, defaultSimulationParams, defaultRenderParams } from './data/types';
import nodeShaderCode from './shaders/node-render.wgsl?raw';

export class App {
  private gpu: GPUContext;
  private buffers: BufferManager;
  camera: Camera;
  private stats: Stats;

  simParams: SimulationParams;
  renderParams: RenderParams;

  private graphData: HypergraphData | null = null;
  private nodeCount = 0;

  // Node drag state
  private cpuPositions: Float32Array | null = null;
  private cpuPositionsPending = false;
  private positionCacheCounter = 0;
  private draggedNodeIndex: number | null = null;
  private dragTargetPos: [number, number] | null = null;   // raw cursor world pos
  private dragSmoothPos: [number, number] | null = null;   // lerped position written to GPU
  private dragPrevPos: [number, number] | null = null;     // previous frame (for release velocity)

  // Render pipeline state
  private nodeRenderPipeline: GPURenderPipeline | null = null;
  private nodeBindGroup: GPUBindGroup | null = null;
  private cameraBuffer: GPUBuffer | null = null;
  private paramsBuffer: GPUBuffer | null = null;
  private paletteBuffer: GPUBuffer | null = null;

  // Dynamically loaded modules (any because they may not exist yet)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private modules: Record<string, any> = {};

  // Live instances
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private instances: Record<string, any> = {};

  private simulation: { tick(params: SimulationParams): void } | null = null;
  private panelInstance: { updateDataInfo(data: HypergraphData): void } | null = null;

  private running = false;
  private disposed = false;

  constructor(gpu: GPUContext) {
    this.gpu = gpu;
    this.buffers = new BufferManager(gpu.device);
    this.camera = new Camera();
    this.stats = new Stats(gpu.canvas.parentElement!);
    this.simParams = defaultSimulationParams();
    this.renderParams = defaultRenderParams();
  }

  async init(): Promise<void> {
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());

    // Load modules dynamically so partial builds don't crash
    await this.loadModules();

    // Setup palette buffer
    const paletteData = getPaletteColors();
    this.paletteBuffer = this.buffers.createBuffer(
      'palette', paletteData.byteLength,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'palette'
    );
    this.buffers.uploadData('palette', paletteData);

    // Setup camera & render params uniform buffers
    this.cameraBuffer = this.buffers.createBuffer(
      'camera-uniform', 64,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'camera-uniform'
    );
    this.paramsBuffer = this.buffers.createBuffer(
      'render-params', 16,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'render-params'
    );

    // Create node render pipeline
    this.createNodePipeline();

    // Setup input handler with node drag support
    if (this.modules.inputHandler) {
      const { InputHandler } = this.modules.inputHandler;
      this.instances.inputHandler = new InputHandler(this.gpu.canvas, this.camera, {
        hitTest: (wx: number, wy: number) => this.hitTestNode(wx, wy),
        onDragStart: (nodeIndex: number) => {
          this.draggedNodeIndex = nodeIndex;
          // Initialize smooth position to the node's current position
          if (this.cpuPositions) {
            const x = this.cpuPositions[nodeIndex * 4];
            const y = this.cpuPositions[nodeIndex * 4 + 1];
            this.dragSmoothPos = [x, y];
            this.dragTargetPos = [x, y];
            this.dragPrevPos = [x, y];
          }
          // Gentle reheat — just enough for neighbors to react without global jitter
          if (this.simParams.alpha < 0.08) {
            this.simParams.alpha = 0.08;
          }
          this.simParams.running = true;
        },
        onDrag: (_nodeIndex: number, wx: number, wy: number) => {
          this.dragTargetPos = [wx, wy];
          // Keep CPU cache in sync for the dragged node
          if (this.cpuPositions && this.draggedNodeIndex !== null) {
            this.cpuPositions[this.draggedNodeIndex * 4] = wx;
            this.cpuPositions[this.draggedNodeIndex * 4 + 1] = wy;
          }
        },
        onDragEnd: () => {
          // Impart momentum on release for natural deceleration
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
      });
    }

    // Setup panel
    if (this.modules.panel) {
      const panelContainer = document.getElementById('panel')!;
      this.panelInstance = new this.modules.panel.Panel(panelContainer, {
        simParams: this.simParams,
        renderParams: this.renderParams,
        camera: this.camera,
        onLoadFile: (data: HypergraphData) => this.setData(data),
        onGenerate: (nodeCount: number, heCount: number, maxSize: number) => {
          if (this.modules.generator) {
            const data = this.modules.generator.generateRandomHypergraph(nodeCount, heCount, maxSize);
            this.setData(data);
          }
        },
        onSimulationToggle: (running: boolean) => { this.simParams.running = running; },
        onSimulationReset: () => this.resetSimulation(),
        onFitToScreen: () => this.fitToScreen(),
      });
    }

    // Load default dataset
    await this.loadDefaultDataset();
  }

  private async loadModules(): Promise<void> {
    const loads: [string, string][] = [
      ['hifLoader', './data/hif-loader'],
      ['generator', './data/generator'],
      ['forceSimulation', './layout/force-simulation'],
      ['renderer', './render/renderer'],
      ['inputHandler', './interaction/input-handler'],
      ['hullCompute', './render/hull-compute'],
      ['hullRenderer', './render/hull-renderer'],
      ['edgeRenderer', './render/edge-renderer'],
      ['nodePicker', './interaction/node-picker'],
      ['panel', './ui/panel'],
    ];

    await Promise.all(loads.map(async ([key, path]) => {
      try {
        this.modules[key] = await import(/* @vite-ignore */ path);
      } catch {
        // Module not built yet — that's fine
      }
    }));
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

  setData(data: HypergraphData): void {
    this.graphData = data;
    this.nodeCount = data.nodes.length;

    // Upload positions: [x, y, vx, vy] per node — random initial positions
    const positions = new Float32Array(data.nodes.length * 4);
    const spread = Math.sqrt(data.nodes.length) * 10;
    for (let i = 0; i < data.nodes.length; i++) {
      positions[i * 4 + 0] = (Math.random() - 0.5) * spread;
      positions[i * 4 + 1] = (Math.random() - 0.5) * spread;
      positions[i * 4 + 2] = 0; // vx
      positions[i * 4 + 3] = 0; // vy
    }
    this.buffers.createBuffer('node-positions', positions.byteLength,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, 'node-positions');
    this.buffers.uploadData('node-positions', positions);

    // Initialize CPU position cache for hit testing
    this.cpuPositions = new Float32Array(positions);

    // Upload metadata: [group, flags] per node
    const metadata = new Uint32Array(data.nodes.length * 2);
    for (let i = 0; i < data.nodes.length; i++) {
      metadata[i * 2 + 0] = data.nodes[i].group;
      metadata[i * 2 + 1] = 0; // flags
    }
    this.buffers.createBuffer('node-metadata', metadata.byteLength,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'node-metadata');
    this.buffers.uploadData('node-metadata', metadata);

    // Upload hyperedge data (CSR format) for edge rendering & hulls
    this.uploadHyperedgeBuffers(data);

    // Recreate bind group with new buffers
    this.createNodeBindGroup();

    // Setup edge renderer
    if (this.modules.edgeRenderer && !this.instances.edgeRenderer) {
      this.instances.edgeRenderer = new this.modules.edgeRenderer.EdgeRenderer(this.gpu, this.buffers, this.camera);
    }
    if (this.instances.edgeRenderer) {
      this.instances.edgeRenderer.setData(data);
    }

    // Setup hull compute + renderer
    if (this.modules.hullCompute && !this.instances.hullCompute) {
      this.instances.hullCompute = new this.modules.hullCompute.HullCompute();
    }
    if (this.modules.hullRenderer && !this.instances.hullRenderer) {
      this.instances.hullRenderer = new this.modules.hullRenderer.HullRenderer(this.gpu, this.buffers, this.camera);
    }
    if (this.instances.hullRenderer) {
      this.instances.hullRenderer.setData(data);
    }

    // Setup force simulation
    if (this.modules.forceSimulation) {
      this.simulation = new this.modules.forceSimulation.ForceSimulation(this.gpu.device, this.buffers, data, this.simParams);
    }

    // Reset alpha
    this.simParams.alpha = 1.0;
    this.simParams.running = true;

    // Update stats
    this.stats.setDataInfo(data.nodes.length, data.hyperedges.length);
    if (this.panelInstance) {
      this.panelInstance.updateDataInfo(data);
    }

    // Fit camera
    this.camera.fitBounds(-spread / 2, -spread / 2, spread / 2, spread / 2);
  }

  private uploadHyperedgeBuffers(data: HypergraphData): void {
    // CSR format: offsets array + members array
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

  private async loadDefaultDataset(): Promise<void> {
    if (!this.modules.hifLoader) return;
    try {
      const response = await fetch('/data/small-test.json');
      if (!response.ok) return;
      const json = await response.json();
      const data = this.modules.hifLoader.parseHIF(json);
      this.setData(data);
    } catch (e) {
      console.warn('Could not load default dataset:', e);
    }
  }

  private resetSimulation(): void {
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

  private async fitToScreen(): Promise<void> {
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

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  private tick = (): void => {
    if (this.disposed || !this.running) return;

    // Keep simulation gently warm during node drag (low alpha = subtle neighbor movement)
    if (this.draggedNodeIndex !== null && this.simParams.alpha < 0.08) {
      this.simParams.alpha = 0.08;
      this.simParams.running = true;
    }

    // Write dragged node position BEFORE simulation so GPU forces read the correct position
    if (this.draggedNodeIndex !== null && this.dragSmoothPos && this.buffers.hasBuffer('node-positions')) {
      const pre = new Float32Array([this.dragSmoothPos[0], this.dragSmoothPos[1], 0, 0]);
      this.buffers.uploadData('node-positions', pre, this.draggedNodeIndex * 16);
    }

    // Update simulation
    if (this.simulation && this.simParams.running && this.simParams.alpha > this.simParams.alphaMin) {
      this.simulation.tick(this.simParams);
      this.simParams.alpha += (this.simParams.alphaTarget - this.simParams.alpha) * this.simParams.alphaDecay;
    }

    // Lerp dragged node toward cursor target (smooths out discrete mouse events)
    if (this.draggedNodeIndex !== null && this.dragTargetPos && this.dragSmoothPos && this.buffers.hasBuffer('node-positions')) {
      this.dragPrevPos = [this.dragSmoothPos[0], this.dragSmoothPos[1]];
      const t = 0.55; // lerp factor: tight tracking with jitter smoothing at 120fps
      this.dragSmoothPos[0] += (this.dragTargetPos[0] - this.dragSmoothPos[0]) * t;
      this.dragSmoothPos[1] += (this.dragTargetPos[1] - this.dragSmoothPos[1]) * t;
      const data = new Float32Array([this.dragSmoothPos[0], this.dragSmoothPos[1], 0, 0]);
      this.buffers.uploadData('node-positions', data, this.draggedNodeIndex * 16);
    }

    // Periodically update CPU position cache for hit testing
    this.positionCacheCounter++;
    if (this.positionCacheCounter >= 10 && this.nodeCount > 0 && !this.cpuPositionsPending && this.buffers.hasBuffer('node-positions')) {
      this.positionCacheCounter = 0;
      this.cpuPositionsPending = true;
      this.buffers.readBuffer('node-positions', this.nodeCount * 16).then(data => {
        this.cpuPositions = data;
        this.cpuPositionsPending = false;
      });
    }

    // Force hull recompute every frame while simulation has energy or during drag
    if (this.instances.hullRenderer && (this.draggedNodeIndex !== null || this.simParams.alpha > 0.05)) {
      this.instances.hullRenderer.forceRecompute();
    }

    this.render();
    this.stats.update();

    requestAnimationFrame(this.tick);
  };

  private render(): void {
    const { device, context } = this.gpu;

    // Update camera uniform
    if (this.cameraBuffer) {
      device.queue.writeBuffer(this.cameraBuffer, 0, this.camera.getProjection());
    }

    // Update render params uniform
    if (this.paramsBuffer) {
      const data = new Float32Array([
        this.renderParams.nodeBaseSize,
        this.camera.getViewportWidth(),
        this.camera.getViewportHeight(),
        this.renderParams.nodeDarkMode ? 1.0 : 0.0,
      ]);
      device.queue.writeBuffer(this.paramsBuffer, 0, data);
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

    // Draw hulls first (back layer)
    if (this.instances.hullRenderer && this.renderParams.hullAlpha > 0) {
      this.instances.hullRenderer.render(renderPass, this.renderParams);
    }

    // Draw edges
    if (this.instances.edgeRenderer && this.renderParams.edgeOpacity > 0) {
      this.instances.edgeRenderer.render(renderPass, this.renderParams);
    }

    // Draw nodes
    if (this.nodeRenderPipeline && this.nodeBindGroup && this.nodeCount > 0) {
      renderPass.setPipeline(this.nodeRenderPipeline);
      renderPass.setBindGroup(0, this.nodeBindGroup);
      renderPass.draw(this.nodeCount * 6); // 6 verts per quad
    }

    renderPass.end();
    device.queue.submit([commandEncoder.finish()]);
  }

  private handleResize(): void {
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

  // Public accessors for modules
  getCamera(): Camera { return this.camera; }
  getBufferManager(): BufferManager { return this.buffers; }
  getGPU(): GPUContext { return this.gpu; }
  getSimParams(): SimulationParams { return this.simParams; }
  getRenderParams(): RenderParams { return this.renderParams; }
  getNodeCount(): number { return this.nodeCount; }
  getGraphData(): HypergraphData | null { return this.graphData; }

  private hitTestNode(worldX: number, worldY: number): number | null {
    if (!this.cpuPositions || this.nodeCount === 0) return null;
    // Convert pixel-space node size to world-space radius, with extra margin for easier clicking
    const hitRadius = (this.renderParams.nodeBaseSize * 1.5) / this.camera.zoom;
    let bestDist = hitRadius;
    let bestIndex: number | null = null;
    for (let i = 0; i < this.nodeCount; i++) {
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

  dispose(): void {
    this.disposed = true;
    this.running = false;
    this.buffers.destroyAll();
  }
}
