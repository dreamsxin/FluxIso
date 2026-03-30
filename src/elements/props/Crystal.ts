import { project } from '../../math/IsoProjection';
import { AABB } from '../../math/depthSort';
import { DrawContext } from '../IsoObject';
import { Entity } from '../../ecs/Entity';
import { HealthComponent } from '../../ecs/components/HealthComponent';

/** Low-poly hexagonal crystal cluster with HealthComponent. */
export class Crystal extends Entity {
  private color: string;
  private accentColor: string;
  private heightPx: number;

  constructor(
    id: string,
    x: number,
    y: number,
    color = '#8060e0',
    heightPx = 48,
  ) {
    super(id, x, y, 0);
    this.color = color;
    this.accentColor = shiftColor(color, 70);
    this.heightPx = heightPx;
  }

  get aabb(): AABB {
    return { minX: this.position.x - 0.4, minY: this.position.y - 0.4, maxX: this.position.x + 0.4, maxY: this.position.y + 0.4, baseZ: 0 };
  }

  update(ts?: number): void {
    super.update(ts); // drive components
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY, omniLights } = dc;
    const { x, y } = this.position;
    const { sx, sy } = project(x, y, 0, tileW, tileH);
    const cx = originX + sx;
    const cy = originY + sy;
    const h = this.heightPx;
    const w = tileW * 0.28;

    // Light factor
    let illum = 0.3;
    for (const l of omniLights) {
      const lp = project(l.position.x, l.position.y, 0, tileW, tileH);
      const lsx = originX + lp.sx;
      const lsy = originY + lp.sy - l.position.z;
      illum += l.illuminateAt(cx, cy, lsx, lsy);
    }
    illum = Math.min(1, illum);

    const baseColor = lerpColor(this.color, '#ffffff', illum * 0.25);
    const darkColor = shiftColor(this.color, -60);
    const faceColor = shiftColor(this.color, -30);

    // Main crystal spike
    ctx.save();
    ctx.translate(cx, cy);

    // Left face (dark)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-w * 0.9, -h * 0.5);
    ctx.lineTo(-w * 0.4, -h);
    ctx.lineTo(0, -h * 0.6);
    ctx.closePath();
    ctx.fillStyle = darkColor;
    ctx.fill();

    // Right face (lit)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w * 0.9, -h * 0.4);
    ctx.lineTo(w * 0.35, -h);
    ctx.lineTo(0, -h * 0.6);
    ctx.closePath();
    ctx.fillStyle = baseColor;
    ctx.fill();

    // Center face (mid tone)
    ctx.beginPath();
    ctx.moveTo(-w * 0.4, -h);
    ctx.lineTo(0, -h * 0.6);
    ctx.lineTo(w * 0.35, -h);
    ctx.lineTo(0, -h * 1.15); // tip
    ctx.closePath();
    ctx.fillStyle = this.accentColor;
    ctx.fill();

    // Small secondary crystal
    ctx.translate(w * 0.7, -h * 0.05);
    ctx.scale(0.55, 0.55);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-w * 0.9, -h * 0.5);
    ctx.lineTo(0, -h * 0.9);
    ctx.lineTo(w * 0.9, -h * 0.4);
    ctx.closePath();
    ctx.fillStyle = faceColor;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-w * 0.9, -h * 0.5);
    ctx.lineTo(0, -h * 0.9);
    ctx.lineTo(0, -h * 1.1);
    ctx.closePath();
    ctx.fillStyle = this.accentColor;
    ctx.fill();

    ctx.restore();

    // Health bar
    this.drawHealthBar(ctx, cx, cy - h * 1.3);
  }

  private drawHealthBar(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const hp = this.getComponent<HealthComponent>('health');
    if (!hp || hp.isDead) return;
    const w = 36, h = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - w / 2, y, w, h);
    const frac = hp.fraction;
    const barColor = frac > 0.5 ? '#50e080' : frac > 0.25 ? '#f0c040' : '#e04040';
    ctx.fillStyle = barColor;
    ctx.fillRect(x - w / 2, y, w * frac, h);
  }
}

function shiftColor(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
  return `rgb(${r},${g},${b})`;
}

function lerpColor(hex: string, to: string, t: number): string {
  const a = parseInt(hex.replace('#', ''), 16);
  const b = parseInt(to.replace('#', ''), 16);
  const r = Math.round(((a >> 16) & 0xff) * (1 - t) + ((b >> 16) & 0xff) * t);
  const g = Math.round(((a >> 8) & 0xff) * (1 - t) + ((b >> 8) & 0xff) * t);
  const bl = Math.round((a & 0xff) * (1 - t) + (b & 0xff) * t);
  return `rgb(${r},${g},${bl})`;
}
