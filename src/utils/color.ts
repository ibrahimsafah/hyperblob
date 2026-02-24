// Categorical color palette for hyperedge/group coloring
// Colors chosen for perceptual distinctness on dark backgrounds

const PALETTE: [number, number, number, number][] = [
  [0.400, 0.761, 0.647, 1.0], // teal
  [0.988, 0.553, 0.384, 1.0], // coral
  [0.553, 0.627, 0.796, 1.0], // periwinkle
  [0.906, 0.541, 0.765, 1.0], // pink
  [0.651, 0.847, 0.329, 1.0], // lime
  [1.000, 0.851, 0.184, 1.0], // yellow
  [0.898, 0.769, 0.580, 1.0], // tan
  [0.702, 0.702, 0.702, 1.0], // gray
  [0.471, 0.808, 0.922, 1.0], // sky
  [0.859, 0.439, 0.576, 1.0], // rose
  [0.580, 0.863, 0.541, 1.0], // green
  [0.776, 0.569, 0.894, 1.0], // lavender
  [0.929, 0.682, 0.380, 1.0], // orange
  [0.404, 0.694, 0.820, 1.0], // blue
  [0.816, 0.780, 0.369, 1.0], // olive
  [0.659, 0.471, 0.710, 1.0], // purple
];

export function getPaletteColors(custom?: Float32Array): Float32Array {
  if (custom) return custom;
  const data = new Float32Array(PALETTE.length * 4);
  for (let i = 0; i < PALETTE.length; i++) {
    data[i * 4 + 0] = PALETTE[i][0];
    data[i * 4 + 1] = PALETTE[i][1];
    data[i * 4 + 2] = PALETTE[i][2];
    data[i * 4 + 3] = PALETTE[i][3];
  }
  return data;
}

export function getPaletteSize(): number {
  return PALETTE.length;
}

export function getPaletteColor(index: number): [number, number, number, number] {
  return PALETTE[index % PALETTE.length];
}

export function idToColor(id: number): [number, number, number, number] {
  // Encode ID as RGBA (for GPU picking)
  return [
    ((id >> 0) & 0xFF) / 255,
    ((id >> 8) & 0xFF) / 255,
    ((id >> 16) & 0xFF) / 255,
    1.0,
  ];
}

export function colorToId(r: number, g: number, b: number): number {
  return (r & 0xFF) | ((g & 0xFF) << 8) | ((b & 0xFF) << 16);
}
