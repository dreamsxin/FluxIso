/**
 * VolcanoFX — 烟雾粒子系统 + 地面裂缝火星喷发
 */
import { IsoObject, DrawContext } from '../../src/elements/IsoObject';
import { AABB } from '../../src/math/depthSort';
import { project } from '../../src/math/IsoProjection';

// ── 烟雾粒子 ──────────────────────────────────────────────────────────────────

interface SmokeParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rotation: number;
  rotSpeed: number;
  life: number;
  lifeRate: number;
  size: number;
  alpha: number;
}

export class SmokePlumeSystem extends IsoObject {
  private _particles: SmokeParticle[] = [];
  private _lastTs = 0;
  densityMult = 1;

  constructor(id: string, x: number, y: number) {
    super(id, x, y, 0);
    this.castsShadow = false;
    for (let i = 0; i < 40; i++) {
      this._particles.push(this._spawn(true));
    }
  }

  get aabb(): AABB {
    return { minX: this.position.x - 2, minY: this.position.y - 2, maxX: this.position.x + 2, maxY: this.position.y + 2, baseZ: 0 };
  }

  private _spawn(randomLife = false): SmokeParticle {
    const { x, y } = this.position;
    return {
      x: x + (Math.random() - 0.5) * 0.6,
      y: y + (Math.random() - 0.5) * 0.6,
      z: 4 + Math.random() * 2,
      vx: (Math.random() - 0.3) * 0.4,   // 轻微向右漂移（风力）
      vy: (Math.random() - 0.5) * 0.2,
      vz: 1.5 + Math.random() * 2,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 1.5,
      life: randomLife ? Math.random() : 0,
      lifeRate: 0.025 + Math.random() * 0.04,
      size: 3 + Math.random() * 5,
      alpha: 0.2 + Math.random() * 0.35,
    };
  }

  update(ts?: number): void {
    const now = ts ?? performance.now();
    const dt  = this._lastTs === 0 ? 0.016 : Math.min((now - this._lastTs) / 1000, 0.1);
    this._lastTs = now;

    const count = Math.round(40 * this.densityMult);
    while (this._particles.length < count) this._particles.push(this._spawn(false));
    while (this._particles.length > count) this._particles.pop();

    for (let i = 0; i < this._particles.length; i++) {
      const p = this._particles[i];
      p.life += p.lifeRate * dt * 60;
      if (p.life >= 1) { this._particles[i] = this._spawn(false); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rotation += p.rotSpeed * dt;
    }
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;
    ctx.save();

    for (const p of this._particles) {
      const fadeAlpha = p.alpha * Math.sin(p.life * Math.PI);
      if (fadeAlpha < 0.02) continue;

      const { sx, sy } = project(p.x, p.y, p.z, tileW, tileH);
      const px = originX + sx, py = originY + sy;

      // 随高度增大
      const sizeScale = 1 + p.life * 2.5;
      const s = p.size * sizeScale;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = fadeAlpha * (1 - p.life * 0.5);

      // 扁平菱形（烟雾薄片）
      const gray = Math.round(20 + p.life * 60);
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.55, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.55, 0);
      ctx.closePath();
      ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
      ctx.fill();

      ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ── 地面裂缝 + 火星喷发 ───────────────────────────────────────────────────────

interface Spark {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  size: number;
}

export class LavaCrack extends IsoObject {
  crackSeed: number;
  private _timer = 0;
  private _nextBurst: number;
  private _sparks: Spark[] = [];
  private _lastTs = 0;
  private _burstActive = false;
  burstAge = 0;

  constructor(id: string, x: number, y: number, crackSeed = 0.5) {
    super(id, x, y, 0);
    this.crackSeed = crackSeed;
    this._nextBurst = 2 + Math.random() * 2;
    this.castsShadow = false;
  }

  get aabb(): AABB {
    return { minX: this.position.x - 0.5, minY: this.position.y - 0.5, maxX: this.position.x + 0.5, maxY: this.position.y + 0.5, baseZ: 0 };
  }

  /** 是否正在喷发（供 main.ts 检测平台生成） */
  get isBursting(): boolean { return this._burstActive; }

  update(ts?: number): void {
    const now = ts ?? performance.now();
    const dt  = this._lastTs === 0 ? 0.016 : Math.min((now - this._lastTs) / 1000, 0.1);
    this._lastTs = now;

    this._timer += dt;
    if (this._timer >= this._nextBurst) {
      this._timer = 0;
      this._nextBurst = 2 + Math.random() * 2;
      this._burst();
    }

    if (this._burstActive) {
      this.burstAge += dt;
      if (this.burstAge > 0.6) this._burstActive = false;
    }

    for (let i = this._sparks.length - 1; i >= 0; i--) {
      const sp = this._sparks[i];
      sp.life -= dt * 1.8;
      sp.x  += sp.vx * dt;
      sp.y  += sp.vy * dt;
      sp.z  += sp.vz * dt;
      sp.vz -= 12 * dt; // gravity
      if (sp.life <= 0) this._sparks.splice(i, 1);
    }
  }

  private _burst(): void {
    this._burstActive = true;
    this.burstAge = 0;
    const { x, y } = this.position;
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3;
      this._sparks.push({
        x, y, z: 0.2,
        vx: Math.cos(angle) * speed * 0.3,
        vy: Math.sin(angle) * speed * 0.3,
        vz: 3 + Math.random() * 5,
        life: 0.6 + Math.random() * 0.4,
        size: 2 + Math.random() * 3,
      });
    }
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;
    const { x, y } = this.position;
    const { sx, sy } = project(x, y, 0, tileW, tileH);
    const cx = originX + sx, cy = originY + sy;
    const seed = this.crackSeed;

    // 裂缝线条（锯齿）
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = '#5a1a08';
    ctx.lineWidth = 1.2;
    const pts: Array<[number, number]> = [
      [-tileW * 0.18, 0],
      [-tileW * 0.08, -tileH * 0.1 + Math.sin(seed * 7) * 3],
      [0, tileH * 0.05],
      [tileW * 0.1, -tileH * 0.08 + Math.cos(seed * 11) * 3],
      [tileW * 0.2, tileH * 0.04],
    ];
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();

    // 裂缝内发光
    ctx.strokeStyle = `rgba(255,80,10,0.4)`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    ctx.restore();

    // 火星粒子
    for (const sp of this._sparks) {
      const { sx: spx, sy: spy } = project(sp.x, sp.y, sp.z, tileW, tileH);
      const px = originX + spx, py = originY + spy;
      const alpha = sp.life;
      const r = 255, g = Math.round(80 + sp.life * 120), b = 0;
      ctx.beginPath();
      ctx.arc(px, py, sp.size * sp.life, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
      ctx.fill();
    }
  }
}
