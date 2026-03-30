export abstract class BaseLight {
  abstract readonly type: string;
  color: string;
  intensity: number;

  constructor(color = '#ffffff', intensity = 1) {
    this.color = color;
    this.intensity = intensity;
  }
}
