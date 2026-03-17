import { type Mat4, type Vec2 } from '../utils/math';
export declare class Camera {
    center: Vec2;
    zoom: number;
    readonly minZoom = 0.0005;
    readonly maxZoom = 50;
    private width;
    private height;
    private projectionDirty;
    private cachedProjection;
    /** Increments on every camera mutation. Consumers compare against their last-seen version to skip redundant uploads. */
    version: number;
    resize(width: number, height: number): void;
    getProjection(): Mat4;
    pan(dx: number, dy: number): void;
    zoomAt(screenX: number, screenY: number, factor: number): void;
    screenToWorld(sx: number, sy: number): Vec2;
    worldToScreen(wx: number, wy: number): Vec2;
    fitBounds(minX: number, minY: number, maxX: number, maxY: number, padding?: number): void;
    getViewportWidth(): number;
    getViewportHeight(): number;
    invalidate(): void;
}
