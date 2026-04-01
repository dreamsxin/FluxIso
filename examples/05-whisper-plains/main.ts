/**
 * 低语草原 — LuxIso 综合 Demo
 *
 * 展示：
 *   - 自定义 IsoObject（CubeHero、Portal、LowPolyTree、WaveLake 等）
 *   - InputMap（WASD + 方向键）
 *   - TriggerZoneComponent（传送阵检测）
 *   - SceneManager（草原 ↔ 湖水场景切换）
 *   - SceneTransition（闪白 + 淡入淡出）
 *   - HudLayer（场景名称、提示文字）
 *   - ParticleSystem（传送爆发、脚下涟漪）
 *   - Camera follow + 平滑过渡
 */
import { Engine, Scene, InputManager, InputMap, SceneManager, SceneTransition, HudLayer, ParticleSystem, TriggerZoneComponent } from '../../src/index';
import { CubeHero } from './CubeHero';
import { buildPlainsScene, PLAINS_COLS, PLAINS_ROWS, PORTAL_X, PORTAL_Y } from './PlainsScene';
import { buildLakeScene } from './LakeScene';

// ── Canvas & Engine ────────────────────────────────────────────────────────

const TILE_W = 64;
const TILE_H = 32;
const COLS   = PLAINS_COLS;
const ROWS   = PLAINS_ROWS;

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width  = Math.min(window.innerWidth, 960);
canvas.height = Math.min(window.innerHeight - 40, 640);

const engine = new Engine({ canvas });
engine.originX = canvas.width  / 2;
engine.originY = canvas.height / 2 - 40;

// ── Input ──────────────────────────────────────────────────────────────────

const input = new InputManager(canvas);
const map   = new InputMap(input);
map.define('up',    ['ArrowUp',    'w', 'KeyW']);
map.define('down',  ['ArrowDown',  's', 'KeyS']);
map.define('left',  ['ArrowLeft',  'a', 'KeyA']);
map.define('right', ['ArrowRight', 'd', 'KeyD']);

// ── HUD ────────────────────────────────────────────────────────────────────

const hud = new HudLayer();
const sceneLabel = hud.addLabel({
  id: 'scene-name', x: 16, y: 28,
  text: '低语草原', color: '#e8f4e8',
  fontSize: 16, shadow: true,
});
const hintLabel = hud.addLabel({
  id: 'hint', x: 16, y: 48,
  text: '走向传送阵…', color: 'rgba(200,230,200,0.7)',
  fontSize: 11, shadow: true,
});

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

// 相机跟随
plainsScene.camera.follow(hero);
plainsScene.camera.lerpFactor = 0.06;

// 传送阵触发区
const triggerZone = new TriggerZoneComponent({
  radius: portal.triggerRadius,
  targets: [hero],
  onEnter: () => { if (!teleporting) triggerTeleport(); },
});
portal.addComponent(triggerZone);

// ── 湖水场景 ───────────────────────────────────────────────────────────────

const LAKE_COLS = 13, LAKE_ROWS = 13;
const lakeScene = buildLakeScene(LAKE_COLS, LAKE_ROWS);

// 湖中心浮台（简单平台标记）
const lakeHero = new CubeHero('hero-lake', LAKE_COLS / 2, LAKE_ROWS / 2);
lakeScene.addObject(lakeHero);
lakeScene.camera.follow(lakeHero);
lakeScene.camera.lerpFactor = 0.05;

// ── SceneManager ───────────────────────────────────────────────────────────

const mgr = new SceneManager(engine);

mgr.register('plains', () => ({
  scene: plainsScene,
  onEnter() {
    sceneLabel.text = '低语草原';
    hintLabel.text  = '走向传送阵…';
    hintLabel.visible = true;
  },
}));

mgr.register('lake', () => ({
  scene: lakeScene,
  onEnter() {
    sceneLabel.text = '幻梦之湖';
    hintLabel.text  = '感受水之低语…';
    hintLabel.visible = true;
    // 3 秒后淡出提示
    setTimeout(() => { hintLabel.visible = false; }, 3000);
  },
}));

// ── 传送逻辑 ───────────────────────────────────────────────────────────────

let fxId = 0;

function spawnTeleportBurst(scene: Scene, x: number, y: number): void {
  const id = `teleport-fx-${++fxId}`;
  const ps = new ParticleSystem(id, x, y, 0);
  ps.addEmitter({
    maxParticles: 40,
    rate: 0,
    shape: 'point',
    lifetime: [0.4, 1.0],
    speed: [3, 8],
    angle: [0, Math.PI * 2],
    vz: [2, 8],
    gravity: -4,
    size: [3, 8],
    sizeFinal: 0,
    colorStart: '#c080ff',
    colorEnd: '#80c0ff',
    alphaStart: 1,
    alphaEnd: 0,
    blend: 'screen',
    rotSpeed: [1, 4],
    particleShape: 'circle',
  });
  ps.onExhausted = () => scene.removeById(id);
  ps.burst(40);
  scene.addObject(ps);
}

function spawnRipple(scene: Scene, x: number, y: number): void {
  const id = `ripple-${++fxId}`;
  const ps = new ParticleSystem(id, x, y, 1);
  ps.addEmitter({
    maxParticles: 8,
    rate: 0,
    shape: 'ring',
    lifetime: [0.3, 0.6],
    speed: [0.5, 1.5],
    angle: [0, Math.PI * 2],
    vz: [0, 0.5],
    gravity: 0,
    size: [2, 5],
    sizeFinal: 0,
    colorStart: '#80d0ff',
    colorEnd: '#40a0ff',
    alphaStart: 0.7,
    alphaEnd: 0,
    blend: 'screen',
    rotSpeed: [0, 0],
    particleShape: 'circle',
  });
  ps.onExhausted = () => scene.removeById(id);
  ps.burst(8);
  scene.addObject(ps);
}

async function triggerTeleport(): Promise<void> {
  teleporting = true;
  portal.activate();
  hero.triggerTeleportFlash();

  // 传送阵爆发粒子
  spawnTeleportBurst(plainsScene, PORTAL_X, PORTAL_Y);

  // 闪白过渡
  await transition.playIn('fade', { color: '#ffffff', duration: 350 });

  // 切换场景
  await mgr.replace('lake');
  currentSceneName = 'lake';

  // 淡入
  await transition.playOut('fade', { color: '#4080c0', duration: 600 });

  teleporting = false;
}

// ── 涟漪计时器 ────────────────────────────────────────────────────────────

let rippleTimer = 0;
const RIPPLE_INTERVAL = 0.4;

// ── 启动 ───────────────────────────────────────────────────────────────────

await mgr.push('plains');

// ── 渲染循环 ───────────────────────────────────────────────────────────────

engine.start(
  // postFrame
  (ts) => {
    hud.draw(engine.ctx, canvas.width, canvas.height);
    transition.draw(canvas.width, canvas.height, ts);
  },

  // preFrame
  (ts) => {
    const dt = 0.016; // 近似帧时间

    // 背景渐变天空
    drawSky(engine.ctx, canvas.width, canvas.height, currentSceneName);

    // 移动输入
    if (!teleporting) {
      const { x, y } = map.axis('right', 'left', 'down', 'up');
      const SPEED = 0.07;

      if (currentSceneName === 'plains') {
        const nx = Math.max(0.5, Math.min(PLAINS_COLS - 0.5, hero.position.x + x * SPEED));
        const ny = Math.max(0.5, Math.min(PLAINS_ROWS - 0.5, hero.position.y + y * SPEED));
        hero.velX = nx - hero.position.x;
        hero.velY = ny - hero.position.y;
        hero.position.x = nx;
        hero.position.y = ny;

        // 更新传送阵触发检测
        triggerZone.update(ts);

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
      }
    }

    input.flush();
  },
);

// ── 天空背景 ───────────────────────────────────────────────────────────────

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, scene: SceneName): void {
  const grad = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  if (scene === 'plains') {
    grad.addColorStop(0, '#87ceeb');
    grad.addColorStop(0.5, '#b0e0f8');
    grad.addColorStop(1, '#d4f0a0');
  } else {
    grad.addColorStop(0, '#0a1a3a');
    grad.addColorStop(0.5, '#0d2a5a');
    grad.addColorStop(1, '#1a4080');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}
