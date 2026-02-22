import { describe, it, expect } from 'vitest';
import {
  getPaletteColors,
  getPaletteSize,
  getPaletteColor,
  idToColor,
  colorToId,
} from '../../src/utils/color';

describe('Palette', () => {
  it('getPaletteSize returns 16', () => {
    expect(getPaletteSize()).toBe(16);
  });

  it('getPaletteColors returns Float32Array with correct length', () => {
    const colors = getPaletteColors();
    expect(colors).toBeInstanceOf(Float32Array);
    // 16 colors * 4 components (RGBA) = 64
    expect(colors.length).toBe(16 * 4);
  });

  it('getPaletteColor(0) returns valid RGBA tuple', () => {
    const color = getPaletteColor(0);
    expect(color).toHaveLength(4);
    expect(color[3]).toBe(1.0); // alpha is 1
  });

  it('all palette colors have values in [0, 1]', () => {
    const size = getPaletteSize();
    for (let i = 0; i < size; i++) {
      const color = getPaletteColor(i);
      for (let c = 0; c < 4; c++) {
        expect(color[c]).toBeGreaterThanOrEqual(0);
        expect(color[c]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('getPaletteColor wraps around for index > palette size', () => {
    const size = getPaletteSize();
    const color0 = getPaletteColor(0);
    const colorWrapped = getPaletteColor(size);
    expect(colorWrapped).toEqual(color0);
  });

  it('getPaletteColor wraps for large indices', () => {
    const size = getPaletteSize();
    const color3 = getPaletteColor(3);
    const colorWrapped = getPaletteColor(3 + size * 5);
    expect(colorWrapped).toEqual(color3);
  });

  it('getPaletteColors data matches individual getPaletteColor calls', () => {
    const colors = getPaletteColors();
    const size = getPaletteSize();
    for (let i = 0; i < size; i++) {
      const color = getPaletteColor(i);
      expect(colors[i * 4 + 0]).toBeCloseTo(color[0]);
      expect(colors[i * 4 + 1]).toBeCloseTo(color[1]);
      expect(colors[i * 4 + 2]).toBeCloseTo(color[2]);
      expect(colors[i * 4 + 3]).toBeCloseTo(color[3]);
    }
  });

  it('all palette colors have alpha of 1.0', () => {
    const size = getPaletteSize();
    for (let i = 0; i < size; i++) {
      const color = getPaletteColor(i);
      expect(color[3]).toBe(1.0);
    }
  });

  it('palette colors are distinct', () => {
    const size = getPaletteSize();
    const colorStrings = new Set<string>();
    for (let i = 0; i < size; i++) {
      const color = getPaletteColor(i);
      const key = `${color[0]},${color[1]},${color[2]}`;
      colorStrings.add(key);
    }
    expect(colorStrings.size).toBe(size);
  });
});

describe('ID encoding', () => {
  it('idToColor returns RGBA with alpha 1.0', () => {
    const color = idToColor(0);
    expect(color).toHaveLength(4);
    expect(color[3]).toBe(1.0);
  });

  it('idToColor encodes id=0 correctly', () => {
    const color = idToColor(0);
    expect(color[0]).toBe(0);
    expect(color[1]).toBe(0);
    expect(color[2]).toBe(0);
  });

  it('idToColor + colorToId round-trip for id=0', () => {
    const color = idToColor(0);
    const r = Math.round(color[0] * 255);
    const g = Math.round(color[1] * 255);
    const b = Math.round(color[2] * 255);
    expect(colorToId(r, g, b)).toBe(0);
  });

  it('idToColor + colorToId round-trip for id=1', () => {
    const color = idToColor(1);
    const r = Math.round(color[0] * 255);
    const g = Math.round(color[1] * 255);
    const b = Math.round(color[2] * 255);
    expect(colorToId(r, g, b)).toBe(1);
  });

  it('idToColor + colorToId round-trip for id=255', () => {
    const color = idToColor(255);
    const r = Math.round(color[0] * 255);
    const g = Math.round(color[1] * 255);
    const b = Math.round(color[2] * 255);
    expect(colorToId(r, g, b)).toBe(255);
  });

  it('idToColor + colorToId round-trip for id=256', () => {
    const color = idToColor(256);
    const r = Math.round(color[0] * 255);
    const g = Math.round(color[1] * 255);
    const b = Math.round(color[2] * 255);
    expect(colorToId(r, g, b)).toBe(256);
  });

  it('idToColor + colorToId round-trip for id=65535', () => {
    const color = idToColor(65535);
    const r = Math.round(color[0] * 255);
    const g = Math.round(color[1] * 255);
    const b = Math.round(color[2] * 255);
    expect(colorToId(r, g, b)).toBe(65535);
  });

  it('idToColor + colorToId round-trip for id=16777215 (max 24-bit)', () => {
    const color = idToColor(16777215);
    const r = Math.round(color[0] * 255);
    const g = Math.round(color[1] * 255);
    const b = Math.round(color[2] * 255);
    expect(colorToId(r, g, b)).toBe(16777215);
  });

  it('idToColor encodes id=256 in green channel', () => {
    const color = idToColor(256);
    // 256 = 0x100 => R=0, G=1, B=0
    expect(color[0]).toBeCloseTo(0 / 255);
    expect(color[1]).toBeCloseTo(1 / 255);
    expect(color[2]).toBeCloseTo(0 / 255);
  });

  it('idToColor encodes id=65536 in blue channel', () => {
    const color = idToColor(65536);
    // 65536 = 0x10000 => R=0, G=0, B=1
    expect(color[0]).toBeCloseTo(0 / 255);
    expect(color[1]).toBeCloseTo(0 / 255);
    expect(color[2]).toBeCloseTo(1 / 255);
  });

  it('round-trip for many sequential IDs', () => {
    for (let id = 0; id < 1000; id++) {
      const color = idToColor(id);
      const r = Math.round(color[0] * 255);
      const g = Math.round(color[1] * 255);
      const b = Math.round(color[2] * 255);
      expect(colorToId(r, g, b)).toBe(id);
    }
  });
});
