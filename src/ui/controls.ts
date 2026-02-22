// Reusable UI control components — vanilla HTML/CSS, no framework

export function createSlider(opts: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  logarithmic?: boolean;
}): HTMLElement {
  const container = document.createElement('div');
  container.className = 'ctrl-slider';

  const header = document.createElement('div');
  header.className = 'ctrl-slider-header';

  const label = document.createElement('span');
  label.className = 'ctrl-label';
  label.textContent = opts.label;

  const valueDisplay = document.createElement('span');
  valueDisplay.className = 'ctrl-value';

  header.appendChild(label);
  header.appendChild(valueDisplay);

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'ctrl-range';

  if (opts.logarithmic) {
    // Map log scale to 0..1000 integer range for the slider
    const logMin = Math.log10(Math.max(opts.min, 1));
    const logMax = Math.log10(opts.max);
    input.min = '0';
    input.max = '1000';
    input.step = '1';

    const valueToSlider = (v: number): number => {
      const logV = Math.log10(Math.max(v, 1));
      return Math.round(((logV - logMin) / (logMax - logMin)) * 1000);
    };

    const sliderToValue = (s: number): number => {
      const logV = logMin + (s / 1000) * (logMax - logMin);
      return Math.round(Math.pow(10, logV));
    };

    input.value = String(valueToSlider(opts.value));
    valueDisplay.textContent = formatNumber(opts.value);

    input.addEventListener('input', () => {
      const val = sliderToValue(Number(input.value));
      valueDisplay.textContent = formatNumber(val);
      opts.onChange(val);
    });
  } else {
    input.min = String(opts.min);
    input.max = String(opts.max);
    input.step = String(opts.step);
    input.value = String(opts.value);
    valueDisplay.textContent = formatValue(opts.value, opts.step);

    input.addEventListener('input', () => {
      const val = Number(input.value);
      valueDisplay.textContent = formatValue(val, opts.step);
      opts.onChange(val);
    });
  }

  container.appendChild(header);
  container.appendChild(input);
  return container;
}

export function createToggle(opts: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}): HTMLElement {
  const container = document.createElement('div');
  container.className = 'ctrl-toggle';

  const label = document.createElement('span');
  label.className = 'ctrl-label';
  label.textContent = opts.label;

  const toggle = document.createElement('button');
  toggle.className = 'ctrl-toggle-btn';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', String(opts.value));

  const knob = document.createElement('span');
  knob.className = 'ctrl-toggle-knob';
  toggle.appendChild(knob);

  const updateState = (val: boolean) => {
    toggle.setAttribute('aria-checked', String(val));
    toggle.classList.toggle('active', val);
  };

  updateState(opts.value);

  let current = opts.value;
  toggle.addEventListener('click', () => {
    current = !current;
    updateState(current);
    opts.onChange(current);
  });

  container.appendChild(label);
  container.appendChild(toggle);
  return container;
}

export function createButton(opts: {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'danger' | 'default';
}): HTMLElement {
  const btn = document.createElement('button');
  btn.className = `ctrl-btn ctrl-btn-${opts.variant ?? 'default'}`;
  btn.textContent = opts.label;
  btn.addEventListener('click', opts.onClick);
  return btn;
}

export function createInfoDisplay(
  label: string,
  value: string,
): { el: HTMLElement; update(value: string): void } {
  const container = document.createElement('div');
  container.className = 'ctrl-info';

  const labelEl = document.createElement('span');
  labelEl.className = 'ctrl-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = 'ctrl-info-value';
  valueEl.textContent = value;

  container.appendChild(labelEl);
  container.appendChild(valueEl);

  return {
    el: container,
    update(newValue: string) {
      valueEl.textContent = newValue;
    },
  };
}

export function createFileDropZone(opts: {
  label: string;
  accept: string;
  onFile: (file: File) => void;
}): HTMLElement {
  const container = document.createElement('div');
  container.className = 'ctrl-drop-zone';

  const labelEl = document.createElement('div');
  labelEl.className = 'ctrl-drop-label';
  labelEl.textContent = opts.label;

  const hint = document.createElement('div');
  hint.className = 'ctrl-drop-hint';
  hint.textContent = 'Drag & drop or click to browse';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = opts.accept;
  input.className = 'ctrl-drop-input';

  input.addEventListener('change', () => {
    if (input.files && input.files.length > 0) {
      opts.onFile(input.files[0]);
      input.value = '';
    }
  });

  container.addEventListener('click', () => input.click());

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    container.classList.add('dragover');
  });

  container.addEventListener('dragleave', () => {
    container.classList.remove('dragover');
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    container.classList.remove('dragover');
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.json')) {
        opts.onFile(file);
      }
    }
  });

  container.appendChild(labelEl);
  container.appendChild(hint);
  container.appendChild(input);
  return container;
}

export function createColorPresets(opts: {
  label: string;
  onChange: (color: [number, number, number, number]) => void;
}): HTMLElement {
  const container = document.createElement('div');
  container.className = 'ctrl-color-presets';

  const labelEl = document.createElement('span');
  labelEl.className = 'ctrl-label';
  labelEl.textContent = opts.label;

  const presets: { name: string; color: [number, number, number, number]; hex: string }[] = [
    { name: 'Dark', color: [0.04, 0.04, 0.06, 1.0], hex: '#0a0a0f' },
    { name: 'Light', color: [0.92, 0.92, 0.94, 1.0], hex: '#ebebf0' },
    { name: 'Midnight', color: [0.06, 0.06, 0.12, 1.0], hex: '#0f0f1f' },
    { name: 'Ocean', color: [0.04, 0.08, 0.14, 1.0], hex: '#0a1424' },
  ];

  const swatches = document.createElement('div');
  swatches.className = 'ctrl-color-swatches';

  for (const preset of presets) {
    const swatch = document.createElement('button');
    swatch.className = 'ctrl-color-swatch';
    swatch.style.backgroundColor = preset.hex;
    swatch.title = preset.name;
    swatch.addEventListener('click', () => {
      // Update active state
      swatches.querySelectorAll('.ctrl-color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      opts.onChange(preset.color);
    });
    swatches.appendChild(swatch);
  }

  // Mark the first as active initially
  swatches.children[0]?.classList.add('active');

  container.appendChild(labelEl);
  container.appendChild(swatches);
  return container;
}

export function createSectionHeader(text: string): HTMLElement {
  const h = document.createElement('div');
  h.className = 'ctrl-section-header';
  h.textContent = text;
  return h;
}

// Helpers

function formatValue(val: number, step: number): string {
  if (step >= 1) return String(Math.round(val));
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return val.toFixed(decimals);
}

function formatNumber(val: number): string {
  if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
  if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
  return String(val);
}
