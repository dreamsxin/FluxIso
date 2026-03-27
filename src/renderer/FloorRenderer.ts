import { project } from '../math/IsoProjection';

export interface FloorRendererOptions {
  cols: number;
  rows: number;
  tileW: number;
  tileH: number;
  /** Origin offset so the grid is centered on the canvas */
  originX: number;
  originY: number;
}

export class FloorRenderer {
  private opts: FloorRendererOptions;

  constructor(opts: FloorRendererOptions) {
    this.opts = opts;
  }

  draw(ctx: CanvasRenderingContext2D, lightX: number, lightY: number, lightRadius: number): void {
    const { cols, rows, tileW, tileH, originX, originY } = this.opts;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const { sx, sy } = project(col, row, 0, tileW, tileH);
        const cx = originX + sx;
        const cy = originY + sy;

        // Distance from tile screen center to light screen pos for illumination
        const lightScreenX = originX + project(lightX, lightY, 0, tileW, tileH).sx;
        const lightScreenY = originY + project(lightX, lightY, 0, tileW, tileH).sy;
        const dx = cx - lightScreenX;
        const dy = cy - lightScreenY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const illum = Math.max(0, 1 - dist / lightRadius);

        this.drawTile(ctx, cx, cy, tileW, tileH, col, row, illum);
      }
    }
  }

  private drawTile(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    tileW: number,
    tileH: number,
    col: number,
    row: number,
    illum: number
  ): void {
    const hw = tileW / 2;
    const hh = tileH / 2;

    // Checkerboard base color
    const isEven = (col + row) % 2 === 0;
    const baseLight = isEven ? 42 : 36;
    const lit = Math.round(baseLight + illum * 80);

    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();

    ctx.fillStyle = `rgb(${lit}, ${Math.round(lit * 0.85)}, ${Math.round(lit * 1.15)})`;
    ctx.fill();

    // Subtle edge line
    ctx.strokeStyle = `rgba(0,0,0,0.4)`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}
