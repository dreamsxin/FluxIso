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

/**
 * Floor — isometric tiled ground plane.
 *
 * Lighting is fully automatic: the floor reads omniLights, dirLights, and
 * dc.ambientRgb from the DrawContext injected by Scene.draw().
 * To drive day/night, set scene.ambientColor + scene.ambientIntensity each
 * frame — no manual floor property sync required.
 */
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
    const { ctx, tileW, tileH, originX, originY, omniLights, dirLights, ambientRgb } = dc;

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

        // Start accumulation from scene ambient (injected by Scene)
        let rIllum = ambientRgb[0];
        let gIllum = ambientRgb[1];
        let bIllum = ambientRgb[2];

        // OmniLights (global ones skip distance calc inside illuminateAt)
        for (const { lsx, lsy, light } of omniScreenPos) {
          const factor = light.illuminateAt(tileCx, tileCy, lsx, lsy);
          if (factor <= 0) continue;
          const [lr, lg, lb] = hexToRgb(light.color);
          rIllum += (lr / 255) * factor;
          gIllum += (lg / 255) * factor;
          bIllum += (lb / 255) * factor;
        }

        // Directional light: floor normal points straight up → dot = sin(elevation)
        for (const dl of dirLights) {
          const factor = Math.sin(dl.elevation) * dl.intensity;
          if (factor <= 0) continue;
          const [lr, lg, lb] = hexToRgb(dl.color);
          rIllum += (lr / 255) * factor;
          gIllum += (lg / 255) * factor;
          bIllum += (lb / 255) * factor;
        }

        // Do NOT clamp here — keep raw values so color tint from directional
        // light (warm sunrise, cool dusk) is preserved in drawTile.

        // Corner of this tile (top vertex of the diamond)
        const { sx: cx, sy: cy } = project(col, row, 0, tileW, tileH);
        const tileX = originX + cx;
        const tileY = originY + cy;

        const isEven = (col + row) % 2 === 0;
        const tileImg = isEven ? img : (altImg ?? img);

        this.drawTile(ctx, tileX, tileY, tileW, tileH, isEven, tileImg, rIllum, gIllum, bIllum);
      }
    }
  }

  private drawTile(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    tileW: number, tileH: number,
    isEven: boolean,
    img: HTMLImageElement | undefined,
    rIllum: number, gIllum: number, bIllum: number,
  ): void {
    const hw = tileW / 2;
    const hh = tileH / 2;

    // Diamond clip path
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx,      cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx,      cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.clip();

    if (img) {
      ctx.drawImage(img, cx - hw, cy - hh, tileW, tileH);

      // Darken by inverse of illumination
      const avgIllum = (rIllum + gIllum + bIllum) / 3;
      const alpha = 1 - Math.min(1, avgIllum * 0.8 + 0.15);
      if (alpha > 0.01) {
        ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
        ctx.fill();
      }

      // Additive color tint from lights
      if (avgIllum > 0.05) {
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgb(${Math.round(Math.min(255, rIllum * 40))},${Math.round(Math.min(255, gIllum * 40))},${Math.round(Math.min(255, bIllum * 40))})`;
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    } else {
      let r: number, g: number, b: number;
      if (this.altColor && !isEven) {
        [r, g, b] = hexToRgb(this.altColor);
      } else {
        [r, g, b] = hexToRgb(this.color);
      }

      // Multiply base tile color by the light color components directly.
      // rIllum/gIllum/bIllum are NOT pre-clamped, so warm/cool tints from
      // directional light (sunrise orange, noon white, dusk red) show through.
      // We clamp only at the final rgb() output.
      const fr = Math.min(255, Math.round(r * rIllum));
      const fg = Math.min(255, Math.round(g * gIllum));
      const fb = Math.min(255, Math.round(b * bIllum));

      ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
      ctx.fill();
    }

    ctx.restore();

    // Tile border
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
