/**
 * HudLayer — a simple canvas-space UI system for in-game HUDs.
 *
 * Renders labels, progress bars, and buttons at fixed screen positions.
 * All elements are drawn in screen space (no camera transform).
 *
 * @example
 *   const hud = new HudLayer();
 *
 *   const hpBar = hud.addBar({ id: 'hp', x: 16, y: 16, w: 160, h: 14,
 *     value: 1, color: '#e04040', label: 'HP' });
 *
 *   const scoreLabel = hud.addLabel({ id: 'score', x: 16, y: 40,
 *     text: 'Score: 0', color: '#fff', fontSize: 14 });
 *
 *   const btn = hud.addButton({ id: 'pause', x: 10, y: 10, w: 60, h: 24,
 *     label: 'Pause', onClick: () => engine.stop() });
 *
 *   // In postFrame:
 *   hud.draw(engine.ctx, canvas.width, canvas.height);
 *
 *   // Update values:
 *   hpBar.value = player.hp / player.maxHp;
 *   scoreLabel.text = `Score: ${score}`;
 *
 *   // Handle clicks:
 *   canvas.addEventListener('click', (e) => hud.handleClick(e.offsetX, e.offsetY));
 */

// ── Element types ──────────────────────────────────────────────────────────

export interface HudLabel {
  type: 'label';
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  font: string;
  visible: boolean;
  /** Optional shadow for readability over busy backgrounds. */
  shadow: boolean;
}

export interface HudBar {
  type: 'bar';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0–1 fill fraction. */
  value: number;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
  labelColor: string;
  fontSize: number;
  visible: boolean;
}

export interface HudButton {
  type: 'button';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: string;
  bgColor: string;
  hoverColor: string;
  fontSize: number;
  visible: boolean;
  onClick: () => void;
  /** Internal hover state. */
  _hovered: boolean;
}

export interface HudPanel {
  type: 'panel';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bgColor: string;
  borderColor: string;
  radius: number;
  visible: boolean;
}

export type HudElement = HudLabel | HudBar | HudButton | HudPanel;

// ── Option types ───────────────────────────────────────────────────────────

export interface LabelOptions {
  id: string;
  x: number;
  y: number;
  text?: string;
  color?: string;
  fontSize?: number;
  font?: string;
  visible?: boolean;
  shadow?: boolean;
}

export interface BarOptions {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  value?: number;
  color?: string;
  bgColor?: string;
  borderColor?: string;
  label?: string;
  labelColor?: string;
  fontSize?: number;
  visible?: boolean;
}

export interface ButtonOptions {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  color?: string;
  bgColor?: string;
  hoverColor?: string;
  fontSize?: number;
  visible?: boolean;
  onClick?: () => void;
}

export interface PanelOptions {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bgColor?: string;
  borderColor?: string;
  radius?: number;
  visible?: boolean;
}

// ── HudLayer ───────────────────────────────────────────────────────────────

export class HudLayer {
  private _elements: HudElement[] = [];
  private _map = new Map<string, HudElement>();

  // ── Add elements ───────────────────────────────────────────────────────────

  addLabel(opts: LabelOptions): HudLabel {
    const el: HudLabel = {
      type: 'label',
      id:       opts.id,
      x:        opts.x,
      y:        opts.y,
      text:     opts.text     ?? '',
      color:    opts.color    ?? '#ffffff',
      fontSize: opts.fontSize ?? 14,
      font:     opts.font     ?? 'sans-serif',
      visible:  opts.visible  ?? true,
      shadow:   opts.shadow   ?? true,
    };
    this._add(el);
    return el;
  }

  addBar(opts: BarOptions): HudBar {
    const el: HudBar = {
      type: 'bar',
      id:          opts.id,
      x:           opts.x,
      y:           opts.y,
      w:           opts.w,
      h:           opts.h,
      value:       opts.value       ?? 1,
      color:       opts.color       ?? '#44cc44',
      bgColor:     opts.bgColor     ?? 'rgba(0,0,0,0.5)',
      borderColor: opts.borderColor ?? 'rgba(255,255,255,0.2)',
      label:       opts.label       ?? '',
      labelColor:  opts.labelColor  ?? '#ffffff',
      fontSize:    opts.fontSize    ?? 10,
      visible:     opts.visible     ?? true,
    };
    this._add(el);
    return el;
  }

  addButton(opts: ButtonOptions): HudButton {
    const el: HudButton = {
      type: 'button',
      id:         opts.id,
      x:          opts.x,
      y:          opts.y,
      w:          opts.w,
      h:          opts.h,
      label:      opts.label      ?? '',
      color:      opts.color      ?? '#ffffff',
      bgColor:    opts.bgColor    ?? 'rgba(40,40,60,0.85)',
      hoverColor: opts.hoverColor ?? 'rgba(80,80,120,0.95)',
      fontSize:   opts.fontSize   ?? 12,
      visible:    opts.visible    ?? true,
      onClick:    opts.onClick    ?? (() => {}),
      _hovered:   false,
    };
    this._add(el);
    return el;
  }

  addPanel(opts: PanelOptions): HudPanel {
    const el: HudPanel = {
      type: 'panel',
      id:          opts.id,
      x:           opts.x,
      y:           opts.y,
      w:           opts.w,
      h:           opts.h,
      bgColor:     opts.bgColor     ?? 'rgba(0,0,0,0.55)',
      borderColor: opts.borderColor ?? 'rgba(255,255,255,0.15)',
      radius:      opts.radius      ?? 6,
      visible:     opts.visible     ?? true,
    };
    this._add(el);
    return el;
  }

  // ── Lookup / remove ────────────────────────────────────────────────────────

  get<T extends HudElement>(id: string): T | undefined {
    return this._map.get(id) as T | undefined;
  }

  remove(id: string): void {
    this._elements = this._elements.filter(e => e.id !== id);
    this._map.delete(id);
  }

  clear(): void {
    this._elements = [];
    this._map.clear();
  }

  // ── Input handling ─────────────────────────────────────────────────────────

  /**
   * Call with canvas-space pointer coordinates each frame (or on mousemove)
   * to update button hover states.
   */
  handleMove(x: number, y: number): void {
    for (const el of this._elements) {
      if (el.type === 'button' && el.visible) {
        el._hovered = x >= el.x && x <= el.x + el.w && y >= el.y && y <= el.y + el.h;
      }
    }
  }

  /**
   * Call with canvas-space click coordinates to trigger button callbacks.
   * Returns true if any button was clicked.
   */
  handleClick(x: number, y: number): boolean {
    for (const el of this._elements) {
      if (el.type === 'button' && el.visible) {
        if (x >= el.x && x <= el.x + el.w && y >= el.y && y <= el.y + el.h) {
          el.onClick();
          return true;
        }
      }
    }
    return false;
  }

  // ── Draw ───────────────────────────────────────────────────────────────────

  /**
   * Draw all visible HUD elements.
   * Call in your postFrame callback (after scene.draw).
   */
  draw(ctx: CanvasRenderingContext2D, _canvasW?: number, _canvasH?: number): void {
    ctx.save();
    // Reset transform — HUD is always in screen space
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    for (const el of this._elements) {
      if (!el.visible) continue;
      switch (el.type) {
        case 'panel':  this._drawPanel(ctx, el);  break;
        case 'label':  this._drawLabel(ctx, el);  break;
        case 'bar':    this._drawBar(ctx, el);    break;
        case 'button': this._drawButton(ctx, el); break;
      }
    }

    ctx.restore();
  }

  // ── Private draw helpers ───────────────────────────────────────────────────

  private _drawPanel(ctx: CanvasRenderingContext2D, el: HudPanel): void {
    ctx.save();
    this._roundRect(ctx, el.x, el.y, el.w, el.h, el.radius);
    ctx.fillStyle = el.bgColor;
    ctx.fill();
    if (el.borderColor) {
      ctx.strokeStyle = el.borderColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  private _drawLabel(ctx: CanvasRenderingContext2D, el: HudLabel): void {
    ctx.save();
    ctx.font = `${el.fontSize}px ${el.font}`;
    if (el.shadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(el.text, el.x + 1, el.y + 1);
    }
    ctx.fillStyle = el.color;
    ctx.fillText(el.text, el.x, el.y);
    ctx.restore();
  }

  private _drawBar(ctx: CanvasRenderingContext2D, el: HudBar): void {
    ctx.save();
    const v = Math.max(0, Math.min(1, el.value));

    // Background
    ctx.fillStyle = el.bgColor;
    ctx.fillRect(el.x, el.y, el.w, el.h);

    // Fill
    if (v > 0) {
      ctx.fillStyle = el.color;
      ctx.fillRect(el.x, el.y, el.w * v, el.h);
    }

    // Border
    ctx.strokeStyle = el.borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(el.x, el.y, el.w, el.h);

    // Label
    if (el.label) {
      ctx.font = `${el.fontSize}px sans-serif`;
      ctx.fillStyle = el.labelColor;
      ctx.textBaseline = 'middle';
      ctx.fillText(el.label, el.x + 4, el.y + el.h / 2);
    }

    ctx.restore();
  }

  private _drawButton(ctx: CanvasRenderingContext2D, el: HudButton): void {
    ctx.save();
    this._roundRect(ctx, el.x, el.y, el.w, el.h, 4);
    ctx.fillStyle = el._hovered ? el.hoverColor : el.bgColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = `${el.fontSize}px sans-serif`;
    ctx.fillStyle = el.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(el.label, el.x + el.w / 2, el.y + el.h / 2);
    ctx.restore();
  }

  private _roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private _add(el: HudElement): void {
    this._map.set(el.id, el);
    this._elements.push(el);
  }
}
