import { FloorRenderer } from './renderer/FloorRenderer';
import { BallRenderer } from './renderer/BallRenderer';
import { project } from './math/IsoProjection';

// ─── Canvas setup ────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const COLS = 10;
const ROWS = 10;
const TILE_W = 64;
const TILE_H = 32; // standard 2:1 iso ratio

// Canvas size: fits a 10x10 iso grid + ball height
const canvasW = (COLS + ROWS) * (TILE_W / 2);
const canvasH = (COLS + ROWS) * (TILE_H / 2) + 120;
canvas.width = canvasW;
canvas.height = canvasH;

// Grid origin: center the diamond grid horizontally, leave top margin
const ORIGIN_X = canvasW / 2;
const ORIGIN_Y = ROWS * (TILE_H / 2) + 20;

// ─── Scene objects ───────────────────────────────────────────────────────────

const floor = new FloorRenderer({
  cols: COLS,
  rows: ROWS,
  tileW: TILE_W,
  tileH: TILE_H,
  originX: ORIGIN_X,
  originY: ORIGIN_Y,
});

// Ball sits at world center (5, 5), hovering 48px above ground
const ball = new BallRenderer({
  x: 5,
  y: 5,
  elevation: 48,
  radius: 26,
});

// ─── Animated light source ────────────────────────────────────────────────────

let time = 0;
const LIGHT_ORBIT_R = 3.2; // world units
const LIGHT_CENTER_X = 5;
const LIGHT_CENTER_Y = 5;
const LIGHT_ELEVATION = 120; // screen pixels above ground
const LIGHT_RADIUS_SCREEN = 320; // px — illumination falloff

// ─── Render loop ─────────────────────────────────────────────────────────────

function render(ts: number): void {
  time = ts * 0.0006; // slow orbit

  const lightX = LIGHT_CENTER_X + Math.cos(time) * LIGHT_ORBIT_R;
  const lightY = LIGHT_CENTER_Y + Math.sin(time) * LIGHT_ORBIT_R;

  // Derive light screen position for ambient glow on the background
  const lightProj = project(lightX, lightY, 0, TILE_W, TILE_H);
  const lightScreenX = ORIGIN_X + lightProj.sx;
  const lightScreenY = ORIGIN_Y + lightProj.sy - LIGHT_ELEVATION;

  // 1. Clear
  ctx.clearRect(0, 0, canvasW, canvasH);

  // 2. Ambient background glow from light
  const bgGlow = ctx.createRadialGradient(
    lightScreenX, lightScreenY, 0,
    lightScreenX, lightScreenY, LIGHT_RADIUS_SCREEN * 1.2
  );
  bgGlow.addColorStop(0, 'rgba(255, 200, 80, 0.07)');
  bgGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bgGlow;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // 3. Floor tiles (lit per-tile)
  floor.draw(ctx, lightX, lightY, LIGHT_RADIUS_SCREEN);

  // 4. Ball + shadow + light halo
  ball.draw(ctx, TILE_W, TILE_H, ORIGIN_X, ORIGIN_Y, {
    x: lightX,
    y: lightY,
    elevation: LIGHT_ELEVATION,
  });

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
