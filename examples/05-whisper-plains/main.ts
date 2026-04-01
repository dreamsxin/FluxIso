/**
 * 低语草原 — LuxIso 综合 Demo
 * 日夜交替 60 秒一周期
 */
import {
  Engine, Scene, InputManager, InputMap,
  SceneManager, SceneTransition, HudLayer,
  ParticleSystem, MovementComponent,
  OmniLight, DirectionalLight,
} from '../../src/index';
import { CubeHero } from './CubeHero';
import { buildPlainsScene, PLAINS_COLS, PLAINS_ROWS, PORTAL_X, PORTAL_Y } from './PlainsScene';
import { buildLakeScene } from './LakeScene';
import { DayNightCycle } from './DayNightCycle';
import { Portal } from './Portal';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width  = Math.min(window.innerWidth,  980);
canvas.height = Math.min(window.innerHeight - 40, 660);

const engine = new Engine({ canvas });
engine.originX = canvas.width / 2;
engine.originY = canvas.height / 2 - 20;

const input = new InputManager(canvas);
const map   = new InputMap(input);
map.define('up',    ['ArrowUp',    'w', 'KeyW']);
map.define('down',  ['ArrowDown',  's', 'KeyS']);
map.define('left',  ['ArrowLeft',  'a', 'KeyA']);
map.define('right', ['ArrowRight', 'd', 'KeyD']);

// ── HUD ───────────────────────────────────────────────────────────────────

const hud = new HudLayer();
hud.addPanel({ id: 'panel', x: 12, y: 12, w: 220, h: 60, radius: 10,
  bgColor: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.12)' });
const sceneLabel = hud.addLabel({ id: 'scene-name', x: 22, y: 33,
  text: '低语草原', color: '#e8f4e8', fontSize: 15, shadow: true });
const hintLabel = hud.addLabel({ id: 'hint', x: 22, y: 54,
  text: 'WASD 移动 · 走向传送阵', color: 'rgba(200,230,200,0.6)', fontSize: 10, shadow: true });
const portalHint = hud.addLabel({ id: 'portal-hint',
  x: canvas.width - 200, y: canvas.height - 20,
  text: '✦ 传送阵感应到你的存在…', color: 'rgba(180,140,255,0)',
  fontSize: 11, shadow: true, visible: false });
const timeLabel = hud.addLabel({ id: 'time',
  x: canvas.width - 80, y: 30,
  text: '☀ 白天', color: 'rgba(255,240,180,0.85)', fontSize: 11, shadow: true });

const transition = new SceneTransition(engine.ctx);

// ── 日夜系统 ──────────────────────────────────────────────────────────────

const dayNight = new DayNightCycle(60);
dayNight.setPhase(0.25); // 从正午开始

// ── 场景状态 ──────────────────────────────────────────────────────────────

type SceneName = 'plains' | 'lake';
let currentSceneName: SceneName = 'plains';
let teleporting = false;
let _portalTriggered = false;
let _portalHintAlpha = 0;

// ── 草原场景 ──────────────────────────────────────────────────────────────

const { scene: plainsScene, portal, collider: plainsCollider } = buildPlainsScene();

// 立即应用初始 scene ambient（避免第一帧用默认值）
{
  const sa = dayNight.getSceneAmbient();
  plainsScene.ambientColor     = sa.color;
  plainsScene.ambientIntensity = sa.intensity;
}

const hero = new CubeHero('hero', 3.5, 3.5);
plainsScene.addObject(hero);

const heroMv = new MovementComponent({ speed: 5.5, radius: 0.32, collider: plainsCollider });
heroMv.onAttach(hero);

plainsScene.camera.follow(hero);
plainsScene.camera.lerpFactor = 0.06;

const sunLight = plainsScene.dirLights[0] as DirectionalLight | undefined;

// ── 湖水场景 ──────────────────────────────────────────────────────────────

const LAKE_COLS = 13, LAKE_ROWS = 13;
const lakeScene = buildLakeScene(LAKE_COLS, LAKE_ROWS);

const lakeHero = new CubeHero('hero-lake', LAKE_COLS / 2, LAKE_ROWS / 2);
lakeScene.addObject(lakeHero);
lakeScene.camera.follow(lakeHero);
lakeScene.camera.lerpFactor = 0.05;

// ── SceneManager ──────────────────────────────────────────────────────────

const mgr = new SceneManager(engine);

mgr.register('plains', () => ({
  scene: plainsScene,
  onEnter() {
    sceneLabel.text    = '低语草原';
    hintLabel.text     = 'WASD 移动 · 走向传送阵';
    hintLabel.visible  = true;
    portalHint.visible = false;
    _portalTriggered   = false;
    _portalHintAlpha   = 0;
  },
}));

mgr.register('lake', () => ({
  scene: lakeScene,
  onEnter() {
    sceneLabel.text   = '幻梦之湖';
    hintLabel.text    = '感受水之低语…';
    hintLabel.visible = true;

    // 在角色降落位置生成临时光柱，角色从光柱顶端落下
    const beamDuration = 1.8;
    const arrivalBeam = new Portal('arrival-beam', lakeHero.position.x, lakeHero.position.y);
    lakeScene.addObject(arrivalBeam);
    arrivalBeam.activateBeam(beamDuration);
    lakeHero.triggerDescend();

    setTimeout(() => {
      lakeScene.removeById('arrival-beam');
      hintLabel.visible = false;
    }, (beamDuration + 0.8) * 1000);
  },
}));

// ── 粒子 ─────────────────────────────────────────────────────────────────

let fxId = 0;

function spawnTeleportBurst(scene: Scene, x: number, y: number): void {
  const id = `tfx-${++fxId}`;
  const ps = new ParticleSystem(id, x, y, 0);
  ps.addEmitter({ maxParticles: 70, rate: 0, shape: 'ring',
    lifetime: [0.5, 1.4], speed: [4, 12], angle: [0, Math.PI * 2],
    vz: [3, 12], gravity: -5, size: [4, 12], sizeFinal: 0,
    colorStart: '#c080ff', colorEnd: '#80c0ff', alphaStart: 1, alphaEnd: 0,
    blend: 'screen', rotSpeed: [1, 5], particleShape: 'circle' });
  ps.addEmitter({ maxParticles: 35, rate: 0, shape: 'point',
    lifetime: [0.3, 0.9], speed: [1, 5], angle: [0, Math.PI * 2],
    vz: [1, 6], gravity: -3, size: [2, 5], sizeFinal: 0,
    colorStart: '#ffffff', colorEnd: '#c0a0ff', alphaStart: 0.9, alphaEnd: 0,
    blend: 'screen', rotSpeed: [0, 2], particleShape: 'circle' });
  ps.onExhausted = () => scene.removeById(id);
  ps.burst(70);
  scene.addObject(ps);
}

function spawnRipple(scene: Scene, x: number, y: number): void {
  const id = `rpl-${++fxId}`;
  const ps = new ParticleSystem(id, x, y, 1);
  ps.addEmitter({ maxParticles: 12, rate: 0, shape: 'ring',
    lifetime: [0.4, 0.9], speed: [0.8, 2.2], angle: [0, Math.PI * 2],
    vz: [0, 0.4], gravity: 0, size: [3, 7], sizeFinal: 0,
    colorStart: '#a0e0ff', colorEnd: '#60b0ff', alphaStart: 0.6, alphaEnd: 0,
    blend: 'screen', rotSpeed: [0, 0], particleShape: 'circle' });
  ps.onExhausted = () => scene.removeById(id);
  ps.burst(12);
  scene.addObject(ps);
}

function spawnDustMote(scene: Scene): void {
  const id = `dust-${++fxId}`;
  const x = 2 + Math.random() * (PLAINS_COLS - 4);
  const y = 2 + Math.random() * (PLAINS_ROWS - 4);
  const ps = new ParticleSystem(id, x, y, 0);
  ps.addEmitter({ maxParticles: 5, rate: 0, shape: 'point',
    lifetime: [2.0, 3.5], speed: [0.08, 0.35], angle: [0, Math.PI * 2],
    vz: [0.8, 2.5], gravity: -0.4, size: [1, 3], sizeFinal: 0,
    colorStart: '#ffe8a0', colorEnd: '#ffd060', alphaStart: 0.45, alphaEnd: 0,
    blend: 'screen', rotSpeed: [0, 1], particleShape: 'circle' });
  ps.onExhausted = () => scene.removeById(id);
  ps.burst(5);
  scene.addObject(ps);
}

function spawnDreamMote(scene: Scene): void {
  const id = `dream-${++fxId}`;
  const x = 1 + Math.random() * (PLAINS_COLS - 2);
  const y = 1 + Math.random() * (PLAINS_ROWS - 2);
  const ps = new ParticleSystem(id, x, y, 0);
  ps.addEmitter({ maxParticles: 3, rate: 0, shape: 'point',
    lifetime: [3.5, 6.0], speed: [0.05, 0.18], angle: [0, Math.PI * 2],
    vz: [0.3, 1.2], gravity: -0.12, size: [2, 5], sizeFinal: 0,
    colorStart: '#c0a8ff', colorEnd: '#80c0ff', alphaStart: 0.55, alphaEnd: 0,
    blend: 'screen', rotSpeed: [0, 0.5], particleShape: 'circle' });
  ps.onExhausted = () => scene.removeById(id);
  ps.burst(3);
  scene.addObject(ps);
}

function spawnWaterMist(scene: Scene): void {
  const id = `mist-${++fxId}`;
  const x = 1 + Math.random() * (LAKE_COLS - 2);
  const y = 1 + Math.random() * (LAKE_ROWS - 2);
  const ps = new ParticleSystem(id, x, y, 2);
  ps.addEmitter({ maxParticles: 4, rate: 0, shape: 'point',
    lifetime: [2.5, 5.0], speed: [0.04, 0.18], angle: [0, Math.PI * 2],
    vz: [0.4, 1.2], gravity: -0.15, size: [5, 12], sizeFinal: 0,
    colorStart: '#80c0ff', colorEnd: '#4080c0', alphaStart: 0.2, alphaEnd: 0,
    blend: 'screen', rotSpeed: [0, 0.3], particleShape: 'circle' });
  ps.onExhausted = () => scene.removeById(id);
  ps.burst(4);
  scene.addObject(ps);
}

// ── 传送 ─────────────────────────────────────────────────────────────────

async function triggerTeleport(): Promise<void> {
  teleporting = true;
  _portalTriggered = true;
  portal.activate();
  portal.activateBeam(1.4);
  spawnTeleportBurst(plainsScene, PORTAL_X, PORTAL_Y);

  // 角色飞升（与光柱同步，1.2s）
  const ascendPromise = hero.triggerAscend();
  hero.triggerTeleportFlash();

  // 等待飞升完成后再 fade
  await ascendPromise;
  await transition.playIn('fade', { color: '#ffffff', duration: 280 });
  await mgr.replace('lake');
  currentSceneName = 'lake';
  await transition.playOut('fade', { color: '#0a1a3a', duration: 650 });
  teleporting = false;
}

// ── 计时器 ────────────────────────────────────────────────────────────────

let rippleTimer = 0, dustTimer = 0, mistTimer = 0, dreamTimer = 0;
const RIPPLE_INTERVAL = 0.32, DUST_INTERVAL = 0.7, MIST_INTERVAL = 1.0, DREAM_INTERVAL = 0.5;

// ── 启动 ─────────────────────────────────────────────────────────────────

await mgr.push('plains');

let _lastTs = 0;

engine.start(
  (ts) => {
    hud.draw(engine.ctx, canvas.width, canvas.height);
    transition.draw(canvas.width, canvas.height, ts);
  },
  (ts) => {
    const dt = _lastTs === 0 ? 0.016 : Math.min((ts - _lastTs) / 1000, 0.1);
    _lastTs = ts;

    // ── 日夜推进 ──────────────────────────────────────────────────────────
    if (currentSceneName === 'plains') {
      dayNight.update(dt);

      const dp = dayNight.getDirLightParams();
      if (sunLight) {
        sunLight.color     = dp.color;
        sunLight.intensity = dp.intensity;
        sunLight.angle     = (dp.angle * Math.PI) / 180;
        sunLight.elevation = (dp.elevation * Math.PI) / 180;
      }
      const sa = dayNight.getSceneAmbient();
      plainsScene.ambientColor     = sa.color;
      plainsScene.ambientIntensity = sa.intensity;

      const n = dayNight.nightness;
      const isDusk  = n > 0.3 && n < 0.7;
      const isNight = n >= 0.7;
      timeLabel.text  = isDusk ? '🌅 黄昏' : isNight ? '🌙 夜晚' : '☀ 白天';
      timeLabel.color = isDusk
        ? 'rgba(255,160,80,0.9)'
        : isNight ? 'rgba(160,200,255,0.85)' : 'rgba(255,240,180,0.85)';
    }

    // ── 天空 ──────────────────────────────────────────────────────────────
    drawSky(engine.ctx, canvas.width, canvas.height, currentSceneName, ts);

    if (teleporting) { input.flush(); return; }

    const { x, y } = map.axis('right', 'left', 'down', 'up');
    const SPEED = 0.08;

    if (currentSceneName === 'plains') {
      if (x !== 0 || y !== 0) {
        const len = Math.hypot(x, y) || 1;
        const resolved = plainsCollider.resolveMove(
          hero.position.x, hero.position.y,
          x / len * SPEED, y / len * SPEED, 0.32,
        );
        hero.velX = resolved.dx;
        hero.velY = resolved.dy;
        hero.position.x += resolved.dx;
        hero.position.y += resolved.dy;
      } else {
        hero.velX = 0; hero.velY = 0;
      }

      const dist = Math.hypot(hero.position.x - PORTAL_X, hero.position.y - PORTAL_Y);
      hero.portalProximity = Math.max(0, 1 - dist / 4.0);

      if (hero.portalProximity > 0.3 && !_portalTriggered) {
        _portalHintAlpha = Math.min(1, _portalHintAlpha + dt * 2);
        portalHint.visible = true;
        portalHint.color = `rgba(180,140,255,${(_portalHintAlpha * 0.85).toFixed(2)})`;
      } else {
        _portalHintAlpha = Math.max(0, _portalHintAlpha - dt * 3);
        portalHint.visible = _portalHintAlpha > 0.01;
        if (portalHint.visible)
          portalHint.color = `rgba(180,140,255,${(_portalHintAlpha * 0.85).toFixed(2)})`;
      }

      if (!_portalTriggered && dist < portal.triggerRadius) triggerTeleport();

      dustTimer += dt;
      if (dustTimer >= DUST_INTERVAL) { dustTimer = 0; spawnDustMote(plainsScene); }

      // 白天梦幻光尘（nightness < 0.5 时才生成）
      if (dayNight.nightness < 0.5) {
        dreamTimer += dt;
        if (dreamTimer >= DREAM_INTERVAL) { dreamTimer = 0; spawnDreamMote(plainsScene); }
      }

    } else if (currentSceneName === 'lake') {
      if (x !== 0 || y !== 0) {
        const len = Math.hypot(x, y) || 1;
        const nx = Math.max(0.5, Math.min(LAKE_COLS - 0.5, lakeHero.position.x + x / len * SPEED));
        const ny = Math.max(0.5, Math.min(LAKE_ROWS - 0.5, lakeHero.position.y + y / len * SPEED));
        lakeHero.velX = nx - lakeHero.position.x;
        lakeHero.velY = ny - lakeHero.position.y;
        lakeHero.position.x = nx;
        lakeHero.position.y = ny;
      } else {
        lakeHero.velX = 0; lakeHero.velY = 0;
      }

      const moving = Math.hypot(lakeHero.velX, lakeHero.velY) > 0.002;
      if (moving) {
        rippleTimer += dt;
        if (rippleTimer >= RIPPLE_INTERVAL) { rippleTimer = 0; spawnRipple(lakeScene, lakeHero.position.x, lakeHero.position.y); }
      } else { rippleTimer = 0; }

      mistTimer += dt;
      if (mistTimer >= MIST_INTERVAL) { mistTimer = 0; spawnWaterMist(lakeScene); }
    }

    input.flush();
  },
);

// ── 天空绘制 ─────────────────────────────────────────────────────────────

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, scene: SceneName, ts: number): void {
  if (scene === 'plains') {
    const c = dayNight.getColors();

    // 天空渐变
    const grad = ctx.createLinearGradient(0, 0, 0, h * 0.72);
    grad.addColorStop(0,   c.skyTop);
    grad.addColorStop(0.6, c.skyBottom);
    grad.addColorStop(1,   c.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 太阳 / 月亮本体
    const cx = c.celestialX * w;
    const cy = c.celestialY * h;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, c.celestialRadius, 0, Math.PI * 2);
    ctx.fillStyle = c.celestialColor;
    ctx.shadowColor = c.celestialGlowColor;
    ctx.shadowBlur  = c.celestialRadius * 2.5;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // 天体光晕
    const glowR = c.celestialRadius * 5.5;
    const glow = ctx.createRadialGradient(cx, cy, c.celestialRadius * 0.5, cx, cy, glowR);
    glow.addColorStop(0, hexToRgba(c.celestialGlowColor, c.celestialGlowAlpha));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // 白天梦幻：彩虹光晕（太阳周围）
    const dayness = 1 - c.nightOverlay;
    if (dayness > 0.3) {
      const rainbowR = c.celestialRadius * 14;
      const rainbow = ctx.createRadialGradient(cx, cy, c.celestialRadius * 2, cx, cy, rainbowR);
      rainbow.addColorStop(0,    `rgba(255,220,180,${(dayness * 0.12).toFixed(3)})`);
      rainbow.addColorStop(0.25, `rgba(255,180,220,${(dayness * 0.08).toFixed(3)})`);
      rainbow.addColorStop(0.5,  `rgba(180,200,255,${(dayness * 0.10).toFixed(3)})`);
      rainbow.addColorStop(0.75, `rgba(200,255,220,${(dayness * 0.06).toFixed(3)})`);
      rainbow.addColorStop(1,    'rgba(0,0,0,0)');
      ctx.fillStyle = rainbow;
      ctx.fillRect(0, 0, w, h);
    }

    // 梦幻：底部地平线光晕（淡紫粉）
    if (dayness > 0.2) {
      const horizY = h * 0.68;
      const horizGlow = ctx.createLinearGradient(0, horizY - 40, 0, horizY + 60);
      horizGlow.addColorStop(0, 'rgba(0,0,0,0)');
      horizGlow.addColorStop(0.4, `rgba(220,180,255,${(dayness * 0.18).toFixed(3)})`);
      horizGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = horizGlow;
      ctx.fillRect(0, horizY - 40, w, 100);
    }

    // 夜晚遮罩
    if (c.nightOverlay > 0.02) {
      ctx.fillStyle = `rgba(4,9,26,${(c.nightOverlay * 0.82).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }

    // 白天梦幻光点（漂浮的小精灵光）
    const dayness2 = 1 - c.nightOverlay;
    if (dayness2 > 0.15) {
      const t2 = ts * 0.001;
      for (let i = 0; i < 18; i++) {
        const fx = (Math.sin(i * 73.1 + t2 * (0.12 + i * 0.008)) * 0.5 + 0.5) * w;
        const fy = (Math.sin(i * 137.5 + t2 * (0.09 + i * 0.006)) * 0.5 + 0.5) * h * 0.75;
        const pulse = 0.4 + Math.sin(t2 * (1.2 + i * 0.3) + i * 2.1) * 0.35;
        const alpha = Math.max(0, pulse) * dayness2 * 0.55;
        const colors = ['255,200,255', '200,220,255', '220,255,220', '255,240,180', '200,180,255'];
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(fx, fy, 1.2 + (i % 4) * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${colors[i % colors.length]})`;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 星星
    if (c.showStars) {
      const t = ts * 0.001;
      for (let i = 0; i < 60; i++) {
        const sx = (Math.sin(i * 127.1) * 0.5 + 0.5) * w;
        const sy = (Math.sin(i * 311.7) * 0.5 + 0.5) * h * 0.52;
        const twinkle = 0.3 + Math.sin(t * (0.7 + i * 0.22) + i * 1.3) * 0.45;
        ctx.globalAlpha = Math.max(0, twinkle) * c.starAlpha;
        ctx.fillStyle = i % 9 === 0 ? '#ffd0a0' : i % 13 === 0 ? '#c0e0ff' : '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, sy, 0.5 + (i % 5) * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

  } else {
    // 湖水：固定深夜
    const grad = ctx.createLinearGradient(0, 0, 0, h * 0.75);
    grad.addColorStop(0,    '#04091a');
    grad.addColorStop(0.25, '#080f28');
    grad.addColorStop(0.6,  '#0c1e48');
    grad.addColorStop(1,    '#102060');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const moonX = w * 0.76, moonY = h * 0.09;
    ctx.save();
    ctx.beginPath();
    ctx.arc(moonX, moonY, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#e8f0ff';
    ctx.shadowColor = '#c0d8ff';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    const mg = ctx.createRadialGradient(moonX, moonY, 10, moonX, moonY, 80);
    mg.addColorStop(0,   'rgba(200,220,255,0.25)');
    mg.addColorStop(0.5, 'rgba(160,190,255,0.08)');
    mg.addColorStop(1,   'rgba(100,140,255,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, w, h);

    const t = ts * 0.001;
    for (let i = 0; i < 60; i++) {
      const sx = (Math.sin(i * 127.1) * 0.5 + 0.5) * w;
      const sy = (Math.sin(i * 311.7) * 0.5 + 0.5) * h * 0.52;
      const twinkle = 0.3 + Math.sin(t * (0.7 + i * 0.22) + i * 1.3) * 0.45;
      ctx.globalAlpha = Math.max(0, twinkle);
      ctx.fillStyle = i % 9 === 0 ? '#ffd0a0' : '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, 0.5 + (i % 5) * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ── 工具 ─────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}
