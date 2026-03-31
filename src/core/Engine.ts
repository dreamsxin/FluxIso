import { Scene } from './Scene';
import { Floor } from '../elements/Floor';
import { Wall, WallOptions } from '../elements/Wall';
import { OmniLight } from '../lighting/OmniLight';
import { DirectionalLight } from '../lighting/DirectionalLight';
import { Character } from '../elements/Character';
import { Cloud } from '../elements/props/Cloud';
import { TileCollider } from '../physics/TileCollider';

export interface EngineOptions {
  canvas: HTMLCanvasElement;
}

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
}

export class Engine {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  private _scene: Scene | null = null;
  private _rafId: number | null = null;
  private _onFrame: ((ts: number) => void) | null = null;
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
      if (l.type === 'omni') {
        scene.addLight(
          new OmniLight({
            x: l.x ?? 0,
            y: l.y ?? 0,
            z: l.z ?? 120,
            color: l.color,
            intensity: l.intensity,
            radius: l.radius,
          }),
        );
      } else if (l.type === 'directional') {
        scene.addLight(
          new DirectionalLight({
            angle: l.angle,
            elevation: l.elevation,
            color: l.color,
            intensity: l.intensity,
          }),
        );
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

    this._scene.update(ts);

    const { ctx, canvas, originX, originY } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this._preFrame?.(ts);
    this._scene.draw(ctx, canvas.width, canvas.height, originX, originY);
    this._onFrame?.(ts);
  }
}
