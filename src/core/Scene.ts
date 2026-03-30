import { IsoObject, DrawContext } from '../elements/IsoObject';
import { BaseLight } from '../lighting/BaseLight';
import { OmniLight } from '../lighting/OmniLight';
import { DirectionalLight } from '../lighting/DirectionalLight';
import { ShadowCaster } from '../lighting/ShadowCaster';
import { Camera } from './Camera';
import { LightmapCache } from './LightmapCache';
import { Floor } from '../elements/Floor';
import { project } from '../math/IsoProjection';
import { topoSort } from '../math/depthSort';
import { TileCollider } from '../physics/TileCollider';
import { hexToRgba } from '../math/color';

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
  /** Lightmap cache for the floor layer. Initialised lazily on first draw. */
  private _lightmapCache: LightmapCache | null = null;

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
    canvasW: number,
    canvasH: number,
    originX: number,
    originY: number,
  ): void {
    // Lazy-init lightmap cache sized to the canvas
    if (!this._lightmapCache) {
      this._lightmapCache = new LightmapCache(canvasW, canvasH);
    }

    const omniLights = this.omniLights;
    const dirLights  = this.dirLights;

    // Separate floor from other objects for lightmap caching
    const floorObjects  = this.objects.filter((o): o is Floor => o instanceof Floor);
    const sceneObjects  = this.objects.filter((o) => !(o instanceof Floor));

    // ── Bake floor lightmap if lights changed ──────────────────────────────
    const cache = this._lightmapCache;
    if (cache.isDirty(omniLights, dirLights, this.camera.x, this.camera.y, this.camera.zoom)) {
      cache.begin();

      // Draw floor into the offscreen canvas using a temporary 2D context.
      // We apply the camera transform to the offscreen canvas so the cached
      // image is always in canvas-pixel space and can be blitted directly.
      const offCtx = cache.ctx as unknown as CanvasRenderingContext2D;
      offCtx.save();
      offCtx.translate(originX, originY);
      offCtx.scale(this.camera.zoom, this.camera.zoom);
      const camOffX = -(this.camera.x - this.camera.y) * (this.tileW / 2);
      const camOffY = -(this.camera.x + this.camera.y) * (this.tileH / 2);
      offCtx.translate(camOffX, camOffY);

      const floorDc: DrawContext = {
        ctx: offCtx,
        tileW: this.tileW,
        tileH: this.tileH,
        originX: 0,
        originY: 0,
        omniLights,
        dirLights,
      };
      for (const floor of floorObjects) {
        floor.draw(floorDc);
      }

      offCtx.restore();

      cache.end();
    }

    // Blit cached floor onto the main canvas (no camera transform needed —
    // the cache is already in canvas-pixel space)
    cache.blit(ctx);

    // Apply camera transform for all non-floor objects
    this.camera.applyTransform(ctx, canvasW, canvasH, this.tileW, this.tileH, originX, originY);

    const dc: DrawContext = {
      ctx,
      tileW: this.tileW,
      tileH: this.tileH,
      originX: 0,
      originY: 0,
      omniLights,
      dirLights,
    };

    // Cast ground shadows from each OmniLight before drawing objects
    for (const light of omniLights) {
      ShadowCaster.draw(ctx, light, sceneObjects, this.tileW, this.tileH);
    }

    const sorted = topoSort(sceneObjects);
    for (const obj of sorted) {
      obj.draw(dc);
    }

    // Light halos (in camera space)
    for (const light of omniLights) {
      const lp = project(light.position.x, light.position.y, 0, this.tileW, this.tileH);
      const lx = lp.sx;
      const ly = lp.sy - light.position.z;
      this.drawLightHalo(ctx, lx, ly, light.color, light.intensity);
    }

    this.camera.restoreTransform(ctx);
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
    grad.addColorStop(0,   hexToRgba(color, 0.95));
    grad.addColorStop(0.3, hexToRgba(color, 0.55));
    grad.addColorStop(1,   hexToRgba(color, 0));

    ctx.beginPath();
    ctx.arc(lx, ly, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff8e0';
    ctx.fill();
  }
}
