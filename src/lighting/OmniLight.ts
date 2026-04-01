import { IsoVec3 } from '../math/IsoProjection';
import { BaseLight } from './BaseLight';

export interface OmniLightOptions {
  id?: string;
  x: number;
  y: number;
  z: number;
  color?: string;
  intensity?: number;
  /** Falloff radius in screen pixels */
  radius?: number;
  /**
   * When true, this light contributes uniformly to the entire scene with no
   * distance falloff — equivalent to a global ambient / sky light.
   * Ideal for day/night ambient: set color + intensity each frame and the
   * whole scene responds automatically without any manual floor sync.
   * Default false.
   */
  isGlobal?: boolean;
}

export class OmniLight extends BaseLight {
  readonly type = 'omni' as const;
  position: IsoVec3;
  radius: number;
  /** No distance falloff when true — acts as a global ambient light. */
  isGlobal: boolean;

  constructor(opts: OmniLightOptions) {
    super(opts.color ?? '#ffffff', opts.intensity ?? 1);
    this.id = opts.id;
    this.position = { x: opts.x, y: opts.y, z: opts.z };
    this.radius = opts.radius ?? 320;
    this.isGlobal = opts.isGlobal ?? false;
  }

  /**
   * Returns illumination (0–1) at screen point (sx, sy).
   * Global lights ignore distance and return intensity directly.
   */
  illuminateAt(sx: number, sy: number, lsx: number, lsy: number): number {
    if (this.isGlobal) return this.intensity;
    const dist = Math.hypot(sx - lsx, sy - lsy);
    return Math.max(0, 1 - dist / this.radius) * this.intensity;
  }
}
