/**
 * LowPolyTree — 低多边形树木（锥体 + 圆柱树干）
 * LowPolyGrass — 细长三棱锥小草
 * LowPolyFlower — 四棱锥花朵
 */
import { IsoObject, DrawContext } from '../../src/elements/IsoObject';
import { AABB } from '../../src/math/depthSort';
import { project } from '../../src/math/IsoProjection';

// ── 低多边形树 ─────────────────────────────────────────────────────────────

export class LowPolyTree extends IsoObject {
  private _color: string;
  private _trunkColor: string;
  private _scale: number;
  private _swayPhase: number;

  constructor(id: string, x: number, y: number, opts: { color?: string; scale?: number; seed?: number } = {}) {
    super(id, x, y, 0);
    this._color      = opts.color ?? '#4a8c3f';
    this._trunkColor = '#6b4226';
    this._scale      = opts.scale ?? 1;
    this._swayPhase  = (opts.seed ?? Math.random()) * Math.PI * 2;
    // Trees draw their own shape; AABB is too small for accurate system shadows
    this.castsShadow = false;
  }

  get aabb(): AABB {
    return {
      minX: this.position.x - 0.4,
      minY: this.position.y - 0.4,
      maxX: this.position.x + 0.4,
      maxY: this.position.y + 0.4,
      baseZ: 0,
    };
  }

  update(ts?: number): void {
    this._swayPhase += 0.0008 * (ts ?? 0) * 0.001;
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;
    const { x, y } = this.position;
    const { sx, sy } = project(x, y, 0, tileW, tileH);
    const cx = originX + sx;
    const cy = originY + sy;
    const s = this._scale;
    const sway = Math.sin(this._swayPhase) * 1.5;

    ctx.save();
    ctx.translate(cx, cy);

    // 树干（扁平矩形模拟等距圆柱）
    const tw = 5 * s, th = 14 * s;
    ctx.fillStyle = this._trunkColor;
    ctx.fillRect(-tw / 2, -th, tw, th);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(-tw / 2, -th, tw, th);

    // 树冠（三层锥体，从大到小）
    const layers = [
      { r: 18 * s, h: 16 * s, y: -th - 4 * s,  color: this._color },
      { r: 14 * s, h: 14 * s, y: -th - 16 * s, color: this._shiftColor(this._color, 15) },
      { r: 9  * s, h: 12 * s, y: -th - 26 * s, color: this._shiftColor(this._color, 30) },
    ];

    for (const layer of layers) {
      ctx.save();
      ctx.translate(sway * 0.3, 0);
      // 等距锥体：底部菱形 + 顶点
      ctx.beginPath();
      ctx.moveTo(0, layer.y - layer.h);           // 顶点
      ctx.lineTo( layer.r, layer.y);              // 右
      ctx.lineTo(0, layer.y + layer.r * 0.4);     // 底
      ctx.lineTo(-layer.r, layer.y);              // 左
      ctx.closePath();
      ctx.fillStyle = layer.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  private _shiftColor(hex: string, amount: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const clamp = (v: number) => Math.max(0, Math.min(255, v));
    return `rgb(${clamp(r + amount)},${clamp(g + amount)},${clamp(b + amount)})`;
  }
}

// ── 低多边形小草 ───────────────────────────────────────────────────────────

export class LowPolyGrass extends IsoObject {
  private _color: string;
  private _height: number;
  private _windPhase: number;

  constructor(id: string, x: number, y: number, opts: { color?: string; height?: number; seed?: number } = {}) {
    super(id, x, y, 0);
    this._color     = opts.color  ?? '#5aaa40';
    this._height    = opts.height ?? 10;
    this._windPhase = (opts.seed ?? Math.random()) * Math.PI * 2;
    this.castsShadow = false;
  }

  get aabb(): AABB {
    return {
      minX: this.position.x - 0.1,
      minY: this.position.y - 0.1,
      maxX: this.position.x + 0.1,
      maxY: this.position.y + 0.1,
      baseZ: 0,
    };
  }

  update(ts?: number): void {
    this._windPhase += (ts ?? 0) * 0.0006;
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;
    const { x, y } = this.position;
    const { sx, sy } = project(x, y, 0, tileW, tileH);
    const cx = originX + sx;
    const cy = originY + sy;
    const sway = Math.sin(this._windPhase) * 2;
    const h = this._height;

    ctx.save();
    ctx.translate(cx, cy);

    // 3 根细长三棱锥草叶
    const blades = [
      { ox: -3, angle: -0.3 },
      { ox:  0, angle:  0.1 },
      { ox:  3, angle: -0.1 },
    ];
    for (const b of blades) {
      ctx.beginPath();
      ctx.moveTo(b.ox + sway * 0.5, 0);
      ctx.lineTo(b.ox - 1.5, -h * 0.6);
      ctx.lineTo(b.ox + sway + Math.cos(b.angle) * 2, -h);
      ctx.lineTo(b.ox + 1.5, -h * 0.6);
      ctx.closePath();
      ctx.fillStyle = this._color;
      ctx.fill();
    }

    ctx.restore();
  }
}

// ── 低多边形小花 ───────────────────────────────────────────────────────────

export class LowPolyFlower extends IsoObject {
  private _petalColor: string;
  private _centerColor: string;
  private _phase: number;

  constructor(id: string, x: number, y: number, opts: { color?: string; seed?: number } = {}) {
    super(id, x, y, 0);
    const colors = ['#ff6b9d', '#ffb347', '#ff4757', '#ffd700', '#a29bfe'];
    this._petalColor  = opts.color ?? colors[Math.floor((opts.seed ?? Math.random()) * colors.length)];
    this._centerColor = '#fff176';
    this._phase       = (opts.seed ?? Math.random()) * Math.PI * 2;
    this.castsShadow  = false;
  }

  get aabb(): AABB {
    return {
      minX: this.position.x - 0.1,
      minY: this.position.y - 0.1,
      maxX: this.position.x + 0.1,
      maxY: this.position.y + 0.1,
      baseZ: 0,
    };
  }

  update(ts?: number): void {
    this._phase += (ts ?? 0) * 0.0004;
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;
    const { x, y } = this.position;
    const { sx, sy } = project(x, y, 0, tileW, tileH);
    const cx = originX + sx;
    const cy = originY + sy;
    const bob = Math.sin(this._phase) * 1;

    ctx.save();
    ctx.translate(cx, cy - 6 + bob);

    // 4 片花瓣（四棱锥投影）
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + this._phase * 0.2;
      const px = Math.cos(a) * 4;
      const py = Math.sin(a) * 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(px - 1.5, py - 1);
      ctx.lineTo(px, py - 4);
      ctx.lineTo(px + 1.5, py - 1);
      ctx.closePath();
      ctx.fillStyle = this._petalColor;
      ctx.fill();
    }

    // 花心（小球）
    ctx.beginPath();
    ctx.arc(0, -1, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = this._centerColor;
    ctx.fill();

    ctx.restore();
  }
}
