import type { RenderParams } from '../../data/types';
import { createSlider, createToggle, createColorPresets, createSectionHeader } from '../controls';

export function createRenderingTab(renderParams: RenderParams): HTMLElement {
  const tab = document.createElement('div');
  tab.className = 'panel-tab-content';

  // -- Nodes section --
  tab.appendChild(createSectionHeader('Nodes'));

  tab.appendChild(createSlider({
    label: 'Node Size',
    min: 1,
    max: 30,
    step: 0.5,
    value: renderParams.nodeBaseSize,
    onChange: (v) => { renderParams.nodeBaseSize = v; },
  }));

  // -- Edges section --
  tab.appendChild(createSectionHeader('Edges'));

  tab.appendChild(createSlider({
    label: 'Edge Opacity',
    min: 0,
    max: 1,
    step: 0.05,
    value: renderParams.edgeOpacity,
    onChange: (v) => { renderParams.edgeOpacity = v; },
  }));

  // -- Hulls section --
  tab.appendChild(createSectionHeader('Hulls'));

  tab.appendChild(createSlider({
    label: 'Hull Alpha',
    min: 0,
    max: 0.5,
    step: 0.01,
    value: renderParams.hullAlpha,
    onChange: (v) => { renderParams.hullAlpha = v; },
  }));

  tab.appendChild(createSlider({
    label: 'Hull Margin',
    min: 0,
    max: 50,
    step: 1,
    value: renderParams.hullMargin,
    onChange: (v) => { renderParams.hullMargin = v; },
  }));

  tab.appendChild(createToggle({
    label: 'Hull Outline',
    value: renderParams.hullOutline,
    onChange: (v) => { renderParams.hullOutline = v; },
  }));

  // -- Background section --
  tab.appendChild(createSectionHeader('Background'));

  tab.appendChild(createColorPresets({
    label: 'Background Color',
    onChange: (color) => {
      renderParams.backgroundColor[0] = color[0];
      renderParams.backgroundColor[1] = color[1];
      renderParams.backgroundColor[2] = color[2];
      renderParams.backgroundColor[3] = color[3];
    },
  }));

  return tab;
}
