/**
 * 低语草原 — LuxIso 综合 Demo（精细版）
 */
import {
  Engine, Scene, InputManager, InputMap,
  SceneManager, SceneTransition, HudLayer,
  ParticleSystem, TriggerZoneComponent,
} from '../../src/index';
import { CubeHero } from './CubeHero';
import { buildPlainsScene, PLAINS_COLS, PLAINS_ROWS, PORTAL_X, PORTAL_Y } from './PlainsScene';
import { buildLakeScene } from './LakeScene';

// ── Canvas & Engine ────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width  = Math.min(window.innerWidth,  980);
canvas.height = Math.min(window.innerHeight - 40, 660);

const engine = new Engine({ canvas });
engine.originX = canvas.width  / 2;
engine.originY = canvas.height / 2 - 30;

// ── Input ──────────────────────────────────────────────────────────────────

const input = new InputManager(canvas);
const map   = new InputMap(input);
map.define('up',    ['ArrowUp',    'w', 'KeyW']);
map.define('down',  ['ArrowDown',  's', 'KeyS']);
map.define('left',  ['ArrowLeft',  'a', 'KeyA']);
map.define('right', ['ArrowRight', 'd', 'KeyD']);

// ── HUD ────────────────────────────────────────────────────────────────────

const hud = new HudLayer();
hud.addPanel({ id: 'panel', x: 10, y: 10, w: 200, h: 52, radius: 8, bgColor: 'rgba(0,0,0,0.35)', borderColor: 'rgba(255,255,255,0.1)' });
const sceneLabel = hud.addLabel({ id: 'scene-name', x: 20, y: 30, text: '低语草原', color: '#e8f4e8', fontSize: 15, shadow: true });
const hintLabel  = hud.addLabel({ id: 'hint', x: 20, y: 50, text: 'WASD 移动 · 走向传送阵', color: 'rgba(200,230,200,0.65)', fontSize: 10, shadow: true });

// ── Transition ─────────────────────────────────────────────────────────────

const transition = new SceneTransition(engine.ctx);

// ── 场景状态 ───────────────────────────────────────────────────────────────

type SceneName = 'plains' | 'lake';
let currentSceneName: SceneName = 'plains';
let teleporting = false;

// ── 草原场景 ───────────────────────────────────────────────────────────────

const { scene: plainsScene, portal } = buildPlainsScene();

const hero = new CubeHero('hero', 3, 3);
plainsScene.addObject(hero);

plainsScene.camera.follow(hero);
plainsScene.camera.lerpFactor = 0.055;

const triggerZone = new TriggerZoneComponent({
  radius: portal.triggerRadius,
  targets: [hero],
  onEnter: () => { if (!teleporting) triggerTeleport(); },
});
portal.addComponent(triggerZone);

// ── 湖水场景 ───────────────────────────────────────────────────────────────

const LAKE_COLS = 13, LAKE_ROWS = 13;
const lakeScene = buildLakeScene(LAKE_COLS, LAKE_ROWS);

const lakeHero = new CubeHero('hero-lake', LAKE_COLS / 2, LAKE_ROWS / 2);
lakeScene.addObject(lakeHero);
lakeScene.camera.follow(lakeHero);
lakeScene.camera.lerpFactor = 0.045;

// ── SceneManager ───────────────────────────────────────────────────────────

const mgr = new SceneManager(engine);

mgr.register('plains', () => ({
  scene: plainsScene,
  onEnter() {
    sceneLabel.text = '低语草原';
    hintLabel.text  = 'WASD 移动 · 走向传送阵';
    hintLabel.visible = true;
  },
}));

mgr.register('lake', () => ({
  scene: lakeScene,
  onEnter() {
    sceneLabel.text = '幻梦之湖';
    hintLabel.text  = '感受水之低语…';
    hintLabel.visible = true;
    setTimeout(() => { hintLabel.visible = false; }, 4000);
  },
}));

// ── 粒子工具 ───────────────────────────────────────────────────────────────

let fxId = 0;

function spawnTeleportBurst(scene: Scene, x: number, y: number): void {
  const id = `tfx-${++fxId}`;
  const ps = new ParticleSystem(id, x, y, 0);
  // 外圈爆发
  ps.addEmitter({
    maxParticles: 50, rate: 0, shape: 'ring',
    lifetime: [0.5, 1.2], speed: [4, 10],
    angle: [0, Math.PI * 2], vz: [3, 10], gravity: -5,
    size: [4, 10], sizeFinal: 0,
    colorStart: '#c080ff', colorEnd: '#80c0ff',
    alphaStart: 1, alphaEnd: 0,
    blend: 'screen', rotSpeed: [1, 5], particleShape: 'circle',
  });
  // 内圈细粒子
  ps.addEmitter({
    maxParticles: 30, rate: 0, shape: 'point',
    lifetime: [0.3, 0.8], speed: [1, 4],
    angle: [0, Math.PI * 2], vz: [1, 5], gravity: -3,
    size: [2, 5], sizeFinal: 0,
    colorStart: '#ffffff', colorEnd: '#c0a0ff',
    alphaStart: 0.9, alphaEnd: 0,
    blend: 'screen', rotSpeed: [0, 2], particleShape: 'circle',
  });
  ps.onExhausted = () => scene.removeById(id);
  ps.burst(50);
  scene.addObject(ps);
}

function spawnRipple(scene: Scene, x: number, y: number): void {
  const id = `rpl-${++fxId}`;
  const ps = new ParticleSystem(id, x, y, 1);
  ps.addEmitter({
    maxParticles: 10, rate: 0, shape: 'ring',
    lifetime: [0.4, 0.8], speed: [0.8, 2.0],
    angle: [0, Math.PI * 2], vz: [0, 0.3], gravity: 0,
    size: [3, 6], sizeFinal: 0,
    colorStart: '#a0e0ff', colorEnd: '#60b0ff',
    alphaStart: 0.65, alphaEnd: 0,
    blend: 'screen', rotSpeed: [0, 0], particleShape: 'circle',
  });
  ps.onExhausted = () => scene.removeById(id);
  ps.burst(10);
  scene.addObject(ps);
}

// 草原光尘（持续飘散）
function spawnDustMote(scene: Scene): void {
  const id = `dust-${++fxId}`;
  const x = 2 + Math.random() * (PLAINS_COLS - 4);
  const y = 2 + Math.random() * (PLAINS_ROWS - 4);
  const ps = new ParticleSystem(id, x, y, 0);
  ps.addEmitter({
    maxParticles: 6, rate: 0, shape: 'point',
    lifetime: [1.5, 3.0], speed: [0.1, 0.4],
    angle: [0, Math.PI * 2], vz: [1, 3], gravity: -0.5,
    size: [1, 3], sizeFinal: 0,
    colorStart: '#ffe8a0', colorEnd: '#ffd060',
    alphaStart: 0.5, alphaEnd: 0,
    blend: 'screen', rotSpeed: [0, 1], particleShape: 'circle',
  });
  ps.onExhausted = () => scene.removeById(id);
  ps.burst(6);
  scene.addObject(ps);
}

// 湖面水雾粒子
function spawnWaterMist(scene: Scene): void {
  const id = `mist-${++fxId}`;
  const x = 1 + Math.random() * (LAKE_COLS - 2);
  const y = 1 + Math.random() * (LAKE_ROWS - 2);
  const ps = new ParticleSystem(id, x, y, 2);
  ps.addEmitter({
    maxParticles: 4, rate: 0, shape: 'point',
    lifetime: [2.0, 4.0], speed: [0.05, 0.2],
    angle: [0, Math.PI * 2], vz: [0.5, 1.5], gravity: -0.2,
    size: [4, 10], sizeFinal: 0,
    colorStart: '#80c0ff', colorEnd: '#4080c0',
    alphaStart: 0.25, alphaEnd: 0,
    blend: 'screen', rotSpeed: [0, 0.5], particleShape: 'circle',
  });
  ps.onExhausted = () => scene.removeById(id);
  ps.burst(4);
  scene.addObject(ps);
}

// ── 传送逻辑 ───────────────────────────────────────────────────────────────

async function triggerTeleport(): Promise<void> {
  teleporting = true;
  portal.activate();
  hero.triggerTeleportFlash();
  spawnTeleportBurst(plainsScene, PORTAL_X, PORTAL_Y);

  await transition.playIn('fade', { color: '#ffffff', duration: 320 });
  await mgr.replace('lake');
  currentSceneName = 'lake';
  await transition.playOut('fade', { color: '#0a1a3a', duration: 700 });

  teleporting = false;
}

// ── 计时器 ────────────────────────────────────────────────────────────────

let rippleTimer = 0;
let dustTimer   = 0;
let mistTimer   = 0;
const RIPPLE_INTERVAL = 0.35;
const DUST_INTERVAL   = 0.8;
const MIST_INTERVAL   = 1.2;

// ── 启动 ───────────────────────────────────────────────────────────────────

await mgr.push('plains');

// ── 渲染循环 ───────────────────────────────────────────────────────────────

let _lastFrameTs = 0;

engine.start(
  // postFrame
  (ts) => {
    hud.draw(engine.ctx, canvas.width, canvas.height);
    transition.draw(canvas.width, canvas.height, ts);
  },

  // preFrame
  (ts) => {
    const dt = _lastFrameTs === 0 ? 0.016 : Math.min((ts - _lastFrameTs) / 1000, 0.1);
    _lastFrameTs = ts;

    // 天空
    drawSky(engine.ctx, canvas.width, canvas.height, currentSceneName, ts);

    if (!teleporting) {
      const { x, y } = map.axis('right', 'left', 'down', 'up');
      const SPEED = 0.075;

      if (currentSceneName === 'plains') {
        const nx = Math.max(0.5, Math.min(PLAINS_COLS - 0.5, hero.position.x + x * SPEED));
        const ny = Math.max(0.5, Math.min(PLAINS_ROWS - 0.5, hero.position.y + y * SPEED));
        hero.velX = nx - hero.position.x;
        hero.velY = ny - hero.position.y;
        hero.position.x = nx;
        hero.position.y = ny;
        triggerZone.update(ts);

        // 草原光尘
        dustTimer += dt;
        if (dustTimer >= DUST_INTERVAL) {
          dustTimer = 0;
          spawnDustMote(plainsScene);
        }

      } else if (currentSceneName === 'lake') {
        const nx = Math.max(0.5, Math.min(LAKE_COLS - 0.5, lakeHero.position.x + x * SPEED));
        const ny = Math.max(0.5, Math.min(LAKE_ROWS - 0.5, lakeHero.position.y + y * SPEED));
        lakeHero.velX = nx - lakeHero.position.x;
        lakeHero.velY = ny - lakeHero.position.y;
        lakeHero.position.x = nx;
        lakeHero.position.y = ny;

        // 脚下涟漪
        const moving = Math.hypot(lakeHero.velX, lakeHero.velY) > 0.002;
        if (moving) {
          rippleTimer += dt;
          if (rippleTimer >= RIPPLE_INTERVAL) {
            rippleTimer = 0;
            spawnRipple(lakeScene, lakeHero.position.x, lakeHero.position.y);
          }
        } else {
          rippleTimer = 0;
        }

        // 水雾
        mistTimer += dt;
        if (mistTimer >= MIST_INTERVAL) {
          mistTimer = 0;
          spawnWaterMist(lakeScene);
        }
      }
    }

    input.flush();
  },
);

// ── 天空背景 ───────────────────────────────────────────────────────────────

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, scene: SceneName, ts: number): void {
  if (scene === 'plains') {
    // 草原天空：蓝天渐变
    const grad = ctx.createLinearGradient(0, 0, 0, h * 0.65);
    grad.addColorStop(0,   '#5ba8d8');
    grad.addColorStop(0.4, '#8ecef0');
    grad.addColorStop(0.75,'#c8e8f8');
    grad.addColorStop(1,   '#d8f0c0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 太阳光晕
    const sunX = w * 0.72, sunY = h * 0.12;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 80);
    sunGrad.addColorStop(0,   'rgba(255,250,200,0.55)');
    sunGrad.addColorStop(0.4, 'rgba(255,220,120,0.2)');
    sunGrad.addColorStop(1,   'rgba(255,200,80,0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, w, h);

  } else {
    // 湖水天空：深夜蓝紫
    const grad = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    grad.addColorStop(0,   '#060e22');
    grad.addColorStop(0.3, '#0a1a3a');
    grad.addColorStop(0.65,'#0d2550');
    grad.addColorStop(1,   '#102060');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 月亮光晕
    const moonX = w * 0.75, moonY = h * 0.1;
    const moonGrad = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 60);
    moonGrad.addColorStop(0,   'rgba(220,235,255,0.5)');
    moonGrad.addColorStop(0.3, 'rgba(180,210,255,0.2)');
    moonGrad.addColorStop(1,   'rgba(100,150,255,0)');
    ctx.fillStyle = moonGrad;
    ctx.fillRect(0, 0, w, h);

    // 星星
    const t = ts * 0.001;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 40; i++) {
      // 用固定 seed 生成稳定位置
      const sx = ((Math.sin(i * 127.1) * 0.5 + 0.5)) * w;
      const sy = ((Math.sin(i * 311.7) * 0.5 + 0.5)) * h * 0.55;
      const twinkle = 0.4 + Math.sin(t * (1 + i * 0.3)) * 0.35;
      ctx.globalAlpha = twinkle;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.8 + (i % 3) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
