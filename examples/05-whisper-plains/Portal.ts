/**
 * Portal — 发光传送阵
 *
 * 地面上的圆形阵法：
 * - 多层嵌套多边形环（八边形 + 三角环）
 * - 蓝紫色自发光，亮度周期性脉动
 * - 旋转粒子 + 光柱效果
 * - 角色进入时亮度提升 + 粒子爆发
 */
import { Entity } from '../../src/ecs/Entity';
import { DrawContext } from '../../src/elements/IsoObject';
import { AABB } from '../../src/math/depthSort';
import { project } from '../../src/math/IsoProjection';

export class Portal extends Entity {
  /** 触发半径（世界单位） */
  readonly triggerRadius = 1.2;

  private _phase = 0;
  private _activated = false;
  private _activationPulse = 0;
  private _lastTs = 0;

  // 粒子
  private _particles: Array<{
    angle: number; radius: number; speed: number;
    size: number; color: string; z: number; zSpeed: number;
  }> = [];

  constructor(id: string, x: number, y: number) {
    super(id, x, y, 0);
    // Portal is a light emitter — no shadow
    this.castsShadow = false;
    // 初始化漂浮粒子
    for (let i = 0; i < 8; i++) {
      this._particles.push({
        angle:  (i / 8) * Math.PI * 2,
        radius: 0.6 + Math.random() * 0.4,
        speed:  0.8 + Math.random() * 0.6,
        size:   2 + Math.random() * 3,
        color:  ['#a080ff', '#80c0ff', '#c060ff', '#60d0ff'][i % 4],
        z:      Math.random() * 20,
        zSpeed: 8 + Math.random() * 6,
      });
    }
  }

  /** 触发激活效果（角色进入时调用） */
  activate(): void {
    this._activated = true;
    this._activationPulse = 1;
  }

  get isActivated(): boolean { return this._activated; }

  get aabb(): AABB {
    return {
      minX: this.position.x - 1.5,
      minY: this.position.y - 1.5,
      maxX: this.position.x + 1.5,
      maxY: this.position.y + 1.5,
      baseZ: 0,
    };
  }

  update(ts?: number): void {
    super.update(ts);
    const now = ts ?? performance.now();
    const dt = this._lastTs === 0 ? 0.016 : Math.min((now - this._lastTs) / 1000, 0.1);
    this._lastTs = now;

    this._phase += dt;

    // 激活脉冲衰减
    if (this._activationPulse > 0) {
      this._activationPulse = Math.max(0, this._activationPulse - dt * 1.5);
    }

    // 更新粒子
    const speedMult = this._activated ? 2.5 : 1;
    for (const p of this._particles) {
      p.angle += dt * p.speed * speedMult;
      p.z += dt * p.zSpeed;
      if (p.z > 30) { p.z = 0; }
    }
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;
    const { x, y } = this.position;

    const { sx, sy } = project(x, y, 0, tileW, tileH);
    const cx = originX + sx;
    const cy = originY + sy;

    // 基础脉动亮度
    const pulse = 0.6 + Math.sin(this._phase * 2.5) * 0.2 + this._activationPulse * 0.6;
    const alpha = Math.min(1, pulse);

    ctx.save();
    ctx.translate(cx, cy);

    // 地面光晕
    this._drawGroundGlow(ctx, tileW, tileH, alpha);

    // 多层多边形环
    this._drawRings(ctx, tileW, tileH, alpha);

    // 光柱
    this._drawLightPillars(ctx, tileW, tileH, alpha);

    // 漂浮粒子
    this._drawParticles(ctx, tileW, tileH, alpha);

    ctx.restore();
  }

  private _drawGroundGlow(ctx: CanvasRenderingContext2D, tileW: number, tileH: number, alpha: number): void {
    const rw = tileW * 1.4;
    const rh = tileH * 1.4;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rw);
    grad.addColorStop(0,   `rgba(120,80,255,${alpha * 0.35})`);
    grad.addColorStop(0.5, `rgba(80,120,255,${alpha * 0.15})`);
    grad.addColorStop(1,   'rgba(80,120,255,0)');

    ctx.save();
    ctx.scale(1, tileH / tileW);
    ctx.beginPath();
    ctx.arc(0, 0, rw, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  private _drawRings(ctx: CanvasRenderingContext2D, tileW: number, tileH: number, alpha: number): void {
    const scaleY = tileH / tileW;

    // 外八边形环
    this._drawIsoPolygon(ctx, tileW * 1.1, scaleY, 8,
      this._phase * 0.3,
      `rgba(100,140,255,${alpha * 0.7})`,
      `rgba(80,100,255,${alpha * 0.15})`,
      2);

    // 中六边形环
    this._drawIsoPolygon(ctx, tileW * 0.75, scaleY, 6,
      -this._phase * 0.5,
      `rgba(160,100,255,${alpha * 0.85})`,
      `rgba(120,80,255,${alpha * 0.2})`,
      1.5);

    // 内三角环（快速旋转）
    this._drawIsoPolygon(ctx, tileW * 0.42, scaleY, 3,
      this._phase * 1.2,
      `rgba(200,160,255,${alpha})`,
      `rgba(180,120,255,${alpha * 0.3})`,
      1.5);

    // 中心符文点
    ctx.save();
    ctx.scale(1, scaleY);
    const centerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, tileW * 0.18);
    centerGlow.addColorStop(0, `rgba(255,255,255,${alpha * 0.9})`);
    centerGlow.addColorStop(0.4, `rgba(180,140,255,${alpha * 0.6})`);
    centerGlow.addColorStop(1, 'rgba(100,80,255,0)');
    ctx.beginPath();
    ctx.arc(0, 0, tileW * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = centerGlow;
    ctx.fill();
    ctx.restore();
  }

  private _drawIsoPolygon(
    ctx: CanvasRenderingContext2D,
    radius: number,
    scaleY: number,
    sides: number,
    rotation: number,
    strokeColor: string,
    fillColor: string,
    lineWidth: number,
  ): void {
    ctx.save();
    ctx.scale(1, scaleY);
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2 + rotation;
      const px = Math.cos(a) * radius;
      const py = Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.restore();
  }

  private _drawLightPillars(ctx: CanvasRenderingContext2D, tileW: number, tileH: number, alpha: number): void {
    const scaleY = tileH / tileW;
    const count = 6;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this._phase * 0.2;
      const r = tileW * 0.85;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r * scaleY;
      const pillarH = 18 + Math.sin(this._phase * 3 + i) * 6;

      const grad = ctx.createLinearGradient(px, py, px, py - pillarH);
      grad.addColorStop(0, `rgba(140,100,255,${alpha * 0.6})`);
      grad.addColorStop(1, 'rgba(140,100,255,0)');

      ctx.beginPath();
      ctx.moveTo(px - 1.5, py);
      ctx.lineTo(px + 1.5, py);
      ctx.lineTo(px + 1, py - pillarH);
      ctx.lineTo(px - 1, py - pillarH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  private _drawParticles(ctx: CanvasRenderingContext2D, tileW: number, tileH: number, alpha: number): void {
    const scaleY = tileH / tileW;
    for (const p of this._particles) {
      const px = Math.cos(p.angle) * p.radius * tileW;
      const py = Math.sin(p.angle) * p.radius * tileW * scaleY - p.z;
      const a = alpha * (1 - p.z / 30) * 0.9;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.angle * 2);

      // 小四面体（简化为旋转菱形）
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.lineTo(p.size * 0.6, 0);
      ctx.lineTo(0, p.size);
      ctx.lineTo(-p.size * 0.6, 0);
      ctx.closePath();
      ctx.fillStyle = p.color.replace(')', `,${a})`).replace('rgb', 'rgba');
      ctx.fill();
      ctx.restore();
    }
  }
}
