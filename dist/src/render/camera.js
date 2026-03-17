import { mat4Ortho } from '../utils/math';
export class Camera {
    center = [0, 0];
    zoom = 1;
    minZoom = 0.0005;
    maxZoom = 50;
    width = 1;
    height = 1;
    projectionDirty = true;
    cachedProjection = new Float32Array(16);
    /** Increments on every camera mutation. Consumers compare against their last-seen version to skip redundant uploads. */
    version = 0;
    resize(width, height) {
        this.width = width;
        this.height = height;
        this.projectionDirty = true;
        this.version++;
    }
    getProjection() {
        if (this.projectionDirty) {
            const hw = (this.width / 2) / this.zoom;
            const hh = (this.height / 2) / this.zoom;
            this.cachedProjection = mat4Ortho(this.center[0] - hw, this.center[0] + hw, this.center[1] - hh, this.center[1] + hh, -1, 1);
            this.projectionDirty = false;
        }
        return this.cachedProjection;
    }
    pan(dx, dy) {
        this.center[0] -= dx / this.zoom;
        this.center[1] += dy / this.zoom;
        this.projectionDirty = true;
        this.version++;
    }
    zoomAt(screenX, screenY, factor) {
        const worldBefore = this.screenToWorld(screenX, screenY);
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
        const worldAfter = this.screenToWorld(screenX, screenY);
        this.center[0] += worldBefore[0] - worldAfter[0];
        this.center[1] += worldBefore[1] - worldAfter[1];
        this.projectionDirty = true;
        this.version++;
    }
    screenToWorld(sx, sy) {
        const wx = this.center[0] + (sx - this.width / 2) / this.zoom;
        const wy = this.center[1] - (sy - this.height / 2) / this.zoom;
        return [wx, wy];
    }
    worldToScreen(wx, wy) {
        const sx = (wx - this.center[0]) * this.zoom + this.width / 2;
        const sy = -(wy - this.center[1]) * this.zoom + this.height / 2;
        return [sx, sy];
    }
    fitBounds(minX, minY, maxX, maxY, padding = 0.1) {
        const minExtent = 100.0;
        const w = Math.max(maxX - minX, minExtent);
        const h = Math.max(maxY - minY, minExtent);
        this.center = [(minX + maxX) / 2, (minY + maxY) / 2];
        const scaleX = this.width / (w * (1 + padding));
        const scaleY = this.height / (h * (1 + padding));
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, Math.min(scaleX, scaleY)));
        this.projectionDirty = true;
        this.version++;
    }
    getViewportWidth() { return this.width; }
    getViewportHeight() { return this.height; }
    invalidate() { this.projectionDirty = true; }
}
