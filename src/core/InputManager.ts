/**
 * InputManager — unified keyboard, mouse, and touch input abstraction.
 *
 * Attach to a canvas element and query input state each frame, or subscribe
 * to action callbacks. Handles key repeat, pointer position, and touch.
 *
 * @example
 *   const input = new InputManager(canvas);
 *
 *   // Poll in game loop
 *   engine.start((ts) => {
 *     if (input.isDown('ArrowRight')) player.position.x += 0.1;
 *     if (input.wasPressed('Space'))  player.jump();
 *   });
 *
 *   // Or subscribe to actions
 *   input.onAction('attack', () => player.attack());
 *   input.bindKey('Space', 'attack');
 *
 *   // Clean up
 *   input.destroy();
 */

export interface PointerState {
  /** Canvas-space X (accounts for CSS scaling). */
  x: number;
  /** Canvas-space Y (accounts for CSS scaling). */
  y: number;
  /** True while any mouse button / touch is held. */
  down: boolean;
  /** True on the frame the pointer was pressed. */
  pressed: boolean;
  /** True on the frame the pointer was released. */
  released: boolean;
}

export class InputManager {
  private _canvas: HTMLCanvasElement;

  // Keyboard state
  private _held     = new Set<string>();
  private _pressed  = new Set<string>();
  private _released = new Set<string>();

  // Pointer state
  readonly pointer: PointerState = { x: 0, y: 0, down: false, pressed: false, released: false };
  private _pointerPressedThisFrame  = false;
  private _pointerReleasedThisFrame = false;

  // Action bindings: actionName → set of keys
  private _bindings = new Map<string, Set<string>>();
  // Action callbacks
  private _callbacks = new Map<string, Set<() => void>>();

  // Bound listeners (for cleanup)
  private _listeners: Array<[EventTarget, string, EventListener]> = [];

  constructor(canvas: HTMLCanvasElement) {
    this._canvas = canvas;
    this._attach();
  }

  // ── Keyboard queries ──────────────────────────────────────────────────────

  /** True while the key is held down. Key = KeyboardEvent.key or .code. */
  isDown(key: string): boolean { return this._held.has(key); }

  /** True on the first frame the key was pressed. Cleared after `flush()`. */
  wasPressed(key: string): boolean { return this._pressed.has(key); }

  /** True on the first frame the key was released. Cleared after `flush()`. */
  wasReleased(key: string): boolean { return this._released.has(key); }

  // ── Action system ─────────────────────────────────────────────────────────

  /**
   * Bind a key to a named action.
   * Multiple keys can map to the same action.
   */
  bindKey(key: string, action: string): void {
    if (!this._bindings.has(action)) this._bindings.set(action, new Set());
    this._bindings.get(action)!.add(key);
  }

  /** Remove a key binding. */
  unbindKey(key: string, action: string): void {
    this._bindings.get(action)?.delete(key);
  }

  /** True while any key bound to `action` is held. */
  isAction(action: string): boolean {
    const keys = this._bindings.get(action);
    if (!keys) return false;
    for (const k of keys) if (this._held.has(k)) return true;
    return false;
  }

  /** True on the first frame any key bound to `action` was pressed. */
  wasAction(action: string): boolean {
    const keys = this._bindings.get(action);
    if (!keys) return false;
    for (const k of keys) if (this._pressed.has(k)) return true;
    return false;
  }

  /**
   * Subscribe to an action — callback fires on the frame the action is pressed.
   * Returns an unsubscribe function.
   */
  onAction(action: string, cb: () => void): () => void {
    if (!this._callbacks.has(action)) this._callbacks.set(action, new Set());
    this._callbacks.get(action)!.add(cb);
    return () => this._callbacks.get(action)?.delete(cb);
  }

  // ── Pointer queries ───────────────────────────────────────────────────────

  /** Canvas-space pointer position (corrected for CSS scaling). */
  get pointerX(): number { return this.pointer.x; }
  get pointerY(): number { return this.pointer.y; }

  // ── Frame lifecycle ───────────────────────────────────────────────────────

  /**
   * Call once per frame AFTER processing input (typically at the end of
   * your postFrame callback). Clears single-frame pressed/released sets.
   */
  flush(): void {
    // Fire action callbacks for pressed actions
    for (const [action, keys] of this._bindings) {
      for (const k of keys) {
        if (this._pressed.has(k)) {
          const cbs = this._callbacks.get(action);
          if (cbs) for (const cb of cbs) cb();
          break;
        }
      }
    }

    this._pressed.clear();
    this._released.clear();
    this.pointer.pressed  = false;
    this.pointer.released = false;
    this._pointerPressedThisFrame  = false;
    this._pointerReleasedThisFrame = false;
  }

  /** Remove all event listeners. Call when the game is destroyed. */
  destroy(): void {
    for (const [target, type, listener] of this._listeners) {
      target.removeEventListener(type, listener);
    }
    this._listeners = [];
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _attach(): void {
    const add = (target: EventTarget, type: string, fn: EventListener) => {
      target.addEventListener(type, fn);
      this._listeners.push([target, type, fn]);
    };

    // Keyboard
    add(window, 'keydown', (e) => {
      const ev = e as KeyboardEvent;
      if (!this._held.has(ev.key))  this._pressed.add(ev.key);
      if (!this._held.has(ev.code)) this._pressed.add(ev.code);
      this._held.add(ev.key);
      this._held.add(ev.code);
    });

    add(window, 'keyup', (e) => {
      const ev = e as KeyboardEvent;
      this._released.add(ev.key);
      this._released.add(ev.code);
      this._held.delete(ev.key);
      this._held.delete(ev.code);
    });

    // Mouse
    add(this._canvas, 'mousemove', (e) => {
      const { x, y } = this._canvasPos(e as MouseEvent);
      this.pointer.x = x; this.pointer.y = y;
    });

    add(this._canvas, 'mousedown', (e) => {
      const { x, y } = this._canvasPos(e as MouseEvent);
      this.pointer.x = x; this.pointer.y = y;
      this.pointer.down = true;
      if (!this._pointerPressedThisFrame) {
        this.pointer.pressed = true;
        this._pointerPressedThisFrame = true;
      }
    });

    add(this._canvas, 'mouseup', () => {
      this.pointer.down = false;
      if (!this._pointerReleasedThisFrame) {
        this.pointer.released = true;
        this._pointerReleasedThisFrame = true;
      }
    });

    // Touch
    add(this._canvas, 'touchstart', (e) => {
      const ev = e as TouchEvent;
      const { x, y } = this._canvasPosTouch(ev.touches[0]);
      this.pointer.x = x; this.pointer.y = y;
      this.pointer.down = true;
      this.pointer.pressed = true;
      this._pointerPressedThisFrame = true;
    }, );

    add(this._canvas, 'touchmove', (e) => {
      const ev = e as TouchEvent;
      const { x, y } = this._canvasPosTouch(ev.touches[0]);
      this.pointer.x = x; this.pointer.y = y;
    });

    add(this._canvas, 'touchend', () => {
      this.pointer.down = false;
      this.pointer.released = true;
      this._pointerReleasedThisFrame = true;
    });
  }

  private _canvasPos(e: MouseEvent): { x: number; y: number } {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this._canvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (this._canvas.height / rect.height),
    };
  }

  private _canvasPosTouch(t: Touch): { x: number; y: number } {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: (t.clientX - rect.left) * (this._canvas.width  / rect.width),
      y: (t.clientY - rect.top)  * (this._canvas.height / rect.height),
    };
  }
}
