import { Scene } from './Scene';
import { Camera } from './Camera';
import { project } from '../math/IsoProjection';
import { IsoVec2 } from '../physics/Pathfinder';
import { Entity } from '../ecs/Entity';
import { TriggerZoneComponent } from '../ecs/components/TriggerZoneComponent';

export interface DebugRendererOptions {
  /** Show walkable/blocked tile grid. Default true. */
  showCollision?: boolean;
  /** Show AABB bounding boxes for all objects. Default false. */
  showAABB?: boolean;
  /** Show OmniLight radius circles. Default true. */
  showLights?: boolean;
  /** Show TriggerZone radii. Default true. */
  showTriggers?: boolean;
  /** Show FPS counter in top-left corner. Default true. */
  showFps?: boolean;
  /** Show object count. Default true. */
  showObjectCount?: boolean;
  /** Tile grid line color. Default 'rgba(255,80,80,0.35)'. */
  blockedColor?: string;
  /** Walkable tile overlay color. Default 'rgba(80,255,80,0.08)'. */
  walkableColor?: string;
  /** AABB stroke color. Default 'rgba(255,220,0,0.7)'. */
  aabbColor?: string;
  /** Light radius stroke color. Default 'rgba(255,200,60,0.4)'. */
  lightColor?: string;
  /** Trigger zone stroke color. Default 'rgba(80,180,255,0.6)'. */
  triggerColor?: string;
}

/**
 * DebugRenderer — overlays collision grids, AABBs, light radii, and
 * trigger zones onto the canvas for development purposes.
 *
 * @example
 *   const debug = new DebugRenderer(scene, engine);
 *   debug.enabled = true;
 *
 *   engine.start((ts) => {
 *     if (debug.enabled) debug.draw(engine.ctx, canvas.width, canvas.height);
 *   });
 *
 *   // Toggle with a key
 *   input.onAction('debug', () => { debug.enabled = !debug.enabled; });
 *   input.bindKey('F1', 'debug');
 */
export class DebugRenderer {
  enabled = false;

  private _scene: Scene;
  private _originX: number;
  private _originY: number;
  private _opts: Required<DebugRendererOptions>;

  // FPS tracking
  private _fpsSamples: number[] = [];
  private _lastTs = 0;

  constructor(
    scene: Scene,
    originX: number,
    originY: number,
    opts: DebugRendererOptions = {},
  ) {
    this._scene   = scene;
    this._originX = originX;
    this._originY = originY;
    this._opts = {
      showCollision:   opts.showCollision   ?? true,
      showAABB:        opts.showAABB        ?? false,
      showLights:      opts.showLights      ?? true,
      showTriggers:    opts.showTriggers    ?? true,
      showFps:         opts.showFps         ?? true,
      showObjectCount: opts.showObjectCount ?? true,
      blockedColor:    opts.blockedColor    ?? 'rgba(255,80,80,0.45)',
      walkableColor:   opts.walkableColor   ?? 'rgba(80,255,80,0.06)',
      aabbColor:       opts.aabbColor       ?? 'rgba(255,220,0,0.7)',
      lightColor:      opts.lightColor      ?? 'rgba(255,200,60,0.4)',
      triggerColor:    opts.triggerColor    ?? 'rgba(80,180,255,0.6)',
    };
  }

  /** Update origin (call after canvas resize). */
  setOrigin(originX: number, originY: number): void {
    this._originX = originX;
    this._originY = originY;
  }

  /**
   * Draw all enabled debug overlays.
   * Call this in your postFrame callback, after scene.draw().
   */
  draw(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, ts = performance.now()): void {
    if (!this.enabled) return;

    const scene    = this._scene;
    const camera   = scene.camera;
    const { tileW, tileH } = scene;
    const ox = this._originX;
    const oy = this._originY;

    // Apply camera transform so debug overlays align with scene objects
    camera.applyTransform(ctx, canvasW, canvasH, tileW, tileH, ox, oy);

    if (this._opts.showCollision) this._drawCollision(ctx, tileW, tileH);
    if (this._opts.showAABB)      this._drawAABBs(ctx, tileW, tileH);
    if (this._opts.showLights)    this._drawLights(ctx, tileW, tileH);
    if (this._opts.showTriggers)  this._drawTriggers(ctx, tileW, tileH);

    camera.restoreTransform(ctx);

    // HUD overlays (screen-space, no camera transform)
    this._drawHud(ctx, canvasW, ts);
  }

  /**
   * Draw a path as a dashed line with waypoint dots.
   * Useful for visualising A* results.
   */
  drawPath(
    ctx: CanvasRenderingContext2D,
    waypoints: readonly IsoVec2[],
    fromX: number,
    fromY: number,
    fromZ: number,
    canvasW: number,
    canvasH: number,
  ): void {
    if (!this.enabled || waypoints.length === 0) return;

    const { tileW, tileH } = this._scene;
    const camera = this._scene.camera;
    const ox = this._originX;
    const oy = this._originY;

    camera.applyTransform(ctx, canvasW, canvasH, tileW, tileH, ox, oy);

    const { sx: startX, sy: startY } = project(fromX, fromY, fromZ, tileW, tileH);

    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = 'rgba(85,144,204,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (const wp of waypoints) {
      const { sx, sy } = project(wp.x, wp.y, fromZ, tileW, tileH);
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(85,144,204,0.85)';
    for (const wp of waypoints) {
      const { sx, sy } = project(wp.x, wp.y, fromZ, tileW, tileH);
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    camera.restoreTransform(ctx);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _drawCollision(ctx: CanvasRenderingContext2D, tileW: number, tileH: number): void {
    const collider = this._scene.collider;
    if (!collider) return;

    const { cols, rows } = collider;
    ctx.save();
    ctx.lineWidth = 0.5;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const walkable = collider.isWalkable(col, row);
        if (walkable && !this._opts.walkableColor) continue;

        // Tile corners in world space
        const corners = [
          project(col,     row,     0, tileW, tileH),
          project(col + 1, row,     0, tileW, tileH),
          project(col + 1, row + 1, 0, tileW, tileH),
          project(col,     row + 1, 0, tileW, tileH),
        ];

        ctx.beginPath();
        ctx.moveTo(corners[0].sx, corners[0].sy);
        for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].sx, corners[i].sy);
        ctx.closePath();

        if (!walkable) {
          ctx.fillStyle = this._opts.blockedColor;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,60,60,0.5)';
          ctx.stroke();
        } else {
          ctx.fillStyle = this._opts.walkableColor;
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  private _drawAABBs(ctx: CanvasRenderingContext2D, tileW: number, tileH: number): void {
    // Access objects via the public getAll — use IsoObject base
    const objects = (this._scene as unknown as { objects: { aabb: { minX: number; minY: number; maxX: number; maxY: number }; id: string }[] }).objects;
    if (!objects) return;

    ctx.save();
    ctx.strokeStyle = this._opts.aabbColor;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 3]);

    for (const obj of objects) {
      const { minX, minY, maxX, maxY } = obj.aabb;
      const corners = [
        project(minX, minY, 0, tileW, tileH),
        project(maxX, minY, 0, tileW, tileH),
        project(maxX, maxY, 0, tileW, tileH),
        project(minX, maxY, 0, tileW, tileH),
      ];
      ctx.beginPath();
      ctx.moveTo(corners[0].sx, corners[0].sy);
      for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].sx, corners[i].sy);
      ctx.closePath();
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.restore();
  }

  private _drawLights(ctx: CanvasRenderingContext2D, tileW: number, tileH: number): void {
    ctx.save();
    ctx.strokeStyle = this._opts.lightColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);

    for (const light of this._scene.omniLights) {
      const { sx, sy } = project(light.position.x, light.position.y, 0, tileW, tileH);
      // Approximate world-radius to screen pixels (rough, ignores zoom here since we're in camera space)
      const radiusPx = (light.radius ?? 200) / (tileW / 2) * (tileW / 2);
      ctx.beginPath();
      ctx.arc(sx, sy - light.position.z, radiusPx * 0.18, 0, Math.PI * 2);
      ctx.stroke();

      // Cross-hair at light position
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,220,80,0.8)';
      ctx.lineWidth = 1;
      const s = 6;
      ctx.beginPath();
      ctx.moveTo(sx - s, sy - light.position.z);
      ctx.lineTo(sx + s, sy - light.position.z);
      ctx.moveTo(sx, sy - light.position.z - s);
      ctx.lineTo(sx, sy - light.position.z + s);
      ctx.stroke();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = this._opts.lightColor;
    }

    ctx.setLineDash([]);
    ctx.restore();
  }

  private _drawTriggers(ctx: CanvasRenderingContext2D, tileW: number, tileH: number): void {
    // Walk all entities and look for TriggerZoneComponent
    const objects = (this._scene as unknown as { objects: unknown[] }).objects;
    if (!objects) return;

    ctx.save();
    ctx.strokeStyle = this._opts.triggerColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (const obj of objects) {
      if (!(obj instanceof Entity)) continue;
      const trigger = obj.getComponent<TriggerZoneComponent>('triggerZone');
      if (!trigger) continue;

      const { sx, sy } = project(obj.position.x, obj.position.y, 0, tileW, tileH);
      // Convert world-unit radius to approximate screen pixels
      const radiusPx = trigger.radius * (tileW / 2);
      ctx.beginPath();
      ctx.ellipse(sx, sy, radiusPx, radiusPx * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.restore();
  }

  private _drawHud(ctx: CanvasRenderingContext2D, canvasW: number, ts: number): void {
    // FPS sampling
    if (this._lastTs > 0) {
      const fps = 1000 / (ts - this._lastTs);
      this._fpsSamples.push(fps);
      if (this._fpsSamples.length > 30) this._fpsSamples.shift();
    }
    this._lastTs = ts;

    const avgFps = this._fpsSamples.length > 0
      ? this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length
      : 0;

    const lines: string[] = ['[DEBUG]'];
    if (this._opts.showFps)         lines.push(`FPS: ${avgFps.toFixed(0)}`);
    if (this._opts.showObjectCount) {
      const count = (this._scene as unknown as { objects: unknown[] }).objects?.length ?? 0;
      lines.push(`Objects: ${count}`);
    }
    if (this._opts.showCollision)   lines.push('Collision: ON');
    if (this._opts.showAABB)        lines.push('AABB: ON');
    if (this._opts.showLights)      lines.push('Lights: ON');
    if (this._opts.showTriggers)    lines.push('Triggers: ON');

    ctx.save();
    ctx.font = '11px monospace';
    const lineH = 15;
    const padX = 8, padY = 8;
    const boxW = 120;
    const boxH = lines.length * lineH + padY * 2;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(canvasW - boxW - padX, padY, boxW, boxH);

    ctx.fillStyle = '#00ff88';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], canvasW - boxW, padY + lineH * (i + 1));
    }
    ctx.restore();
  }
}
