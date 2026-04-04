import { Scene } from './Scene';
import { Floor } from '../elements/Floor';
import { Wall, WallOptions } from '../elements/Wall';
import { OmniLight } from '../lighting/OmniLight';
import { DirectionalLight } from '../lighting/DirectionalLight';
import { BaseLight } from '../lighting/BaseLight';
import { Character } from '../elements/Character';
import { Cloud } from '../elements/props/Cloud';
import { Crystal } from '../elements/props/Crystal';
import { Boulder } from '../elements/props/Boulder';
import { Chest } from '../elements/props/Chest';
import { HealthComponent } from '../ecs/components/HealthComponent';
import { TileCollider } from '../physics/TileCollider';
import { IsoObject } from '../elements/IsoObject';

export interface EngineOptions {
  canvas: HTMLCanvasElement;
}

// ── Registry types ──────────────────────────────────────────────────────────

/** Shape of a prop entry from the JSON scene definition. */
export interface PropJson {
  id: string;
  type: string;
  x: number;
  y: number;
  color?: string;
  radius?: number;
  heightPx?: number;
  health?: number;
  [key: string]: unknown;
}

/** Shape of a light entry from the JSON scene definition. */
export interface LightJson {
  id?: string;
  type: string;
  x?: number;
  y?: number;
  z?: number;
  color?: string;
  intensity?: number;
  radius?: number;
  angle?: number;
  elevation?: number;
  [key: string]: unknown;
}

/**
 * Factory function that constructs an IsoObject from a raw JSON prop entry.
 * Register custom types with Engine.registerProp().
 */
export type PropFactory = (json: PropJson) => IsoObject;

/**
 * Factory function that constructs a BaseLight from a raw JSON light entry.
 * Register custom types with Engine.registerLight().
 */
export type LightFactory = (json: LightJson) => BaseLight;

// ── JSON scene schema ──────────────────────────────────────────────────────

interface SceneJson {
  name?: string;
  tileW?: number;
  tileH?: number;
  cols?: number;
  rows?: number;
  floor?: {
    id: string;
    cols?: number;
    rows?: number;
    color?: string;
    altColor?: string;
    tileImage?: string;
    altTileImage?: string;
    /** Row-major walkable flags: true = walkable, false = blocked. */
    walkable?: boolean[][] | boolean[];
  };
  walls?: Array<WallOptions>;
  lights?: Array<{
    id?: string;
    type: 'omni' | 'directional';
    x?: number;
    y?: number;
    z?: number;
    color?: string;
    intensity?: number;
    radius?: number;
    angle?: number;
    elevation?: number;
  }>;
  characters?: Array<{
    id: string;
    x: number;
    y: number;
    z?: number;
    radius?: number;
    color?: string;
  }>;
  clouds?: Array<{
    id: string;
    x: number;
    y: number;
    altitude?: number;
    speed?: number;
    angle?: number;
    scale?: number;
    color?: string;
    seed?: number;
  }>;
  props?: Array<PropJson>;
}

/**
 * Engine — the central controller of the LuxIso isometric engine.
 * Handles the canvas setup, scene loading, and the main render loop.
 */
export class Engine {
  // ── Static prop/light registries ───────────────────────────────────────────
  //
  // These maps allow users to register custom prop and light types without
  // modifying engine source code (Open-Closed Principle).
  //
  // Usage:
  //   Engine.registerProp('dragon', (json) => new Dragon(json.id, json.x, json.y));
  //   Engine.registerLight('spot', (json) => new SpotLight({ ... }));
  //
  static _propRegistry   = new Map<string, PropFactory>();
  static _lightRegistry  = new Map<string, LightFactory>();

  /**
   * Register a factory for a custom prop type.
   * The factory is called during _buildScene for every prop entry whose
   * `type` field matches the given key.
   */
  static registerProp(type: string, factory: PropFactory): void {
    Engine._propRegistry.set(type, factory);
  }

  /**
   * Register a factory for a custom light type.
   * The factory is called during _buildScene for every light entry whose
   * `type` field matches the given key.
   */
  static registerLight(type: string, factory: LightFactory): void {
    Engine._lightRegistry.set(type, factory);
  }

  /** Remove a previously registered prop factory. */
  static unregisterProp(type: string): void {
    Engine._propRegistry.delete(type);
  }

  /** Remove a previously registered light factory. */
  static unregisterLight(type: string): void {
    Engine._lightRegistry.delete(type);
  }

  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  private _scene: Scene | null = null;
  private _rafId: number | null = null;
  private _onFrame: ((ts: number) => void) | null = null;
  private _lastTs = 0;
  private _accumulator = 0;
  /** Fixed physics timestep in seconds. Default 1/60. */
  fixedDeltaTime = 1 / 60;
  private _preFrame: ((ts: number) => void) | null = null;

  get canvasW(): number { return this.canvas.width; }
  get canvasH(): number { return this.canvas.height; }

  /**
   * Isometric origin in canvas pixels — the point where world (0,0,0) projects to.
   * Defaults to (canvasW/2, canvasH/2); override after construction to match your layout.
   */
  originX: number;
  originY: number;

  constructor(opts: EngineOptions) {
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d')!;
    this.originX = this.canvas.width / 2;
    this.originY = this.canvas.height / 2;
  }

  // ── Scene loading ──────────────────────────────────────────────────────────

  async loadScene(url: string): Promise<Scene> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load scene: ${url} (${res.status})`);
    const json: SceneJson = await res.json();
    return this._buildScene(json);
  }

  /** Build a scene directly from a JSON object (no fetch required) */
  buildScene(json: object): Scene {
    return this._buildScene(json as SceneJson);
  }

  private _buildScene(json: SceneJson): Scene {
    const scene = new Scene({
      tileW: json.tileW,
      tileH: json.tileH,
      cols: json.cols ?? json.floor?.cols,
      rows: json.rows ?? json.floor?.rows,
    });

    if (json.floor) {
      scene.addObject(
        new Floor({
          id: json.floor.id,
          cols: json.floor.cols ?? json.cols ?? 10,
          rows: json.floor.rows ?? json.rows ?? 10,
          color: json.floor.color,
          altColor: json.floor.altColor,
          tileImage: json.floor.tileImage,
          altTileImage: json.floor.altTileImage,
        }),
      );
    }

    for (const w of json.walls ?? []) {
      scene.addObject(new Wall(w));
    }

    for (const l of json.lights ?? []) {
      const lightFactory = Engine._lightRegistry.get(l.type);
      if (lightFactory) {
        scene.addLight(lightFactory(l));
      } else {
        console.warn(`[Engine] Unknown light type '${l.type}'. Register it with Engine.registerLight().`);
      }
    }

    for (const c of json.characters ?? []) {
      scene.addObject(
        new Character({ id: c.id, x: c.x, y: c.y, z: c.z, radius: c.radius, color: c.color }),
      );
    }

    for (const c of json.clouds ?? []) {
      const cloud = new Cloud({
        id: c.id, x: c.x, y: c.y,
        altitude: c.altitude,
        speed:    c.speed,
        angle:    c.angle,
        scale:    c.scale,
        color:    c.color,
        seed:     c.seed,
      });
      cloud.boundsX = json.cols ?? json.floor?.cols ?? 10;
      cloud.boundsY = json.rows ?? json.floor?.rows ?? 10;
      scene.addObject(cloud);
    }

    for (const p of json.props ?? []) {
      const propFactory = Engine._propRegistry.get(p.type);
      if (!propFactory) {
        console.warn(`[Engine] Unknown prop type '${p.type}'. Register it with Engine.registerProp().`);
        continue;
      }
      const prop = propFactory(p);
      if (p.health) {
        // All built-in props (Crystal/Boulder/Chest) extend Entity which has addComponent.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prop as any).addComponent(new HealthComponent({ max: p.health }));
      }
      scene.addObject(prop);
    }

    // Build collision layer
    const cols = json.cols ?? json.floor?.cols ?? 10;
    const rows = json.rows ?? json.floor?.rows ?? 10;
    if (json.floor?.walkable) {
      scene.collider = TileCollider.fromArray(cols, rows, json.floor.walkable);
    } else {
      // Default: all tiles walkable, but world boundary blocks movement
      scene.collider = new TileCollider(cols, rows);
    }

    return scene;
  }

  // ── Scene management ───────────────────────────────────────────────────────

  setScene(scene: Scene): void {
    this._scene = scene;
  }

  get scene(): Scene | null {
    return this._scene;
  }

  /**
   * Resize the canvas and update internal origins.
   * If width/height are omitted, the canvas will fill its parent container.
   */
  resize(width?: number, height?: number): void {
    const { canvas } = this;
    if (width !== undefined && height !== undefined) {
      canvas.width  = width;
      canvas.height = height;
    } else {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width  = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    }

    // Default origin to center; user can override after resize()
    this.originX = canvas.width / 2;
    this.originY = canvas.height / 2;

    // Invalidate scene sorting if active
    if (this._scene) {
      // (We could trigger a redraw or sort here if needed)
    }
  }

  // ── Render loop ────────────────────────────────────────────────────────────

  /**
   * Start the engine render loop.
   * @param onFrame  called after scene.draw (post-frame, for overlays/hint rings)
   * @param preFrame called after clearRect but before scene.draw (for background fx)
   */
  start(onFrame?: (ts: number) => void, preFrame?: (ts: number) => void): void {
    if (this._rafId !== null) return;
    this._onFrame = onFrame ?? null;
    this._preFrame = preFrame ?? null;
    const loop = (ts: number): void => {
      this._tick(ts);
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  private _tick(ts: number): void {
    if (!this._scene) return;

    const rawDt = this._lastTs === 0 ? 0 : Math.min((ts - this._lastTs) / 1000, 0.1);
    this._lastTs = ts;

    this._accumulator += rawDt;
    while (this._accumulator >= this.fixedDeltaTime) {
      this._scene.fixedUpdate(this.fixedDeltaTime);
      this._accumulator -= this.fixedDeltaTime;
    }

    this._scene.update(ts);

    const { ctx, canvas, originX, originY } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this._preFrame?.(ts);
    this._scene.draw(ctx, canvas.width, canvas.height, originX, originY);
    this._onFrame?.(ts);
  }
}

// ── Register built-in prop and light factories ────────────────────────────
// This static initialiser runs once when the Engine class is first loaded.
// It seeds the registries with the default types so existing scene JSON
// continues to work without any changes.
Engine._propRegistry.set('crystal',
  (p) => new Crystal(p.id, p.x, p.y, p.color, p.heightPx as number | undefined));
Engine._propRegistry.set('boulder',
  (p) => new Boulder(p.id, p.x, p.y, p.color, p.radius as number | undefined));
Engine._propRegistry.set('chest',
  (p) => new Chest(p.id, p.x, p.y, p.color));

Engine._lightRegistry.set('omni',
  (l) => new OmniLight({
    x: l.x ?? 0, y: l.y ?? 0, z: l.z ?? 120,
    color: l.color, intensity: l.intensity, radius: l.radius,
  }));
Engine._lightRegistry.set('directional',
  (l) => new DirectionalLight({
    angle: l.angle, elevation: l.elevation,
    color: l.color, intensity: l.intensity,
  }));
