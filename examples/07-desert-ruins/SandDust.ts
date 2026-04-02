/**
 * SandDust — 沙尘粒子系统
 *
 * 60个旋转半透明小菱形，缓慢漂移，远处更密集。
 */
import { IsoObject, DrawContext } from '../../src/elements/IsoObject';
import { AABB } from '../../src/math/depthSort';
import { project } from '../../src/math/IsoProjection';

interface DustParticle {
  x: number; y: number; z: number;
  vx: number; vy: number;
  rotation: number;
  rotSpeed: number;
  life: number;       // 0-1
  lifeRate: number;
  size: number;
  alpha: number;
}

export class SandDustSystem extends IsoObject {
  private _particles: DustParticle[] = [];
  private _lastTs = 0;
  readonly cols: number;
  readonly rows: number;
  speedMult = 1;

  constructor(id: string, cols: number, rows: number) {
    super(id, 0, 0, 0);
    this.cols = cols;
    this.rows = rows;
    this.castsShadow = false;

    for (let i = 0; i < 60; i++) {
      this._particles.push(this._spawn(true));
    }
  }

  get aabb(): AABB {
    return { minX: 0, minY: 0, maxX: this.cols, maxY: this.rows, baseZ: 0 };
  }

  private _spawn(randomLife = false): DustParticle {
    // 远处（row < 6）更密集
    const farBias = Math.random() < 0.55;
    const x = Math.random() * this.cols;
    const y = farBias ? Math.random() * 6 : Math.random() * this.rows;
    const z = Math.random() * 8;
    return {
      x, y, z,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.3) * 0.3,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 2,
      life: randomLife ? Math.random() : 0,
      lifeRate: 0.04 + Math.random() * 0.06,
      size: 2 + Math.random() * 4,
      alpha: 0.15 + Math.random() * 0.3,
    };
  }

  update(ts?: number): void {
    const now = ts ?? performance.now();
    const dt = this._lastTs === 0 ? 0.016 : Math.min((now - this._lastTs) / 1000, 0.1);
    this._lastTs = now;

    for (let i = 0; i < this._particles.length; i++) {
      const p = this._particles[i];
      p.life += p.lifeRate * dt * this.speedMult;
      if (p.life >= 1) {
        this._particles[i] = this._spawn(false);
        continue;
      }
      p.x += p.vx * dt * this.speedMult;
      p.y += p.vy * dt * this.speedMult;
      p.z += 0.3 * dt * this.speedMult;
      if (p.z > 8) p.z = 0;
      p.rotation += p.rotSpeed * dt * this.speedMult;
    }
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const p of this._particles) {
      const fadeAlpha = p.alpha * Math.sin(p.life * Math.PI);
      if (fadeAlpha < 0.02) continue;

      const { sx, sy } = project(p.x, p.y, p.z, tileW, tileH);
      const px = originX + sx, py = originY + sy;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = fadeAlpha;

      // 菱形（旋转正方形）
      const s = p.size;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.6, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.6, 0);
      ctx.closePath();
      ctx.fillStyle = '#e8c870';
      ctx.fill();

      ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}
