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
import { Crystal } from '../elements/props/Crystal';
import { Boulder } from '../elements/props/Boulder';
import { Chest } from '../elements/props/Chest';
import { HealthComponent } from '../ecs/components/HealthComponent';
import { FloatingText, FloatingTextOptions } from '../elements/props/FloatingText';
import { project, DEFAULT_ISO_VIEW } from '../math/IsoProjection';
import type { IsoView } from '../math/IsoProjection';
import { topoSort } from '../math/depthSort';
import { TileCollider } from '../physics/TileCollider';
import { hexToRgb, hexToRgba } from '../math/color';

export interface SceneOptions {
  tileW?: number;
  tileH?: number;
  cols?: number;
  rows?: number;
}

/**
 * Scene — a container for all game objects, lights, and the camera.
 * Handles depth sorting, frustum culling, and rendering management.
 */
export class Scene {
  readonly camera: Camera;
  private objects: IsoObject[] = [];
  private lights: BaseLight[] = [];
  collider: TileCollider | null = null;
  private _lightmapCache: LightmapCache | null = null;

  // ── Performance: dirty-flag sort cache ────────────────────────────────────
  private _sortedCache: IsoObject[] = [];
  private _sortDirty = true;
  /**
   * Lightweight sort-dirty detection: numeric hash of all visible object
   * positions. Compared each frame instead of serializing AABB to a JSON
   * string, eliminating per-frame string allocation and GC pressure.
   */
  private _sortHash = 0;

  // ── Performance: pre-allocated partition buffers ───────────────────────────
  // Reused every frame to avoid per-frame array allocation.
  private _floorBuf: Floor[]     = [];
  private _cullBuf:  IsoObject[] = [];

  readonly tileW: number;
  readonly tileH: number;
  readonly cols: number;
  readonly rows: number;

  /**
   * Scene-level ambient light color (CSS hex string, e.g. '#ffffff').
   * Combined with ambientIntensity and injected into every DrawContext as
   * ambientRgb — Floor, Wall, and custom objects all respond automatically.
   * Change this each frame from your day/night system; no manual floor sync needed.
   */
  ambientColor = '#ffffff';

  /**
   * Scene-level ambient intensity (0–1).
   * Multiplied with ambientColor to produce the ambientRgb in DrawContext.
   * 0 = pitch black ambient, 1 = full ambient color.
   */
  ambientIntensity = 0.15;

  /**
   * When true, the floor lightmap is re-baked every frame.
   * Enable this whenever the scene has dynamic lighting (day/night cycle,
   * moving lights, etc.) so gradual changes are always reflected.
   * Has a small per-frame cost (one offscreen canvas redraw).
   * Default false — static scenes use snapshot-based dirty detection.
   */
  dynamicLighting = false;

  /**
   * Isometric view parameters: rotation (degrees) and elevation (0.2–1.0).
   * Change these to rotate the world or tilt the camera.
   * Use transitionView() for smooth animated transitions.
   */
  view: IsoView = { ...DEFAULT_ISO_VIEW };

  // View transition state
  private _viewFrom: IsoView | null = null;
  private _viewTo:   IsoView | null = null;
  private _viewT     = 0;   // 0→1 progress
  private _viewDur   = 0;   // seconds

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

  /**
   * Get all objects in the scene that are instances of a given class.
   * @example
   *   const crystals = scene.getAll(Crystal);
   */
  getAll<T extends IsoObject>(ctor: new (...args: any[]) => T): T[] {
    return this.objects.filter((o): o is T => o instanceof ctor);
  }

  /** Iterate over all objects currently in the scene (read-only snapshot). */
  get allObjects(): readonly IsoObject[] {
    return this.objects;
  }

  /**
   * Helper to spawn a floating text element in the scene.
   * Useful for damage numbers, status effects, etc.
   */
  spawnFloatingText(opts: Omit<FloatingTextOptions, 'id'>): FloatingText {
    const id = `ft-${Math.random().toString(36).substring(2, 11)}`;
    const ft = new FloatingText({ id, ...opts });
    this.addObject(ft);
    return ft;
  }

  // ── Lights ─────────────────────────────────────────────────────────────────

  addLight(light: BaseLight): void {
    this.lights.push(light);
  }

  get omniLights(): OmniLight[] {
    return this.lights.filter((l): l is OmniLight => l instanceof OmniLight && l.enabled !== false);
  }

  get dirLights(): DirectionalLight[] {
    return this.lights.filter((l): l is DirectionalLight => l instanceof DirectionalLight && l.enabled !== false);
  }

  /** Find a light by id. */
  getLightById(id: string): BaseLight | undefined {
    return this.lights.find(l => l.id === id);
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  private _lastTs = 0;

  /**
   * Smoothly transition to a new isometric view over `duration` seconds.
   * @param to       Target view (rotation in degrees, elevation 0.2–1.0).
   * @param duration Transition duration in seconds. 0 = instant.
   */
  transitionView(to: Partial<IsoView>, duration = 0.6): void {
    const target: IsoView = {
      rotation:  to.rotation  ?? this.view.rotation,
      elevation: to.elevation ?? this.view.elevation,
    };
    if (duration <= 0) { this.view = target; this._viewFrom = null; return; }
    this._viewFrom = { ...this.view };
    this._viewTo   = target;
    this._viewT    = 0;
    this._viewDur  = duration;
    this._lightmapCache?.invalidate();
  }

  update(ts?: number): void {
    const now = ts ?? performance.now();
    const dt  = this._lastTs === 0 ? 1 / 60 : Math.min((now - this._lastTs) / 1000, 0.1);
    this._lastTs = now;

    // Advance view transition
    if (this._viewFrom && this._viewTo) {
      this._viewT = Math.min(1, this._viewT + dt / this._viewDur);
      // easeInOut
      const t = this._viewT < 0.5 ? 2 * this._viewT * this._viewT : 1 - Math.pow(-2 * this._viewT + 2, 2) / 2;
      this.view = {
        rotation:  this._viewFrom.rotation  + (this._viewTo.rotation  - this._viewFrom.rotation)  * t,
        elevation: this._viewFrom.elevation + (this._viewTo.elevation - this._viewFrom.elevation) * t,
      };
      if (this._viewT >= 1) { this.view = { ...this._viewTo }; this._viewFrom = null; this._viewTo = null; }
      this._lightmapCache?.invalidate();
    }

    this.camera.update(dt);
    for (const obj of this.objects) {
      if (!obj.visible) continue;
      const updatable = obj as unknown as { update?: (ts?: number, collider?: TileCollider | null) => void };
      if (typeof updatable.update === 'function') {
        updatable.update(ts, this.collider);
      }
    }

    // Auto-reap expired floating text
    const expired = this.objects.filter((o): o is FloatingText => o instanceof FloatingText && o.isExpired);
    if (expired.length > 0) {
      this.objects = this.objects.filter((o) => !(o instanceof FloatingText && o.isExpired));
      this._sortDirty = true;
    }
  }

  /**
   * Fixed-timestep update — called by Engine at a constant rate (default 60 Hz).
   * Drives physics and pathfinding components (MovementComponent.fixedUpdate).
   */
  fixedUpdate(dt: number): void {
    for (const obj of this.objects) {
      if (!obj.visible) continue;
      // Only Entity subclasses have components
      if ('components' in obj) {
        for (const comp of (obj as any).components) {
          comp.fixedUpdate?.(dt);
        }
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
    this._lightmapCache.alwaysDirty = this.dynamicLighting;

    const omniLights = this.omniLights;
    const dirLights  = this.dirLights;

    // Compute scene ambient RGB (color × intensity)
    const [ar, ag, ab] = hexToRgb(this.ambientColor);
    const ai = Math.max(0, Math.min(1, this.ambientIntensity));
    const ambientRgb: [number, number, number] = [
      (ar / 255) * ai,
      (ag / 255) * ai,
      (ab / 255) * ai,
    ];

    // ── Partition into floor vs non-floor (single pass, reuse buffers) ──
    this._floorBuf.length = 0;
    this._cullBuf.length  = 0;
    for (const o of this.objects) {
      if (o instanceof Floor) this._floorBuf.push(o);
      else if (o.visible)     this._cullBuf.push(o);
    }
    const floorObjects = this._floorBuf;

    // ── Bake floor lightmap if lights or ambient changed ───────────────────
    const cache = this._lightmapCache;
    if (cache.isDirty(omniLights, dirLights, this.camera.x, this.camera.y, this.camera.zoom, ambientRgb)) {
      cache.begin();
      // We apply the camera transform to the offscreen canvas so the cached
      // image is always in canvas-pixel space and can be blitted directly.
      const offCtx = cache.ctx as unknown as CanvasRenderingContext2D;
      offCtx.save();
      offCtx.translate(originX, originY);
      offCtx.scale(this.camera.zoom, this.camera.zoom);

      const rot  = this.view.rotation;
      const elev = this.view.elevation;
      if (elev !== 0.5) offCtx.scale(1, elev / 0.5);
      if (rot !== 0) {
        const rad = (rot * Math.PI) / 180;
        const c = Math.cos(rad), s = Math.sin(rad);
        const aspect = this.tileW / this.tileH;
        offCtx.transform(c, -s / aspect, s * aspect, c, 0, 0);
      }

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
        ambientRgb,
        view: this.view,
      };
      for (const floor of floorObjects) {
        floor.draw(floorDc);
      }

      // Draw shadows into the lightmap so they appear under all objects
      const shadowCasters = this._cullBuf.filter(o => o.castsShadow !== false);
      for (const light of omniLights) {
        ShadowCaster.draw(offCtx, light, shadowCasters, this.tileW, this.tileH);
      }
      for (const light of dirLights) {
        ShadowCaster.drawDirectional(offCtx, light, shadowCasters, this.tileW, this.tileH);
      }

      offCtx.restore();

      cache.end();
    }

    // Blit cached floor onto the main canvas (no camera transform needed —
    // the cache is already in canvas-pixel space)
    cache.blit(ctx);

    // Apply camera transform for all non-floor objects
    this.camera.applyTransform(ctx, canvasW, canvasH, this.tileW, this.tileH, originX, originY, this.view);

    const dc: DrawContext = {
      ctx,
      tileW: this.tileW,
      tileH: this.tileH,
      originX: 0,
      originY: 0,
      omniLights,
      dirLights,
      ambientRgb,
      view: this.view,
    };

    // Cast ground shadows from each OmniLight before drawing objects
    // NOTE: shadows are now baked into the lightmap offscreen canvas above,
    // so they correctly appear beneath all scene objects.

    // ── Frustum culling (in-place, no new array) ───────────────────────────
    this._frustumCull(this._cullBuf, canvasW, canvasH);
    const visibleObjects = this._cullBuf;

    // ── Dirty-flag topoSort ────────────────────────────────────────────────
    // Re-sort only when object positions have changed.
    const hash = (this._computeSortHash(visibleObjects) * 31 + visibleObjects.length) | 0;
    if (this._sortDirty || hash !== this._sortHash) {
      this._sortedCache = topoSort(visibleObjects);
      this._sortHash    = hash;
      this._sortDirty   = false;
    }

    for (const obj of this._sortedCache) {
      obj.draw(dc);
    }

    // Light halos (in camera space)
    for (const light of omniLights) {
      const lp = project(light.position.x, light.position.y, 0, this.tileW, this.tileH, this.view);
      const lx = lp.sx;
      const ly = lp.sy - light.position.z;
      this.drawLightHalo(ctx, lx, ly, light.color, light.intensity);
    }

    this.camera.restoreTransform(ctx);
  }

  /**
   * Frustum-cull `objects` in-place: removes elements that are fully outside
   * the visible isometric viewport. Operates directly on the passed array so
   * no new array is allocated per frame.
   */
  private _frustumCull(
    objects: IsoObject[],
    canvasW: number,
    canvasH: number,
  ): void {
    // Compute the world-space iso-parallelogram visible through the camera.
    //
    // The camera transform maps world → screen as:
    //   sx = (x - y) * tileW/2  (the "diff" axis)
    //   sy = (x + y) * tileH/2  (the "sum"  axis)
    // shifted by the camera's own (x, y) position.
    //
    // Rather than testing AABB centres, we test whether the object's full
    // AABB overlaps the visible region on both iso axes simultaneously.
    // An object is visible iff:
    //   AABB.maxSum  >= viewSumMin   AND   AABB.minSum  <= viewSumMax
    //   AABB.maxDiff >= viewDiffMin  AND   AABB.minDiff <= viewDiffMax
    //
    // where sum  = x + y  (maps to the vertical screen axis)
    //       diff = x - y  (maps to the horizontal screen axis)
    //
    // A small padding (0.5 tile) prevents sub-pixel pop-in at exact edges.
    const pad    = 0.5;
    const zoom   = this.camera.zoom;
    // Half-extents in world-iso units that the canvas can show
    const halfSum  = (canvasH / 2) / zoom / (this.tileH / 2) + pad;
    const halfDiff = (canvasW / 2) / zoom / (this.tileW / 2) + pad;
    const camSum   = this.camera.x + this.camera.y;
    const camDiff  = this.camera.x - this.camera.y;

    const sumMin  = camSum  - halfSum  * 2;
    const sumMax  = camSum  + halfSum  * 2;
    const diffMin = camDiff - halfDiff * 2;
    const diffMax = camDiff + halfDiff * 2;

    let write = 0;
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      const { minX, minY, maxX, maxY } = obj.aabb;
      // sum  extremes: min at (minX+minY), max at (maxX+maxY)
      // diff extremes: min at (minX-maxY), max at (maxX-minY)
      const aabbSumMin  = minX + minY;
      const aabbSumMax  = maxX + maxY;
      const aabbDiffMin = minX - maxY;
      const aabbDiffMax = maxX - minY;
      if (
        aabbSumMax  >= sumMin  && aabbSumMin  <= sumMax &&
        aabbDiffMax >= diffMin && aabbDiffMin <= diffMax
      ) {
        objects[write++] = obj;
      }
    }
    objects.length = write;
  }

  /**
   * Compute a lightweight numeric hash of all object positions.
   * Uses a simple djb2-style accumulation — no string allocation, O(n) arithmetic.
   * Two different configurations may theoretically collide, but the cost of a
   * spurious re-sort is just one extra topoSort call, not a correctness issue.
   */
  private _computeSortHash(objects: IsoObject[]): number {
    let h = 0;
    for (const o of objects) {
      const p = o.position;
      // Multiply by primes and XOR to mix x/y/z independently
      h = (Math.imul(h, 31) + (p.x * 1000 | 0)) | 0;
      h = (Math.imul(h, 31) + (p.y * 1000 | 0)) | 0;
      h = (Math.imul(h, 31) + (p.z * 1000 | 0)) | 0;
    }
    return h;
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  /**
   * Export the scene as a plain JSON object compatible with `Engine.loadScene()`.
   *
   * Serializes Floor, Wall, Character, Cloud, Crystal, Boulder, and Chest.
   * HealthComponent max HP is preserved when present.
   * Custom prop types must override this method or handle serialization externally.
   */
  toJSON(): Record<string, unknown> {
    const floors      = this.objects.filter((o): o is Floor      => o instanceof Floor);
    const walls       = this.objects.filter((o): o is Wall       => o instanceof Wall);
    const characters  = this.objects.filter((o): o is Character  => o instanceof Character);
    const clouds      = this.objects.filter((o): o is Cloud      => o instanceof Cloud);
    const crystals    = this.objects.filter((o): o is Crystal    => o instanceof Crystal);
    const boulders    = this.objects.filter((o): o is Boulder    => o instanceof Boulder);
    const chests      = this.objects.filter((o): o is Chest      => o instanceof Chest);

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

      // Props — serialized so the editor can round-trip Crystal / Boulder / Chest.
      props: [
        ...crystals.map(o => ({
          type:     'crystal' as const,
          id:       o.id,
          x:        o.position.x,
          y:        o.position.y,
          color:    o.propColor,
          heightPx: o.propHeightPx,
          ...(o.getComponent(HealthComponent)
            ? { health: o.getComponent(HealthComponent)!.maxHp } : {}),
        })),
        ...boulders.map(o => ({
          type:   'boulder' as const,
          id:     o.id,
          x:      o.position.x,
          y:      o.position.y,
          color:  o.propColor,
          radius: o.propRadius,
          ...(o.getComponent(HealthComponent)
            ? { health: o.getComponent(HealthComponent)!.maxHp } : {}),
        })),
        ...chests.map(o => ({
          type:  'chest' as const,
          id:    o.id,
          x:     o.position.x,
          y:     o.position.y,
          color: o.propColor,
          ...(o.getComponent(HealthComponent)
            ? { health: o.getComponent(HealthComponent)!.maxHp } : {}),
        })),
      ],
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
