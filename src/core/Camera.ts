import { IsoObject } from '../elements/IsoObject';
import { unproject } from '../math/IsoProjection';

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

  /** Called each frame before drawing. Lerps toward follow target. */
  update(): void {
    if (this._target) {
      const tx = this._target.position.x;
      const ty = this._target.position.y;
      const t = this.lerpFactor;
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
   */
  applyTransform(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    tileW: number,
    tileH: number,
    originX: number,
    originY: number,
  ): void {
    ctx.save();
    // Translate to the engine's iso origin first
    ctx.translate(originX, originY);
    ctx.scale(this.zoom, this.zoom);
    // Shift so the camera's world position is centred on the origin
    const offsetX = -(this.x - this.y) * (tileW / 2);
    const offsetY = -(this.x + this.y) * (tileH / 2);
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
    wx: number,
    wy: number,
    wz: number,
    tileW: number,
    tileH: number,
    originX: number,
    originY: number,
  ): { sx: number; sy: number } {
    const camOffX = -(this.x - this.y) * (tileW / 2);
    const camOffY = -(this.x + this.y) * (tileH / 2);
    const isoX = (wx - wy) * (tileW / 2);
    const isoY = (wx + wy) * (tileH / 2) - wz;
    return {
      sx: originX + (isoX + camOffX) * this.zoom,
      sy: originY + (isoY + camOffY) * this.zoom,
    };
  }

  /**
   * Convert a canvas pixel position to world coordinates, accounting for
   * the current camera transform (zoom + pan).
   */
  screenToWorld(
    cx: number,
    cy: number,
    canvasW: number,
    canvasH: number,
    tileW: number,
    tileH: number,
    originX: number,
    originY: number,
  ): { x: number; y: number } {
    // Undo the camera transform:
    // 1. subtract origin
    // 2. undo zoom
    // 3. undo camera world offset
    const sx = (cx - originX) / this.zoom;
    const sy = (cy - originY) / this.zoom;
    const camOffX = -(this.x - this.y) * (tileW / 2);
    const camOffY = -(this.x + this.y) * (tileH / 2);
    return unproject(sx - camOffX, sy - camOffY, tileW, tileH);
  }

  private _clamp(): void {
    if (!this._bounds) return;
    this.x = Math.max(this._bounds.minX, Math.min(this._bounds.maxX, this.x));
    this.y = Math.max(this._bounds.minY, Math.min(this._bounds.maxY, this.y));
  }
}
