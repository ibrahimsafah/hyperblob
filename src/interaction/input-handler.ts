import type { Camera } from '../render/camera';

export interface NodeDragCallbacks {
  hitTest(worldX: number, worldY: number): number | null;
  onDragStart(nodeIndex: number): void;
  onDrag(nodeIndex: number, worldX: number, worldY: number): void;
  onDragEnd(nodeIndex: number): void;
  onClick?(nodeIndex: number | null): void;
  onHoverNode?(nodeIndex: number | null, screenX: number, screenY: number): void;
  hitTestEdge?(worldX: number, worldY: number): number | null;
  onHoverEdge?(edgeIndex: number | null, screenX: number, screenY: number): void;
}

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private camera: Camera;
  private dragging = false;
  private draggedNode: number | null = null;
  private nodeDrag: NodeDragCallbacks | null;
  private mousedownPos: { x: number; y: number } | null = null;
  private mousedownNodeIndex: number | null = null;
  private lastTouchDist = 0;
  private lastTouchCenter: [number, number] = [0, 0];
  private boundHandlers: Array<[string, EventListener, EventListenerOptions?]> = [];

  constructor(canvas: HTMLCanvasElement, camera: Camera, nodeDrag?: NodeDragCallbacks) {
    this.canvas = canvas;
    this.camera = camera;
    this.nodeDrag = nodeDrag ?? null;
    this.attachListeners();
  }

  private attachListeners(): void {
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions
    ) => {
      const wrapped = handler as EventListener;
      this.canvas.addEventListener(type, wrapped, opts);
      this.boundHandlers.push([type, wrapped, opts]);
    };

    // Mouse drag to pan (or drag node)
    on('mousedown', (e: MouseEvent) => {
      if (e.button === 0) {
        this.mousedownPos = { x: e.offsetX, y: e.offsetY };
        // Try node hit test first
        if (this.nodeDrag) {
          const dpr = window.devicePixelRatio || 1;
          const [wx, wy] = this.camera.screenToWorld(e.offsetX * dpr, e.offsetY * dpr);
          const nodeIndex = this.nodeDrag.hitTest(wx, wy);
          if (nodeIndex !== null) {
            this.draggedNode = nodeIndex;
            this.mousedownNodeIndex = nodeIndex;
            this.nodeDrag.onDragStart(nodeIndex);
            this.canvas.style.cursor = 'grabbing';
            return;
          }
        }
        this.mousedownNodeIndex = null;
        this.dragging = true;
      }
    });

    on('mousemove', (e: MouseEvent) => {
      if (this.draggedNode !== null && this.nodeDrag) {
        const dpr = window.devicePixelRatio || 1;
        const [wx, wy] = this.camera.screenToWorld(e.offsetX * dpr, e.offsetY * dpr);
        this.nodeDrag.onDrag(this.draggedNode, wx, wy);
      } else if (this.dragging) {
        const dpr = window.devicePixelRatio || 1;
        this.camera.pan(e.movementX * dpr, e.movementY * dpr);
      } else if (this.nodeDrag) {
        // Hover cursor feedback
        const dpr = window.devicePixelRatio || 1;
        const [wx, wy] = this.camera.screenToWorld(e.offsetX * dpr, e.offsetY * dpr);
        const nodeIndex = this.nodeDrag.hitTest(wx, wy);
        if (nodeIndex !== null) {
          this.canvas.style.cursor = 'grab';
          this.nodeDrag.onHoverNode?.(nodeIndex, e.offsetX, e.offsetY);
          this.nodeDrag.onHoverEdge?.(null, e.offsetX, e.offsetY);
        } else {
          this.nodeDrag.onHoverNode?.(null, e.offsetX, e.offsetY);
          // No node hit — try edge hull hit test
          const edgeIndex = this.nodeDrag.hitTestEdge?.(wx, wy) ?? null;
          this.canvas.style.cursor = edgeIndex !== null ? 'pointer' : '';
          this.nodeDrag.onHoverEdge?.(edgeIndex, e.offsetX, e.offsetY);
        }
      }
    });

    on('mouseup', (e: MouseEvent) => {
      // Detect click vs drag: if mouse moved < 4px, it's a click
      const isClick = this.mousedownPos !== null &&
        Math.abs(e.offsetX - this.mousedownPos.x) < 4 &&
        Math.abs(e.offsetY - this.mousedownPos.y) < 4;

      if (this.draggedNode !== null && this.nodeDrag) {
        this.nodeDrag.onDragEnd(this.draggedNode);
        if (isClick) {
          this.nodeDrag.onClick?.(this.mousedownNodeIndex);
        }
        this.draggedNode = null;
        this.canvas.style.cursor = '';
      } else if (isClick && this.nodeDrag) {
        // Clicked empty space
        this.nodeDrag.onClick?.(null);
      }
      this.dragging = false;
      this.mousedownPos = null;
      this.mousedownNodeIndex = null;
    });

    on('mouseleave', () => {
      if (this.draggedNode !== null && this.nodeDrag) {
        this.nodeDrag.onDragEnd(this.draggedNode);
        this.draggedNode = null;
        this.canvas.style.cursor = '';
      }
      this.nodeDrag?.onHoverEdge?.(null, 0, 0);
      this.dragging = false;
    });

    // Wheel to zoom
    on('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const dpr = window.devicePixelRatio || 1;
      this.camera.zoomAt(e.offsetX * dpr, e.offsetY * dpr, factor);
    }, { passive: false });

    // Touch: single-touch pan, pinch-to-zoom
    on('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        this.dragging = true;
        this.lastTouchCenter = [e.touches[0].clientX, e.touches[0].clientY];
      } else if (e.touches.length === 2) {
        this.dragging = false;
        this.lastTouchDist = this.touchDistance(e.touches[0], e.touches[1]);
        this.lastTouchCenter = this.touchCenter(e.touches[0], e.touches[1]);
      }
    }, { passive: false });

    on('touchmove', (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && this.dragging) {
        const dx = e.touches[0].clientX - this.lastTouchCenter[0];
        const dy = e.touches[0].clientY - this.lastTouchCenter[1];
        const dpr = window.devicePixelRatio || 1;
        this.camera.pan(dx * dpr, dy * dpr);
        this.lastTouchCenter = [e.touches[0].clientX, e.touches[0].clientY];
      } else if (e.touches.length === 2) {
        const dist = this.touchDistance(e.touches[0], e.touches[1]);
        const center = this.touchCenter(e.touches[0], e.touches[1]);
        const rect = this.canvas.getBoundingClientRect();

        if (this.lastTouchDist > 0) {
          const factor = dist / this.lastTouchDist;
          const dpr = window.devicePixelRatio || 1;
          const sx = (center[0] - rect.left) * dpr;
          const sy = (center[1] - rect.top) * dpr;
          this.camera.zoomAt(sx, sy, factor);
        }

        // Also pan with two-finger drag
        const dprP = window.devicePixelRatio || 1;
        const dx = center[0] - this.lastTouchCenter[0];
        const dy = center[1] - this.lastTouchCenter[1];
        this.camera.pan(dx * dprP, dy * dprP);

        this.lastTouchDist = dist;
        this.lastTouchCenter = center;
      }
    }, { passive: false });

    on('touchend', (e: TouchEvent) => {
      if (e.touches.length === 0) {
        this.dragging = false;
        this.lastTouchDist = 0;
      } else if (e.touches.length === 1) {
        this.dragging = true;
        this.lastTouchCenter = [e.touches[0].clientX, e.touches[0].clientY];
        this.lastTouchDist = 0;
      }
    });
  }

  private touchDistance(a: Touch, b: Touch): number {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private touchCenter(a: Touch, b: Touch): [number, number] {
    return [(a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2];
  }

  dispose(): void {
    for (const [type, handler, opts] of this.boundHandlers) {
      this.canvas.removeEventListener(type, handler, opts);
    }
    this.boundHandlers = [];
  }
}
