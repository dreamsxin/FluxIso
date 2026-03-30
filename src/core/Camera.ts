import { IsoObject } from '../elements/IsoObject';

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
  bounds?: CameraBounds;
}

export class Camera {
  x: number;
  y: number;
  zoom: number;
  private _target: IsoObject | null = null;
  private _bounds: CameraBounds | null = null;

  constructor(opts: CameraOptions = {}) {
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.zoom = opts.zoom ?? 1;
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

  /** Called each frame before drawing */
  update(): void {
    if (this._target) {
      this.x = this._target.position.x;
      this.y = this._target.position.y;
      this._clamp();
    }
  }

  /** Apply camera transform to a canvas context */
  applyTransform(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    tileW: number,
    tileH: number,
  ): void {
    ctx.save();
    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.scale(this.zoom, this.zoom);
    // Offset by world position (isometric projection of camera center)
    const offsetX = -(this.x - this.y) * (tileW / 2);
    const offsetY = -(this.x + this.y) * (tileH / 2);
    ctx.translate(offsetX, offsetY);
  }

  restoreTransform(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  private _clamp(): void {
    if (!this._bounds) return;
    this.x = Math.max(this._bounds.minX, Math.min(this._bounds.maxX, this.x));
    this.y = Math.max(this._bounds.minY, Math.min(this._bounds.maxY, this.y));
  }
}
