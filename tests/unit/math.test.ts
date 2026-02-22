import { describe, it, expect } from 'vitest';
import {
  vec2Add,
  vec2Sub,
  vec2Scale,
  vec2Length,
  vec2Normalize,
  vec2Dot,
  vec2Cross,
  vec2Lerp,
  vec2Distance,
  mat4Identity,
  mat4Ortho,
  mat4Multiply,
  mat4Inverse,
} from '../../src/utils/math';

describe('Vec2 operations', () => {
  it('vec2Add adds component-wise', () => {
    expect(vec2Add([1, 2], [3, 4])).toEqual([4, 6]);
  });

  it('vec2Sub subtracts component-wise', () => {
    expect(vec2Sub([5, 3], [2, 1])).toEqual([3, 2]);
  });

  it('vec2Scale multiplies by scalar', () => {
    expect(vec2Scale([2, 3], 2)).toEqual([4, 6]);
  });

  it('vec2Length computes Euclidean length', () => {
    expect(vec2Length([3, 4])).toBe(5);
  });

  it('vec2Length of zero vector is 0', () => {
    expect(vec2Length([0, 0])).toBe(0);
  });

  it('vec2Normalize returns unit vector', () => {
    const result = vec2Normalize([3, 4]);
    expect(result[0]).toBeCloseTo(0.6);
    expect(result[1]).toBeCloseTo(0.8);
  });

  it('vec2Normalize of zero vector returns [0, 0]', () => {
    expect(vec2Normalize([0, 0])).toEqual([0, 0]);
  });

  it('vec2Normalize of near-zero vector returns [0, 0]', () => {
    expect(vec2Normalize([1e-12, 1e-12])).toEqual([0, 0]);
  });

  it('vec2Dot computes dot product', () => {
    expect(vec2Dot([1, 2], [3, 4])).toBe(11);
  });

  it('vec2Dot of perpendicular vectors is 0', () => {
    expect(vec2Dot([1, 0], [0, 1])).toBe(0);
  });

  it('vec2Cross computes 2D cross product', () => {
    expect(vec2Cross([1, 0], [0, 1])).toBe(1);
  });

  it('vec2Cross of parallel vectors is 0', () => {
    expect(vec2Cross([2, 3], [4, 6])).toBe(0);
  });

  it('vec2Lerp interpolates at t=0', () => {
    expect(vec2Lerp([0, 0], [10, 20], 0)).toEqual([0, 0]);
  });

  it('vec2Lerp interpolates at t=1', () => {
    expect(vec2Lerp([0, 0], [10, 20], 1)).toEqual([10, 20]);
  });

  it('vec2Lerp interpolates at t=0.5', () => {
    expect(vec2Lerp([0, 0], [10, 20], 0.5)).toEqual([5, 10]);
  });

  it('vec2Distance computes Euclidean distance', () => {
    expect(vec2Distance([0, 0], [3, 4])).toBe(5);
  });

  it('vec2Distance between same point is 0', () => {
    expect(vec2Distance([7, 11], [7, 11])).toBe(0);
  });

  it('vec2Add with negative values', () => {
    expect(vec2Add([-1, -2], [3, 4])).toEqual([2, 2]);
  });

  it('vec2Scale with zero', () => {
    expect(vec2Scale([5, 10], 0)).toEqual([0, 0]);
  });

  it('vec2Scale with negative scalar', () => {
    expect(vec2Scale([2, 3], -1)).toEqual([-2, -3]);
  });
});

describe('Mat4 operations', () => {
  it('mat4Identity returns identity matrix', () => {
    const m = mat4Identity();
    expect(m).toBeInstanceOf(Float32Array);
    expect(m.length).toBe(16);
    // Diagonal should be 1
    expect(m[0]).toBe(1);
    expect(m[5]).toBe(1);
    expect(m[10]).toBe(1);
    expect(m[15]).toBe(1);
    // Off-diagonal should be 0
    expect(m[1]).toBe(0);
    expect(m[2]).toBe(0);
    expect(m[3]).toBe(0);
    expect(m[4]).toBe(0);
    expect(m[6]).toBe(0);
    expect(m[7]).toBe(0);
    expect(m[8]).toBe(0);
    expect(m[9]).toBe(0);
    expect(m[11]).toBe(0);
    expect(m[12]).toBe(0);
    expect(m[13]).toBe(0);
    expect(m[14]).toBe(0);
  });

  it('mat4Ortho produces correct NDC mapping', () => {
    // Standard orthographic: left=-1, right=1, bottom=-1, top=1, near=-1, far=1
    const m = mat4Ortho(-1, 1, -1, 1, -1, 1);
    // For this symmetric case, it should be identity-like
    expect(m[0]).toBeCloseTo(1);   // 2 / (right - left) = 2/2 = 1
    expect(m[5]).toBeCloseTo(1);   // 2 / (top - bottom) = 2/2 = 1
    expect(m[10]).toBeCloseTo(-1); // -2 / (far - near) = -2/2 = -1
    expect(m[12]).toBeCloseTo(0);  // -(right + left) / (right - left) = 0
    expect(m[13]).toBeCloseTo(0);  // -(top + bottom) / (top - bottom) = 0
    expect(m[14]).toBeCloseTo(0);  // -(far + near) / (far - near) = 0
    expect(m[15]).toBeCloseTo(1);
  });

  it('mat4Ortho maps asymmetric bounds correctly', () => {
    const m = mat4Ortho(0, 800, 0, 600, -1, 1);
    // m[0] = 2/800 = 0.0025
    expect(m[0]).toBeCloseTo(2 / 800);
    // m[5] = 2/600
    expect(m[5]).toBeCloseTo(2 / 600);
    // m[12] = -(800) / 800 = -1
    expect(m[12]).toBeCloseTo(-1);
    // m[13] = -(600) / 600 = -1
    expect(m[13]).toBeCloseTo(-1);
  });

  it('mat4Multiply with identity returns same matrix', () => {
    const identity = mat4Identity();
    const m = mat4Ortho(-100, 100, -75, 75, -1, 1);
    const result = mat4Multiply(m, identity);
    for (let i = 0; i < 16; i++) {
      expect(result[i]).toBeCloseTo(m[i], 5);
    }
  });

  it('mat4Multiply identity * M = M', () => {
    const identity = mat4Identity();
    const m = mat4Ortho(-50, 50, -50, 50, 0, 100);
    const result = mat4Multiply(identity, m);
    for (let i = 0; i < 16; i++) {
      expect(result[i]).toBeCloseTo(m[i], 5);
    }
  });

  it('mat4Inverse of identity is identity', () => {
    const identity = mat4Identity();
    const inv = mat4Inverse(identity);
    expect(inv).not.toBeNull();
    for (let i = 0; i < 16; i++) {
      expect(inv![i]).toBeCloseTo(identity[i], 5);
    }
  });

  it('mat4Inverse round-trips correctly', () => {
    const m = mat4Ortho(-400, 400, -300, 300, -1, 1);
    const inv = mat4Inverse(m);
    expect(inv).not.toBeNull();
    const product = mat4Multiply(m, inv!);
    const identity = mat4Identity();
    for (let i = 0; i < 16; i++) {
      expect(product[i]).toBeCloseTo(identity[i], 4);
    }
  });

  it('mat4Inverse of singular matrix returns null', () => {
    // All zeros is singular
    const singular = new Float32Array(16);
    const inv = mat4Inverse(singular);
    expect(inv).toBeNull();
  });

  it('mat4Multiply is associative: (A*B)*C = A*(B*C)', () => {
    const a = mat4Ortho(-10, 10, -10, 10, -1, 1);
    const b = mat4Ortho(-5, 5, -5, 5, -1, 1);
    const c = mat4Identity();
    c[12] = 3; // add a translation

    const ab = mat4Multiply(a, b);
    const ab_c = mat4Multiply(ab, c);
    const bc = mat4Multiply(b, c);
    const a_bc = mat4Multiply(a, bc);

    for (let i = 0; i < 16; i++) {
      expect(ab_c[i]).toBeCloseTo(a_bc[i], 4);
    }
  });
});
