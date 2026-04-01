export abstract class BaseLight {
  abstract readonly type: string;
  color: string;
  intensity: number;
  /** Optional id — allows scene.removeById() to remove this light. */
  id?: string;

  constructor(color = '#ffffff', intensity = 1) {
    this.color = color;
    this.intensity = intensity;
  }
}
