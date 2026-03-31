import { IsoObject, DrawContext } from '../elements/IsoObject';
import { BaseLight } from '../lighting/BaseLight';
import { OmniLight } from '../lighting/OmniLight';
import { DirectionalLight } from '../lighting/DirectionalLight';
import { ShadowCaster } from '../lighting/ShadowCaster';
import { Camera } from './Camera';
import { LightmapCache } from './LightmapCache';
import { Floor } from '../elements/Floor';
import { Wall } from '../elements/Wall';
import { Character } from '../elements/Character';
import { Cloud } from '../elements/props/Cloud';
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
  collider: TileCollider | null = null;
  private _lightmapCache: LightmapCache | null = null;

  // ── Performance: dirty-flag sort cache ────────────────────────────────────
  private _sortedCache: IsoObject[] = [];
  private _sortDirty = true;
  /** Snapshot of AABB positions used to detect movement between frames. */
  private _aabbSnapshot: string = '';

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
    this._sortDirty = true;
  }

  removeById(id: string): void {
    this.objects = this.objects.filter((o) => o.id !== id);
    this.lights  = this.lights.filter((l) => (l as { id?: string }).id !== id);
    this._sortDirty = true;
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

  private _lastTs = 0;

  update(ts?: number): void {
    const now = ts ?? performance.now();
    const dt  = this._lastTs === 0 ? 1 / 60 : Math.min((now - this._lastTs) / 1000, 0.1);
    this._lastTs = now;
    this.camera.update(dt);
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

    // ── Frustum culling ────────────────────────────────────────────────────
    // Compute visible world bounds from camera + canvas size.
    // Objects whose AABB centre is far outside the view are skipped.
    const visibleObjects = this._frustumCull(sceneObjects, canvasW, canvasH, originX, originY);

    // ── Dirty-flag topoSort ────────────────────────────────────────────────
    // Re-sort only when object positions have changed.
    const snap = this._buildAabbSnapshot(visibleObjects);
    if (this._sortDirty || snap !== this._aabbSnapshot) {
      this._sortedCache  = topoSort(visibleObjects);
      this._aabbSnapshot = snap;
      this._sortDirty    = false;
    }

    for (const obj of this._sortedCache) {
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

  private _frustumCull(
    objects: IsoObject[],
    canvasW: number,
    canvasH: number,
    originX: number,
    originY: number,
  ): IsoObject[] {
    // Compute world-space bounds visible through the camera.
    // Add a generous margin (2 tiles) to avoid pop-in at edges.
    const margin = 2;
    const zoom   = this.camera.zoom;
    const halfW  = (canvasW / 2) / zoom / (this.tileW / 2) + margin;
    const halfH  = (canvasH / 2) / zoom / (this.tileH / 2) + margin;
    const cx     = this.camera.x;
    const cy     = this.camera.y;

    // In iso space: visible x+y range and x-y range
    const sumMin  = (cx + cy) - halfH * 2;
    const sumMax  = (cx + cy) + halfH * 2;
    const diffMin = (cx - cy) - halfW * 2;
    const diffMax = (cx - cy) + halfW * 2;

    return objects.filter((obj) => {
      const { minX, minY, maxX, maxY } = obj.aabb;
      const cX = (minX + maxX) / 2;
      const cY = (minY + maxY) / 2;
      const sum  = cX + cY;
      const diff = cX - cY;
      return sum  >= sumMin  && sum  <= sumMax
          && diff >= diffMin && diff <= diffMax;
    });
  }

  private _buildAabbSnapshot(objects: IsoObject[]): string {
    // Compact snapshot: only position, not full AABB, for speed
    return objects.map(o =>
      `${o.id}:${o.position.x.toFixed(2)},${o.position.y.toFixed(2)},${o.position.z.toFixed(2)}`
    ).join('|');
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  /**
   * Export the scene as a plain JSON object compatible with `Engine.loadScene()`.
   *
   * Props other than Cloud, Character, Floor, Wall are omitted (they carry
   * runtime state that cannot round-trip cleanly). Add custom serialization
   * by subclassing Scene and overriding this method.
   */
  toJSON(): Record<string, unknown> {
    const floors      = this.objects.filter((o): o is Floor      => o instanceof Floor);
    const walls       = this.objects.filter((o): o is Wall       => o instanceof Wall);
    const characters  = this.objects.filter((o): o is Character  => o instanceof Character);
    const clouds      = this.objects.filter((o): o is Cloud      => o instanceof Cloud);

    const floor = floors[0];
    const walkable = this.collider
      ? Array.from({ length: this.collider.rows }, (_, r) =>
          Array.from({ length: this.collider!.cols }, (__, c) => this.collider!.isWalkable(c, r)),
        )
      : undefined;

    return {
      name:  'Untitled Scene',
      cols:  this.cols,
      rows:  this.rows,
      tileW: this.tileW,
      tileH: this.tileH,

      ...(floor ? {
        floor: {
          id:           floor.id,
          cols:         floor.cols,
          rows:         floor.rows,
          ...(floor.color         ? { color:        floor.color }        : {}),
          ...(floor.altColor      ? { altColor:      floor.altColor }     : {}),
          ...(floor.tileImageUrl  ? { tileImage:     floor.tileImageUrl } : {}),
          ...(floor.altTileImageUrl ? { altTileImage: floor.altTileImageUrl } : {}),
          ...(walkable            ? { walkable }                          : {}),
        },
      } : {}),

      walls: walls.map(w => ({
        id:       w.id,
        x:        w.position.x,
        y:        w.position.y,
        endX:     w.endX,
        endY:     w.endY,
        height:   w.wallHeight,
        color:    w.color,
        openings: w.openings,
      })),

      lights: [
        ...this.omniLights.map(l => ({
          type:      'omni',
          x:         l.position.x,
          y:         l.position.y,
          z:         l.position.z,
          color:     l.color,
          intensity: l.intensity,
          radius:    l.radius,
        })),
        ...this.dirLights.map(l => ({
          type:      'directional',
          angle:     Math.round(l.angle * 180 / Math.PI),
          elevation: Math.round(l.elevation * 180 / Math.PI),
          color:     l.color,
          intensity: l.intensity,
        })),
      ],

      characters: characters.map(c => ({
        id:     c.id,
        x:      c.position.x,
        y:      c.position.y,
        z:      c.position.z,
        radius: c.radius,
        color:  c.color,
      })),

      clouds: clouds.map(c => ({
        id:       c.id,
        x:        c.position.x,
        y:        c.position.y,
        altitude: c.altitude,
        speed:    c.speed,
        angle:    c.angle,
        scale:    c.scale,
        seed:     c.seed,
      })),
    };
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
