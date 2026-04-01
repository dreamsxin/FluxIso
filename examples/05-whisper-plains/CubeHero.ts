/**
 * CubeHero — 钻石守护者
 *
 * 造型：低多边形钻石（上冠 + 腰棱 + 下亭）
 * 装饰：内部旋转光芒 + 外圈折射光点
 * 动画：移动时上下浮动 + 方向倾斜 + 慢速自转
 */
import { Entity } from '../../src/ecs/Entity';
import { DrawContext } from '../../src/elements/IsoObject';
import { AABB } from '../../src/math/depthSort';
import { project } from '../../src/math/IsoProjection';

export class CubeHero extends Entity {
  velX = 0;
  velY = 0;

  private _bobPhase   = 0;
  private _tiltX      = 0;
  private _tiltY      = 0;
  private _spinAngle  = 0;   // 慢速自转
  private _glintAngle = 0;   // 折射光点旋转
  private _lastTs     = 0;
  private _teleportFlash = 0;

  constructor(id: string, x: number, y: number) {
    super(id, x, y, 0);
    // CubeHero draws its own shadow blob in draw(); skip ShadowCaster
    this.castsShadow = false;
  }

  triggerTeleportFlash(): void {
    this._teleportFlash = 1;
  }

  get aabb(): AABB {
    return {
      minX: this.position.x - 0.5,
      minY: this.position.y - 0.5,
      maxX: this.position.x + 0.5,
      maxY: this.position.y + 0.5,
      baseZ: this.position.z,
    };
  }

  update(ts?: number): void {
    super.update(ts);
    const now = ts ?? performance.now();
    const dt = this._lastTs === 0 ? 0.016 : Math.min((now - this._lastTs) / 1000, 0.1);
    this._lastTs = now;

    const moving = Math.hypot(this.velX, this.velY) > 0.01;

    // 上下浮动
    this._bobPhase += moving ? dt * 5.5 : dt * 1.2;
    this.position.z = Math.sin(this._bobPhase) * (moving ? 4 : 2);

    // 方向倾斜（平滑插值）
    const targetTiltX = moving ? this.velX * 10 : 0;
    const targetTiltY = moving ? this.velY * 10 : 0;
    this._tiltX += (targetTiltX - this._tiltX) * Math.min(1, dt * 9);
    this._tiltY += (targetTiltY - this._tiltY) * Math.min(1, dt * 9);

    // 慢速自转 + 折射光旋转
    this._spinAngle  += dt * 0.6;
    this._glintAngle += dt * 1.8;

    if (this._teleportFlash > 0) {
      this._teleportFlash = Math.max(0, this._teleportFlash - dt * 3);
    }
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;
    const { x, y, z } = this.position;

    // 角色当前屏幕位置（含 z 偏移）
    const { sx, sy } = project(x, y, z, tileW, tileH);
    const cx = originX + sx;
    const cy = originY + sy;

    // 地面投影位置（z=0），用于正确放置阴影
    const { sx: gsx, sy: gsy } = project(x, y, 0, tileW, tileH);
    const gx = originX + gsx;
    const gy = originY + gsy;

    // 先画地面阴影（在角色下方，不受倾斜变换影响）
    this._drawShadowBlob(ctx, gx, gy);

    ctx.save();
    ctx.translate(cx, cy);

    // 倾斜变换
    ctx.transform(1, this._tiltY * 0.009, this._tiltX * 0.013, 1, 0, 0);

    this._drawDiamond(ctx);
    this._drawGlints(ctx);

    // 传送闪光
    if (this._teleportFlash > 0) {
      ctx.globalAlpha = this._teleportFlash * 0.85;
      const flash = ctx.createRadialGradient(0, -18, 0, 0, -18, 32);
      flash.addColorStop(0, '#ffffff');
      flash.addColorStop(1, 'rgba(180,220,255,0)');
      ctx.beginPath();
      ctx.arc(0, -18, 32, 0, Math.PI * 2);
      ctx.fillStyle = flash;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // ── 地面投影阴影（画在 z=0 地面位置） ───────────────────────────────────

  private _drawShadowBlob(ctx: CanvasRenderingContext2D, gx: number, gy: number): void {
    // 读取当前相机变换矩阵，将相机空间坐标转换为真实屏幕坐标
    const m = ctx.getTransform();
    const screenX = m.a * gx + m.c * gy + m.e;
    const screenY = m.b * gx + m.d * gy + m.f;

    ctx.save();
    // 重置变换，直接在屏幕坐标系绘制，避免相机 zoom/scale 干扰
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(screenX, screenY);
    ctx.scale(1, 0.38);
    const r = 20 * (m.a || 1); // 根据 zoom 缩放阴影半径
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0,   'rgba(0,0,0,0.45)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.2)');
    g.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  // ── 钻石主体 ──────────────────────────────────────────────────────────────

  private _drawDiamond(ctx: CanvasRenderingContext2D): void {
    const spin = this._spinAngle;

    // 钻石尺寸参数
    const W  = 20;   // 腰部半宽
    const HT = 22;   // 冠部高度（上半）
    const HP = 26;   // 亭部高度（下半）
    const GIRDLE = 3; // 腰棱厚度

    // 腰部顶点（8个，形成八边形腰棱）
    const SIDES = 8;
    const girdle: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2 + spin;
      girdle.push({ x: Math.cos(a) * W, y: Math.sin(a) * W * 0.45 });
    }

    // 冠顶（table facet 中心）
    const tableY = -HT - GIRDLE;
    // 亭底（culet 尖点）
    const culetY = HP;

    // ── 亭部（下半，倒锥，先画避免遮挡） ──────────────────────────────────
    for (let i = 0; i < SIDES; i++) {
      const g0 = girdle[i];
      const g1 = girdle[(i + 1) % SIDES];
      // 亭部面颜色：深蓝紫，交替明暗
      const bright = i % 2 === 0;
      ctx.beginPath();
      ctx.moveTo(g0.x, g0.y + GIRDLE);
      ctx.lineTo(g1.x, g1.y + GIRDLE);
      ctx.lineTo(0, culetY);
      ctx.closePath();
      ctx.fillStyle = bright ? '#3a6fd8' : '#1e3fa0';
      ctx.fill();
      ctx.strokeStyle = 'rgba(100,160,255,0.4)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    // ── 腰棱 ──────────────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(girdle[0].x, girdle[0].y);
    for (let i = 1; i < SIDES; i++) ctx.lineTo(girdle[i].x, girdle[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(180,220,255,0.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,230,255,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // ── 冠部（上半，多面锥） ───────────────────────────────────────────────
    // table（顶面平台）顶点
    const tableR = W * 0.52;
    const TABLE_SIDES = 8;
    const table: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < TABLE_SIDES; i++) {
      const a = (i / TABLE_SIDES) * Math.PI * 2 + spin + Math.PI / TABLE_SIDES;
      table.push({ x: Math.cos(a) * tableR, y: tableY + Math.sin(a) * tableR * 0.4 });
    }

    // 冠部侧面（girdle → table 边）
    for (let i = 0; i < SIDES; i++) {
      const g0 = girdle[i];
      const g1 = girdle[(i + 1) % SIDES];
      const t0 = table[i % TABLE_SIDES];
      const t1 = table[(i + 1) % TABLE_SIDES];

      // 交替两种蓝色，模拟折射
      const bright = i % 2 === 0;
      ctx.beginPath();
      ctx.moveTo(g0.x, g0.y - GIRDLE);
      ctx.lineTo(g1.x, g1.y - GIRDLE);
      ctx.lineTo(t1.x, t1.y);
      ctx.lineTo(t0.x, t0.y);
      ctx.closePath();
      ctx.fillStyle = bright ? '#60aaff' : '#3a7aee';
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,220,255,0.5)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    // table 顶面（最亮）
    ctx.beginPath();
    ctx.moveTo(table[0].x, table[0].y);
    for (let i = 1; i < TABLE_SIDES; i++) ctx.lineTo(table[i].x, table[i].y);
    ctx.closePath();

    // 顶面渐变（模拟天光反射）
    const tableGrad = ctx.createLinearGradient(-tableR, tableY - 4, tableR, tableY + 4);
    tableGrad.addColorStop(0, '#d0eeff');
    tableGrad.addColorStop(0.5, '#a0d0ff');
    tableGrad.addColorStop(1, '#70b0ff');
    ctx.fillStyle = tableGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 内部折射光（table 面上的十字高光）
    ctx.save();
    ctx.clip(); // 裁剪到 table 面内
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    const cr = tableR * 0.7;
    ctx.beginPath();
    ctx.moveTo(-cr, tableY); ctx.lineTo(cr, tableY);
    ctx.moveTo(0, tableY - cr * 0.5); ctx.lineTo(0, tableY + cr * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  // ── 外圈折射光点 ──────────────────────────────────────────────────────────

  private _drawGlints(ctx: CanvasRenderingContext2D): void {
    const a = this._glintAngle;
    const glints = [
      { r: 26, offset: 0,              size: 3.5, alpha: 0.9 },
      { r: 22, offset: Math.PI * 0.5,  size: 2.5, alpha: 0.7 },
      { r: 28, offset: Math.PI * 1.1,  size: 2,   alpha: 0.6 },
      { r: 20, offset: Math.PI * 1.6,  size: 3,   alpha: 0.8 },
    ];

    for (const g of glints) {
      const gx = Math.cos(a + g.offset) * g.r;
      const gy = Math.sin(a + g.offset) * g.r * 0.45 - 10;

      // 星形光点（4条线）
      ctx.save();
      ctx.translate(gx, gy);
      ctx.globalAlpha = g.alpha * (0.6 + Math.sin(a * 2 + g.offset) * 0.4);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 4; i++) {
        const la = (i / 4) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(Math.cos(la) * g.size, Math.sin(la) * g.size);
        ctx.lineTo(-Math.cos(la) * g.size, -Math.sin(la) * g.size);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // 中心内部光芒（模拟钻石火彩）
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(a * 1.3) * 0.15;
    const fireGrad = ctx.createRadialGradient(0, -10, 0, 0, -10, 18);
    fireGrad.addColorStop(0, '#ffffff');
    fireGrad.addColorStop(0.3, 'rgba(180,220,255,0.6)');
    fireGrad.addColorStop(1, 'rgba(100,160,255,0)');
    ctx.beginPath();
    ctx.arc(0, -10, 18, 0, Math.PI * 2);
    ctx.fillStyle = fireGrad;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
