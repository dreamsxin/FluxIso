export abstract class BaseLight {
  abstract readonly type: string;
  color: string;
  intensity: number;

  constructor(color = '#ffffff', intensity = 1) {
    this.color = color;
    this.intensity = intensity;
  }

  /**
   * Compute illumination factor (0–1) for a given screen-space point.
   * Implemented by each subclass.
   */
  abstract illuminate(sx: number, sy: number): number;
}
