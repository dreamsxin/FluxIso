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
import { ParticleSystem } from './animation/ParticleSystem';
import { Minimap } from './core/Minimap';
import { MovementComponent } from './ecs/components/MovementComponent';
import { InputManager } from './core/InputManager';

// ─── Canvas & Engine ──────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement;

const COLS = 16;
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

const input = new InputManager(canvas);

// ─── Responsive Resize ────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  const parent = canvas.parentElement;
  if (parent) {
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w !== canvas.width || h !== canvas.height) {
      const oldW = canvas.width;
      const oldH = canvas.height;
      canvas.width = w;
      canvas.height = h;
      engine.originX = w / 2;
      engine.originY = ROWS * (TILE_H / 2) + 20;

      // Keep minimap relative to bottom-right if it was there
      minimapX += (w - oldW);
      minimapY += (h - oldH);
      minimapX = clamp(minimapX, 0, w - minimapSize);
      minimapY = clamp(minimapY, 0, h - minimapSize);
    }
  }
});

// ─── Audio ────────────────────────────────────────────────────────────────────

const audio = new AudioManager();
const HIT_SFX = '/sfx/hit.mp3';

// ─── Scene ────────────────────────────────────────────────────────────────────

const scene = await engine.loadScene('/scenes/level1.json');
engine.setScene(scene);

const character = scene.getById('player') as Character;
const omniLight = scene.omniLights[0] as OmniLight;

// ─── Particle helper ──────────────────────────────────────────────────────────

let _fxCounter = 0;
type FxPreset = 'spark' | 'crystal' | 'dust' | 'coin';

function spawnFx(x: number, y: number, preset: FxPreset, color?: string, count?: number): void {
  const id = `fx-${++_fxCounter}`;
  const ps = new ParticleSystem(id, x, y, 0);
  switch (preset) {
    case 'crystal': ps.addEmitter(ParticleSystem.presets.crystalShatter({ color })); break;
    case 'dust':    ps.addEmitter(ParticleSystem.presets.dustPuff({ color })); break;
    case 'coin':    ps.addEmitter(ParticleSystem.presets.coinSpill({ count })); break;
    default:        ps.addEmitter(ParticleSystem.presets.sparkBurst({ color, count })); break;
  }
  ps.onExhausted = () => scene.removeById(id);
  ps.burst();
  scene.addObject(ps);
}

// ─── Low Poly props with HealthComponent ─────────────────────────────────────

const crystal = scene.getById('crystal-1') as Crystal;
const boulder = scene.getById('boulder-1') as Boulder;
const chest   = scene.getById('chest-1') as Chest;

const crystalHp = crystal.getComponent<HealthComponent>('health');
if (crystalHp) {
  crystalHp.onChange = () => spawnFx(crystal.position.x, crystal.position.y, 'spark', '#8060e0', 8);
  crystalHp.onDeath = () => {
    spawnFx(crystal.position.x, crystal.position.y, 'crystal', '#8060e0', 20);
    scene.removeById('crystal-1');
  };
}

const boulderHp = boulder.getComponent<HealthComponent>('health');
if (boulderHp) {
  boulderHp.onChange = () => spawnFx(boulder.position.x, boulder.position.y, 'dust', undefined, 6);
  boulderHp.onDeath = () => {
    spawnFx(boulder.position.x, boulder.position.y, 'dust', undefined, 16);
    scene.removeById('boulder-1');
  };
}

const chestHp = chest.getComponent<HealthComponent>('health');
if (chestHp) {
  chestHp.onChange = (hp, max) => {
    if (hp < max) chest.open();
    spawnFx(chest.position.x, chest.position.y, 'spark', '#ffd040', 6);
  };
  chestHp.onDeath = () => {
    chest.open();
    spawnFx(chest.position.x, chest.position.y, 'coin', undefined, 18);
  };
}

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

// ─── MovementComponent on player (A* pathfinding) ────────────────────────────

const playerMv = new MovementComponent({
  speed:    3.5,
  radius:   0.35,
  collider: scene.collider ?? undefined,
});
playerMv.onAttach(character);

// ─── Minimap ──────────────────────────────────────────────────────────────────

const minimap = new Minimap(scene, { cols: COLS, rows: ROWS, style: { alpha: 0.7 } });
let minimapVisible = true;
let minimapSize    = 150;
let minimapX       = canvas.width - minimapSize - 14;
let minimapY       = canvas.height - minimapSize - 14;

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

const minimapToggle    = $<HTMLInputElement>('minimap-toggle');
const minimapSizeSlider = $<HTMLInputElement>('minimap-size');
const minimapAlphaSlider = $<HTMLInputElement>('minimap-alpha');

minimapToggle.addEventListener('change', () => {
  minimapVisible = minimapToggle.checked;
});
minimapSizeSlider.addEventListener('input', () => {
  minimapSize = Number(minimapSizeSlider.value);
});
minimapAlphaSlider.addEventListener('input', () => {
  minimap.alpha = Number(minimapAlphaSlider.value);
});

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
type DragTarget = 'ball' | 'light' | 'minimap' | null;
let dragging: DragTarget = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

function getBallScreenPos(): { bx: number; by: number } {
  const { sx, sy } = scene.camera.worldToScreen(
    character.position.x, character.position.y, character.position.z,
    TILE_W, TILE_H, engine.originX, engine.originY,
  );
  return { bx: sx, by: sy };
}

function getLightScreenPos(): { lx: number; ly: number } {
  const { sx, sy } = scene.camera.worldToScreen(
    omniLight.position.x, omniLight.position.y, omniLight.position.z,
    TILE_W, TILE_H, engine.originX, engine.originY,
  );
  return { lx: sx, ly: sy };
}

/** Screen position of any scene entity (at its ground level). */
function getEntityScreenPos(e: Entity): { ex: number; ey: number } {
  const { sx, sy } = scene.camera.worldToScreen(
    e.position.x, e.position.y, 0,
    TILE_W, TILE_H, engine.originX, engine.originY,
  );
  return { ex: sx, ey: sy };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function clampWorld(x: number, y: number): { x: number; y: number } {
  return { x: clamp(x, 0.5, COLS - 0.5), y: clamp(y, 0.5, ROWS - 0.5) };
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

function handlePointerDown(cx: number, cy: number): void {
  // Minimap hit
  if (minimapVisible && minimap.isHit(cx, cy, minimapX, minimapY, minimapSize, minimapSize)) {
    dragging = 'minimap';
    dragOffsetX = cx - minimapX;
    dragOffsetY = cy - minimapY;
    canvas.style.cursor = 'grabbing';
    return;
  }

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
    playerMv.stopMoving();   // cancel any in-progress path
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

      // Spawn damage number
      scene.spawnFloatingText({
        x: prop.position.x,
        y: prop.position.y,
        z: 32,
        text: '-15',
        color: '#ff4040',
        duration: 800,
        fontSize: 20
      });
    }
    return;
  }

  // Floor click → A* pathfinding (zoom + pan aware)
  const world   = scene.camera.screenToWorld(cx, cy, canvasW, canvasH, TILE_W, TILE_H, engine.originX, engine.originY);
  const clamped = clampWorld(world.x, world.y);
  const reached = playerMv.pathTo(clamped.x, clamped.y, character.position.z);
  if (!reached) {
    // Goal unreachable — flash the canvas edge briefly
    flashUnreachable();
  }
}

function handlePointerMove(cx: number, cy: number): void {
  if (dragging === 'minimap') {
    minimapX = cx - dragOffsetX;
    minimapY = cy - dragOffsetY;
    // Clamp to canvas bounds
    minimapX = clamp(minimapX, 0, canvas.width - minimapSize);
    minimapY = clamp(minimapY, 0, canvas.height - minimapSize);
    return;
  }

  if (dragging === 'ball') {
    const world = scene.camera.screenToWorld(
      cx - dragOffsetX, cy - dragOffsetY + character.position.z,
      canvasW, canvasH, TILE_W, TILE_H, engine.originX, engine.originY,
    );
    const w = clampWorld(world.x, world.y);
    character.position.x = w.x;
    character.position.y = w.y;
    return;
  }

  if (dragging === 'light') {
    const world = scene.camera.screenToWorld(
      cx - dragOffsetX, cy - dragOffsetY + omniLight.position.z,
      canvasW, canvasH, TILE_W, TILE_H, engine.originX, engine.originY,
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
  const onMinimap = minimapVisible && minimap.isHit(cx, cy, minimapX, minimapY, minimapSize, minimapSize);
  let onLight = false;
  if (lightMode === 'manual') {
    const { lx, ly } = getLightScreenPos();
    onLight = Math.hypot(cx - lx, cy - ly) < HIT_RADIUS;
  }
  canvas.style.cursor = onBall || onLight || onMinimap ? 'grab' : onProp ? 'pointer' : 'crosshair';
}

function handlePointerUp(): void {
  dragging = null;
  canvas.style.cursor = 'crosshair';
}

const KEY_STEP = 0.5;

// ─── Unreachable flash ────────────────────────────────────────────────────────

let _flashAlpha = 0;
function flashUnreachable(): void { _flashAlpha = 0.28; }

// ─── HUD ─────────────────────────────────────────────────────────────────────

const hudBall     = $<HTMLSpanElement>('hud-ball');
const hudPath     = $<HTMLSpanElement>('hud-path');
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
  const wps = playerMv.remainingWaypoints.length;
  hudPath.textContent  = playerMv.isMoving
    ? `path    waypoints:${wps} remaining`
    : `path    idle`;
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

    // Unreachable flash (red tint on canvas edge)
    if (_flashAlpha > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,60,60,${_flashAlpha.toFixed(2)})`;
      ctx.lineWidth   = 6;
      ctx.strokeRect(3, 3, canvasW - 6, canvasH - 6);
      ctx.restore();
      _flashAlpha = Math.max(0, _flashAlpha - 0.018);
    }

    // A* path visualisation — draw waypoint trail
    const wps = playerMv.remainingWaypoints;
    if (wps.length > 0) {
      ctx.save();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(85,144,204,0.55)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      // Start from character screen pos
      const { bx, by } = getBallScreenPos();
      ctx.moveTo(bx, by);
      for (const wp of wps) {
        const { sx, sy } = scene.camera.worldToScreen(
          wp.x, wp.y, character.position.z,
          TILE_W, TILE_H, engine.originX, engine.originY,
        );
        ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      // Draw small dots at each waypoint
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(85,144,204,0.7)';
      for (const wp of wps) {
        const { sx, sy } = scene.camera.worldToScreen(
          wp.x, wp.y, character.position.z,
          TILE_W, TILE_H, engine.originX, engine.originY,
        );
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (dragging === null) {
      const { bx, by } = getBallScreenPos();
      drawHintRing(ctx, bx, by, 'rgba(255,255,255,0.15)');
      if (lightMode === 'manual') {
        const { lx, ly } = getLightScreenPos();
        drawHintRing(ctx, lx, ly, 'rgba(255,220,80,0.35)');
      }
    }

    // Minimap — draggable
    if (minimapVisible) {
      minimap.draw(engine.ctx, minimapX, minimapY, minimapSize, minimapSize);
    }

    updateHud();
  },
  // preFrame — input + pathfinding update + background glow
  (ts) => {
    // Keyboard
    if (!(document.activeElement instanceof HTMLInputElement)) {
      if (input.wasPressed('m') || input.wasPressed('M')) {
        lightMode = lightMode === 'orbit' ? 'manual' : 'orbit';
        updateModeBtn();
      }
      if (input.isDown('ArrowUp'))    character.position.y = clamp(character.position.y - KEY_STEP * 0.1, 0.5, ROWS - 0.5);
      if (input.isDown('ArrowDown'))  character.position.y = clamp(character.position.y + KEY_STEP * 0.1, 0.5, ROWS - 0.5);
      if (input.isDown('ArrowLeft'))  character.position.x = clamp(character.position.x - KEY_STEP * 0.1, 0.5, COLS - 0.5);
      if (input.isDown('ArrowRight')) character.position.x = clamp(character.position.x + KEY_STEP * 0.1, 0.5, COLS - 0.5);
    }

    // Pointer
    const { x: cx, y: cy, pressed, released, down } = input.pointer;
    if (pressed) {
      handlePointerDown(cx, cy);
    } else if (released) {
      handlePointerUp();
    } else if (down || true) { // Always handle move for hover effects
      handlePointerMove(cx, cy);
    }

    playerMv.update(ts);

    if (lightMode === 'orbit') {
      orbitTime = ts * 0.001 * orbitSpeed;
      omniLight.position.x = LIGHT_CENTER_X + Math.cos(orbitTime) * LIGHT_ORBIT_R;
      omniLight.position.y = LIGHT_CENTER_Y + Math.sin(orbitTime) * LIGHT_ORBIT_R;
    }
    const { sx: lsx, sy: lsy } = scene.camera.worldToScreen(
      omniLight.position.x, omniLight.position.y, omniLight.position.z,
      TILE_W, TILE_H, engine.originX, engine.originY,
    );
    const ctx = engine.ctx;
    const r = (omniLight.radius ?? 320) * scene.camera.zoom * 1.2;
    const bgGlow = ctx.createRadialGradient(lsx, lsy, 0, lsx, lsy, r);
    bgGlow.addColorStop(0, hexToRgba(omniLight.color, 0.08));
    bgGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, canvasW, canvasH);

    input.flush();
  },
);
