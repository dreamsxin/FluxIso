import { FloorRenderer } from './renderer/FloorRenderer';
import { BallRenderer } from './renderer/BallRenderer';
import { project, unproject } from './math/IsoProjection';

// ─── Canvas setup ────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const COLS = 10;
const ROWS = 10;
const TILE_W = 64;
const TILE_H = 32;

const canvasW = (COLS + ROWS) * (TILE_W / 2);
const canvasH = (COLS + ROWS) * (TILE_H / 2) + 120;
canvas.width = canvasW;
canvas.height = canvasH;

const ORIGIN_X = canvasW / 2;
const ORIGIN_Y = ROWS * (TILE_H / 2) + 20;

// ─── Scene objects ───────────────────────────────────────────────────────────

const floor = new FloorRenderer({
  cols: COLS, rows: ROWS,
  tileW: TILE_W, tileH: TILE_H,
  originX: ORIGIN_X, originY: ORIGIN_Y,
});

const ball = new BallRenderer({ x: 5, y: 5, elevation: 48, radius: 26 });

// ─── Slider bindings ─────────────────────────────────────────────────────────

const ballElevSlider  = document.getElementById('ball-elev')   as HTMLInputElement;
const ballElevVal     = document.getElementById('ball-elev-val')  as HTMLSpanElement;
const lightElevSlider = document.getElementById('light-elev')  as HTMLInputElement;
const lightElevVal    = document.getElementById('light-elev-val') as HTMLSpanElement;

ballElevSlider.addEventListener('input', () => {
  ball.ball.elevation = Number(ballElevSlider.value);
  ballElevVal.textContent = ballElevSlider.value;
});

lightElevSlider.addEventListener('input', () => {
  lightElevation = Number(lightElevSlider.value);
  lightElevVal.textContent = lightElevSlider.value;
});

// ─── Light state ─────────────────────────────────────────────────────────────

let lightElevation = 120;
const LIGHT_RADIUS_SCREEN = 320;
const LIGHT_ORBIT_R = 3.2;

type LightMode = 'orbit' | 'manual';
let lightMode: LightMode = 'orbit';
let orbitTime = 0;

// Manual mode world position
let manualLightX = 5 + LIGHT_ORBIT_R;
let manualLightY = 5;

// Current light world position (resolved each frame)
let lightX = manualLightX;
let lightY = manualLightY;

// ─── Drag state ───────────────────────────────────────────────────────────────

type DragTarget = 'ball' | 'light' | null;
let dragging: DragTarget = null;
let dragOffsetX = 0; // screen-space offset from object center to mouse
let dragOffsetY = 0;

/** Hit-test radius in screen pixels for drag targets */
const HIT_RADIUS = 30;

function getBallScreenPos(): { bx: number; by: number } {
  const { sx, sy } = project(ball.ball.x, ball.ball.y, ball.ball.elevation, TILE_W, TILE_H);
  return { bx: ORIGIN_X + sx, by: ORIGIN_Y + sy };
}

function getLightScreenPos(): { lx: number; ly: number } {
  const { sx, sy } = project(lightX, lightY, 0, TILE_W, TILE_H);
  return { lx: ORIGIN_X + sx, ly: ORIGIN_Y + sy - lightElevation };
}

/** Clamp world coordinates so the object stays within the 10x10 grid */
function clampWorld(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0.5, Math.min(COLS - 0.5, x)),
    y: Math.max(0.5, Math.min(ROWS - 0.5, y)),
  };
}

// ─── Mouse events ────────────────────────────────────────────────────────────

function getCanvasPos(e: MouseEvent | TouchEvent): { cx: number; cy: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
  const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY;
  return {
    cx: (clientX - rect.left) * scaleX,
    cy: (clientY - rect.top) * scaleY,
  };
}

function onPointerDown(e: MouseEvent | TouchEvent): void {
  const { cx, cy } = getCanvasPos(e);

  // Check light first (only in manual mode)
  if (lightMode === 'manual') {
    const { lx, ly } = getLightScreenPos();
    const dl = Math.hypot(cx - lx, cy - ly);
    if (dl < HIT_RADIUS) {
      dragging = 'light';
      dragOffsetX = cx - lx;
      dragOffsetY = cy - ly;
      canvas.style.cursor = 'grabbing';
      return;
    }
  }

  // Check ball
  const { bx, by } = getBallScreenPos();
  const db = Math.hypot(cx - bx, cy - by);
  if (db < HIT_RADIUS) {
    dragging = 'ball';
    dragOffsetX = cx - bx;
    dragOffsetY = cy - by;
    canvas.style.cursor = 'grabbing';
  }
}

function onPointerMove(e: MouseEvent | TouchEvent): void {
  const { cx, cy } = getCanvasPos(e);

  if (dragging === 'ball') {
    // Convert screen position back to world XY (z=elevation factored out)
    const targetScreenX = cx - dragOffsetX - ORIGIN_X;
    // Ball is rendered at elevation above ground; account for that vertical shift
    const targetScreenY = cy - dragOffsetY - ORIGIN_Y + ball.ball.elevation;
    const world = unproject(targetScreenX, targetScreenY, TILE_W, TILE_H);
    const clamped = clampWorld(world.x, world.y);
    ball.ball.x = clamped.x;
    ball.ball.y = clamped.y;
    return;
  }

  if (dragging === 'light') {
    // Light halo is drawn at elevation above ground; invert that offset
    const targetScreenX = cx - dragOffsetX - ORIGIN_X;
    const targetScreenY = cy - dragOffsetY - ORIGIN_Y + lightElevation;
    const world = unproject(targetScreenX, targetScreenY, TILE_W, TILE_H);
    const clamped = clampWorld(world.x, world.y);
    manualLightX = clamped.x;
    manualLightY = clamped.y;
    return;
  }

  // Hover cursor update
  const { bx, by } = getBallScreenPos();
  const onBall = Math.hypot(cx - bx, cy - by) < HIT_RADIUS;

  let onLight = false;
  if (lightMode === 'manual') {
    const { lx, ly } = getLightScreenPos();
    onLight = Math.hypot(cx - lx, cy - ly) < HIT_RADIUS;
  }

  canvas.style.cursor = onBall || onLight ? 'grab' : 'default';
}

function onPointerUp(): void {
  dragging = null;
  canvas.style.cursor = 'default';
}

canvas.addEventListener('mousedown', onPointerDown);
canvas.addEventListener('mousemove', onPointerMove);
canvas.addEventListener('mouseup', onPointerUp);
canvas.addEventListener('mouseleave', onPointerUp);
canvas.addEventListener('touchstart', onPointerDown, { passive: true });
canvas.addEventListener('touchmove', onPointerMove, { passive: true });
canvas.addEventListener('touchend', onPointerUp);

// ─── UI — mode toggle ─────────────────────────────────────────────────────────

const modeBtn = document.getElementById('mode-btn') as HTMLButtonElement;

function updateModeBtn(): void {
  if (lightMode === 'orbit') {
    modeBtn.textContent = 'Light: Orbit';
    modeBtn.classList.remove('active');
  } else {
    modeBtn.textContent = 'Light: Manual';
    modeBtn.classList.add('active');
  }
}

modeBtn.addEventListener('click', () => {
  if (lightMode === 'orbit') {
    lightMode = 'manual';
    // Seed manual position from current orbit position
    manualLightX = lightX;
    manualLightY = lightY;
  } else {
    lightMode = 'orbit';
  }
  updateModeBtn();
});

updateModeBtn();

// ─── Render loop ─────────────────────────────────────────────────────────────

function render(ts: number): void {
  if (lightMode === 'orbit') {
    orbitTime = ts * 0.0006;
    lightX = 5 + Math.cos(orbitTime) * LIGHT_ORBIT_R;
    lightY = 5 + Math.sin(orbitTime) * LIGHT_ORBIT_R;
  } else {
    lightX = manualLightX;
    lightY = manualLightY;
  }

  const lightProj = project(lightX, lightY, 0, TILE_W, TILE_H);
  const lightScreenX = ORIGIN_X + lightProj.sx;
  const lightScreenY = ORIGIN_Y + lightProj.sy - lightElevation;

  // 1. Clear
  ctx.clearRect(0, 0, canvasW, canvasH);

  // 2. Ambient background glow
  const bgGlow = ctx.createRadialGradient(
    lightScreenX, lightScreenY, 0,
    lightScreenX, lightScreenY, LIGHT_RADIUS_SCREEN * 1.2,
  );
  bgGlow.addColorStop(0, 'rgba(255, 200, 80, 0.07)');
  bgGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bgGlow;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // 3. Floor
  floor.draw(ctx, lightX, lightY, LIGHT_RADIUS_SCREEN);

  // 4. Ball + shadow + light halo
  ball.draw(ctx, TILE_W, TILE_H, ORIGIN_X, ORIGIN_Y, {
    x: lightX,
    y: lightY,
    elevation: lightElevation,
  });

  // 5. Drag hint rings (shown only when not dragging)
  if (dragging === null) {
    drawHintRing(ctx, getBallScreenPos().bx, getBallScreenPos().by, 'rgba(255,255,255,0.12)');
    if (lightMode === 'manual') {
      const { lx, ly } = getLightScreenPos();
      drawHintRing(ctx, lx, ly, 'rgba(255, 220, 80, 0.25)');
    }
  }

  requestAnimationFrame(render);
}

function drawHintRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.arc(x, y, HIT_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

requestAnimationFrame(render);
