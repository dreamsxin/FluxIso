export abstract class BaseLight {
  abstract readonly type: string;
  color: string;
  intensity: number;
  /** Optional id — allows scene.removeById() to remove this light. */
  id?: string;
  /**
   * When false, the light is skipped during rendering.
   * Useful for toggling lights without removing them from the scene.
   * Default true.
   */
  enabled: boolean = true;

  constructor(color = '#ffffff', intensity = 1) {
    this.color = color;
    this.intensity = intensity;
  }
}
