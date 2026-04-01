import { IsoObject } from '../elements/IsoObject';
import { unproject, project } from '../math/IsoProjection';
import type { IsoView } from '../math/IsoProjection';

export interface CameraBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CameraOptions {
  x?: number;
  y?: number;
  zoom?: number;
  /** Lerp factor per frame (0–1). 1 = instant snap, 0.08 = smooth follow. Default 1. */
  lerpFactor?: number;
  bounds?: CameraBounds;
}

export class Camera {
  x: number;
  y: number;
  zoom: number;
  /** Lerp smoothing factor (0–1). Set < 1 for smooth follow. */
  lerpFactor: number;

  private _target: IsoObject | null = null;
  private _bounds: CameraBounds | null = null;

  constructor(opts: CameraOptions = {}) {
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.zoom = opts.zoom ?? 1;
    this.lerpFactor = opts.lerpFactor ?? 1;
    this._bounds = opts.bounds ?? null;
  }

  follow(obj: IsoObject): void {
    this._target = obj;
  }

  unfollow(): void {
    this._target = null;
  }

  setBounds(bounds: CameraBounds): void {
    this._bounds = bounds;
  }

  pan(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this._clamp();
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(0.25, Math.min(4, zoom));
  }

  /**
   * Called each frame before drawing. Lerps toward follow target.
   * `dt` is the frame delta in seconds; pass it for frame-rate-independent
   * smoothing (lerpFactor is treated as the per-60fps factor, so the actual
   * factor is adjusted via `1 - (1-lerpFactor)^(dt*60)`).
   */
  update(dt = 1 / 60): void {
    if (this._target) {
      const tx = this._target.position.x;
      const ty = this._target.position.y;
      // Frame-rate-independent lerp: same convergence speed at any FPS
      const t = this.lerpFactor >= 1 ? 1 : 1 - Math.pow(1 - this.lerpFactor, dt * 60);
      this.x += (tx - this.x) * t;
      this.y += (ty - this.y) * t;
      this._clamp();
    }
  }

  /**
   * Apply camera transform to a canvas context.
   * After this call, draw all scene objects, then call restoreTransform().
   * The transform maps world-space iso coordinates so that the camera's
   * world position appears at the canvas centre.
   *
   * canvasW/canvasH are accepted for API symmetry but the origin is driven
   * by the caller-supplied originX/originY.
   */
  applyTransform(
    ctx: CanvasRenderingContext2D,
    _canvasW: number,
    _canvasH: number,
    tileW: number,
    tileH: number,
    originX: number,
    originY: number,
    view?: IsoView,
  ): void {
    const effTileH = view ? tileW * view.elevation : tileH;
    // For rotated views, the camera offset must account for rotation
    let offsetX: number, offsetY: number;
    if (view && view.rotation !== 0) {
      const rad = (view.rotation * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const rx = this.x * cos - this.y * sin;
      const ry = this.x * sin + this.y * cos;
      offsetX = -(rx - ry) * (tileW / 2);
      offsetY = -(rx + ry) * (effTileH / 2);
    } else {
      offsetX = -(this.x - this.y) * (tileW / 2);
      offsetY = -(this.x + this.y) * (effTileH / 2);
    }
    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(offsetX, offsetY);
  }

  restoreTransform(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  /**
   * Convert a world position to canvas pixel coordinates, accounting for
   * the current camera transform (zoom + pan).
   */
  worldToScreen(
    wx: number, wy: number, wz: number,
    tileW: number, tileH: number,
    originX: number, originY: number,
    view?: IsoView,
  ): { sx: number; sy: number } {
    const p = project(wx, wy, wz, tileW, tileH, view);
    const effTileH = view ? tileW * view.elevation : tileH;
    let camOffX: number, camOffY: number;
    if (view && view.rotation !== 0) {
      const rad = (view.rotation * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const rx = this.x * cos - this.y * sin;
      const ry = this.x * sin + this.y * cos;
      camOffX = -(rx - ry) * (tileW / 2);
      camOffY = -(rx + ry) * (effTileH / 2);
    } else {
      camOffX = -(this.x - this.y) * (tileW / 2);
      camOffY = -(this.x + this.y) * (effTileH / 2);
    }
    return {
      sx: originX + (p.sx + camOffX) * this.zoom,
      sy: originY + (p.sy + camOffY) * this.zoom,
    };
  }

  screenToWorld(
    cx: number, cy: number,
    _canvasW: number, _canvasH: number,
    tileW: number, tileH: number,
    originX: number, originY: number,
    view?: IsoView,
  ): { x: number; y: number } {
    const effTileH = view ? tileW * view.elevation : tileH;
    const sx = (cx - originX) / this.zoom;
    const sy = (cy - originY) / this.zoom;
    let camOffX: number, camOffY: number;
    if (view && view.rotation !== 0) {
      const rad = (view.rotation * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const rx = this.x * cos - this.y * sin;
      const ry = this.x * sin + this.y * cos;
      camOffX = -(rx - ry) * (tileW / 2);
      camOffY = -(rx + ry) * (effTileH / 2);
    } else {
      camOffX = -(this.x - this.y) * (tileW / 2);
      camOffY = -(this.x + this.y) * (effTileH / 2);
    }
    return unproject(sx - camOffX, sy - camOffY, tileW, effTileH, view);
  }

  private _clamp(): void {
    if (!this._bounds) return;
    this.x = Math.max(this._bounds.minX, Math.min(this._bounds.maxX, this.x));
    this.y = Math.max(this._bounds.minY, Math.min(this._bounds.maxY, this.y));
  }
}
