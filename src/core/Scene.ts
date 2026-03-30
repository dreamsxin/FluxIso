import { IsoObject, DrawContext } from '../elements/IsoObject';
import { BaseLight } from '../lighting/BaseLight';
import { OmniLight } from '../lighting/OmniLight';
import { DirectionalLight } from '../lighting/DirectionalLight';
import { Camera } from './Camera';
import { project } from '../math/IsoProjection';
import { topoSort } from '../math/depthSort';
import { TileCollider } from '../physics/TileCollider';

export interface SceneOptions {
  tileW?: number;
  tileH?: number;
  cols?: number;
  rows?: number;
}

export class Scene {
  readonly camera: Camera;
  private objects: IsoObject[] = [];
  private lights: BaseLight[] = [];
  /** Optional tile-based collision layer. Set via engine.buildScene() or directly. */
  collider: TileCollider | null = null;

  readonly tileW: number;
  readonly tileH: number;
  readonly cols: number;
  readonly rows: number;

  constructor(opts: SceneOptions = {}) {
    this.tileW = opts.tileW ?? 64;
    this.tileH = opts.tileH ?? 32;
    this.cols = opts.cols ?? 10;
    this.rows = opts.rows ?? 10;
    this.camera = new Camera();
  }

  // ── Objects ────────────────────────────────────────────────────────────────

  addObject(obj: IsoObject): void {
    this.objects.push(obj);
  }

  removeById(id: string): void {
    this.objects = this.objects.filter((o) => o.id !== id);
    this.lights = this.lights.filter((l) => (l as { id?: string }).id !== id);
  }

  getById(id: string): IsoObject | undefined {
    return this.objects.find((o) => o.id === id);
  }

  // ── Lights ─────────────────────────────────────────────────────────────────

  addLight(light: BaseLight): void {
    this.lights.push(light);
  }

  get omniLights(): OmniLight[] {
    return this.lights.filter((l): l is OmniLight => l instanceof OmniLight);
  }

  get dirLights(): DirectionalLight[] {
    return this.lights.filter((l): l is DirectionalLight => l instanceof DirectionalLight);
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  update(ts?: number): void {
    this.camera.update();
    for (const obj of this.objects) {
      const updatable = obj as unknown as { update?: (ts?: number, collider?: TileCollider | null) => void };
      if (typeof updatable.update === 'function') {
        updatable.update(ts, this.collider);
      }
    }
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  draw(
    ctx: CanvasRenderingContext2D,
    _canvasW: number,
    _canvasH: number,
    originX: number,
    originY: number,
  ): void {
    // Topological depth sort using AABB overlap detection
    const sorted = topoSort(this.objects);

    const dc: DrawContext = {
      ctx,
      tileW: this.tileW,
      tileH: this.tileH,
      originX,
      originY,
      omniLights: this.omniLights,
      dirLights: this.dirLights,
    };

    for (const obj of sorted) {
      obj.draw(dc);
    }

    // Draw light halos on top of objects
    for (const light of this.omniLights) {
      const lp = project(light.position.x, light.position.y, 0, this.tileW, this.tileH);
      const lx = originX + lp.sx;
      const ly = originY + lp.sy - light.position.z;
      this.drawLightHalo(ctx, lx, ly, light.color, light.intensity);
    }
  }

  private drawLightHalo(
    ctx: CanvasRenderingContext2D,
    lx: number,
    ly: number,
    color: string,
    intensity: number,
  ): void {
    const r = 18 * Math.min(1.5, intensity);
    const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
    grad.addColorStop(0, this.hexToRgba(color, 0.95));
    grad.addColorStop(0.3, this.hexToRgba(color, 0.55));
    grad.addColorStop(1, this.hexToRgba(color, 0));

    ctx.beginPath();
    ctx.arc(lx, ly, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff8e0';
    ctx.fill();
  }

  private hexToRgba(hex: string, alpha: number): string {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = (n >> 16) & 0xff;
    const g = (n >> 8) & 0xff;
    const b = n & 0xff;
    return `rgba(${r},${g},${b},${alpha})`;
  }
}
