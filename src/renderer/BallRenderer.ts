import { project } from '../math/IsoProjection';

export interface BallOptions {
  /** World position (center of ball, ground level) */
  x: number;
  y: number;
  /** Ball hover height above ground in pixels */
  elevation: number;
  /** Visual radius in pixels */
  radius: number;
}

export interface LightSource {
  x: number;
  y: number;
  /** Screen-space Z of the light (elevation above ground) */
  elevation: number;
}

export class BallRenderer {
  constructor(public ball: BallOptions) {}

  draw(
    ctx: CanvasRenderingContext2D,
    tileW: number,
    tileH: number,
    originX: number,
    originY: number,
    light: LightSource
  ): void {
    const { x, y, elevation, radius } = this.ball;

    // Screen position of ball center
    const { sx, sy } = project(x, y, elevation, tileW, tileH);
    const bx = originX + sx;
    const by = originY + sy;

    // Screen position of ball's ground shadow anchor
    const groundProj = project(x, y, 0, tileW, tileH);
    const gx = originX + groundProj.sx;
    const gy = originY + groundProj.sy;

    // Light screen position
    const lightProj = project(light.x, light.y, 0, tileW, tileH);
    const lx = originX + lightProj.sx;
    const ly = originY + lightProj.sy - light.elevation;

    this.drawShadow(ctx, gx, gy, bx, by, lx, ly, radius, elevation);
    this.drawBall(ctx, bx, by, radius, lx, ly);
    this.drawLightHalo(ctx, lx, ly);
  }

  /** Elliptical drop shadow on the floor */
  private drawShadow(
    ctx: CanvasRenderingContext2D,
    gx: number,
    gy: number,
    bx: number,
    by: number,
    lx: number,
    ly: number,
    radius: number,
    elevation: number
  ): void {
    // Shadow is cast opposite to the light direction, squished vertically (isometric)
    const dx = bx - lx;
    const dy = by - ly;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    // Shadow offset: scales with elevation
    const shadowScale = elevation / 60;
    const offX = (dx / len) * radius * shadowScale * 1.5;
    const offY = (dy / len) * radius * shadowScale * 0.7;

    ctx.save();
    ctx.translate(gx + offX, gy + offY);
    ctx.scale(1, 0.45); // isometric squish

    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.3);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  /** 3D-shaded sphere using radial gradient highlight */
  private drawBall(
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    radius: number,
    lx: number,
    ly: number
  ): void {
    // Direction from ball to light → highlight offset
    const dx = lx - bx;
    const dy = ly - by;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const hx = bx + (dx / len) * radius * 0.38;
    const hy = by + (dy / len) * radius * 0.38;

    // Base sphere gradient (dark base)
    const base = ctx.createRadialGradient(hx, hy, radius * 0.05, bx, by, radius);
    base.addColorStop(0, '#d4e8ff');    // bright highlight
    base.addColorStop(0.3, '#5590cc'); // mid-tone
    base.addColorStop(0.75, '#1a3a6e'); // shadow side
    base.addColorStop(1, '#0a1a38');   // deep shadow rim

    ctx.beginPath();
    ctx.arc(bx, by, radius, 0, Math.PI * 2);
    ctx.fillStyle = base;
    ctx.fill();

    // Specular glint (small bright circle)
    const glint = ctx.createRadialGradient(hx, hy, 0, hx, hy, radius * 0.25);
    glint.addColorStop(0, 'rgba(255,255,255,0.85)');
    glint.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(bx, by, radius, 0, Math.PI * 2);
    ctx.fillStyle = glint;
    ctx.fill();
  }

  /** Visible light source halo glow */
  private drawLightHalo(ctx: CanvasRenderingContext2D, lx: number, ly: number): void {
    const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, 18);
    grad.addColorStop(0, 'rgba(255, 240, 180, 0.95)');
    grad.addColorStop(0.3, 'rgba(255, 200, 80, 0.6)');
    grad.addColorStop(1, 'rgba(255, 160, 40, 0)');

    ctx.beginPath();
    ctx.arc(lx, ly, 18, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Solid center dot
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff8e0';
    ctx.fill();
  }
}
