import type { SimulationParams, RenderParams, HypergraphData } from '../data/types';
import type { Camera } from '../render/camera';
import { createSimulationTab } from './tabs/simulation-tab';
import { createRenderingTab } from './tabs/rendering-tab';
import { createDataTab } from './tabs/data-tab';
import { createCameraTab } from './tabs/camera-tab';

export interface PanelConfig {
  simParams: SimulationParams;
  renderParams: RenderParams;
  camera: Camera;
  onLoadFile: (data: HypergraphData) => void;
  onGenerate: (nodeCount: number, heCount: number, maxSize: number) => void;
  onSimulationToggle: (running: boolean) => void;
  onSimulationReset: () => void;
  onFitToScreen: () => void;
}

interface TabDef {
  id: string;
  label: string;
  content: HTMLElement;
}

export class Panel {
  private container: HTMLElement;
  private dataTabHandle: { updateDataInfo(data: HypergraphData): void } | null = null;

  constructor(container: HTMLElement, config: PanelConfig) {
    this.container = container;
    this.injectStyles();
    this.build(config);
  }

  private build(config: PanelConfig): void {
    this.container.innerHTML = '';

    // Title
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'Hypergraph Visualizer';
    this.container.appendChild(title);

    // Build tabs
    const simTab = createSimulationTab(
      config.simParams,
      config.onSimulationToggle,
      config.onSimulationReset,
    );

    const renderTab = createRenderingTab(config.renderParams);

    const dataTabResult = createDataTab(
      config.onLoadFile,
      config.onGenerate,
    );
    this.dataTabHandle = dataTabResult;

    const cameraTab = createCameraTab(config.camera, config.onFitToScreen);

    const tabs: TabDef[] = [
      { id: 'sim', label: 'Simulation', content: simTab },
      { id: 'render', label: 'Rendering', content: renderTab },
      { id: 'data', label: 'Data', content: dataTabResult.el },
      { id: 'camera', label: 'Camera', content: cameraTab },
    ];

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.className = 'panel-tab-bar';

    const tabContents = document.createElement('div');
    tabContents.className = 'panel-tab-contents';

    tabs.forEach((tab, i) => {
      // Tab button
      const btn = document.createElement('button');
      btn.className = 'panel-tab-btn';
      btn.textContent = tab.label;
      btn.setAttribute('data-tab', tab.id);
      if (i === 0) btn.classList.add('active');

      btn.addEventListener('click', () => {
        tabBar.querySelectorAll('.panel-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        tabContents.querySelectorAll('.panel-tab-content').forEach(c => {
          (c as HTMLElement).style.display = 'none';
        });
        tab.content.style.display = '';
      });

      tabBar.appendChild(btn);

      // Tab content
      if (i !== 0) tab.content.style.display = 'none';
      tabContents.appendChild(tab.content);
    });

    this.container.appendChild(tabBar);
    this.container.appendChild(tabContents);
  }

  updateDataInfo(data: HypergraphData): void {
    this.dataTabHandle?.updateDataInfo(data);
  }

  private injectStyles(): void {
    if (document.getElementById('panel-styles')) return;

    const style = document.createElement('style');
    style.id = 'panel-styles';
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);
  }
}

// All panel CSS — dark theme, self-contained
const PANEL_CSS = `
/* ── Panel ── */
#panel {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace;
  font-size: 12px;
  user-select: none;
  display: flex;
  flex-direction: column;
}

.panel-title {
  padding: 14px 16px 10px;
  font-size: 13px;
  font-weight: 600;
  color: #c0c0d0;
  letter-spacing: 0.5px;
  border-bottom: 1px solid #1e1e2e;
}

/* ── Tab Bar ── */
.panel-tab-bar {
  display: flex;
  border-bottom: 1px solid #1e1e2e;
  background: #16161f;
  flex-shrink: 0;
}

.panel-tab-btn {
  flex: 1;
  padding: 9px 4px;
  border: none;
  background: transparent;
  color: #6a6a8a;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}

.panel-tab-btn:hover {
  color: #9a9abc;
}

.panel-tab-btn.active {
  color: #b0b0d0;
  border-bottom-color: #5577cc;
}

/* ── Tab Content ── */
.panel-tab-contents {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 20px;
}

.panel-tab-content {
  padding: 12px 14px;
}

/* ── Section Header ── */
.ctrl-section-header {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #5a5a78;
  margin: 16px 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #1e1e2e;
}

.panel-tab-content .ctrl-section-header:first-child {
  margin-top: 4px;
}

/* ── Slider ── */
.ctrl-slider {
  margin-bottom: 10px;
}

.ctrl-slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.ctrl-label {
  color: #8888a8;
  font-size: 11px;
}

.ctrl-value {
  color: #a0a0c0;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.ctrl-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  background: #1e1e2e;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.ctrl-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: #5577cc;
  border-radius: 50%;
  border: 2px solid #13131a;
  cursor: pointer;
  transition: background 0.15s;
}

.ctrl-range::-webkit-slider-thumb:hover {
  background: #6688dd;
}

.ctrl-range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #5577cc;
  border-radius: 50%;
  border: 2px solid #13131a;
  cursor: pointer;
}

/* ── Toggle ── */
.ctrl-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.ctrl-toggle-btn {
  position: relative;
  width: 36px;
  height: 20px;
  background: #1e1e2e;
  border: 1px solid #2a2a3a;
  border-radius: 10px;
  cursor: pointer;
  padding: 0;
  transition: background 0.2s, border-color 0.2s;
}

.ctrl-toggle-btn.active {
  background: #334488;
  border-color: #5577cc;
}

.ctrl-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: #6a6a8a;
  border-radius: 50%;
  transition: transform 0.2s, background 0.2s;
}

.ctrl-toggle-btn.active .ctrl-toggle-knob {
  transform: translateX(16px);
  background: #aabbee;
}

/* ── Button ── */
.ctrl-btn {
  padding: 7px 14px;
  border: 1px solid #2a2a3a;
  border-radius: 6px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.ctrl-btn-default {
  background: #1a1a28;
  color: #9a9abc;
}

.ctrl-btn-default:hover {
  background: #22223a;
  border-color: #3a3a5a;
  color: #b0b0d0;
}

.ctrl-btn-primary {
  background: #293d6e;
  border-color: #3a5599;
  color: #b0c8ff;
}

.ctrl-btn-primary:hover {
  background: #334888;
  border-color: #4a66aa;
}

.ctrl-btn-danger {
  background: #3a1a1a;
  border-color: #5a2a2a;
  color: #ff8888;
}

.ctrl-btn-danger:hover {
  background: #4a2020;
  border-color: #6a3a3a;
}

.ctrl-btn-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.ctrl-btn-row .ctrl-btn {
  flex: 1;
}

/* ── Info Display ── */
.ctrl-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  margin-bottom: 4px;
}

.ctrl-info-value {
  color: #a0a0c0;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* ── File Drop Zone ── */
.ctrl-drop-zone {
  border: 1px dashed #2a2a3a;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  margin-bottom: 12px;
}

.ctrl-drop-zone:hover,
.ctrl-drop-zone.dragover {
  border-color: #5577cc;
  background: rgba(85, 119, 204, 0.05);
}

.ctrl-drop-label {
  color: #8888a8;
  font-size: 12px;
  margin-bottom: 4px;
}

.ctrl-drop-hint {
  color: #5a5a78;
  font-size: 10px;
}

.ctrl-drop-input {
  display: none;
}

/* ── Color Presets ── */
.ctrl-color-presets {
  margin-bottom: 10px;
}

.ctrl-color-presets .ctrl-label {
  display: block;
  margin-bottom: 6px;
}

.ctrl-color-swatches {
  display: flex;
  gap: 6px;
}

.ctrl-color-swatch {
  width: 32px;
  height: 24px;
  border-radius: 4px;
  border: 2px solid #2a2a3a;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.1s;
  padding: 0;
}

.ctrl-color-swatch:hover {
  border-color: #4a4a6a;
  transform: scale(1.08);
}

.ctrl-color-swatch.active {
  border-color: #5577cc;
}

/* ── Alpha Bar ── */
.ctrl-alpha-bar {
  margin-bottom: 12px;
}

.ctrl-alpha-track {
  width: 100%;
  height: 4px;
  background: #1e1e2e;
  border-radius: 2px;
  overflow: hidden;
}

.ctrl-alpha-fill {
  height: 100%;
  background: linear-gradient(90deg, #5577cc, #33aa77);
  border-radius: 2px;
  transition: width 0.15s;
}

/* ── Scrollbar ── */
.panel-tab-contents::-webkit-scrollbar {
  width: 6px;
}

.panel-tab-contents::-webkit-scrollbar-track {
  background: transparent;
}

.panel-tab-contents::-webkit-scrollbar-thumb {
  background: #2a2a3a;
  border-radius: 3px;
}

.panel-tab-contents::-webkit-scrollbar-thumb:hover {
  background: #3a3a5a;
}
`;
