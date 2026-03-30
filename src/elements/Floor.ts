import { project } from '../math/IsoProjection';
import { AABB } from '../math/depthSort';
import { AssetLoader } from '../core/AssetLoader';
import { IsoObject, DrawContext } from './IsoObject';
import { hexToRgb } from '../math/color';

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

export class Floor extends IsoObject {
  cols: number;
  rows: number;
  color: string;
  altColor: string;
  tileImageUrl?: string;
  altTileImageUrl?: string;

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

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY, omniLights, dirLights } = dc;

    // Pre-compute omni light screen positions once
    const omniScreenPos = omniLights.map((l) => {
      const lp = project(l.position.x, l.position.y, 0, tileW, tileH);
      return { lsx: originX + lp.sx, lsy: originY + lp.sy - l.position.z, light: l };
    });

    // Resolve tile images (synchronous — must be preloaded)
    const img    = this.tileImageUrl    ? AssetLoader.get(this.tileImageUrl)    : undefined;
    const altImg = this.altTileImageUrl ? AssetLoader.get(this.altTileImageUrl) : undefined;

    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        // Sample illumination at tile center
        const { sx: csx, sy: csy } = project(col + 0.5, row + 0.5, 0, tileW, tileH);
        const tileCx = originX + csx;
        const tileCy = originY + csy;

        // Accumulate RGB illumination (multi-light color mixing)
        let rIllum = 0, gIllum = 0, bIllum = 0;

        for (const { lsx, lsy, light } of omniScreenPos) {
          const factor = light.illuminateAt(tileCx, tileCy, lsx, lsy);
          if (factor <= 0) continue;
          const [lr, lg, lb] = hexToRgb(light.color);
          rIllum += (lr / 255) * factor;
          gIllum += (lg / 255) * factor;
          bIllum += (lb / 255) * factor;
        }

        // Directional light: floor normal points straight up (0,0,1)
        // dot(normal, lightDir) = sin(elevation) — independent of angle
        for (const dl of dirLights) {
          const factor = Math.sin(dl.elevation) * dl.intensity;
          if (factor <= 0) continue;
          const [lr, lg, lb] = hexToRgb(dl.color);
          rIllum += (lr / 255) * factor;
          gIllum += (lg / 255) * factor;
          bIllum += (lb / 255) * factor;
        }

        rIllum = Math.min(1, rIllum);
        gIllum = Math.min(1, gIllum);
        bIllum = Math.min(1, bIllum);

        // Corner of this tile (top vertex of the diamond)
        const { sx: cx, sy: cy } = project(col, row, 0, tileW, tileH);
        const tileX = originX + cx;
        const tileY = originY + cy;

        const isEven = (col + row) % 2 === 0;
        const tileImg = isEven ? img : (altImg ?? img);

        this.drawTile(ctx, tileX, tileY, tileW, tileH, col, row, isEven, tileImg, rIllum, gIllum, bIllum);
      }
    }
  }

  private drawTile(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    tileW: number, tileH: number,
    _col: number, _row: number,
    isEven: boolean,
    img: HTMLImageElement | undefined,
    rIllum: number, gIllum: number, bIllum: number,
  ): void {
    const hw = tileW / 2;
    const hh = tileH / 2;

    // Build the diamond clipping path
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx,      cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx,      cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.clip();

    if (img) {
      // Draw texture clipped to diamond
      ctx.drawImage(img, cx - hw, cy - hh, tileW, tileH);

      // Lighting multiply layer
      const alpha = 1 - Math.min(1, (rIllum + gIllum + bIllum) / 3 + 0.15);
      if (alpha > 0.01) {
        ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
        ctx.fill();
      }

      // Color tint from colored lights (additive screen blend approximation)
      if (rIllum + gIllum + bIllum > 0.05) {
        ctx.globalCompositeOperation = 'screen';
        const r = Math.round(rIllum * 40);
        const g = Math.round(gIllum * 40);
        const b = Math.round(bIllum * 40);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    } else {
      // Procedural color mode
      const base = isEven ? 42 : (this.altColor ? 0 : 36);
      let r: number, g: number, b: number;

      if (this.altColor && !isEven) {
        [r, g, b] = hexToRgb(this.altColor);
      } else {
        [r, g, b] = hexToRgb(this.color);
      }

      // Apply lighting: scale base color by illum, then add light color tint
      const ambient = 0.25;
      const illumTotal = Math.min(1, (rIllum + gIllum + bIllum) / 3);
      const scale = ambient + illumTotal * (1 - ambient);

      const fr = Math.min(255, Math.round(r * scale + rIllum * 60));
      const fg = Math.min(255, Math.round(g * scale + gIllum * 60));
      const fb = Math.min(255, Math.round(b * scale + bIllum * 60));

      // If no lights at all, use original procedural scheme
      if (rIllum + gIllum + bIllum < 0.01) {
        const lit = Math.round(base + illumTotal * 80);
        ctx.fillStyle = `rgb(${lit},${Math.round(lit * 0.85)},${Math.round(lit * 1.15)})`;
      } else {
        ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
      }
      ctx.fill();
    }

    ctx.restore();

    // Tile border (drawn after restore, no clipping needed)
    ctx.beginPath();
    ctx.moveTo(cx,      cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx,      cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

// ── helpers removed — imported from src/math/color.ts ──────────────────────
