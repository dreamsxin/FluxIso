import { project } from '../math/IsoProjection';
import { AABB } from '../math/depthSort';
import { DrawContext } from './IsoObject';
import { SpriteSheet } from '../animation/SpriteSheet';
import { AnimationController } from '../animation/AnimationController';
import { TileCollider } from '../physics/TileCollider';
import { Pathfinder, IsoVec2 } from '../physics/Pathfinder';
import { shiftColor } from '../math/color';
import { Entity } from '../ecs/Entity';
import { AnimationComponent } from '../ecs/components/AnimationComponent';

export interface CharacterOptions {
  id: string;
  x: number;
  y: number;
  z?: number;
  /** Visual radius in pixels (used for sphere fallback rendering). */
  radius?: number;
  color?: string;
  /** Optional sprite sheet for animated rendering. */
  spriteSheet?: SpriteSheet;
  /** Movement speed in world units per second (default 2.4). */
  speed?: number;
}

/**
 * Character — a specialized Entity for controllable or NPC characters.
 * Supports pathfinding, collision, and 8-direction sprite animation.
 */
export class Character extends Entity {
  radius: number;
  color: string;
  speed: number;

  private _target: { x: number; y: number; z: number } | null = null;
  /** Remaining path waypoints when following a multi-step path. */
  private _waypoints: IsoVec2[] = [];
  private _prevX: number;
  private _prevY: number;

  private _anim: AnimationComponent | null = null;
  private _lastFrameTime = 0;

  constructor(opts: CharacterOptions) {
    super(opts.id, opts.x, opts.y, opts.z ?? 0);
    this.radius = opts.radius ?? 22;
    this.color = opts.color ?? '#5590cc';
    this.speed = opts.speed ?? 2.4;
    this._prevX = opts.x;
    this._prevY = opts.y;
    this._lastFrameTime = 0;

    if (opts.spriteSheet) {
      this.setSpriteSheet(opts.spriteSheet);
    }
  }

  /** Current animation controller (read-only). */
  get anim(): AnimationController | null {
    return this._anim?.controller ?? null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Attach a sprite sheet and start animation. */
  setSpriteSheet(sheet: SpriteSheet, initialClip = 'idle'): void {
    this.removeComponent('animation');
    this._anim = this.addComponent(new AnimationComponent({
      spriteSheet: sheet,
      initialClip,
      autoUpdateDirection: true,
    }));
  }

  /**
   * Switch to named animation clip.
   * No-op if no sprite sheet is attached or clip doesn't exist.
   */
  playAnimation(name: string): void {
    if (!this._anim) return;
    if (!this._anim.controller.spriteSheet.hasClip(name)) return;
    this._anim.play(name);
  }

  /** Begin smooth movement toward world position (x, y, z). No pathfinding. */
  moveTo(x: number, y: number, z = this.position.z): void {
    this._waypoints = [];
    this._target = { x, y, z };
  }

  /**
   * Use A* to find a path to (tx, ty) on the supplied collider and begin
   * following it. Returns `true` if a path was found, `false` if unreachable.
   *
   * Falls back to a direct `moveTo` when `collider` is null/undefined.
   */
  pathTo(tx: number, ty: number, collider: TileCollider | null | undefined, tz = this.position.z): boolean {
    if (!collider) {
      this.moveTo(tx, ty, tz);
      return true;
    }
    const path = Pathfinder.find(collider, this.position, { x: tx, y: ty });
    if (!path) return false;
    this._followWaypoints(path, tz);
    return true;
  }

  /**
   * Follow a pre-computed array of world-space waypoints.
   * Each waypoint is consumed in order; the character stops at the last one.
   */
  followPath(waypoints: IsoVec2[], z = this.position.z): void {
    this._followWaypoints(waypoints, z);
  }

  /** Cancel any in-progress movement. */
  stopMoving(): void {
    this._target = null;
    this._waypoints = [];
  }

  get isMoving(): boolean {
    return this._target !== null;
  }

  /** Remaining waypoints on the current path (read-only). */
  get remainingWaypoints(): readonly IsoVec2[] {
    return this._waypoints;
  }

  // ── AABB ──────────────────────────────────────────────────────────────────

  get aabb(): AABB {
    const r = 0.5;
    return {
      minX: this.position.x - r,
      minY: this.position.y - r,
      maxX: this.position.x + r,
      maxY: this.position.y + r,
      baseZ: this.position.z,
    };
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  update(ts?: number, collider?: TileCollider | null): void {
    super.update(ts); // drive components

    const now = ts ?? performance.now();
    const dt = this._lastFrameTime === 0 ? 0.016 : Math.min((now - this._lastFrameTime) / 1000, 0.1);
    this._lastFrameTime = now;

    this._prevX = this.position.x;
    this._prevY = this.position.y;

    if (this._target) {
      const dx = this._target.x - this.position.x;
      const dy = this._target.y - this.position.y;
      const dz = this._target.z - this.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const step = this.speed * dt;

      if (dist < step) {
        // Arrived at current waypoint
        const r = 0.4;
        if (!collider || collider.canOccupy(
          this._target.x - r, this._target.y - r,
          this._target.x + r, this._target.y + r,
        )) {
          this.position.x = this._target.x;
          this.position.y = this._target.y;
          this.position.z = this._target.z;
        }

        // Advance to next waypoint or stop
        const next = this._waypoints.shift();
        this._target = next ? { x: next.x, y: next.y, z: this._target.z } : null;
      } else {
        const stepDx = (dx / dist) * step;
        const stepDy = (dy / dist) * step;

        if (collider) {
          const resolved = collider.resolveMove(
            this.position.x, this.position.y, stepDx, stepDy,
          );
          if (resolved.dx === 0 && resolved.dy === 0) {
            // Fully blocked — drop target and remaining path
            this._target = null;
            this._waypoints = [];
          } else {
            this.position.x += resolved.dx;
            this.position.y += resolved.dy;
          }
        } else {
          this.position.x += stepDx;
          this.position.y += stepDy;
        }
        this.position.z += (dz / dist) * step;
      }
    }

    // Drive animation state (walk/idle)
    if (this._anim) {
      const moveDx = this.position.x - this._prevX;
      const moveDy = this.position.y - this._prevY;
      const moving = Math.hypot(moveDx, moveDy) > 0.0005;

      const ctrl = this._anim.controller;
      if (moving) {
        if (ctrl.currentClip.name !== 'walk' && ctrl.spriteSheet.hasClip('walk')) {
          ctrl.play('walk');
        }
      } else if (ctrl.currentClip.name === 'walk') {
        if (ctrl.spriteSheet.hasClip('idle')) ctrl.play('idle');
      }
    }
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY, omniLights } = dc;
    const { x, y, z } = this.position;

    const { sx, sy } = project(x, y, z, tileW, tileH);
    const bx = originX + sx;
    const by = originY + sy;

    const groundProj = project(x, y, 0, tileW, tileH);
    const gx = originX + groundProj.sx;
    const gy = originY + groundProj.sy;

    // Resolve primary light for shading
    const light = omniLights[0] ?? null;
    let lx = bx - 60;
    let ly = by - 80;
    if (light) {
      const lp = project(light.position.x, light.position.y, 0, tileW, tileH);
      lx = originX + lp.sx;
      ly = originY + lp.sy - light.position.z;
    }

    this.drawShadow(ctx, gx, gy, bx, by, lx, ly, z);

    if (this.anim?.spriteSheet.image) {
      this.drawSprite(ctx, bx, by);
    } else {
      this.drawSphere(ctx, bx, by, lx, ly);
    }
  }

  // ── Sprite rendering ──────────────────────────────────────────────────────

  private drawSprite(ctx: CanvasRenderingContext2D, bx: number, by: number): void {
    const anim = this.anim!;
    const sheet = anim.spriteSheet;
    const img = sheet.image!;
    const frame = anim.currentClip.frames[anim.frameIndex];
    const w = frame.w * sheet.scale;
    const h = frame.h * sheet.scale;
    const dx = bx - w / 2;
    const dy = by - h * sheet.anchorY;

    ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, dx, dy, w, h);
  }

  // ── Sphere fallback ───────────────────────────────────────────────────────

  private drawShadow(
    ctx: CanvasRenderingContext2D,
    gx: number, gy: number,
    bx: number, by: number,
    lx: number, ly: number,
    elevation: number,
  ): void {
    const dx = bx - lx;
    const dy = by - ly;
    const len = Math.hypot(dx, dy) || 1;
    const scale = elevation / 60;
    const offX = (dx / len) * this.radius * scale * 1.5;
    const offY = (dy / len) * this.radius * scale * 0.7;

    ctx.save();
    ctx.translate(gx + offX, gy + offY);
    ctx.scale(1, 0.45);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 1.3);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  private drawSphere(
    ctx: CanvasRenderingContext2D,
    bx: number, by: number,
    lx: number, ly: number,
  ): void {
    const dx = lx - bx;
    const dy = ly - by;
    const len = Math.hypot(dx, dy) || 1;
    const hx = bx + (dx / len) * this.radius * 0.38;
    const hy = by + (dy / len) * this.radius * 0.38;

    const dark   = shiftColor(this.color, -80);
    const mid    = this.color;
    const bright = shiftColor(this.color, 100);

    const base = ctx.createRadialGradient(hx, hy, this.radius * 0.05, bx, by, this.radius);
    base.addColorStop(0,    bright);
    base.addColorStop(0.35, mid);
    base.addColorStop(0.8,  dark);
    base.addColorStop(1,    '#050505');

    ctx.beginPath();
    ctx.arc(bx, by, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = base;
    ctx.fill();

    const glint = ctx.createRadialGradient(hx, hy, 0, hx, hy, this.radius * 0.25);
    glint.addColorStop(0, 'rgba(255,255,255,0.8)');
    glint.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(bx, by, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = glint;
    ctx.fill();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _followWaypoints(waypoints: IsoVec2[], z: number): void {
    if (waypoints.length === 0) return;
    // First waypoint becomes the immediate target; rest go into the queue
    const first = waypoints[0];
    this._target = { x: first.x, y: first.y, z };
    this._waypoints = waypoints.slice(1);
  }
}
