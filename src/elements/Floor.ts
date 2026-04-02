import { project } from '../math/IsoProjection';
import { AABB } from '../math/depthSort';
import { AssetLoader } from '../core/AssetLoader';
import { IsoObject, DrawContext } from './IsoObject';
import { hexToRgb } from '../math/color';
import type { OmniLight } from '../lighting/OmniLight';
import type { DirectionalLight } from '../lighting/DirectionalLight';

export interface FloorOptions {
  id: string;
  cols: number;
  rows: number;
  /** Flat color for procedural tiles (used when no tileImage is set). */
  color?: string;
  /**
   * URL of a tile texture image. The image is clipped into each isometric
   * diamond and then a lighting multiply layer is applied on top.
   */
  tileImage?: string;
  /**
   * Checkerboard alternate color or image URL for even tiles.
   * If omitted, alternate tiles use a slightly darker shade of `color`.
   */
  altColor?: string;
  altTileImage?: string;
}

/**
 * Floor — isometric tiled ground plane.
 *
 * Lighting is fully automatic: the floor reads omniLights, dirLights, and
 * dc.ambientRgb from the DrawContext injected by Scene.draw().
 * To drive day/night, set scene.ambientColor + scene.ambientIntensity each
 * frame — no manual floor property sync required.
 *
 * ## Performance
 * Per-tile illumination is expensive to recompute every frame. Floor caches
 * the computed fill-color string for each tile and only recomputes when the
 * lighting inputs change (lights, ambient, or tile count). This eliminates
 * redundant `hexToRgb` calls and string allocations on static scenes.
 */
export class Floor extends IsoObject {
  cols: number;
  rows: number;
  color: string;
  altColor: string;
  tileImageUrl?: string;
  altTileImageUrl?: string;

  // ── Tile color cache ──────────────────────────────────────────────────────
  // Stores pre-computed fill colors for each tile (row-major).
  // Invalidated when lighting inputs change.
  private _colorCache: string[] = [];
  private _cacheKey = '';

  constructor(opts: FloorOptions) {
    super(opts.id, 0, 0, 0);
    this.cols = opts.cols;
    this.rows = opts.rows;
    this.color = opts.color ?? '#2a2a3a';
    this.altColor = opts.altColor ?? '';
    this.tileImageUrl = opts.tileImage;
    this.altTileImageUrl = opts.altTileImage;
  }

  /** Preload tile textures if configured. Call before engine.start(). */
  async preload(): Promise<void> {
    const urls = [this.tileImageUrl, this.altTileImageUrl].filter(Boolean) as string[];
    if (urls.length) await AssetLoader.loadAll(urls);
  }

  get aabb(): AABB {
    return { minX: 0, minY: 0, maxX: this.cols, maxY: this.rows, baseZ: 0 };
  }

  /** Invalidate the tile color cache (e.g. after changing color/altColor). */
  invalidateCache(): void {
    this._cacheKey = '';
    this._colorCache = [];
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY, omniLights, dirLights, ambientRgb } = dc;

    // Resolve tile images (synchronous — must be preloaded)
    const img    = this.tileImageUrl    ? AssetLoader.get(this.tileImageUrl)    : undefined;
    const altImg = this.altTileImageUrl ? AssetLoader.get(this.altTileImageUrl) : undefined;

    // ── Build / validate color cache ────────────────────────────────────────
    // Cache key encodes all lighting inputs. If unchanged, skip recomputation.
    const newKey = this._buildCacheKey(omniLights, dirLights, ambientRgb, originX, originY, tileW, tileH);
    if (newKey !== this._cacheKey || this._colorCache.length !== this.cols * this.rows) {
      this._rebuildColorCache(omniLights, dirLights, ambientRgb, originX, originY, tileW, tileH);
      this._cacheKey = newKey;
    }

    // ── Draw tiles using cached colors ──────────────────────────────────────
    const hw = tileW / 2;
    const hh = tileH / 2;

    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const { sx: cx, sy: cy } = project(col, row, 0, tileW, tileH);
        const tileX = originX + cx;
        const tileY = originY + cy;
        const isEven = (col + row) % 2 === 0;
        const tileImg = isEven ? img : (altImg ?? img);

        // Diamond clip path (reused for fill + border)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(tileX,      tileY - hh);
        ctx.lineTo(tileX + hw, tileY);
        ctx.lineTo(tileX,      tileY + hh);
        ctx.lineTo(tileX - hw, tileY);
        ctx.closePath();

        if (tileImg) {
          ctx.clip();
          ctx.drawImage(tileImg, tileX - hw, tileY - hh, tileW, tileH);

          // Cached illumination overlay
          const illumColor = this._colorCache[row * this.cols + col];
          if (illumColor) {
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = illumColor;
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }
        } else {
          ctx.fillStyle = this._colorCache[row * this.cols + col] ?? '#000';
          ctx.fill();
        }

        ctx.restore();

        // Tile border (no clip needed)
        ctx.beginPath();
        ctx.moveTo(tileX,      tileY - hh);
        ctx.lineTo(tileX + hw, tileY);
        ctx.lineTo(tileX,      tileY + hh);
        ctx.lineTo(tileX - hw, tileY);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  // ── Cache helpers ─────────────────────────────────────────────────────────

  private _buildCacheKey(
    omniLights: OmniLight[],
    dirLights: DirectionalLight[],
    ambientRgb: [number, number, number],
    originX: number, originY: number,
    tileW: number, tileH: number,
  ): string {
    const omni = omniLights.map(l =>
      `${l.position.x.toFixed(1)},${l.position.y.toFixed(1)},${l.position.z.toFixed(1)},${l.color},${l.intensity.toFixed(3)},${l.radius}`
    ).join('|');
    const dir = dirLights.map(l =>
      `${l.angle.toFixed(3)},${l.elevation.toFixed(3)},${l.color},${l.intensity.toFixed(3)}`
    ).join('|');
    const amb = ambientRgb.map(v => v.toFixed(4)).join(',');
    return `${omni};${dir};${amb};${originX},${originY};${tileW}x${tileH};${this.cols}x${this.rows};${this.color};${this.altColor}`;
  }

  private _rebuildColorCache(
    omniLights: OmniLight[],
    dirLights: DirectionalLight[],
    ambientRgb: [number, number, number],
    originX: number, originY: number,
    tileW: number, tileH: number,
  ): void {
    const cache: string[] = new Array(this.cols * this.rows);

    // Pre-compute omni light screen positions once
    const omniScreenPos = omniLights.map((l) => {
      const lp = project(l.position.x, l.position.y, 0, tileW, tileH);
      return { lsx: originX + lp.sx, lsy: originY + lp.sy - l.position.z, light: l };
    });

    // Pre-compute directional light contribution (same for all tiles)
    let dirR = 0, dirG = 0, dirB = 0;
    for (const dl of dirLights) {
      const factor = Math.sin(dl.elevation) * dl.intensity;
      if (factor <= 0) continue;
      const [lr, lg, lb] = hexToRgb(dl.color);
      dirR += (lr / 255) * factor;
      dirG += (lg / 255) * factor;
      dirB += (lb / 255) * factor;
    }

    const [baseR, baseG, baseB] = hexToRgb(this.color);
    const [altR, altG, altB]    = this.altColor ? hexToRgb(this.altColor) : [baseR, baseG, baseB];
    const img = this.tileImageUrl ? AssetLoader.get(this.tileImageUrl) : undefined;

    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const { sx: csx, sy: csy } = project(col + 0.5, row + 0.5, 0, tileW, tileH);
        const tileCx = originX + csx;
        const tileCy = originY + csy;

        let rIllum = ambientRgb[0] + dirR;
        let gIllum = ambientRgb[1] + dirG;
        let bIllum = ambientRgb[2] + dirB;

        for (const { lsx, lsy, light } of omniScreenPos) {
          const factor = light.illuminateAt(tileCx, tileCy, lsx, lsy);
          if (factor <= 0) continue;
          const [lr, lg, lb] = hexToRgb(light.color);
          rIllum += (lr / 255) * factor;
          gIllum += (lg / 255) * factor;
          bIllum += (lb / 255) * factor;
        }

        const isEven = (col + row) % 2 === 0;

        if (img) {
          // For image tiles: store screen-blend tint color
          const avgIllum = (rIllum + gIllum + bIllum) / 3;
          if (avgIllum > 0.05) {
            cache[row * this.cols + col] = `rgb(${Math.round(Math.min(255, rIllum * 40))},${Math.round(Math.min(255, gIllum * 40))},${Math.round(Math.min(255, bIllum * 40))})`;
          } else {
            cache[row * this.cols + col] = '';
          }
        } else {
          // For solid-color tiles: store final lit color
          const [tr, tg, tb] = isEven || !this.altColor
            ? [baseR, baseG, baseB]
            : [altR, altG, altB];
          cache[row * this.cols + col] = `rgb(${Math.min(255, Math.round(tr * rIllum))},${Math.min(255, Math.round(tg * gIllum))},${Math.min(255, Math.round(tb * bIllum))})`;
        }
      }
    }

    this._colorCache = cache;
  }
}
