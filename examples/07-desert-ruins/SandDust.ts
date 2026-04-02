/**
 * SandDust — 沙尘粒子系统（使用框架 ParticleSystem.presets.ambientDrift）
 */
import { IsoObject, DrawContext } from '../../src/elements/IsoObject';
import { ParticleSystem } from '../../src/animation/ParticleSystem';
import { AABB } from '../../src/math/depthSort';

export class SandDustSystem extends IsoObject {
  private _ps: ParticleSystem;
  readonly cols: number;
  readonly rows: number;
  speedMult = 1;

  constructor(id: string, cols: number, rows: number) {
    super(id, 0, 0, 0);
    this.cols = cols;
    this.rows = rows;
    this.castsShadow = false;

    // 在场景中心生成，用大 spawnRadius 覆盖整个场景
    this._ps = new ParticleSystem(`${id}-ps`, cols / 2, rows / 2, 0);
    this._ps.autoRemove = false;
    this._ps.addEmitter({
      ...ParticleSystem.presets.ambientDrift({
        color: '#e8c870',
        count: 60,
        speed: [0.1, 0.5],
        size: [2, 5],
        alpha: 0.3,
        blend: 'screen',
        shape: 'square',
      }),
      shape: 'circle',
      spawnRadius: Math.max(cols, rows) * 0.6,  // 覆盖整个场景
    });
  }

  get aabb(): AABB {
    return { minX: 0, minY: 0, maxX: this.cols, maxY: this.rows, baseZ: 0, maxZ: 4 };
  }

  update(ts?: number): void {
    const cfg = (this._ps as any)._emitters[0]?.cfg;
    if (cfg) {
      cfg.rate = Math.round(60 * this.speedMult);
      // 调整速度
      cfg.speed = [0.1 * this.speedMult, 0.5 * this.speedMult];
    }
    this._ps.update(ts);
  }

  draw(dc: DrawContext): void {
    this._ps.draw(dc);
  }
}
