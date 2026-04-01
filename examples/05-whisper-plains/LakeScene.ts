/**
 * LakeScene — 幻梦之湖场景
 *
 * - 起伏蓝色波浪平面（正弦/余弦实时波动）
 * - 低多边形石头、水草
 * - 荷叶（扁平圆柱 + 露珠）
 * - 偏冷色调，淡蓝环境光，雾效
 * - 脚下涟漪粒子
 */
import { IsoObject, DrawContext } from '../../src/elements/IsoObject';
import { AABB } from '../../src/math/depthSort';
import { project } from '../../src/math/IsoProjection';
import { Scene } from '../../src/core/Scene';
import { DirectionalLight } from '../../src/lighting/DirectionalLight';
import { OmniLight } from '../../src/lighting/OmniLight';

// ── 波浪湖面 ───────────────────────────────────────────────────────────────

export class WaveLake extends IsoObject {
  readonly cols: number;
  readonly rows: number;
  private _time = 0;
  private _lastTs = 0;

  constructor(id: string, cols: number, rows: number) {
    super(id, 0, 0, 0);
    this.cols = cols;
    this.rows = rows;
    // Lake surface draws itself; no system shadow needed
    this.castsShadow = false;
  }

  get aabb(): AABB {
    return {
      minX: 0, minY: 0,
      maxX: this.cols, maxY: this.rows,
      baseZ: -10,
    };
  }

  update(ts?: number): void {
    const now = ts ?? performance.now();
    const dt = this._lastTs === 0 ? 0.016 : Math.min((now - this._lastTs) / 1000, 0.1);
    this._lastTs = now;
    this._time += dt;
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;
    const t = this._time;

    // 绘制每个瓦片的波浪面
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        // 四个角的波浪高度
        const h00 = this._wave(col,     row,     t);
        const h10 = this._wave(col + 1, row,     t);
        const h11 = this._wave(col + 1, row + 1, t);
        const h01 = this._wave(col,     row + 1, t);

        const p00 = project(col,     row,     h00, tileW, tileH);
        const p10 = project(col + 1, row,     h10, tileW, tileH);
        const p11 = project(col + 1, row + 1, h11, tileW, tileH);
        const p01 = project(col,     row + 1, h01, tileW, tileH);

        const x00 = originX + p00.sx, y00 = originY + p00.sy;
        const x10 = originX + p10.sx, y10 = originY + p10.sy;
        const x11 = originX + p11.sx, y11 = originY + p11.sy;
        const x01 = originX + p01.sx, y01 = originY + p01.sy;

        // 根据平均高度决定颜色（深浅蓝）
        const avgH = (h00 + h10 + h11 + h01) / 4;
        const brightness = 0.5 + (avgH / 8) * 0.3;
        const r = Math.round(20  * brightness);
        const g = Math.round(80  * brightness);
        const b = Math.round(160 * brightness);

        ctx.beginPath();
        ctx.moveTo(x00, y00);
        ctx.lineTo(x10, y10);
        ctx.lineTo(x11, y11);
        ctx.lineTo(x01, y01);
        ctx.closePath();
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fill();

        // 波光反射线（每隔几格）
        if ((col + row) % 3 === 0) {
          ctx.strokeStyle = `rgba(120,200,255,${0.1 + Math.sin(t * 3 + col + row) * 0.05})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    // 雾效叠加（底部渐变）
    const fogGrad = ctx.createLinearGradient(
      originX, originY - tileH * this.rows * 0.5,
      originX, originY + tileH * this.rows * 0.5,
    );
    fogGrad.addColorStop(0, 'rgba(40,80,140,0)');
    fogGrad.addColorStop(1, 'rgba(40,80,140,0.18)');
    ctx.fillStyle = fogGrad;
    ctx.fillRect(originX - tileW * this.cols, originY - tileH * this.rows,
                 tileW * this.cols * 2, tileH * this.rows * 2);
  }

  private _wave(col: number, row: number, t: number): number {
    return (
      Math.sin(col * 0.8 + t * 1.8) * 3 +
      Math.cos(row * 0.7 + t * 1.4) * 2.5 +
      Math.sin((col + row) * 0.5 + t * 2.2) * 1.5
    );
  }
}

// ── 湖底石头 ───────────────────────────────────────────────────────────────

export class LakeRock extends IsoObject {
  private _color: string;
  private _size: number;

  constructor(id: string, x: number, y: number, opts: { color?: string; size?: number } = {}) {
    super(id, x, y, 0);
    this._color = opts.color ?? '#4a5568';
    this._size  = opts.size  ?? 1;
    this.castsShadow = false;
  }

  get aabb(): AABB {
    const r = 0.3 * this._size;
    return { minX: this.position.x - r, minY: this.position.y - r, maxX: this.position.x + r, maxY: this.position.y + r, baseZ: 0 };
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;
    const { x, y } = this.position;
    const { sx, sy } = project(x, y, 0, tileW, tileH);
    const cx = originX + sx;
    const cy = originY + sy;
    const s = this._size;

    ctx.save();
    ctx.translate(cx, cy);

    // 低多边形石头（不规则多边形）
    const pts = [
      [-8*s, -4*s], [-4*s, -10*s], [4*s, -9*s],
      [9*s, -3*s],  [7*s, 3*s],    [0, 5*s],
      [-6*s, 4*s],
    ];
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = this._color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 高光面
    ctx.beginPath();
    ctx.moveTo(-4*s, -10*s);
    ctx.lineTo(4*s, -9*s);
    ctx.lineTo(0, -4*s);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();

    ctx.restore();
  }
}

// ── 水草 ───────────────────────────────────────────────────────────────────

export class WaterGrass extends IsoObject {
  private _phase: number;

  constructor(id: string, x: number, y: number, seed = 0) {
    super(id, x, y, 0);
    this._phase = seed * Math.PI * 2;
    this.castsShadow = false;
  }

  get aabb(): AABB {
    return { minX: this.position.x - 0.1, minY: this.position.y - 0.1, maxX: this.position.x + 0.1, maxY: this.position.y + 0.1, baseZ: 0 };
  }

  update(ts?: number): void {
    this._phase += (ts ?? 0) * 0.0005;
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;
    const { x, y } = this.position;
    const { sx, sy } = project(x, y, 0, tileW, tileH);
    const cx = originX + sx;
    const cy = originY + sy;
    const sway = Math.sin(this._phase) * 3;

    ctx.save();
    ctx.translate(cx, cy);

    const blades = [
      { ox: -2, h: 16, color: '#2d8a6e' },
      { ox:  1, h: 20, color: '#3aaa80' },
      { ox:  4, h: 14, color: '#2d8a6e' },
    ];
    for (const b of blades) {
      ctx.beginPath();
      ctx.moveTo(b.ox, 0);
      ctx.quadraticCurveTo(b.ox + sway, -b.h * 0.5, b.ox + sway * 1.5, -b.h);
      ctx.lineTo(b.ox + sway * 1.5 + 2, -b.h);
      ctx.quadraticCurveTo(b.ox + sway + 2, -b.h * 0.5, b.ox + 2, 0);
      ctx.closePath();
      ctx.fillStyle = b.color;
      ctx.fill();
    }

    ctx.restore();
  }
}

// ── 荷叶 ───────────────────────────────────────────────────────────────────

export class LilyPad extends IsoObject {
  private _phase: number;
  private _color: string;

  constructor(id: string, x: number, y: number, seed = 0) {
    super(id, x, y, 2);
    this._phase = seed * Math.PI * 2;
    this._color = '#2d8a3e';
    this.castsShadow = false;
  }

  get aabb(): AABB {
    return { minX: this.position.x - 0.4, minY: this.position.y - 0.4, maxX: this.position.x + 0.4, maxY: this.position.y + 0.4, baseZ: 2 };
  }

  update(ts?: number): void {
    this._phase += (ts ?? 0) * 0.0003;
    this.position.z = 2 + Math.sin(this._phase) * 1.5;
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;
    const { x, y, z } = this.position;
    const { sx, sy } = project(x, y, z, tileW, tileH);
    const cx = originX + sx;
    const cy = originY + sy;

    ctx.save();
    ctx.translate(cx, cy);

    // 荷叶（扁平椭圆，带缺口）
    ctx.save();
    ctx.scale(1, 0.5);
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0.3, Math.PI * 2 - 0.3);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = this._color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    // 叶脉
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 1.8 + 0.3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 5.5);
      ctx.stroke();
    }

    // 露珠
    ctx.beginPath();
    ctx.arc(3, -1, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(180,230,255,0.8)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(2.5, -1.5, 0.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();

    ctx.restore();
  }
}

// ── 构建湖水场景 ───────────────────────────────────────────────────────────

export function buildLakeScene(cols: number, rows: number): Scene {
  const scene = new Scene({ tileW: 64, tileH: 32, cols, rows });

  // 波浪湖面
  scene.addObject(new WaveLake('lake', cols, rows));

  // 冷色调方向光
  scene.addLight(new DirectionalLight({
    angle: 225,
    elevation: 45,
    color: '#80b4ff',
    intensity: 0.9,
  }));

  // 淡蓝补光 — 湖面场景无实体对象需要投影，z 设低避免无效 shadow 计算
  scene.addLight(new OmniLight({
    x: cols / 2, y: rows / 2, z: 80,
    color: '#4080c0',
    intensity: 0.6,
    radius: 600,
  }));

  // 湖底石头
  const rockPositions = [
    [2, 3], [5, 2], [8, 4], [3, 7], [7, 6], [1, 5], [9, 8],
    [4, 9], [6, 1], [10, 3], [11, 7],
  ];
  for (const [i, [rx, ry]] of rockPositions.entries()) {
    scene.addObject(new LakeRock(`rock-${i}`, rx, ry, {
      color: ['#4a5568', '#3d4a5c', '#5a6478'][i % 3],
      size: 0.6 + (i % 3) * 0.3,
    }));
  }

  // 水草
  const grassPositions = [
    [1.5, 2.5], [4.5, 1.5], [7.5, 3.5], [2.5, 6.5],
    [8.5, 5.5], [5.5, 8.5], [10.5, 2.5], [3.5, 9.5],
  ];
  for (const [i, [gx, gy]] of grassPositions.entries()) {
    scene.addObject(new WaterGrass(`wgrass-${i}`, gx, gy, i * 0.7));
  }

  // 荷叶
  const padPositions = [
    [3, 4], [6, 3], [5, 6], [8, 7], [2, 8], [9, 5],
  ];
  for (const [i, [px, py]] of padPositions.entries()) {
    scene.addObject(new LilyPad(`pad-${i}`, px, py, i * 0.5));
  }

  return scene;
}
