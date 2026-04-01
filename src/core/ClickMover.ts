import { Camera } from './Camera';
import { InputManager } from './InputManager';
import { InputMap } from './InputMap';
import { TileCollider } from '../physics/TileCollider';

export interface ClickMoverOptions {
  cols: number;
  rows: number;
  speed: number;
  radius?: number;
  collider?: TileCollider | null;
}

/**
 * ClickMover — handles click-to-move and keyboard movement for a single entity.
 *
 * Resolves pointer clicks to world coordinates, drives the entity toward the
 * target each frame, and optionally resolves collisions via TileCollider.
 *
 * Usage:
 *   const mover = new ClickMover({ cols, rows, speed: 0.08, collider });
 *   // each frame:
 *   mover.update(dt, input, map, camera, tileW, tileH, originX, originY, canvasW, canvasH);
 *   entity.position.x += mover.velX;
 *   entity.position.y += mover.velY;
 *   entity.velX = mover.velX;
 *   entity.velY = mover.velY;
 */
export class ClickMover {
  velX = 0;
  velY = 0;

  private _target: { x: number; y: number } | null = null;
  private _markerX = 0;
  private _markerY = 0;
  private _markerAlpha = 0;

  readonly cols: number;
  readonly rows: number;
  readonly speed: number;
  readonly radius: number;
  readonly collider: TileCollider | null;

  constructor(opts: ClickMoverOptions) {
    this.cols     = opts.cols;
    this.rows     = opts.rows;
    this.speed    = opts.speed;
    this.radius   = opts.radius ?? 0.3;
    this.collider = opts.collider ?? null;
  }

  get markerX(): number { return this._markerX; }
  get markerY(): number { return this._markerY; }
  get markerAlpha(): number { return this._markerAlpha; }

  /** Clear any pending click target and velocity. Call on scene enter. */
  reset(): void {
    this._target = null;
    this._markerAlpha = 0;
    this.velX = 0;
    this.velY = 0;
  }

  update(
    dt: number,
    input: InputManager,
    map: InputMap,
    camera: Camera,
    tileW: number,
    tileH: number,
    originX: number,
    originY: number,
    canvasW: number,
    canvasH: number,
    entityX: number,
    entityY: number,
  ): void {
    const kbAxis = map.axis('right', 'left', 'down', 'up');
    const hasKb  = kbAxis.x !== 0 || kbAxis.y !== 0;

    if (input.pointer.pressed) {
      const world = camera.screenToWorld(
        input.pointer.x, input.pointer.y,
        canvasW, canvasH, tileW, tileH, originX, originY,
      );
      const tx = Math.max(0.5, Math.min(this.cols - 0.5, world.x));
      const ty = Math.max(0.5, Math.min(this.rows - 0.5, world.y));
      this._target = { x: tx, y: ty };
      this._markerX = tx; this._markerY = ty; this._markerAlpha = 1;
    }

    if (hasKb) this._target = null;
    if (this._markerAlpha > 0) this._markerAlpha = Math.max(0, this._markerAlpha - dt * 1.8);

    let moveX = 0, moveY = 0;

    if (hasKb) {
      const len = Math.hypot(kbAxis.x, kbAxis.y) || 1;
      moveX = kbAxis.x / len * this.speed;
      moveY = kbAxis.y / len * this.speed;
    } else if (this._target) {
      const dx = this._target.x - entityX;
      const dy = this._target.y - entityY;
      const dist = Math.hypot(dx, dy);
      if (dist < this.speed * 1.2) {
        this.velX = 0; this.velY = 0;
        this._target = null;
        return;
      }
      moveX = (dx / dist) * this.speed;
      moveY = (dy / dist) * this.speed;
    }

    if (moveX === 0 && moveY === 0) { this.velX = 0; this.velY = 0; return; }

    if (this.collider) {
      const resolved = this.collider.resolveMove(entityX, entityY, moveX, moveY, this.radius);
      if (this._target && Math.abs(resolved.dx - moveX) + Math.abs(resolved.dy - moveY) > 0.001) {
        this._target = null;
      }
      this.velX = resolved.dx;
      this.velY = resolved.dy;
    } else {
      const nx = Math.max(0.5, Math.min(this.cols - 0.5, entityX + moveX)) - entityX;
      const ny = Math.max(0.5, Math.min(this.rows - 0.5, entityY + moveY)) - entityY;
      this.velX = nx; this.velY = ny;
    }
  }

  /** Draw the animated click marker at the target position. */
  drawMarker(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    tileW: number,
    tileH: number,
    originX: number,
    originY: number,
    ts: number,
  ): void {
    if (this._markerAlpha < 0.01) return;
    const screen = camera.worldToScreen(this._markerX, this._markerY, 0, tileW, tileH, originX, originY);
    const a = this._markerAlpha;
    const t = ts * 0.004;
    ctx.save();
    const ringR = 10 + Math.sin(t * 3) * 2;
    ctx.beginPath(); ctx.arc(screen.sx, screen.sy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180,140,255,${(a * 0.8).toFixed(2)})`; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(screen.sx, screen.sy, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(220,180,255,${a.toFixed(2)})`; ctx.fill();
    ctx.strokeStyle = `rgba(255,220,255,${(a * 0.6).toFixed(2)})`; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(screen.sx - 7, screen.sy); ctx.lineTo(screen.sx + 7, screen.sy);
    ctx.moveTo(screen.sx, screen.sy - 7); ctx.lineTo(screen.sx, screen.sy + 7);
    ctx.stroke();
    ctx.restore();
  }
}
