import { project } from '../math/IsoProjection';
import { AABB } from '../math/depthSort';
import { IsoObject, DrawContext } from './IsoObject';
import { SpriteSheet } from '../animation/SpriteSheet';
import { AnimationController } from '../animation/AnimationController';
import { TileCollider } from '../physics/TileCollider';

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
  /** Movement speed in world units per frame (default 0.04). */
  speed?: number;
}

export class Character extends IsoObject {
  radius: number;
  color: string;
  speed: number;

  private target: { x: number; y: number; z: number } | null = null;
  private _prevX: number;
  private _prevY: number;

  private anim: AnimationController | null = null;
  private _lastFrameTime = 0;

  constructor(opts: CharacterOptions) {
    super(opts.id, opts.x, opts.y, opts.z ?? 0);
    this.radius = opts.radius ?? 22;
    this.color = opts.color ?? '#5590cc';
    this.speed = opts.speed ?? 0.04;
    this._prevX = opts.x;
    this._prevY = opts.y;

    if (opts.spriteSheet) {
      this.anim = new AnimationController(opts.spriteSheet, 'idle');
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Attach a sprite sheet and start animation. */
  setSpriteSheet(sheet: SpriteSheet, initialClip = 'idle'): void {
    this.anim = new AnimationController(sheet, initialClip);
  }

  /**
   * Switch to named animation clip.
   * No-op if no sprite sheet is attached or clip doesn't exist.
   */
  playAnimation(name: string): void {
    if (!this.anim) return;
    if (!this.anim.spriteSheet.hasClip(name)) return;
    this.anim.play(name);
  }

  /** Begin smooth movement toward world position (x, y, z). */
  moveTo(x: number, y: number, z = this.position.z): void {
    this.target = { x, y, z };
  }

  /** Cancel any in-progress movement. */
  stopMoving(): void {
    this.target = null;
  }

  get isMoving(): boolean {
    return this.target !== null;
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
    const now = ts ?? performance.now();
    const dt = Math.min((now - this._lastFrameTime) / 1000, 0.1); // seconds, capped
    this._lastFrameTime = now;

    this._prevX = this.position.x;
    this._prevY = this.position.y;

    // Move toward target
    if (this.target) {
      const dx = this.target.x - this.position.x;
      const dy = this.target.y - this.position.y;
      const dz = this.target.z - this.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < this.speed) {
        // Arrived: final position check
        const r = 0.4;
        if (!collider || collider.canOccupy(
          this.target.x - r, this.target.y - r,
          this.target.x + r, this.target.y + r,
        )) {
          this.position.x = this.target.x;
          this.position.y = this.target.y;
          this.position.z = this.target.z;
        }
        this.target = null;
      } else {
        const stepDx = (dx / dist) * this.speed;
        const stepDy = (dy / dist) * this.speed;

        if (collider) {
          // Resolve step against collision
          const resolved = collider.resolveMove(
            this.position.x, this.position.y, stepDx, stepDy,
          );
          // If fully blocked in both axes, cancel target
          if (resolved.dx === 0 && resolved.dy === 0) {
            this.target = null;
          } else {
            this.position.x += resolved.dx;
            this.position.y += resolved.dy;
          }
        } else {
          this.position.x += stepDx;
          this.position.y += stepDy;
        }
        this.position.z += (dz / dist) * this.speed;
      }
    }

    // Drive animation controller
    if (this.anim) {
      const moveDx = this.position.x - this._prevX;
      const moveDy = this.position.y - this._prevY;
      const moving = Math.hypot(moveDx, moveDy) > 0.0005;

      if (moving) {
        this.anim.direction = AnimationController.directionFrom(moveDx, moveDy);
        // Auto-switch between walk and idle
        if (this.anim.currentClip.name !== 'walk' &&
            this.anim.spriteSheet.hasClip('walk')) {
          this.anim.play('walk');
        }
      } else if (this.anim.currentClip.name === 'walk') {
        if (this.anim.spriteSheet.hasClip('idle')) this.anim.play('idle');
      }

      this.anim.update(dt);
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
    // Anchor: bottom-center by default (anchorY=1)
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
}

// ── helpers ───────────────────────────────────────────────────────────────────

function shiftColor(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
  return `rgb(${r},${g},${b})`;
}
