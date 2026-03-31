/**
 * EditorRenderer — drives the Engine to preview the current EditorState.
 */
import { Engine } from '../core/Engine';
import { Crystal } from '../elements/props/Crystal';
import { Boulder } from '../elements/props/Boulder';
import { Chest } from '../elements/props/Chest';
import { project, unproject } from '../math/IsoProjection';
import { EditorState } from './EditorState';

export class EditorRenderer {
  readonly engine: Engine;
  private _state: EditorState;

  hoverWorld: { x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement, state: EditorState) {
    this.engine = new Engine({ canvas });
    this._state = state;
    this._updateOrigin();
    this._rebuild();
    state.onChange(() => {
      this._updateOrigin();
      this._rebuild();
    });
  }

  private _updateOrigin(): void {
    const s = this._state.scene;
    this.engine.originX = this.engine.canvas.width / 2;
    this.engine.originY = s.rows * (s.tileH / 2) + 20;
  }

  // ── Scene rebuild ─────────────────────────────────────────────────────────

  private _rebuild(): void {
    const s = this._state.scene;
    const scene = this.engine.buildScene({
      name: s.name,
      cols: s.cols, rows: s.rows,
      tileW: s.tileW, tileH: s.tileH,
      floor: { ...s.floor },
      walls: s.walls.map(w => ({ ...w })),
      lights: s.lights.map(l => ({
        type: l.type, x: l.x, y: l.y, z: l.z,
        color: l.color, intensity: l.intensity, radius: l.radius,
      })),
      characters: s.characters.map(c => ({
        id: c.id, x: c.x, y: c.y, z: c.z, radius: c.radius, color: c.color,
      })),
    });
    for (const p of s.props) {
      if (p.kind === 'crystal') scene.addObject(new Crystal(p.id, p.x, p.y, p.color));
      else if (p.kind === 'boulder') scene.addObject(new Boulder(p.id, p.x, p.y, p.color));
      else if (p.kind === 'chest')   scene.addObject(new Chest(p.id, p.x, p.y, p.color));
    }
    this.engine.setScene(scene);
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────

  canvasToWorld(cx: number, cy: number): { x: number; y: number } {
    const s = this._state.scene;
    return unproject(cx - this.engine.originX, cy - this.engine.originY, s.tileW, s.tileH);
  }

  snapToTile(wx: number, wy: number): { x: number; y: number } {
    return { x: Math.floor(wx) + 0.5, y: Math.floor(wy) + 0.5 };
  }

  snapToGrid(wx: number, wy: number): { x: number; y: number } {
    return { x: Math.round(wx), y: Math.round(wy) };
  }

  // ── Start / stop ──────────────────────────────────────────────────────────

  start(): void {
    this.engine.start(() => this._drawOverlay());
  }

  stop(): void {
    this.engine.stop();
  }

  // ── Overlay ───────────────────────────────────────────────────────────────

  private _drawOverlay(): void {
    const ctx = this.engine.ctx;
    const s   = this._state.scene;
    const ox  = this.engine.originX;
    const oy  = this.engine.originY;
    const tw  = s.tileW, th = s.tileH;

    // ── Walkable / blocked tile overlay ──────────────────────────────────
    const showCollision = this._state.activeTool === 'walkable' || this._state.activeTool === 'blocked';
    if (showCollision) {
      for (let row = 0; row < s.rows; row++) {
        for (let col = 0; col < s.cols; col++) {
          const walkable = this._state.isWalkable(col, row);
          if (!walkable) {
            this._drawTileHighlight(ctx, col, row, ox, oy, tw, th, 'rgba(220,60,60,0.28)');
          }
        }
      }
    }

    // ── Grid dots ─────────────────────────────────────────────────────────
    ctx.save();
    ctx.globalAlpha = 0.15;
    for (let row = 0; row <= s.rows; row++) {
      for (let col = 0; col <= s.cols; col++) {
        const { sx, sy } = project(col, row, 0, tw, th);
        ctx.beginPath();
        ctx.arc(ox + sx, oy + sy, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#88aaff';
        ctx.fill();
      }
    }
    ctx.restore();

    // ── Hover tile ────────────────────────────────────────────────────────
    if (this.hoverWorld) {
      const { x, y } = this.hoverWorld;
      const col = Math.floor(x), row = Math.floor(y);
      if (col >= 0 && col < s.cols && row >= 0 && row < s.rows) {
        const tool = this._state.activeTool;
        const color = tool === 'blocked'  ? 'rgba(220,60,60,0.35)'
                    : tool === 'walkable' ? 'rgba(60,220,100,0.25)'
                    : 'rgba(100,180,255,0.18)';
        this._drawTileHighlight(ctx, col, row, ox, oy, tw, th, color);
      }
    }

    // ── Wall preview ──────────────────────────────────────────────────────
    if (this._state.activeTool === 'wall' && this._state.wallStart && this.hoverWorld) {
      const ws = this._state.wallStart;
      const we = this.snapToGrid(this.hoverWorld.x, this.hoverWorld.y);
      const p0 = project(ws.x, ws.y, 0, tw, th);
      const p1 = project(we.x, we.y, 0, tw, th);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(255,200,80,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ox + p0.sx, oy + p0.sy);
      ctx.lineTo(ox + p1.sx, oy + p1.sy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ox + p0.sx, oy + p0.sy, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,200,80,0.9)';
      ctx.fill();
      ctx.restore();
    }

    // ── Selection highlight ───────────────────────────────────────────────
    if (this._state.selectedId) {
      const obj = this._state.getById(this._state.selectedId);
      if (obj) {
        const x = (obj as { x: number }).x ?? 0;
        const y = (obj as { y: number }).y ?? 0;
        const { sx, sy } = project(x, y, 0, tw, th);
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

    // ── Object labels (id) ────────────────────────────────────────────────
    ctx.save();
    ctx.font = '9px monospace';
    ctx.fillStyle = 'rgba(180,200,255,0.5)';
    for (const obj of this._state.allObjects()) {
      const x = (obj as { x: number }).x;
      const y = (obj as { y: number }).y;
      if (x === undefined) continue;
      const { sx, sy } = project(x, y, 0, tw, th);
      ctx.fillText(obj.id, ox + sx + 14, oy + sy - 4);
    }
    ctx.restore();
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
}
