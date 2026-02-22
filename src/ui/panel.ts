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
  color: #2a2a3e;
  letter-spacing: 0.5px;
  border-bottom: 1px solid #e0e0e5;
}

/* ── Tab Bar ── */
.panel-tab-bar {
  display: flex;
  border-bottom: 1px solid #e0e0e5;
  background: #f8f8fa;
  flex-shrink: 0;
}

.panel-tab-btn {
  flex: 1;
  padding: 9px 4px;
  border: none;
  background: transparent;
  color: #888898;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}

.panel-tab-btn:hover {
  color: #555570;
}

.panel-tab-btn.active {
  color: #2a2a3e;
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
  color: #888898;
  margin: 16px 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #e0e0e5;
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
  color: #555570;
  font-size: 11px;
}

.ctrl-value {
  color: #333348;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.ctrl-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  background: #e0e0e8;
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
  border: 2px solid #ffffff;
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
  border: 2px solid #ffffff;
  cursor: pointer;
}

/* ── Select ── */
.ctrl-select {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.ctrl-select-input {
  font-family: inherit;
  font-size: 11px;
  padding: 4px 8px;
  border: 1px solid #d0d0d8;
  border-radius: 4px;
  background: #f8f8fa;
  color: #333348;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
}

.ctrl-select-input:hover {
  border-color: #b0b0c0;
}

.ctrl-select-input:focus {
  border-color: #5577cc;
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
  background: #d8d8e0;
  border: 1px solid #c0c0cc;
  border-radius: 10px;
  cursor: pointer;
  padding: 0;
  transition: background 0.2s, border-color 0.2s;
}

.ctrl-toggle-btn.active {
  background: #5577cc;
  border-color: #5577cc;
}

.ctrl-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: #999;
  border-radius: 50%;
  transition: transform 0.2s, background 0.2s;
}

.ctrl-toggle-btn.active .ctrl-toggle-knob {
  transform: translateX(16px);
  background: #ffffff;
}

/* ── Button ── */
.ctrl-btn {
  padding: 7px 14px;
  border: 1px solid #d0d0d8;
  border-radius: 6px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.ctrl-btn-default {
  background: #f0f0f5;
  color: #555570;
}

.ctrl-btn-default:hover {
  background: #e8e8f0;
  border-color: #b0b0c0;
  color: #333348;
}

.ctrl-btn-primary {
  background: #5577cc;
  border-color: #4466bb;
  color: #ffffff;
}

.ctrl-btn-primary:hover {
  background: #4466bb;
  border-color: #3355aa;
}

.ctrl-btn-danger {
  background: #fff0f0;
  border-color: #ffaaaa;
  color: #cc3333;
}

.ctrl-btn-danger:hover {
  background: #ffe0e0;
  border-color: #ff8888;
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
  color: #333348;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* ── File Drop Zone ── */
.ctrl-drop-zone {
  border: 1px dashed #d0d0d8;
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
  color: #555570;
  font-size: 12px;
  margin-bottom: 4px;
}

.ctrl-drop-hint {
  color: #888898;
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
  border: 2px solid #d0d0d8;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.1s;
  padding: 0;
}

.ctrl-color-swatch:hover {
  border-color: #8888aa;
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
  background: #e0e0e8;
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
  background: #d0d0d8;
  border-radius: 3px;
}

.panel-tab-contents::-webkit-scrollbar-thumb:hover {
  background: #b0b0c0;
}
`;
