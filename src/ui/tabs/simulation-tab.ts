import type { SimulationParams } from '../../data/types';
import { createSlider, createButton, createSectionHeader } from '../controls';

export function createSimulationTab(
  simParams: SimulationParams,
  onToggle: (running: boolean) => void,
  onReset: () => void,
): HTMLElement {
  const tab = document.createElement('div');
  tab.className = 'panel-tab-content';

  // -- Controls section --
  tab.appendChild(createSectionHeader('Playback'));

  const btnRow = document.createElement('div');
  btnRow.className = 'ctrl-btn-row';

  const playBtn = createButton({
    label: simParams.running ? 'Pause' : 'Play',
    variant: 'primary',
    onClick: () => {
      simParams.running = !simParams.running;
      playBtn.textContent = simParams.running ? 'Pause' : 'Play';
      onToggle(simParams.running);
    },
  });

  const resetBtn = createButton({
    label: 'Reset',
    variant: 'danger',
    onClick: () => {
      simParams.running = true;
      playBtn.textContent = 'Pause';
      onReset();
    },
  });

  btnRow.appendChild(playBtn);
  btnRow.appendChild(resetBtn);
  tab.appendChild(btnRow);

  // -- Alpha progress --
  const alphaContainer = document.createElement('div');
  alphaContainer.className = 'ctrl-alpha-bar';

  const alphaLabel = document.createElement('span');
  alphaLabel.className = 'ctrl-label';
  alphaLabel.textContent = 'Alpha (energy)';

  const alphaTrack = document.createElement('div');
  alphaTrack.className = 'ctrl-alpha-track';

  const alphaFill = document.createElement('div');
  alphaFill.className = 'ctrl-alpha-fill';
  alphaFill.style.width = `${(simParams.alpha * 100).toFixed(0)}%`;

  const alphaValue = document.createElement('span');
  alphaValue.className = 'ctrl-value';
  alphaValue.textContent = simParams.alpha.toFixed(3);

  alphaTrack.appendChild(alphaFill);

  const alphaHeader = document.createElement('div');
  alphaHeader.className = 'ctrl-slider-header';
  alphaHeader.appendChild(alphaLabel);
  alphaHeader.appendChild(alphaValue);

  alphaContainer.appendChild(alphaHeader);
  alphaContainer.appendChild(alphaTrack);
  tab.appendChild(alphaContainer);

  // Update alpha display periodically
  const alphaUpdateInterval = setInterval(() => {
    alphaFill.style.width = `${Math.min(100, simParams.alpha * 100).toFixed(0)}%`;
    alphaValue.textContent = simParams.alpha.toFixed(3);
  }, 100);

  // Store interval for cleanup (accessible via data attribute)
  tab.setAttribute('data-alpha-interval', String(alphaUpdateInterval));

  // -- Force parameters section --
  tab.appendChild(createSectionHeader('Forces'));

  tab.appendChild(createSlider({
    label: 'Repulsion',
    min: -1000,
    max: 0,
    step: 10,
    value: simParams.repulsionStrength,
    onChange: (v) => { simParams.repulsionStrength = v; },
  }));

  tab.appendChild(createSlider({
    label: 'Attraction',
    min: 0,
    max: 0.2,
    step: 0.005,
    value: simParams.attractionStrength,
    onChange: (v) => { simParams.attractionStrength = v; },
  }));

  tab.appendChild(createSlider({
    label: 'Link Distance',
    min: 10,
    max: 200,
    step: 5,
    value: simParams.linkDistance,
    onChange: (v) => { simParams.linkDistance = v; },
  }));

  tab.appendChild(createSlider({
    label: 'Center Gravity',
    min: 0,
    max: 0.1,
    step: 0.002,
    value: simParams.centerStrength,
    onChange: (v) => { simParams.centerStrength = v; },
  }));

  tab.appendChild(createSlider({
    label: 'Velocity Decay',
    min: 0,
    max: 1,
    step: 0.05,
    value: simParams.velocityDecay,
    onChange: (v) => { simParams.velocityDecay = v; },
  }));

  tab.appendChild(createSlider({
    label: 'Theta (BH)',
    min: 0.3,
    max: 2.0,
    step: 0.1,
    value: simParams.theta,
    onChange: (v) => { simParams.theta = v; },
  }));

  tab.appendChild(createSlider({
    label: 'Alpha Decay',
    min: 0,
    max: 0.1,
    step: 0.001,
    value: simParams.alphaDecay,
    onChange: (v) => { simParams.alphaDecay = v; },
  }));

  return tab;
}
