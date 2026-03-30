/**
 * EditorRenderer — drives the Engine to preview the current EditorState.
 *
 * Rebuilds the Scene from EditorState on every change, then renders it
 * via the normal Engine pipeline. Also draws editor overlays (grid,
 * selection highlight, wall preview).
 */
import { Engine } from '../core/Engine';
import { Scene } from '../core/Scene';
import { OmniLight } from '../lighting/OmniLight';
import { Character } from '../elements/Character';
import { Crystal } from '../elements/props/Crystal';
import { Boulder } from '../elements/props/Boulder';
import { Chest } from '../elements/props/Chest';
import { project, unproject } from '../math/IsoProjection';
import { hexToRgba } from '../math/color';
import { EditorState, EditorLight, EditorCharacter, EditorProp } from './EditorState';

export class EditorRenderer {
  readonly engine: Engine;
  private _state: EditorState;
  private _scene: Scene | null = null;

  // Mouse world position for hover feedback
  hoverWorld: { x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement, state: EditorState) {
    this.engine = new Engine({ canvas });
    this._state = state;

    // Set iso origin
    this.engine.originX = canvas.width / 2;
    this.engine.originY = state.scene.rows * (state.scene.tileH / 2) + 20;

    this._rebuild();
    state.onChange(() => this._rebuild());
  }

  // ── Scene rebuild ─────────────────────────────────────────────────────────

  private _rebuild(): void {
    const s = this._state.scene;

    // Build base scene (floor + walls + collider)
    const scene = this.engine.buildScene({
      name: s.name,
      cols: s.cols, rows: s.rows,
      tileW: s.tileW, tileH: s.tileH,
      floor: { ...s.floor },
      walls: s.walls.map(w => ({ ...w })),
      lights: s.lights.map(l => ({
        type: l.type,
        x: l.x, y: l.y, z: l.z,
        color: l.color,
        intensity: l.intensity,
        radius: l.radius,
      })),
      characters: s.characters.map(c => ({
        id: c.id, x: c.x, y: c.y, z: c.z,
        radius: c.radius, color: c.color,
      })),
    });

    // Add props
    for (const p of s.props) {
      if (p.kind === 'crystal') scene.addObject(new Crystal(p.id, p.x, p.y, p.color));
      else if (p.kind === 'boulder') scene.addObject(new Boulder(p.id, p.x, p.y, p.color));
      else if (p.kind === 'chest')   scene.addObject(new Chest(p.id, p.x, p.y, p.color));
    }

    this._scene = scene;
    this.engine.setScene(scene);
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────

  canvasToWorld(cx: number, cy: number): { x: number; y: number } {
    const ox = this.engine.originX;
    const oy = this.engine.originY;
    const s  = this._state.scene;
    return unproject(cx - ox, cy - oy, s.tileW, s.tileH);
  }

  snapToTile(wx: number, wy: number): { x: number; y: number } {
    return { x: Math.floor(wx) + 0.5, y: Math.floor(wy) + 0.5 };
  }

  snapToGrid(wx: number, wy: number): { x: number; y: number } {
    return { x: Math.round(wx), y: Math.round(wy) };
  }

  // ── Start / stop ──────────────────────────────────────────────────────────

  start(): void {
    this.engine.start(
      (_ts) => this._drawOverlay(),
    );
  }

  stop(): void {
    this.engine.stop();
  }

  // ── Overlay drawing ───────────────────────────────────────────────────────

  private _drawOverlay(): void {
    const ctx = this.engine.ctx;
    const s   = this._state.scene;
    const ox  = this.engine.originX;
    const oy  = this.engine.originY;

    // Grid dots at tile corners
    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let row = 0; row <= s.rows; row++) {
      for (let col = 0; col <= s.cols; col++) {
        const { sx, sy } = project(col, row, 0, s.tileW, s.tileH);
        ctx.beginPath();
        ctx.arc(ox + sx, oy + sy, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#88aaff';
        ctx.fill();
      }
    }
    ctx.restore();

    // Hover tile highlight
    if (this.hoverWorld) {
      const { x, y } = this.hoverWorld;
      const col = Math.floor(x);
      const row = Math.floor(y);
      if (col >= 0 && col < s.cols && row >= 0 && row < s.rows) {
        this._drawTileHighlight(ctx, col, row, ox, oy, s.tileW, s.tileH, 'rgba(100,180,255,0.18)');
      }
    }

    // Wall preview (while drawing)
    if (this._state.activeTool === 'wall' && this._state.wallStart && this.hoverWorld) {
      const ws = this._state.wallStart;
      const we = this.snapToGrid(this.hoverWorld.x, this.hoverWorld.y);
      const p0 = project(ws.x, ws.y, 0, s.tileW, s.tileH);
      const p1 = project(we.x, we.y, 0, s.tileW, s.tileH);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(255,200,80,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ox + p0.sx, oy + p0.sy);
      ctx.lineTo(ox + p1.sx, oy + p1.sy);
      ctx.stroke();
      // Start dot
      ctx.beginPath();
      ctx.arc(ox + p0.sx, oy + p0.sy, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,200,80,0.9)';
      ctx.fill();
      ctx.restore();
    }

    // Selection highlight
    if (this._state.selectedId) {
      this._drawSelectionHighlight(ctx, this._state.selectedId, ox, oy, s.tileW, s.tileH);
    }
  }

  private _drawTileHighlight(
    ctx: CanvasRenderingContext2D,
    col: number, row: number,
    ox: number, oy: number,
    tileW: number, tileH: number,
    color: string,
  ): void {
    const { sx, sy } = project(col, row, 0, tileW, tileH);
    const hw = tileW / 2, hh = tileH / 2;
    const tx = ox + sx, ty = oy + sy;
    ctx.beginPath();
    ctx.moveTo(tx,      ty - hh);
    ctx.lineTo(tx + hw, ty);
    ctx.lineTo(tx,      ty + hh);
    ctx.lineTo(tx - hw, ty);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  private _drawSelectionHighlight(
    ctx: CanvasRenderingContext2D,
    id: string,
    ox: number, oy: number,
    tileW: number, tileH: number,
  ): void {
    const obj = this._state.getById(id);
    if (!obj) return;

    const x = (obj as { x: number }).x ?? 0;
    const y = (obj as { y: number }).y ?? 0;
    const { sx, sy } = project(x, y, 0, tileW, tileH);

    ctx.save();
    ctx.strokeStyle = '#ffdd44';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(ox + sx, oy + sy, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
