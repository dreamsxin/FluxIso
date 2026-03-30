import { Engine } from './core/Engine';
import { OmniLight } from './lighting/OmniLight';
import { Character } from './elements/Character';
import { Crystal } from './elements/props/Crystal';
import { Boulder } from './elements/props/Boulder';
import { Chest } from './elements/props/Chest';
import { Cloud } from './elements/props/Cloud';
import { HealthComponent } from './ecs/components/HealthComponent';
import { Entity } from './ecs/Entity';
import { hexToRgba } from './math/color';
import { AudioManager } from './audio/AudioManager';

// ─── Canvas & Engine ──────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement;

const COLS = 10;
const ROWS = 10;
const TILE_W = 64;
const TILE_H = 32;

const canvasW = (COLS + ROWS) * (TILE_W / 2);
const canvasH = (COLS + ROWS) * (TILE_H / 2) + 120;
canvas.width = canvasW;
canvas.height = canvasH;

const engine = new Engine({ canvas });
engine.originX = canvasW / 2;
engine.originY = ROWS * (TILE_H / 2) + 20;

const ORIGIN_X = engine.originX;
const ORIGIN_Y = engine.originY;

// ─── Audio ────────────────────────────────────────────────────────────────────

const audio = new AudioManager();
const HIT_SFX = '/sfx/hit.mp3';

// ─── Scene ────────────────────────────────────────────────────────────────────

const scene = await engine.loadScene('/scenes/level1.json');
engine.setScene(scene);

const character = scene.getById('player') as Character;
const omniLight = scene.omniLights[0] as OmniLight;

// ─── Low Poly props with HealthComponent ─────────────────────────────────────

const crystal = new Crystal('crystal-1', 2, 3, '#8060e0');
crystal.addComponent(new HealthComponent({
  max: 60,
  onDeath: () => { scene.removeById('crystal-1'); },
}));

const boulder = new Boulder('boulder-1', 7, 2, '#7a7a8a');
boulder.addComponent(new HealthComponent({
  max: 100,
  onDeath: () => { scene.removeById('boulder-1'); },
}));

const chest = new Chest('chest-1', 7, 7);
chest.addComponent(new HealthComponent({
  max: 40,
  onChange: (hp, max) => { if (hp < max) chest.open(); },
  onDeath: () => { chest.open(); },
}));

scene.addObject(crystal);
scene.addObject(boulder);
scene.addObject(chest);

// ─── Clouds ───────────────────────────────────────────────────────────────────

const clouds: Cloud[] = [
  new Cloud({ id: 'cloud-1', x: 2,   y: 1,   altitude: 7,   speed: 0.35, angle: 0.25,  scale: 1.1, seed: 0.18 }),
  new Cloud({ id: 'cloud-2', x: 7,   y: 3,   altitude: 8.5, speed: 0.22, angle: -0.15, scale: 0.8, seed: 0.62 }),
  new Cloud({ id: 'cloud-3', x: 4.5, y: 8,   altitude: 6,   speed: 0.48, angle: 0.40,  scale: 1.3, seed: 0.85 }),
  new Cloud({ id: 'cloud-4', x: 9,   y: 6.5, altitude: 9,   speed: 0.18, angle: -0.30, scale: 0.7, seed: 0.41 }),
];

for (const cloud of clouds) {
  cloud.boundsX = COLS;
  cloud.boundsY = ROWS;
  scene.addObject(cloud);
}

// ─── Light orbit state ────────────────────────────────────────────────────────

const LIGHT_CENTER_X = 5;
const LIGHT_CENTER_Y = 5;
const LIGHT_ORBIT_R = 3.2;

type LightMode = 'orbit' | 'manual';
let lightMode: LightMode = 'orbit';
let orbitTime = 0;
let orbitSpeed = 0.6;

// ─── UI helpers ───────────────────────────────────────────────────────────────

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// ─── Panel: Ball controls ─────────────────────────────────────────────────────

const ballElevSlider = $<HTMLInputElement>('ball-elev');
const ballElevVal    = $<HTMLSpanElement>('ball-elev-val');

ballElevSlider.addEventListener('input', () => {
  character.position.z = Number(ballElevSlider.value);
  ballElevVal.textContent = ballElevSlider.value;
});

// ─── Panel: Light controls ────────────────────────────────────────────────────

const lightElevSlider      = $<HTMLInputElement>('light-elev');
const lightElevVal         = $<HTMLSpanElement>('light-elev-val');
const lightIntensitySlider = $<HTMLInputElement>('light-intensity');
const lightIntensityVal    = $<HTMLSpanElement>('light-intensity-val');
const lightSpeedSlider     = $<HTMLInputElement>('light-speed');
const lightSpeedVal        = $<HTMLSpanElement>('light-speed-val');
const lightColorPicker     = $<HTMLInputElement>('light-color');
const modeBtn              = $<HTMLButtonElement>('mode-btn');

lightElevSlider.addEventListener('input', () => {
  omniLight.position.z = Number(lightElevSlider.value);
  lightElevVal.textContent = lightElevSlider.value;
});
lightIntensitySlider.addEventListener('input', () => {
  omniLight.intensity = Number(lightIntensitySlider.value);
  lightIntensityVal.textContent = lightIntensitySlider.value;
});
lightSpeedSlider.addEventListener('input', () => {
  orbitSpeed = Number(lightSpeedSlider.value);
  lightSpeedVal.textContent = lightSpeedSlider.value;
});
lightColorPicker.addEventListener('input', () => {
  omniLight.color = lightColorPicker.value;
});

// ─── Mode toggle ──────────────────────────────────────────────────────────────

function updateModeBtn(): void {
  modeBtn.textContent = lightMode === 'orbit' ? 'Orbit' : 'Manual';
  modeBtn.classList.toggle('active', lightMode === 'manual');
  lightSpeedSlider.closest('.row')!.classList.toggle('disabled', lightMode === 'manual');
}
modeBtn.addEventListener('click', () => {
  lightMode = lightMode === 'orbit' ? 'manual' : 'orbit';
  updateModeBtn();
});
updateModeBtn();

// ─── Drag & click ─────────────────────────────────────────────────────────────

const HIT_RADIUS = 30;
type DragTarget = 'ball' | 'light' | null;
let dragging: DragTarget = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

function getBallScreenPos(): { bx: number; by: number } {
  const { sx, sy } = scene.camera.worldToScreen(
    character.position.x, character.position.y, character.position.z,
    TILE_W, TILE_H, ORIGIN_X, ORIGIN_Y,
  );
  return { bx: sx, by: sy };
}

function getLightScreenPos(): { lx: number; ly: number } {
  const { sx, sy } = scene.camera.worldToScreen(
    omniLight.position.x, omniLight.position.y, omniLight.position.z,
    TILE_W, TILE_H, ORIGIN_X, ORIGIN_Y,
  );
  return { lx: sx, ly: sy };
}

/** Screen position of any scene entity (at its ground level). */
function getEntityScreenPos(e: Entity): { ex: number; ey: number } {
  const { sx, sy } = scene.camera.worldToScreen(
    e.position.x, e.position.y, 0,
    TILE_W, TILE_H, ORIGIN_X, ORIGIN_Y,
  );
  return { ex: sx, ey: sy };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function clampWorld(x: number, y: number): { x: number; y: number } {
  return { x: clamp(x, 0.5, COLS - 0.5), y: clamp(y, 0.5, ROWS - 0.5) };
}
function getCanvasPos(e: MouseEvent | TouchEvent): { cx: number; cy: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const src = e instanceof MouseEvent ? e : e.touches[0];
  return {
    cx: (src.clientX - rect.left) * scaleX,
    cy: (src.clientY - rect.top) * scaleY,
  };
}

const PROP_HIT_R = 28;
const props: Entity[] = [crystal, boulder, chest];

function hitTestProps(cx: number, cy: number): Entity | null {
  for (const prop of props) {
    const { ex, ey } = getEntityScreenPos(prop);
    if (Math.hypot(cx - ex, cy - ey) < PROP_HIT_R) return prop;
  }
  return null;
}

function onPointerDown(e: MouseEvent | TouchEvent): void {
  const { cx, cy } = getCanvasPos(e);

  // Light hit (manual mode only)
  if (lightMode === 'manual') {
    const { lx, ly } = getLightScreenPos();
    if (Math.hypot(cx - lx, cy - ly) < HIT_RADIUS) {
      dragging = 'light';
      dragOffsetX = cx - lx;
      dragOffsetY = cy - ly;
      canvas.style.cursor = 'grabbing';
      return;
    }
  }

  // Ball drag
  const { bx, by } = getBallScreenPos();
  if (Math.hypot(cx - bx, cy - by) < HIT_RADIUS) {
    dragging = 'ball';
    dragOffsetX = cx - bx;
    dragOffsetY = cy - by;
    canvas.style.cursor = 'grabbing';
    return;
  }

  // Prop click → deal damage (15 per click)
  const prop = hitTestProps(cx, cy);
  if (prop) {
    audio.resume();
    const hp = prop.getComponent<HealthComponent>('health');
    if (hp && !hp.isDead) {
      const vol = AudioManager.spatialVolume({
        x: prop.position.x, y: prop.position.y,
        listenerX: character.position.x, listenerY: character.position.y,
        refDistance: 1, maxDistance: 14,
      });
      audio.playSfx(HIT_SFX, { volume: vol });
      hp.takeDamage(15);
    }
    return;
  }

  // Floor click → moveTo (zoom + pan aware)
  const world = scene.camera.screenToWorld(cx, cy, canvasW, canvasH, TILE_W, TILE_H, ORIGIN_X, ORIGIN_Y);
  const clamped = clampWorld(world.x, world.y);
  character.moveTo(clamped.x, clamped.y, character.position.z);
}

function onPointerMove(e: MouseEvent | TouchEvent): void {
  const { cx, cy } = getCanvasPos(e);

  if (dragging === 'ball') {
    const world = scene.camera.screenToWorld(
      cx - dragOffsetX, cy - dragOffsetY + character.position.z,
      canvasW, canvasH, TILE_W, TILE_H, ORIGIN_X, ORIGIN_Y,
    );
    const w = clampWorld(world.x, world.y);
    character.position.x = w.x;
    character.position.y = w.y;
    return;
  }

  if (dragging === 'light') {
    const world = scene.camera.screenToWorld(
      cx - dragOffsetX, cy - dragOffsetY + omniLight.position.z,
      canvasW, canvasH, TILE_W, TILE_H, ORIGIN_X, ORIGIN_Y,
    );
    const w = clampWorld(world.x, world.y);
    omniLight.position.x = w.x;
    omniLight.position.y = w.y;
    return;
  }

  // Hover cursor
  const { bx, by } = getBallScreenPos();
  const onBall = Math.hypot(cx - bx, cy - by) < HIT_RADIUS;
  const onProp = hitTestProps(cx, cy) !== null;
  let onLight = false;
  if (lightMode === 'manual') {
    const { lx, ly } = getLightScreenPos();
    onLight = Math.hypot(cx - lx, cy - ly) < HIT_RADIUS;
  }
  canvas.style.cursor = onBall || onLight ? 'grab' : onProp ? 'pointer' : 'crosshair';
}

function onPointerUp(): void {
  dragging = null;
  canvas.style.cursor = 'crosshair';
}

canvas.addEventListener('mousedown', onPointerDown);
canvas.addEventListener('mousemove', onPointerMove);
canvas.addEventListener('mouseup', onPointerUp);
canvas.addEventListener('mouseleave', onPointerUp);
canvas.addEventListener('touchstart', onPointerDown, { passive: true });
canvas.addEventListener('touchmove', onPointerMove, { passive: true });
canvas.addEventListener('touchend', onPointerUp);

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

const KEY_STEP = 0.5;
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  switch (e.key) {
    case 'm': case 'M':
      lightMode = lightMode === 'orbit' ? 'manual' : 'orbit';
      updateModeBtn();
      break;
    case 'ArrowUp':    e.preventDefault(); character.position.y = clamp(character.position.y - KEY_STEP, 0.5, ROWS - 0.5); break;
    case 'ArrowDown':  e.preventDefault(); character.position.y = clamp(character.position.y + KEY_STEP, 0.5, ROWS - 0.5); break;
    case 'ArrowLeft':  e.preventDefault(); character.position.x = clamp(character.position.x - KEY_STEP, 0.5, COLS - 0.5); break;
    case 'ArrowRight': e.preventDefault(); character.position.x = clamp(character.position.x + KEY_STEP, 0.5, COLS - 0.5); break;
  }
});

// ─── HUD ─────────────────────────────────────────────────────────────────────

const hudBall     = $<HTMLSpanElement>('hud-ball');
const hudLight    = $<HTMLSpanElement>('hud-light');
const hudCrystal  = $<HTMLSpanElement>('hud-crystal');
const hudBoulder  = $<HTMLSpanElement>('hud-boulder');
const hudChest    = $<HTMLSpanElement>('hud-chest');

function hpBar(hp: HealthComponent | undefined): string {
  if (!hp) return '';
  const filled = Math.round(hp.fraction * 8);
  return ` ${'█'.repeat(filled)}${'░'.repeat(8 - filled)} ${hp.hp}/${hp.maxHp}`;
}

function updateHud(): void {
  const p = character.position;
  const l = omniLight.position;
  hudBall.textContent  = `player  x:${p.x.toFixed(1)} y:${p.y.toFixed(1)} z:${p.z.toFixed(0)}`;
  hudLight.textContent = `light   x:${l.x.toFixed(1)} y:${l.y.toFixed(1)} z:${l.z.toFixed(0)}`;
  hudCrystal.textContent  = `crystal${hpBar(crystal.getComponent('health'))}`;
  hudBoulder.textContent  = `boulder${hpBar(boulder.getComponent('health'))}`;
  hudChest.textContent    = `chest  ${hpBar(chest.getComponent('health'))}`;
}

// ─── Render loop ──────────────────────────────────────────────────────────────

function drawHintRing(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, HIT_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

engine.start(
  // postFrame — overlays
  (_ts) => {
    const ctx = engine.ctx;
    if (dragging === null) {
      const { bx, by } = getBallScreenPos();
      drawHintRing(ctx, bx, by, 'rgba(255,255,255,0.15)');
      if (lightMode === 'manual') {
        const { lx, ly } = getLightScreenPos();
        drawHintRing(ctx, lx, ly, 'rgba(255,220,80,0.35)');
      }
    }
    updateHud();
  },
  // preFrame — background glow
  (ts) => {
    if (lightMode === 'orbit') {
      orbitTime = ts * 0.001 * orbitSpeed;
      omniLight.position.x = LIGHT_CENTER_X + Math.cos(orbitTime) * LIGHT_ORBIT_R;
      omniLight.position.y = LIGHT_CENTER_Y + Math.sin(orbitTime) * LIGHT_ORBIT_R;
    }
    const { sx: lsx, sy: lsy } = scene.camera.worldToScreen(
      omniLight.position.x, omniLight.position.y, omniLight.position.z,
      TILE_W, TILE_H, ORIGIN_X, ORIGIN_Y,
    );
    const ctx = engine.ctx;
    const r = (omniLight.radius ?? 320) * scene.camera.zoom * 1.2;
    const bgGlow = ctx.createRadialGradient(lsx, lsy, 0, lsx, lsy, r);
    bgGlow.addColorStop(0, hexToRgba(omniLight.color, 0.08));
    bgGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, canvasW, canvasH);
  },
);
