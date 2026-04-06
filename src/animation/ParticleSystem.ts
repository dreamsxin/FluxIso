import { IsoObject, DrawContext } from '../elements/IsoObject';
import { project } from '../math/IsoProjection';
import { AABB } from '../math/depthSort';
import { SpriteSheet } from './SpriteSheet';

export enum EmitterShape { POINT, CIRCLE, SQUARE }
export enum ParticleBlend { ADD, ALPHA, MULTIPLY }

export interface EmitterConfig {
  rate: number;
  max?: number;
  maxParticles?: number;
  shape?: EmitterShape | string;
  radius?: number;
  spawnRadius?: number;
  // accept both 'life' and 'lifetime' tuple forms
  life?: [number, number];
  lifetime?: [number, number];
  // accept both 'speed' tuple and separate vz
  speed?: [number, number];
  vz?: [number, number];
  angle?: [number, number];
  size: [number, number];
  sizeFinal?: number;
  color?: string | string[];
  colorStart?: string;
  colorEnd?: string;
  alphaStart?: number;
  alphaEnd?: number;
  gravity?: number;
  spriteClip?: string;
  blend?: ParticleBlend | string;
  rotSpeed?: [number, number];
  particleShape?: string;
}

export interface ParticleOptions {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; size: number;
  color?: string; gravity?: number;
  spriteSheet?: SpriteSheet; spriteClip?: string;
}

export class ParticleSystem extends IsoObject {
  private particles: Particle[] = [];
  private static _pool: Particle[] = [];
  private _emitters: { config: EmitterConfig, accumulator: number }[] = [];
  onExhausted: (() => void) | null = null;
  private _lastTs = 0;

  static presets: any = {
    crystalShatter: (_o?: any) => ({ rate: 0, life: [0.4, 0.8], speed: [2, 5], size: [4, 8], color: ['#00ffff', '#ffffff'], gravity: 10 }),
    dustPuff:       (_o?: any) => ({ rate: 0, life: [0.6, 1.0], speed: [0.5, 2], size: [8, 20], color: ['#887766'], gravity: 0 }),
    coinSpill:      (_o?: any) => ({ rate: 0, life: [0.8, 1.5], speed: [1, 4], size: [5, 10], color: ['#ffff00', '#ffd700'], gravity: 12 }),
    sparkBurst:     (_o?: any) => ({ rate: 0, life: [0.3, 0.6], speed: [4, 8], size: [2, 5], color: ['#ffffff', '#ffffcc'], gravity: 5 }),
    FIRE:   { rate: 40, life: [0.5, 1.2], speed: [0.5, 1.5], size: [4, 12], color: ['#ff4400', '#ffaa00'], gravity: 2 },
    SMOKE:  { rate: 10, life: [1.5, 3.0], speed: [0.2, 0.6], size: [10, 30], color: ['#333', '#666'], gravity: -1 },
  };

  constructor(id: string, x: number, y: number, z: number) {
    super(id, x, y, z);
    this.castsShadow = false;
  }

  addEmitter(config: EmitterConfig): void {
    this._emitters.push({ config, accumulator: 0 });
  }

  spawn(opts: ParticleOptions): void {
    let p = ParticleSystem._pool.pop();
    if (p) p.reset(opts); else p = new Particle(opts);
    this.particles.push(p);
  }

  burst(count = 20, randomness = 0.5): void {
    // Legacy: burst first emitter
    const e = this._emitters[0];
    if (!e) return;
    const c = e.config;
    for (let i = 0; i < count; i++) {
      this.spawnFromEmitter(c, randomness);
    }
  }

  get aabb(): AABB {
    if (this.particles.length === 0) {
      return { minX: this.position.x - 0.5, minY: this.position.y - 0.5, maxX: this.position.x + 0.5, maxY: this.position.y + 0.5, baseZ: this.position.z };
    }
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const p of this.particles) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY, baseZ: this.position.z };
  }

  update(ts?: number): void {
    const now = ts ?? performance.now();
    const dt  = this._lastTs === 0 ? 1 / 60 : Math.min((now - this._lastTs) / 1000, 0.1);
    this._lastTs = now;

    for (const e of this._emitters) {
      if (e.config.rate <= 0) continue;
      e.accumulator += dt;
      const interval = 1 / e.config.rate;
      while (e.accumulator >= interval) {
        e.accumulator -= interval;
        this.spawnFromEmitter(e.config);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (!p.update(dt)) {
        this.particles.splice(i, 1);
        ParticleSystem._pool.push(p);
      }
    }
    if (this.particles.length === 0 && this._emitters.every(e => e.config.rate <= 0)) {
      this.onExhausted?.();
    }
  }

  private spawnFromEmitter(c: EmitterConfig, randomness = 1.0): void {
    const limit = c.maxParticles ?? c.max;
    if (limit !== undefined && this.particles.length >= limit) return;

    const rx = (Math.random() - 0.5) * (c.spawnRadius ?? c.radius ?? 0);
    const ry = (Math.random() - 0.5) * (c.spawnRadius ?? c.radius ?? 0);
    const lifeRange = c.life ?? c.lifetime ?? [0.5, 1.0];
    const life = lifeRange[0] + Math.random() * (lifeRange[1] - lifeRange[0]);
    const speedRange = c.speed ?? [1, 2];
    const speed = (speedRange[0] + Math.random() * (speedRange[1] - speedRange[0])) * randomness;
    const size = c.size[0] + Math.random() * (c.size[1] - c.size[0]);
    const angleRange = c.angle ?? [0, Math.PI * 2];
    const angle = angleRange[0] + Math.random() * (angleRange[1] - angleRange[0]);
    const vzRange = c.vz;
    const vzVal = vzRange ? vzRange[0] + Math.random() * (vzRange[1] - vzRange[0]) : speed;
    const color = Array.isArray(c.color)
      ? c.color[Math.floor(Math.random() * c.color.length)]
      : (c.color ?? c.colorStart ?? '#fff');
    this.spawn({
      x: this.position.x + rx, y: this.position.y + ry, z: this.position.z,
      vx: Math.cos(angle) * speed * 0.2, vy: Math.sin(angle) * speed * 0.2, vz: vzVal,
      life, size, color, gravity: c.gravity, spriteClip: c.spriteClip
    });
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;
    for (const p of this.particles) {
      const { sx, sy } = project(p.x, p.y, p.z, tileW, tileH);
      const bx = originX + sx;
      const by = originY + sy;
      ctx.beginPath();
      ctx.arc(bx, by, p.size * (tileW / 32), 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }
  }
}

class Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  size: number; color: string; gravity: number;
  alpha = 1.0;
  constructor(opts: ParticleOptions) {
    this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0;
    this.life = 0; this.maxLife = 0; this.size = 0; this.color = '#fff'; this.gravity = 0;
    this.reset(opts);
  }
  reset(opts: ParticleOptions): void {
    this.x = opts.x; this.y = opts.y; this.z = opts.z;
    this.vx = opts.vx; this.vy = opts.vy; this.vz = opts.vz;
    this.life = opts.life; this.maxLife = opts.life;
    this.size = opts.size;
    this.color = opts.color ?? '#fff';
    this.gravity = opts.gravity ?? 0;
    this.alpha = 1.0;
  }
  update(dt: number): boolean {
    this.life -= dt;
    if (this.life <= 0) return false;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this.vz -= this.gravity * dt;
    this.alpha = this.life / this.maxLife;
    return true;
  }
}
