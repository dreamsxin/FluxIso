import { IsoVec3 } from '../math/IsoProjection';
import { BaseLight } from './BaseLight';

export interface OmniLightOptions {
  x: number;
  y: number;
  z: number;
  color?: string;
  intensity?: number;
  /** Falloff radius in screen pixels */
  radius?: number;
}

export class OmniLight extends BaseLight {
  readonly type = 'omni' as const;
  position: IsoVec3;
  radius: number;

  constructor(opts: OmniLightOptions) {
    super(opts.color ?? '#ffffff', opts.intensity ?? 1);
    this.position = { x: opts.x, y: opts.y, z: opts.z };
    this.radius = opts.radius ?? 320;
  }

  /**
   * Returns illumination (0–1) at screen point (sx, sy),
   * given the light's own projected screen position (lsx, lsy).
   */
  illuminateAt(sx: number, sy: number, lsx: number, lsy: number): number {
    const dist = Math.hypot(sx - lsx, sy - lsy);
    return Math.max(0, 1 - dist / this.radius) * this.intensity;
  }

  /** BaseLight interface — requires screen-space light position injected externally */
  illuminate(_sx: number, _sy: number): number {
    return 0; // screen pos unknown without projection context; use illuminateAt instead
  }
}
