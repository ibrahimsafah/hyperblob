import type { SimulationParams } from '../../data/types';
import { createSlider, createButton, createSectionHeader } from '../controls';

export function createSimulationTab(
  simParams: SimulationParams,
  onToggle: (running: boolean) => void,
  onReset: () => void,
): { el: HTMLElement; dispose: () => void } {
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

  // -- Energy progress bar --
  const energyContainer = document.createElement('div');
  energyContainer.className = 'ctrl-alpha-bar';

  const energyLabel = document.createElement('span');
  energyLabel.className = 'ctrl-label';
  energyLabel.textContent = 'Energy';

  const energyTrack = document.createElement('div');
  energyTrack.className = 'ctrl-alpha-track';

  const energyFill = document.createElement('div');
  energyFill.className = 'ctrl-alpha-fill';
  energyFill.style.width = `${(simParams.energy * 100).toFixed(0)}%`;

  const energyValue = document.createElement('span');
  energyValue.className = 'ctrl-value';
  energyValue.textContent = simParams.energy.toFixed(3);

  energyTrack.appendChild(energyFill);

  const energyHeader = document.createElement('div');
  energyHeader.className = 'ctrl-slider-header';
  energyHeader.appendChild(energyLabel);
  energyHeader.appendChild(energyValue);

  energyContainer.appendChild(energyHeader);
  energyContainer.appendChild(energyTrack);
  tab.appendChild(energyContainer);

  // Update energy display periodically
  const energyUpdateInterval = setInterval(() => {
    energyFill.style.width = `${Math.min(100, simParams.energy * 100).toFixed(0)}%`;
    energyValue.textContent = simParams.energy.toFixed(3);
  }, 100);

  const dispose = () => {
    clearInterval(energyUpdateInterval);
  };

  // -- Force parameters section --
  tab.appendChild(createSectionHeader('Forces'));

  tab.appendChild(createSlider({
    label: 'Repulsion',
    min: -1000,
    max: 0,
    step: 10,
    value: simParams.repulsionStrength,
    onChange: (v) => { simParams.repulsionStrength = v; },
    tooltip: 'Negative charge between nodes — pushes them apart. Stronger = more spread out.',
  }));

  tab.appendChild(createSlider({
    label: 'Attraction',
    min: 0,
    max: 0.2,
    step: 0.005,
    value: simParams.attractionStrength,
    onChange: (v) => { simParams.attractionStrength = v; },
    tooltip: 'Spring force pulling hyperedge members toward their shared center.',
  }));

  tab.appendChild(createSlider({
    label: 'Link Distance',
    min: 10,
    max: 200,
    step: 5,
    value: simParams.linkDistance,
    onChange: (v) => { simParams.linkDistance = v; },
    tooltip: 'Ideal distance between connected nodes. Springs rest at this length.',
  }));

  tab.appendChild(createSlider({
    label: 'Center Gravity',
    min: 0,
    max: 0.1,
    step: 0.002,
    value: simParams.centerStrength,
    onChange: (v) => { simParams.centerStrength = v; },
    tooltip: 'Gentle pull toward the center of the viewport. Prevents drift.',
  }));

  tab.appendChild(createSlider({
    label: 'Velocity Decay',
    min: 0,
    max: 1,
    step: 0.05,
    value: simParams.velocityDecay,
    onChange: (v) => { simParams.velocityDecay = v; },
    tooltip: 'Friction — 0 = frozen, 1 = no damping. Controls how quickly nodes slow down.',
  }));

  tab.appendChild(createSlider({
    label: 'Theta (BH)',
    min: 0.3,
    max: 2.0,
    step: 0.1,
    value: simParams.theta,
    onChange: (v) => { simParams.theta = v; },
    tooltip: 'Barnes-Hut accuracy. Lower = more accurate forces but slower. 0.9 is a good balance.',
  }));

  tab.appendChild(createSlider({
    label: 'Cooling Rate',
    min: 0,
    max: 0.1,
    step: 0.001,
    value: simParams.coolingRate,
    onChange: (v) => { simParams.coolingRate = v; },
    tooltip: 'How fast the simulation cools down. Higher = settles faster but may miss optimal layout.',
  }));

  tab.appendChild(createSlider({
    label: 'Idle Energy',
    min: 0,
    max: 0.1,
    step: 0.005,
    value: simParams.idleEnergy,
    onChange: (v) => {
      simParams.idleEnergy = v;
      // If energy already settled below new target, bump it up
      if (simParams.energy < v) {
        simParams.energy = v;
        simParams.running = true;
      }
    },
    tooltip: 'Minimum energy the simulation settles to. Higher = nodes keep jiggling slightly.',
  }));

  return { el: tab, dispose };
}
