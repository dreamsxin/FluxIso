/**
 * InputMap — action-based input abstraction layer over InputManager.
 *
 * Decouples game logic from raw key/button names. Define named actions
 * and bind multiple keys (or gamepad buttons) to each one.
 *
 * @example
 *   const map = new InputMap(input);
 *
 *   map.define('move_up',    ['ArrowUp',    'w', 'KeyW']);
 *   map.define('move_down',  ['ArrowDown',  's', 'KeyS']);
 *   map.define('move_left',  ['ArrowLeft',  'a', 'KeyA']);
 *   map.define('move_right', ['ArrowRight', 'd', 'KeyD']);
 *   map.define('attack',     ['Space', 'Enter']);
 *   map.define('debug',      ['F1']);
 *
 *   // In game loop:
 *   if (map.isDown('move_up'))    player.y -= speed * dt;
 *   if (map.wasPressed('attack')) player.attack();
 *
 *   // Get movement as a normalised vector:
 *   const { x, y } = map.axis('move_right', 'move_left', 'move_down', 'move_up');
 *
 *   // Subscribe to action events:
 *   map.on('debug', () => debugRenderer.enabled = !debugRenderer.enabled);
 *
 *   // Rebind at runtime (e.g. from settings screen):
 *   map.rebind('attack', ['MouseLeft', 'Space']);
 */
import { InputManager } from './InputManager';

type ActionCallback = () => void;

export class InputMap {
  private _input: InputManager;
  /** action → set of key strings */
  private _bindings = new Map<string, Set<string>>();
  /** action → set of callbacks (fired on press) */
  private _callbacks = new Map<string, Set<ActionCallback>>();

  constructor(input: InputManager) {
    this._input = input;
  }

  // ── Action definition ──────────────────────────────────────────────────────

  /**
   * Define (or overwrite) an action with a list of key bindings.
   * Keys can be `KeyboardEvent.key` values ('ArrowUp', 'w', ' ')
   * or `KeyboardEvent.code` values ('KeyW', 'Space').
   */
  define(action: string, keys: string[]): this {
    const set = new Set(keys);
    this._bindings.set(action, set);
    // Mirror into InputManager's action system for callback support
    for (const k of keys) this._input.bindKey(k, action);
    return this;
  }

  /**
   * Add extra keys to an existing action without replacing current bindings.
   */
  addBinding(action: string, keys: string[]): this {
    if (!this._bindings.has(action)) this._bindings.set(action, new Set());
    const set = this._bindings.get(action)!;
    for (const k of keys) {
      set.add(k);
      this._input.bindKey(k, action);
    }
    return this;
  }

  /**
   * Replace all bindings for an action (useful for settings screens).
   */
  rebind(action: string, keys: string[]): this {
    // Remove old bindings from InputManager
    const old = this._bindings.get(action);
    if (old) {
      for (const k of old) this._input.unbindKey(k, action);
    }
    return this.define(action, keys);
  }

  /** Remove an action entirely. */
  remove(action: string): void {
    const keys = this._bindings.get(action);
    if (keys) for (const k of keys) this._input.unbindKey(k, action);
    this._bindings.delete(action);
    this._callbacks.delete(action);
  }

  /** Returns the current key bindings for an action. */
  getBindings(action: string): string[] {
    return [...(this._bindings.get(action) ?? [])];
  }

  // ── Polling API ────────────────────────────────────────────────────────────

  /** True while any key bound to `action` is held. */
  isDown(action: string): boolean {
    return this._input.isAction(action);
  }

  /** True on the first frame any key bound to `action` was pressed. */
  wasPressed(action: string): boolean {
    return this._input.wasAction(action);
  }

  /**
   * Returns a normalised 2D axis vector from four directional actions.
   * Diagonal inputs are normalised to length 1.
   *
   * @example
   *   const { x, y } = map.axis('move_right', 'move_left', 'move_down', 'move_up');
   *   player.x += x * speed * dt;
   *   player.y += y * speed * dt;
   */
  axis(
    positiveX: string,
    negativeX: string,
    positiveY: string,
    negativeY: string,
  ): { x: number; y: number } {
    let x = 0, y = 0;
    if (this.isDown(positiveX)) x += 1;
    if (this.isDown(negativeX)) x -= 1;
    if (this.isDown(positiveY)) y += 1;
    if (this.isDown(negativeY)) y -= 1;

    // Normalise diagonal
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.SQRT2;
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }

  // ── Event API ──────────────────────────────────────────────────────────────

  /**
   * Subscribe to an action press event.
   * Returns an unsubscribe function.
   */
  on(action: string, cb: ActionCallback): () => void {
    if (!this._callbacks.has(action)) this._callbacks.set(action, new Set());
    this._callbacks.get(action)!.add(cb);
    // Delegate to InputManager's callback system
    return this._input.onAction(action, cb);
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  /**
   * Export current bindings as a plain object (for saving to localStorage).
   */
  toJSON(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [action, keys] of this._bindings) {
      out[action] = [...keys];
    }
    return out;
  }

  /**
   * Import bindings from a plain object (e.g. loaded from localStorage).
   * Existing bindings are replaced.
   */
  fromJSON(data: Record<string, string[]>): void {
    for (const [action, keys] of Object.entries(data)) {
      this.rebind(action, keys);
    }
  }
}
