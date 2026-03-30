import { project } from '../../math/IsoProjection';
import { AABB } from '../../math/depthSort';
import { DrawContext } from '../IsoObject';
import { Entity } from '../../ecs/Entity';
import { HealthComponent } from '../../ecs/components/HealthComponent';

/** Low-poly isometric treasure chest with HealthComponent. */
export class Chest extends Entity {
  private color: string;
  private lidOpen: boolean;
  private _lidAngle = 0; // 0=closed, 1=open (animated)

  constructor(id: string, x: number, y: number, color = '#c08020') {
    super(id, x, y, 0);
    this.color = color;
    this.lidOpen = false;
  }

  open(): void { this.lidOpen = true; }
  close(): void { this.lidOpen = false; }
  toggle(): void { this.lidOpen = !this.lidOpen; }

  get aabb(): AABB {
    return { minX: this.position.x - 0.4, minY: this.position.y - 0.4, maxX: this.position.x + 0.4, maxY: this.position.y + 0.4, baseZ: 0 };
  }

  update(ts?: number): void {
    super.update(ts);
    // Animate lid
    const target = this.lidOpen ? 1 : 0;
    this._lidAngle += (target - this._lidAngle) * 0.12;
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY, omniLights } = dc;
    const { x, y } = this.position;
    const { sx, sy } = project(x, y, 0, tileW, tileH);
    const px = originX + sx;
    const py = originY + sy;

    // Light
    let illum = 0.25;
    for (const l of omniLights) {
      const lp = project(l.position.x, l.position.y, 0, tileW, tileH);
      const lsx = originX + lp.sx;
      const lsy = originY + lp.sy - l.position.z;
      illum += l.illuminateAt(px, py, lsx, lsy);
    }
    illum = Math.min(1, illum);

    const W = tileW * 0.36;   // chest half-width
    const H = tileH * 0.9;    // chest body height
    const D = tileW * 0.18;   // depth offset

    const wood  = blendHex(this.color, illum);
    const dark  = blendHex(shiftHex(this.color, -50), illum * 0.6);
    const band  = blendHex('#404040', illum * 0.7);
    const latch = blendHex('#d0b060', illum);

    ctx.save();
    ctx.translate(px, py);

    // ── Body ──
    // Front face
    ctx.beginPath();
    ctx.moveTo(-W, -D);
    ctx.lineTo( W, -D);
    ctx.lineTo( W, -D - H);
    ctx.lineTo(-W, -D - H);
    ctx.closePath();
    ctx.fillStyle = wood;
    ctx.fill();

    // Right face (darker, iso depth)
    ctx.beginPath();
    ctx.moveTo(W, -D);
    ctx.lineTo(W + D, 0);
    ctx.lineTo(W + D, -H);
    ctx.lineTo(W, -D - H);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();

    // Metal band across front
    const bandY = -D - H * 0.45;
    ctx.fillStyle = band;
    ctx.fillRect(-W, bandY, W * 2, H * 0.12);

    // Latch
    ctx.beginPath();
    ctx.arc(0, bandY + H * 0.06, H * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = latch;
    ctx.fill();

    // ── Lid (animated) ──
    const lidH  = H * 0.35;
    const openAng = this._lidAngle * 0.9; // max ~52°
    const lidYOffset = -D - H - lidH * 0.5;

    ctx.save();
    ctx.translate(0, lidYOffset);
    ctx.scale(1, Math.cos(openAng)); // perspective-squash open

    // Lid front
    ctx.beginPath();
    ctx.moveTo(-W, -lidH * 0.5);
    ctx.lineTo( W, -lidH * 0.5);
    ctx.lineTo( W,  lidH * 0.5);
    ctx.lineTo(-W,  lidH * 0.5);
    ctx.closePath();
    ctx.fillStyle = blendHex(shiftHex(this.color, 20), illum * 0.9);
    ctx.fill();

    // Lid top (curved-ish: just a brighter sliver)
    ctx.beginPath();
    ctx.moveTo(-W, -lidH * 0.5);
    ctx.lineTo( W, -lidH * 0.5);
    ctx.lineTo( W + D, -lidH * 0.5);
    ctx.lineTo(-W + D * 0.2, -lidH * 0.5 - 3);
    ctx.closePath();
    ctx.fillStyle = blendHex(shiftHex(this.color, 40), illum);
    ctx.fill();

    // Lid right face
    ctx.beginPath();
    ctx.moveTo(W, -lidH * 0.5);
    ctx.lineTo(W + D, -lidH * 0.5);
    ctx.lineTo(W + D,  lidH * 0.5);
    ctx.lineTo(W,  lidH * 0.5);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();

    ctx.restore();

    // Glow when open
    if (this._lidAngle > 0.1) {
      const alpha = this._lidAngle * 0.35;
      const grad = ctx.createRadialGradient(0, -D - H * 0.5, 0, 0, -D - H * 0.5, W * 1.5);
      grad.addColorStop(0, `rgba(255,220,80,${alpha})`);
      grad.addColorStop(1, 'rgba(255,180,20,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(-W * 2, -D - H * 1.5, W * 4, H * 1.5);
    }

    ctx.restore();

    this.drawHealthBar(ctx, px, py - D - H * 1.6);
  }

  private drawHealthBar(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const hp = this.getComponent<HealthComponent>('health');
    if (!hp || hp.isDead) return;
    const w = 34, h = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - w / 2, y, w, h);
    const frac = hp.fraction;
    const barColor = frac > 0.5 ? '#50e080' : frac > 0.25 ? '#f0c040' : '#e04040';
    ctx.fillStyle = barColor;
    ctx.fillRect(x - w / 2, y, w * frac, h);
  }
}

function shiftHex(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function blendHex(hex: string, factor: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((n & 0xff) * factor));
  return `rgb(${r},${g},${b})`;
}
