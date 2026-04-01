/**
 * SceneTransition — canvas-level transition effects between scenes.
 *
 * Works alongside SceneManager: call `transition.start()` before switching
 * scenes, then `transition.draw()` in your postFrame callback.
 *
 * Built-in effects: 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'circle-wipe'
 *
 * @example
 *   const transition = new SceneTransition(engine.ctx);
 *
 *   // In postFrame:
 *   transition.draw(canvas.width, canvas.height);
 *
 *   // Trigger a fade when switching scenes:
 *   await transition.play('fade', 400);
 *   await sceneManager.replace('level2');
 *   await transition.playOut('fade', 400);
 */

export type TransitionEffect = 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'circle-wipe';

export interface TransitionOptions {
  /** Transition color (for fade/wipe). Default '#000000'. */
  color?: string;
  /** Duration in milliseconds. Default 400. */
  duration?: number;
  /** Easing function. Default ease-in-out. */
  easing?: (t: number) => number;
}

const easeInOut = (t: number): number => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

type Phase = 'idle' | 'in' | 'hold' | 'out';

export class SceneTransition {
  private _ctx: CanvasRenderingContext2D;
  private _phase: Phase = 'idle';
  private _effect: TransitionEffect = 'fade';
  private _color = '#000000';
  private _duration = 400;
  private _easing: (t: number) => number = easeInOut;
  private _startTs = 0;
  private _progress = 0; // 0 = transparent, 1 = fully covered
  private _resolve: (() => void) | null = null;

  /** True while a transition is in progress. */
  get isPlaying(): boolean { return this._phase !== 'idle'; }

  /** Current coverage (0–1). Useful for syncing audio fades. */
  get progress(): number { return this._progress; }

  constructor(ctx: CanvasRenderingContext2D) {
    this._ctx = ctx;
  }

  /**
   * Play the "in" phase (covers the screen).
   * Returns a Promise that resolves when the screen is fully covered.
   * Switch your scene content while awaiting this.
   */
  playIn(effect: TransitionEffect = 'fade', opts: TransitionOptions = {}): Promise<void> {
    this._effect   = effect;
    this._color    = opts.color    ?? '#000000';
    this._duration = opts.duration ?? 400;
    this._easing   = opts.easing   ?? easeInOut;
    this._phase    = 'in';
    this._startTs  = performance.now();
    this._progress = 0;

    return new Promise(resolve => { this._resolve = resolve; });
  }

  /**
   * Play the "out" phase (uncovers the screen).
   * Returns a Promise that resolves when the screen is fully clear.
   */
  playOut(effect: TransitionEffect = 'fade', opts: TransitionOptions = {}): Promise<void> {
    this._effect   = effect;
    this._color    = opts.color    ?? '#000000';
    this._duration = opts.duration ?? 400;
    this._easing   = opts.easing   ?? easeInOut;
    this._phase    = 'out';
    this._startTs  = performance.now();
    this._progress = 1;

    return new Promise(resolve => { this._resolve = resolve; });
  }

  /**
   * Convenience: play in → resolve (switch scene here) → play out.
   *
   * @example
   *   await transition.between('fade', async () => {
   *     await sceneManager.replace('level2');
   *   }, { duration: 350 });
   */
  async between(
    effect: TransitionEffect,
    onCovered: () => void | Promise<void>,
    opts: TransitionOptions = {},
  ): Promise<void> {
    await this.playIn(effect, opts);
    await onCovered();
    await this.playOut(effect, opts);
  }

  /**
   * Draw the transition overlay.
   * Call in your postFrame callback every frame.
   */
  draw(canvasW: number, canvasH: number, ts = performance.now()): void {
    if (this._phase === 'idle') return;

    const elapsed = ts - this._startTs;
    const raw = Math.min(elapsed / this._duration, 1);
    const t = this._easing(raw);

    if (this._phase === 'in') {
      this._progress = t;
    } else if (this._phase === 'out') {
      this._progress = 1 - t;
    }

    this._drawEffect(canvasW, canvasH, this._progress);

    if (raw >= 1) {
      this._phase = 'idle';
      const resolve = this._resolve;
      this._resolve = null;
      resolve?.();
    }
  }

  // ── Effect renderers ───────────────────────────────────────────────────────

  private _drawEffect(w: number, h: number, p: number): void {
    if (p <= 0) return;
    const ctx = this._ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    switch (this._effect) {
      case 'fade':
        ctx.globalAlpha = p;
        ctx.fillStyle = this._color;
        ctx.fillRect(0, 0, w, h);
        break;

      case 'slide-left': {
        const x = w * (1 - p);
        ctx.fillStyle = this._color;
        ctx.fillRect(x, 0, w - x, h);
        break;
      }

      case 'slide-right': {
        const x = w * p;
        ctx.fillStyle = this._color;
        ctx.fillRect(0, 0, x, h);
        break;
      }

      case 'slide-up': {
        const y = h * (1 - p);
        ctx.fillStyle = this._color;
        ctx.fillRect(0, y, w, h - y);
        break;
      }

      case 'slide-down': {
        const y = h * p;
        ctx.fillStyle = this._color;
        ctx.fillRect(0, 0, w, y);
        break;
      }

      case 'circle-wipe': {
        const cx = w / 2, cy = h / 2;
        const maxR = Math.hypot(cx, cy);
        const r = maxR * p;
        // Clip to circle, fill outside
        ctx.fillStyle = this._color;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
