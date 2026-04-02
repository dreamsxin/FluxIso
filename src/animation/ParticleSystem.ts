/**
 * ParticleSystem — sprite-animated and procedural particle emitter for LuxIso.
 *
 * Integrates with the scene as an IsoObject so particles are depth-sorted
 * correctly alongside walls, characters, and props.
 *
 * Two rendering modes per emitter:
 *   - Procedural: colored circles/squares with per-particle color, size, alpha
 *   - Sprite:     draws frames from a SpriteSheet clip on each particle
 *
 * Usage:
 *   const fx = new ParticleSystem('hit-fx', 3, 4, 0);
 *   fx.addEmitter(ParticleSystem.presets.sparkBurst({ color: '#ff8040' }));
 *   scene.addObject(fx);
 *   // Later, trigger a burst:
 *   fx.burst(20);
 */
import { IsoObject, DrawContext } from '../elements/IsoObject';
import { project } from '../math/IsoProjection';
import { AABB } from '../math/depthSort';
import { SpriteSheet } from './SpriteSheet';
import { hexToRgb } from '../math/color';

// ── Particle state ────────────────────────────────────────────────────────────

interface Particle {
  // World position (relative to emitter origin)
  x: number; y: number; z: number;
  // Velocity (world units/sec)
  vx: number; vy: number; vz: number;
  // Gravity acceleration on z (world units/sec²)
  gravity: number;
  // Life: 0 = just born, 1 = dead
  life: number;
  // How fast life increases per second (1/duration)
  lifeRate: number;
  // Visual
  size: number;       // radius in screen pixels at birth
  sizeFinal: number;  // radius at end of life
  rotation: number;   // radians
  rotSpeed: number;   // radians/sec
  // Color (RGBA components, interpolated over life)
  r0: number; g0: number; b0: number; a0: number;
  r1: number; g1: number; b1: number; a1: number;
  // Sprite frame index (for sprite mode)
  frameIndex: number;
  frameElapsed: number;
  active: boolean;
}

// ── Emitter config ────────────────────────────────────────────────────────────

export type EmitterShape = 'point' | 'circle' | 'ring';
export type ParticleBlend = 'source-over' | 'screen' | 'lighter' | 'multiply';

export interface EmitterConfig {
  // Emission
  /** Max live particles at once. Default 64. */
  maxParticles?: number;
  /** Particles emitted per second (continuous). 0 = burst-only. Default 0. */
  rate?: number;
  /** Shape of the spawn area. Default 'point'. */
  shape?: EmitterShape;
  /** Radius of circle/ring spawn shape (world units). Default 0.3. */
  spawnRadius?: number;

  // Lifetime
  /** Particle duration in seconds [min, max]. Default [0.4, 0.8]. */
  lifetime?: [number, number];

  // Velocity (world units/sec)
  /** Speed range [min, max]. Default [1, 3]. */
  speed?: [number, number];
  /** Angle range in radians [min, max]. Default [0, 2π] (all directions). */
  angle?: [number, number];
  /** Vertical (z) velocity range [min, max]. Default [0.5, 2]. */
  vz?: [number, number];
  /** Gravity on z axis (world units/sec²). Negative = fall down. Default -1.5. */
  gravity?: number;

  // Visuals
  /** Particle size in screen pixels at birth [min, max]. Default [4, 10]. */
  size?: [number, number];
  /** Size at end of life (fraction of birth size). Default 0. */
  sizeFinal?: number;
  /** Birth color (hex). Default '#ffffff'. */
  colorStart?: string;
  /** End-of-life color (hex). Default same as colorStart. */
  colorEnd?: string;
  /** Birth alpha. Default 1. */
  alphaStart?: number;
  /** End-of-life alpha. Default 0. */
  alphaEnd?: number;
  /** Canvas composite operation. Default 'screen'. */
  blend?: ParticleBlend;
  /** Rotation speed range [min, max] radians/sec. Default [0, 0]. */
  rotSpeed?: [number, number];
  /** Particle shape: 'circle' | 'square'. Default 'circle'. */
  particleShape?: 'circle' | 'square';

  // Sprite mode (overrides procedural rendering)
  spriteSheet?: SpriteSheet;
  /** Clip name to play on each particle. Default 'default'. */
  spriteClip?: string;
  /** Sprite FPS. Default 12. */
  spriteFps?: number;
  /** Whether sprite clip loops. Default false (plays once then particle dies). */
  spriteLoop?: boolean;
}

// ── Emitter ───────────────────────────────────────────────────────────────────

class Emitter {
  readonly cfg: Required<EmitterConfig>;
  private pool: Particle[];
  private _accumulator = 0; // for continuous emission

  // Resolved color components
  private _r0: number; private _g0: number; private _b0: number;
  private _r1: number; private _g1: number; private _b1: number;

  constructor(cfg: EmitterConfig) {
    this.cfg = {
      maxParticles:  cfg.maxParticles  ?? 64,
      rate:          cfg.rate          ?? 0,
      shape:         cfg.shape         ?? 'point',
      spawnRadius:   cfg.spawnRadius   ?? 0.3,
      lifetime:      cfg.lifetime      ?? [0.4, 0.8],
      speed:         cfg.speed         ?? [1, 3],
      angle:         cfg.angle         ?? [0, Math.PI * 2],
      vz:            cfg.vz            ?? [0.5, 2],
      gravity:       cfg.gravity       ?? -1.5,
      size:          cfg.size          ?? [4, 10],
      sizeFinal:     cfg.sizeFinal     ?? 0,
      colorStart:    cfg.colorStart    ?? '#ffffff',
      colorEnd:      cfg.colorEnd      ?? (cfg.colorStart ?? '#ffffff'),
      alphaStart:    cfg.alphaStart    ?? 1,
      alphaEnd:      cfg.alphaEnd      ?? 0,
      blend:         cfg.blend         ?? 'screen',
      rotSpeed:      cfg.rotSpeed      ?? [0, 0],
      particleShape: cfg.particleShape ?? 'circle',
      spriteSheet:   cfg.spriteSheet   ?? (null as unknown as SpriteSheet),
      spriteClip:    cfg.spriteClip    ?? 'default',
      spriteFps:     cfg.spriteFps     ?? 12,
      spriteLoop:    cfg.spriteLoop    ?? false,
    };

    [this._r0, this._g0, this._b0] = hexToRgb(this.cfg.colorStart);
    [this._r1, this._g1, this._b1] = hexToRgb(this.cfg.colorEnd);

    this.pool = Array.from({ length: this.cfg.maxParticles }, () => this._blank());
  }

  private _blank(): Particle {
    return {
      x:0,y:0,z:0, vx:0,vy:0,vz:0, gravity:0,
      life:1, lifeRate:1,
      size:0, sizeFinal:0, rotation:0, rotSpeed:0,
      r0:255,g0:255,b0:255,a0:1, r1:255,g1:255,b1:255,a1:0,
      frameIndex:0, frameElapsed:0, active:false,
    };
  }

  private _spawn(p: Particle): void {
    const c = this.cfg;
    const rng = Math.random;

    // Position within spawn shape
    if (c.shape === 'circle') {
      const r = rng() * c.spawnRadius;
      const a = rng() * Math.PI * 2;
      p.x = Math.cos(a) * r; p.y = Math.sin(a) * r;
    } else if (c.shape === 'ring') {
      const a = rng() * Math.PI * 2;
      p.x = Math.cos(a) * c.spawnRadius; p.y = Math.sin(a) * c.spawnRadius;
    } else {
      p.x = 0; p.y = 0;
    }
    p.z = 0;

    // Velocity
    const speed = lerp(c.speed[0], c.speed[1], rng());
    const angle = lerp(c.angle[0], c.angle[1], rng());
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.vz = lerp(c.vz[0], c.vz[1], rng());
    p.gravity = c.gravity;

    // Life
    const dur = lerp(c.lifetime[0], c.lifetime[1], rng());
    p.life = 0;
    p.lifeRate = 1 / dur;

    // Visual
    p.size = lerp(c.size[0], c.size[1], rng());
    p.sizeFinal = p.size * c.sizeFinal;
    p.rotation = rng() * Math.PI * 2;
    p.rotSpeed = lerp(c.rotSpeed[0], c.rotSpeed[1], rng()) * (rng() < 0.5 ? 1 : -1);

    p.r0 = this._r0; p.g0 = this._g0; p.b0 = this._b0; p.a0 = c.alphaStart;
    p.r1 = this._r1; p.g1 = this._g1; p.b1 = this._b1; p.a1 = c.alphaEnd;

    // Sprite
    p.frameIndex = 0;
    p.frameElapsed = 0;

    p.active = true;
  }

  /** Emit `count` particles immediately. */
  burst(count: number): void {
    let emitted = 0;
    for (const p of this.pool) {
      if (!p.active) { this._spawn(p); if (++emitted >= count) break; }
    }
  }

  /** Update all particles. `dt` in seconds. Returns true if any particle is alive. */
  update(dt: number): boolean {
    const c = this.cfg;

    // Continuous emission
    if (c.rate > 0) {
      this._accumulator += c.rate * dt;
      const toEmit = Math.floor(this._accumulator);
      this._accumulator -= toEmit;
      if (toEmit > 0) this.burst(toEmit);
    }

    let anyAlive = false;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life += p.lifeRate * dt;

      if (p.life >= 1) {
        // Sprite: if looping, keep alive; otherwise die
        if (c.spriteSheet && c.spriteLoop) {
          p.life = 0;
        } else {
          p.active = false;
          continue;
        }
      }

      // Physics
      p.vz += p.gravity * dt;
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      p.z  += p.vz * dt;
      if (p.z < 0) { p.z = 0; p.vz = 0; }

      // Rotation
      p.rotation += p.rotSpeed * dt;

      // Sprite frame advance
      if (c.spriteSheet) {
        p.frameElapsed += dt;
        const frameDur = 1 / c.spriteFps;
        const clip = c.spriteSheet.clips.get(c.spriteClip);
        if (clip && clip.frames.length > 0) {
          const totalFrames = clip.frames.length;
          if (c.spriteLoop) {
            p.frameIndex = Math.floor((p.frameElapsed / frameDur) % totalFrames);
          } else {
            p.frameIndex = Math.min(Math.floor(p.frameElapsed / frameDur), totalFrames - 1);
          }
        }
      }

      anyAlive = true;
    }
    return anyAlive;
  }

  /** Draw all active particles. `ox/oy` = emitter screen origin. */
  draw(ctx: CanvasRenderingContext2D, ox: number, oy: number, tileW: number, tileH: number): void {
    const c = this.cfg;
    ctx.save();
    ctx.globalCompositeOperation = c.blend;

    for (const p of this.pool) {
      if (!p.active) continue;
      const t = p.life;

      // Screen position: project particle world offset
      const { sx, sy } = project(p.x, p.y, p.z, tileW, tileH);
      const px = ox + sx;
      const py = oy + sy;

      const r = Math.round(lerp(p.r0, p.r1, t));
      const g = Math.round(lerp(p.g0, p.g1, t));
      const b = Math.round(lerp(p.b0, p.b1, t));
      const a = lerp(p.a0, p.a1, t);
      const sz = lerp(p.size, p.sizeFinal, t);

      if (c.spriteSheet) {
        const img = c.spriteSheet.image;
        const clip = c.spriteSheet.clips.get(c.spriteClip);
        if (img && clip && clip.frames.length > 0) {
          const frame = clip.frames[p.frameIndex];
          const w = frame.w * (c.spriteSheet.scale ?? 1);
          const h = frame.h * (c.spriteSheet.scale ?? 1);
          ctx.globalAlpha = a;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(p.rotation);
          ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, -w / 2, -h / 2, w, h);
          ctx.restore();
        }
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(p.rotation);
        if (c.particleShape === 'square') {
          ctx.fillRect(-sz, -sz * 0.5, sz * 2, sz);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, sz, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  get activeCount(): number {
    return this.pool.filter(p => p.active).length;
  }
}

// ── ParticleSystem (IsoObject) ────────────────────────────────────────────────

/**
 * ParticleSystem is an IsoObject that hosts one or more Emitters.
 * Add it to a Scene to participate in depth sorting and the render loop.
 *
 * The system auto-removes itself from the scene when all emitters are
 * exhausted and `autoRemove` is true (default).
 */
export class ParticleSystem extends IsoObject {
  private _emitters: Emitter[] = [];
  private _lastTs = 0;
  private _alive = true;

  /** If true, the system marks itself inactive when all particles die. */
  autoRemove = true;

  /** Called when all particles have died (useful for cleanup). */
  onExhausted: (() => void) | null = null;

  constructor(id: string, x: number, y: number, z = 0) {
    super(id, x, y, z);
    // Particles are visual-only effects; never cast ground shadows
    this.castsShadow = false;
  }

  get aabb(): AABB {
    // Particles spread around the origin; use a generous fixed radius
    return {
      minX: this.position.x - 2, minY: this.position.y - 2,
      maxX: this.position.x + 2, maxY: this.position.y + 2,
      baseZ: this.position.z,
    };
  }

  get isAlive(): boolean { return this._alive; }

  /** Add an emitter configuration to this system. */
  addEmitter(cfg: EmitterConfig): this {
    this._emitters.push(new Emitter(cfg));
    return this;
  }

  /**
   * Trigger a burst on all emitters.
   * @param count Particles per emitter. Default uses emitter's maxParticles/4.
   */
  burst(count?: number): this {
    for (const e of this._emitters) {
      e.burst(count ?? Math.max(1, Math.floor(e.cfg.maxParticles / 4)));
    }
    return this;
  }

  update(ts?: number): void {
    const now = ts ?? performance.now();
    if (this._lastTs === 0) { this._lastTs = now; return; }
    const dt = Math.min((now - this._lastTs) / 1000, 0.1);
    this._lastTs = now;

    let anyAlive = false;
    for (const e of this._emitters) {
      if (e.update(dt)) anyAlive = true;
    }

    if (!anyAlive && this.autoRemove) {
      this._alive = false;
      this.onExhausted?.();
    }
  }

  draw(dc: DrawContext): void {
    if (!this._alive && this._emitters.every(e => e.activeCount === 0)) return;

    const { ctx, tileW, tileH, originX, originY } = dc;
    const { sx, sy } = project(this.position.x, this.position.y, this.position.z, tileW, tileH);
    const ox = originX + sx;
    const oy = originY + sy;

    for (const e of this._emitters) {
      e.draw(ctx, ox, oy, tileW, tileH);
    }
  }

  // ── Built-in presets ──────────────────────────────────────────────────────

  static presets = {
    /** Colorful spark burst (hit effect). */
    sparkBurst(opts: { color?: string; count?: number } = {}): EmitterConfig {
      const color = opts.color ?? '#ff8040';
      return {
        maxParticles: opts.count ?? 24,
        rate: 0,
        shape: 'point',
        lifetime: [0.3, 0.7],
        speed: [2, 5],
        angle: [0, Math.PI * 2],
        vz: [1, 4],
        gravity: -6,
        size: [2, 6],
        sizeFinal: 0,
        colorStart: color,
        colorEnd: '#ffffff',
        alphaStart: 1,
        alphaEnd: 0,
        blend: 'screen',
        rotSpeed: [0, 0],
        particleShape: 'circle',
      };
    },

    /** Glowing ember trail (fire/magic effect). */
    emberTrail(opts: { color?: string } = {}): EmitterConfig {
      const color = opts.color ?? '#ff6020';
      return {
        maxParticles: 40,
        rate: 20,
        shape: 'circle',
        spawnRadius: 0.15,
        lifetime: [0.5, 1.2],
        speed: [0.2, 0.8],
        angle: [0, Math.PI * 2],
        vz: [0.5, 2.5],
        gravity: -0.5,
        size: [3, 8],
        sizeFinal: 0,
        colorStart: color,
        colorEnd: '#ffff80',
        alphaStart: 0.9,
        alphaEnd: 0,
        blend: 'screen',
        particleShape: 'circle',
      };
    },

    /** Dust puff (footstep / landing). */
    dustPuff(opts: { color?: string } = {}): EmitterConfig {
      return {
        maxParticles: 16,
        rate: 0,
        shape: 'ring',
        spawnRadius: 0.2,
        lifetime: [0.4, 0.9],
        speed: [0.3, 1.2],
        angle: [0, Math.PI * 2],
        vz: [0.1, 0.5],
        gravity: -0.3,
        size: [6, 14],
        sizeFinal: 1.5,
        colorStart: opts.color ?? '#a09080',
        colorEnd: opts.color ?? '#a09080',
        alphaStart: 0.5,
        alphaEnd: 0,
        blend: 'source-over',
        particleShape: 'circle',
      };
    },

    /** Crystal shatter (gem destruction). */
    crystalShatter(opts: { color?: string } = {}): EmitterConfig {
      const color = opts.color ?? '#8060e0';
      return {
        maxParticles: 20,
        rate: 0,
        shape: 'point',
        lifetime: [0.5, 1.0],
        speed: [1.5, 4],
        angle: [0, Math.PI * 2],
        vz: [2, 5],
        gravity: -8,
        size: [3, 8],
        sizeFinal: 0,
        colorStart: color,
        colorEnd: '#ffffff',
        alphaStart: 1,
        alphaEnd: 0,
        blend: 'screen',
        rotSpeed: [2, 8],
        particleShape: 'square',
      };
    },

    /** Gold coins spill (chest open). */
    coinSpill(opts: { count?: number } = {}): EmitterConfig {
      return {
        maxParticles: opts.count ?? 18,
        rate: 0,
        shape: 'point',
        lifetime: [0.6, 1.1],
        speed: [1, 3],
        angle: [0, Math.PI * 2],
        vz: [3, 6],
        gravity: -10,
        size: [4, 7],
        sizeFinal: 0.3,
        colorStart: '#ffd040',
        colorEnd: '#ff8800',
        alphaStart: 1,
        alphaEnd: 0,
        blend: 'screen',
        rotSpeed: [4, 12],
        particleShape: 'square',
      };
    },

    /** Sprite-based explosion (requires a sprite sheet). */
    spriteExplosion(sheet: SpriteSheet, opts: { clip?: string; count?: number } = {}): EmitterConfig {
      return {
        maxParticles: opts.count ?? 8,
        rate: 0,
        shape: 'circle',
        spawnRadius: 0.3,
        lifetime: [0.5, 0.8],
        speed: [0.5, 1.5],
        angle: [0, Math.PI * 2],
        vz: [0.5, 1.5],
        gravity: -1,
        size: [1, 1],
        sizeFinal: 1,
        alphaStart: 1,
        alphaEnd: 0,
        blend: 'screen',
        spriteSheet: sheet,
        spriteClip: opts.clip ?? 'explode',
        spriteFps: 16,
        spriteLoop: false,
      };
    },

    /**
     * Ambient drifting particles — slow-moving, looping, no gravity.
     * Ideal for dust motes, sand, snow, embers floating in the air.
     * Spawn the system at (0,0) and set a large aabb to cover the scene.
     *
     * @param opts.color   Particle color hex. Default '#e8c870' (sand/dust).
     * @param opts.count   Max live particles. Default 60.
     * @param opts.speed   Drift speed [min, max]. Default [0.1, 0.5].
     * @param opts.size    Particle size px [min, max]. Default [2, 5].
     * @param opts.alpha   Max alpha. Default 0.35.
     * @param opts.blend   Composite op. Default 'screen'.
     * @param opts.shape   Particle shape. Default 'square' (diamond when rotated).
     */
    ambientDrift(opts: {
      color?: string;
      count?: number;
      speed?: [number, number];
      size?: [number, number];
      alpha?: number;
      blend?: ParticleBlend;
      shape?: 'circle' | 'square';
    } = {}): EmitterConfig {
      return {
        maxParticles: opts.count ?? 60,
        rate: opts.count ?? 60,   // continuous — always keep pool full
        shape: 'circle',
        spawnRadius: 0,           // caller positions the system; spread via speed
        lifetime: [3, 8],
        speed: opts.speed ?? [0.1, 0.5],
        angle: [0, Math.PI * 2],
        vz: [0, 0],               // no vertical drift by default
        gravity: 0,               // no gravity — particles float
        size: opts.size ?? [2, 5],
        sizeFinal: 1,
        colorStart: opts.color ?? '#e8c870',
        colorEnd:   opts.color ?? '#e8c870',
        alphaStart: opts.alpha ?? 0.35,
        alphaEnd: 0,
        blend: opts.blend ?? 'screen',
        rotSpeed: [-1.5, 1.5],
        particleShape: opts.shape ?? 'square',
      };
    },

    /**
     * Rising smoke plume — continuous upward smoke from a fixed point.
     * @param opts.color  Smoke color. Default '#303030'.
     * @param opts.count  Max particles. Default 50.
     */
    smokePlume(opts: { color?: string; count?: number } = {}): EmitterConfig {
      return {
        maxParticles: opts.count ?? 50,
        rate: 15,
        shape: 'circle',
        spawnRadius: 0.2,
        lifetime: [2, 4],
        speed: [0.1, 0.3],
        angle: [0, Math.PI * 2],
        vz: [8, 20],
        gravity: 0,
        size: [6, 16],
        sizeFinal: 2,
        colorStart: opts.color ?? '#303030',
        colorEnd: '#808080',
        alphaStart: 0.5,
        alphaEnd: 0,
        blend: 'source-over',
        rotSpeed: [-1, 1],
        particleShape: 'circle',
      };
    },

    /**
     * Lava sparks — burst of hot sparks with gravity, for crack/fissure effects.
     * @param opts.color  Spark color. Default '#ff8800'.
     * @param opts.count  Particles per burst. Default 30.
     */
    lavaSparks(opts: { color?: string; count?: number } = {}): EmitterConfig {
      return {
        maxParticles: opts.count ?? 30,
        rate: 0,
        shape: 'ring',
        spawnRadius: 0.15,
        lifetime: [0.4, 0.9],
        speed: [0.8, 2.5],
        angle: [0, Math.PI * 2],
        vz: [12, 30],
        gravity: -25,
        size: [2, 5],
        sizeFinal: 0,
        colorStart: opts.color ?? '#ff8800',
        colorEnd: '#ff2200',
        alphaStart: 1,
        alphaEnd: 0,
        blend: 'screen',
        particleShape: 'circle',
      };
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
