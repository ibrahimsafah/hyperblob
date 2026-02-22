import { describe, it, expect, beforeEach } from 'vitest';
import { Camera } from '../../src/render/camera';

describe('Camera', () => {
  let camera: Camera;

  beforeEach(() => {
    camera = new Camera();
  });

  it('has default center at origin', () => {
    expect(camera.center).toEqual([0, 0]);
  });

  it('has default zoom of 1', () => {
    expect(camera.zoom).toBe(1);
  });

  it('has minZoom of 0.0005', () => {
    expect(camera.minZoom).toBe(0.0005);
  });

  it('has maxZoom of 50', () => {
    expect(camera.maxZoom).toBe(50);
  });

  describe('resize', () => {
    it('updates viewport dimensions', () => {
      camera.resize(800, 600);
      expect(camera.getViewportWidth()).toBe(800);
      expect(camera.getViewportHeight()).toBe(600);
    });

    it('invalidates projection cache', () => {
      camera.resize(800, 600);
      const proj1 = camera.getProjection();
      camera.resize(1024, 768);
      const proj2 = camera.getProjection();
      // Different sizes should produce different projections
      let different = false;
      for (let i = 0; i < 16; i++) {
        if (proj1[i] !== proj2[i]) {
          different = true;
          break;
        }
      }
      expect(different).toBe(true);
    });
  });

  describe('getProjection', () => {
    it('returns a Float32Array of length 16', () => {
      camera.resize(800, 600);
      const proj = camera.getProjection();
      expect(proj).toBeInstanceOf(Float32Array);
      expect(proj.length).toBe(16);
    });

    it('returns valid orthographic matrix', () => {
      camera.resize(800, 600);
      camera.center = [0, 0];
      camera.zoom = 1;
      camera.invalidate();

      const proj = camera.getProjection();
      // For center [0,0], zoom 1, viewport 800x600:
      // hw = 400/1 = 400, hh = 300/1 = 300
      // left=-400, right=400, bottom=-300, top=300
      // m[0] = 2/800 = 0.0025
      // m[5] = 2/600 ~ 0.00333
      expect(proj[0]).toBeCloseTo(2 / 800);
      expect(proj[5]).toBeCloseTo(2 / 600);
      expect(proj[15]).toBe(1);
    });

    it('caches projection when not dirty', () => {
      camera.resize(800, 600);
      const proj1 = camera.getProjection();
      const proj2 = camera.getProjection();
      // Should return the same reference (cached)
      expect(proj1).toBe(proj2);
    });
  });

  describe('pan', () => {
    it('moves center correctly', () => {
      camera.resize(800, 600);
      camera.center = [0, 0];
      camera.zoom = 1;

      camera.pan(100, 0);
      // pan subtracts dx/zoom from center[0]
      expect(camera.center[0]).toBeCloseTo(-100);
      expect(camera.center[1]).toBeCloseTo(0);
    });

    it('accounts for zoom level in pan', () => {
      camera.resize(800, 600);
      camera.center = [0, 0];
      camera.zoom = 2;

      camera.pan(100, 0);
      // dx / zoom = 100 / 2 = 50
      expect(camera.center[0]).toBeCloseTo(-50);
    });

    it('pan in y direction moves center[1] positively', () => {
      camera.resize(800, 600);
      camera.center = [0, 0];
      camera.zoom = 1;

      camera.pan(0, 100);
      // pan adds dy/zoom to center[1]
      expect(camera.center[1]).toBeCloseTo(100);
    });

    it('pan invalidates projection', () => {
      camera.resize(800, 600);
      const proj1 = camera.getProjection();
      camera.pan(50, 50);
      const proj2 = camera.getProjection();
      // Translation elements should differ
      expect(proj1[12]).not.toBe(proj2[12]);
    });
  });

  describe('screenToWorld and worldToScreen', () => {
    it('round-trip at viewport center', () => {
      camera.resize(800, 600);
      camera.center = [0, 0];
      camera.zoom = 1;

      // Screen center (400, 300) should map to world origin
      const world = camera.screenToWorld(400, 300);
      expect(world[0]).toBeCloseTo(0);
      expect(world[1]).toBeCloseTo(0);

      const screen = camera.worldToScreen(0, 0);
      expect(screen[0]).toBeCloseTo(400);
      expect(screen[1]).toBeCloseTo(300);
    });

    it('round-trip at arbitrary point', () => {
      camera.resize(800, 600);
      camera.center = [10, 20];
      camera.zoom = 2;

      const world = camera.screenToWorld(500, 200);
      const screen = camera.worldToScreen(world[0], world[1]);
      expect(screen[0]).toBeCloseTo(500, 3);
      expect(screen[1]).toBeCloseTo(200, 3);
    });

    it('round-trip with different zoom and center', () => {
      camera.resize(1920, 1080);
      camera.center = [-50, 75];
      camera.zoom = 0.5;

      const sx = 123, sy = 456;
      const world = camera.screenToWorld(sx, sy);
      const screen = camera.worldToScreen(world[0], world[1]);
      expect(screen[0]).toBeCloseTo(sx, 3);
      expect(screen[1]).toBeCloseTo(sy, 3);
    });

    it('screenToWorld converts top-left corner correctly', () => {
      camera.resize(800, 600);
      camera.center = [0, 0];
      camera.zoom = 1;

      const world = camera.screenToWorld(0, 0);
      // wx = 0 + (0 - 400) / 1 = -400
      // wy = 0 - (0 - 300) / 1 = 300
      expect(world[0]).toBeCloseTo(-400);
      expect(world[1]).toBeCloseTo(300);
    });
  });

  describe('zoomAt', () => {
    it('preserves world point under cursor', () => {
      camera.resize(800, 600);
      camera.center = [0, 0];
      camera.zoom = 1;

      const sx = 200, sy = 150;
      const worldBefore = camera.screenToWorld(sx, sy);
      camera.zoomAt(sx, sy, 2);
      const worldAfter = camera.screenToWorld(sx, sy);

      expect(worldAfter[0]).toBeCloseTo(worldBefore[0], 3);
      expect(worldAfter[1]).toBeCloseTo(worldBefore[1], 3);
    });

    it('increases zoom when factor > 1', () => {
      camera.zoom = 1;
      camera.resize(800, 600);
      camera.zoomAt(400, 300, 2);
      expect(camera.zoom).toBe(2);
    });

    it('decreases zoom when factor < 1', () => {
      camera.zoom = 2;
      camera.resize(800, 600);
      camera.zoomAt(400, 300, 0.5);
      expect(camera.zoom).toBe(1);
    });

    it('clamps zoom to maxZoom', () => {
      camera.zoom = 40;
      camera.resize(800, 600);
      camera.zoomAt(400, 300, 2);
      expect(camera.zoom).toBe(camera.maxZoom);
    });

    it('clamps zoom to minZoom', () => {
      camera.zoom = 0.001;
      camera.resize(800, 600);
      camera.zoomAt(400, 300, 0.1);
      expect(camera.zoom).toBe(camera.minZoom);
    });
  });

  describe('fitBounds', () => {
    it('centers camera on bounds center', () => {
      camera.resize(800, 600);
      camera.fitBounds(-100, -50, 100, 50);
      expect(camera.center[0]).toBeCloseTo(0);
      expect(camera.center[1]).toBeCloseTo(0);
    });

    it('centers camera on offset bounds', () => {
      camera.resize(800, 600);
      camera.fitBounds(10, 20, 110, 120);
      expect(camera.center[0]).toBeCloseTo(60);
      expect(camera.center[1]).toBeCloseTo(70);
    });

    it('sets zoom to fit bounds with default padding', () => {
      camera.resize(800, 600);
      camera.fitBounds(-100, -100, 100, 100);
      // w=200, h=200, padding=0.1
      // scaleX = 800 / (200 * 1.1) = 800/220 ~ 3.636
      // scaleY = 600 / (200 * 1.1) = 600/220 ~ 2.727
      // zoom = min(scaleX, scaleY) = ~2.727
      const expectedZoom = 600 / (200 * 1.1);
      expect(camera.zoom).toBeCloseTo(expectedZoom, 2);
    });

    it('respects custom padding', () => {
      camera.resize(800, 600);
      camera.fitBounds(-100, -100, 100, 100, 0.5);
      // w=200, h=200, padding=0.5
      // scaleX = 800 / (200 * 1.5) = 800/300 ~ 2.667
      // scaleY = 600 / (200 * 1.5) = 600/300 = 2.0
      // zoom = min(scaleX, scaleY) = 2.0
      const expectedZoom = 600 / (200 * 1.5);
      expect(camera.zoom).toBeCloseTo(expectedZoom, 2);
    });

    it('clamps zoom within min/max', () => {
      camera.resize(800, 600);
      // Very large bounds should produce small zoom, but not below minZoom
      camera.fitBounds(-1000000, -1000000, 1000000, 1000000);
      expect(camera.zoom).toBeGreaterThanOrEqual(camera.minZoom);
      expect(camera.zoom).toBeLessThanOrEqual(camera.maxZoom);
    });
  });
});
