import { mat4Ortho, type Mat4, type Vec2 } from '../utils/math';

export class Camera {
  center: Vec2 = [0, 0];
  zoom = 1;
  readonly minZoom = 0.0005;
  readonly maxZoom = 50;

  private width = 1;
  private height = 1;
  private projectionDirty = true;
  private cachedProjection: Mat4 = new Float32Array(16);

  /** Increments on every camera mutation. Consumers compare against their last-seen version to skip redundant uploads. */
  version = 0;

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.projectionDirty = true;
    this.version++;
  }

  getProjection(): Mat4 {
    if (this.projectionDirty) {
      const hw = (this.width / 2) / this.zoom;
      const hh = (this.height / 2) / this.zoom;
      this.cachedProjection = mat4Ortho(
        this.center[0] - hw, this.center[0] + hw,
        this.center[1] - hh, this.center[1] + hh,
        -1, 1
      );
      this.projectionDirty = false;
    }
    return this.cachedProjection;
  }

  pan(dx: number, dy: number): void {
    this.center[0] -= dx / this.zoom;
    this.center[1] += dy / this.zoom;
    this.projectionDirty = true;
    this.version++;
  }

  zoomAt(screenX: number, screenY: number, factor: number): void {
    const worldBefore = this.screenToWorld(screenX, screenY);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const worldAfter = this.screenToWorld(screenX, screenY);
    this.center[0] += worldBefore[0] - worldAfter[0];
    this.center[1] += worldBefore[1] - worldAfter[1];
    this.projectionDirty = true;
    this.version++;
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    const wx = this.center[0] + (sx - this.width / 2) / this.zoom;
    const wy = this.center[1] - (sy - this.height / 2) / this.zoom;
    return [wx, wy];
  }

  worldToScreen(wx: number, wy: number): Vec2 {
    const sx = (wx - this.center[0]) * this.zoom + this.width / 2;
    const sy = -(wy - this.center[1]) * this.zoom + this.height / 2;
    return [sx, sy];
  }

  fitBounds(minX: number, minY: number, maxX: number, maxY: number, padding = 0.1): void {
    const w = maxX - minX;
    const h = maxY - minY;
    this.center = [(minX + maxX) / 2, (minY + maxY) / 2];
    const scaleX = this.width / (w * (1 + padding));
    const scaleY = this.height / (h * (1 + padding));
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, Math.min(scaleX, scaleY)));
    this.projectionDirty = true;
    this.version++;
  }

  getViewportWidth(): number { return this.width; }
  getViewportHeight(): number { return this.height; }

  invalidate(): void { this.projectionDirty = true; }
}
