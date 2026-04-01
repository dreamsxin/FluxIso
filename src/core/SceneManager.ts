/**
 * SceneManager — multi-scene lifecycle management.
 *
 * Manages a stack of named scenes with push/pop/replace transitions.
 * Each scene can define optional `onEnter` / `onExit` / `onPause` / `onResume`
 * lifecycle hooks via a `ManagedScene` wrapper.
 *
 * @example
 *   const mgr = new SceneManager(engine);
 *
 *   mgr.register('game',  async () => {
 *     const scene = await engine.loadScene('/scenes/level1.json');
 *     return { scene, onEnter: () => audio.playBgm('/music/game.mp3') };
 *   });
 *
 *   mgr.register('menu', async () => {
 *     const scene = engine.buildScene({ cols: 1, rows: 1 });
 *     return { scene };
 *   });
 *
 *   await mgr.push('menu');
 *
 *   // Later, transition to game:
 *   await mgr.replace('game');
 *
 *   // Pause game, show overlay:
 *   await mgr.push('pause-overlay');
 *
 *   // Resume:
 *   await mgr.pop();
 */
import { Engine } from './Engine';
import { Scene } from './Scene';

export interface ManagedScene {
  scene: Scene;
  /** Called when this scene becomes the active (top) scene. */
  onEnter?(): void | Promise<void>;
  /** Called when this scene is removed from the stack. */
  onExit?():  void | Promise<void>;
  /** Called when another scene is pushed on top of this one. */
  onPause?(): void | Promise<void>;
  /** Called when the scene above this one is popped. */
  onResume?():void | Promise<void>;
}

type SceneFactory = () => Promise<ManagedScene> | ManagedScene;

export class SceneManager {
  private _engine:    Engine;
  private _registry   = new Map<string, SceneFactory>();
  private _stack:     Array<{ name: string; managed: ManagedScene }> = [];
  private _loading    = false;

  constructor(engine: Engine) {
    this._engine = engine;
  }

  // ── Registry ──────────────────────────────────────────────────────────────

  /**
   * Register a named scene factory.
   * The factory is called lazily when the scene is first pushed.
   */
  register(name: string, factory: SceneFactory): void {
    this._registry.set(name, factory);
  }

  // ── Stack operations ──────────────────────────────────────────────────────

  /** Current active scene name, or null if the stack is empty. */
  get current(): string | null {
    return this._stack.length > 0 ? this._stack[this._stack.length - 1].name : null;
  }

  /** Depth of the scene stack. */
  get depth(): number { return this._stack.length; }

  /**
   * Push a new scene onto the stack.
   * The current top scene receives `onPause`, the new scene receives `onEnter`.
   */
  async push(name: string): Promise<void> {
    if (this._loading) return;
    this._loading = true;
    try {
      const top = this._stack[this._stack.length - 1];
      if (top?.managed.onPause) await top.managed.onPause();

      const managed = await this._build(name);
      this._stack.push({ name, managed });
      this._engine.setScene(managed.scene);
      if (managed.onEnter) await managed.onEnter();
    } finally {
      this._loading = false;
    }
  }

  /**
   * Pop the top scene off the stack.
   * The popped scene receives `onExit`, the new top receives `onResume`.
   */
  async pop(): Promise<void> {
    if (this._loading || this._stack.length === 0) return;
    this._loading = true;
    try {
      const top = this._stack.pop()!;
      if (top.managed.onExit) await top.managed.onExit();

      const newTop = this._stack[this._stack.length - 1];
      if (newTop) {
        this._engine.setScene(newTop.managed.scene);
        if (newTop.managed.onResume) await newTop.managed.onResume();
      } else {
        this._engine.setScene(new Scene());
      }
    } finally {
      this._loading = false;
    }
  }

  /**
   * Replace the entire stack with a single new scene.
   * All existing scenes receive `onExit` (bottom to top).
   */
  async replace(name: string): Promise<void> {
    if (this._loading) return;
    this._loading = true;
    try {
      // Exit all existing scenes
      for (let i = this._stack.length - 1; i >= 0; i--) {
        if (this._stack[i].managed.onExit) await this._stack[i].managed.onExit!();
      }
      this._stack = [];

      const managed = await this._build(name);
      this._stack.push({ name, managed });
      this._engine.setScene(managed.scene);
      if (managed.onEnter) await managed.onEnter();
    } finally {
      this._loading = false;
    }
  }

  /**
   * Pop all scenes and push a new one.
   * Equivalent to `replace` but semantically clearer for "go to main menu".
   */
  async goto(name: string): Promise<void> {
    return this.replace(name);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async _build(name: string): Promise<ManagedScene> {
    const factory = this._registry.get(name);
    if (!factory) throw new Error(`SceneManager: scene "${name}" is not registered`);
    return factory();
  }
}
