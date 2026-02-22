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

interface SectionDef {
  label: string;
  content: HTMLElement;
  defaultOpen: boolean;
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
    title.textContent = 'Hyperblob';
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

    const sections: SectionDef[] = [
      { label: 'Simulation', content: simTab, defaultOpen: true },
      { label: 'Rendering', content: renderTab, defaultOpen: true },
      { label: 'Data', content: dataTabResult.el, defaultOpen: false },
      { label: 'Camera', content: cameraTab, defaultOpen: false },
    ];

    // Scrollable wrapper for all sections
    const scrollArea = document.createElement('div');
    scrollArea.className = 'panel-sections';

    for (const section of sections) {
      const wrapper = document.createElement('div');
      wrapper.className = 'panel-section';
      if (section.defaultOpen) wrapper.classList.add('open');

      // Header
      const header = document.createElement('div');
      header.className = 'panel-section-header';

      const label = document.createElement('span');
      label.className = 'panel-section-label';
      label.textContent = section.label;

      const chevron = document.createElement('span');
      chevron.className = 'panel-section-chevron';
      chevron.textContent = '\u25B6'; // ▶

      header.appendChild(label);
      header.appendChild(chevron);

      // Body
      const body = document.createElement('div');
      body.className = 'panel-section-body';
      body.appendChild(section.content);

      // Click toggles open/close
      header.addEventListener('click', () => {
        wrapper.classList.toggle('open');
      });

      wrapper.appendChild(header);
      wrapper.appendChild(body);
      scrollArea.appendChild(wrapper);
    }

    this.container.appendChild(scrollArea);
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

/* ── Accordion Sections ── */
.panel-sections {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 20px;
}

.panel-section {
  border-bottom: 1px solid #e0e0e5;
}

.panel-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.panel-section-header:hover {
  background: #f0f0f5;
}

.panel-section-label {
  font-size: 11px;
  font-weight: 600;
  color: #555570;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.panel-section.open .panel-section-label {
  color: #2a2a3e;
}

.panel-section-chevron {
  font-size: 8px;
  color: #999;
  transition: transform 0.25s ease;
}

.panel-section.open .panel-section-chevron {
  transform: rotate(90deg);
}

.panel-section-body {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.25s ease;
}

.panel-section.open .panel-section-body {
  max-height: 600px;
}

.panel-section-body > * {
  padding: 0 14px 12px;
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

.panel-section-body .ctrl-section-header:first-child {
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
.panel-sections::-webkit-scrollbar {
  width: 6px;
}

.panel-sections::-webkit-scrollbar-track {
  background: transparent;
}

.panel-sections::-webkit-scrollbar-thumb {
  background: #d0d0d8;
  border-radius: 3px;
}

.panel-sections::-webkit-scrollbar-thumb:hover {
  background: #b0b0c0;
}
`;
