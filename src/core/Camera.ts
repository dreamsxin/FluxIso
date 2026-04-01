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
    const rot  = view?.rotation  ?? 0;
    const elev = view?.elevation ?? 0.5;
    // Standard camera offset (no rotation — rotation is applied via canvas transform)
    const offsetX = -(this.x - this.y) * (tileW / 2);
    const offsetY = -(this.x + this.y) * (tileH / 2);

    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(this.zoom, this.zoom);

    if (rot !== 0 || elev !== 0.5) {
      // Decompose the iso view into a 2×2 canvas transform matrix.
      //
      // Standard iso maps world (x,y) → screen (sx,sy):
      //   sx = (x - y) * tileW/2
      //   sy = (x + y) * tileH/2
      //
      // With rotation θ and elevation e (tileH = tileW * e):
      //   rx = x*cosθ - y*sinθ,  ry = x*sinθ + y*cosθ
      //   sx' = (rx - ry) * tileW/2
      //   sy' = (rx + ry) * tileW*e/2
      //
      // Expanding in terms of original (sx, sy) where tileH = tileW*0.5:
      //   sx = (x-y)*tileW/2,  sy = (x+y)*tileW*0.5/2
      //   x-y = sx/(tileW/2),  x+y = sy/(tileW*0.5/2)
      //
      // The resulting 2×2 matrix M such that [sx',sy'] = M * [sx,sy]:
      const rad = (rot * Math.PI) / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      const r = elev / 0.5; // elevation scale relative to standard
      // M = [[c, s/r], [-s*r, c]]  (derived from the projection equations)
      ctx.transform(c, -s * r, s / r, c, 0, 0);
    }

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
    // Standard projection (no view rotation — that's handled by canvas transform)
    const isoX = (wx - wy) * (tileW / 2);
    const isoY = (wx + wy) * (tileH / 2) - wz;
    const camOffX = -(this.x - this.y) * (tileW / 2);
    const camOffY = -(this.x + this.y) * (tileH / 2);
    let sx = isoX + camOffX;
    let sy = isoY + camOffY;

    // Apply view matrix
    if (view && (view.rotation !== 0 || view.elevation !== 0.5)) {
      const rad = (view.rotation * Math.PI) / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      const r = view.elevation / 0.5;
      const nx = c * sx + (s / r) * sy;
      const ny = (-s * r) * sx + c * sy;
      sx = nx; sy = ny;
    }

    return {
      sx: originX + sx * this.zoom,
      sy: originY + sy * this.zoom,
    };
  }

  screenToWorld(
    cx: number, cy: number,
    _canvasW: number, _canvasH: number,
    tileW: number, tileH: number,
    originX: number, originY: number,
    view?: IsoView,
  ): { x: number; y: number } {
    let sx = (cx - originX) / this.zoom;
    let sy = (cy - originY) / this.zoom;

    // Undo view matrix
    if (view && (view.rotation !== 0 || view.elevation !== 0.5)) {
      const rad = (view.rotation * Math.PI) / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      const r = view.elevation / 0.5;
      // Inverse of [[c, s/r], [-s*r, c]] = [[c, -s/r], [s*r, c]] (det=1)
      const nx = c * sx - (s / r) * sy;
      const ny = (s * r) * sx + c * sy;
      sx = nx; sy = ny;
    }

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
