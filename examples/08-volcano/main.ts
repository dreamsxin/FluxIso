/**
 * 08 — Volcano Lava Zone
 * 火山熔岩地带：岩层地面、火山锥、熔岩河、烟雾、裂缝喷发、灼烧伤害、跳跃垫脚石
 */
import {
  Engine, Scene, OmniLight, DirectionalLight,
  InputManager, IsoObject, DrawContext,
} from '../../src/index';
import { AABB } from '../../src/math/depthSort';
import { project } from '../../src/math/IsoProjection';
import { RockLayer, VolcanoCone } from './VolcanoTerrain';
import { LavaRiver } from './LavaRiver';
import { SmokePlumeSystem, LavaCrack } from './VolcanoFX';

// ── Canvas & Engine ───────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width  = Math.min(window.innerWidth - 24, 900);
canvas.height = Math.min(window.innerHeight - 120, 580);

const engine = new Engine({ canvas });
engine.originX = canvas.width / 2;
engine.originY = canvas.height * 0.38;

// ── Scene ─────────────────────────────────────────────────────────────────────

const COLS = 14, ROWS = 14;
const scene = new Scene({ tileW: 64, tileH: 32, cols: COLS, rows: ROWS });
scene.dynamicLighting  = true;
scene.ambientColor     = '#3a1a0a';
scene.ambientIntensity = 0.3;
engine.setScene(scene);

// ── 光源 ──────────────────────────────────────────────────────────────────────

scene.addLight(new DirectionalLight({ angle: 225, elevation: 25, color: '#ff6020', intensity: 0.7 }));
scene.addLight(new OmniLight({ id: 'volcano-top', x: 7, y: 5, z: 60, color: '#ff8020', intensity: 0.8, radius: 400 }));
scene.addLight(new OmniLight({ id: 'lava-center', x: 7, y: 8, z: 4,  color: '#ff2200', intensity: 0.5, radius: 300 }));

// ── 地形 ──────────────────────────────────────────────────────────────────────

scene.addObject(new RockLayer('rock', COLS, ROWS));
scene.addObject(new VolcanoCone('cone', 5, 3));

// ── 熔岩河 ────────────────────────────────────────────────────────────────────

const lavaRiver = new LavaRiver('lava');
scene.addObject(lavaRiver);

// ── 烟雾 ──────────────────────────────────────────────────────────────────────

const smoke = new SmokePlumeSystem('smoke', 7, 5);
scene.addObject(smoke);

// ── 裂缝 ──────────────────────────────────────────────────────────────────────

const crackDefs: Array<[string, number, number, number]> = [
  ['crack-0', 3,  7,  0.2],
  ['crack-1', 8,  9,  0.6],
  ['crack-2', 11, 5,  0.85],
];
const cracks = crackDefs.map(([id, x, y, seed]) => {
  const c = new LavaCrack(id, x, y, seed);
  scene.addObject(c);
  return c;
});

// ── 角色（简单立方体英雄） ────────────────────────────────────────────────────

class Hero extends IsoObject {
  velX = 0; velY = 0;
  hp = 100;
  private _bobPhase = 0;
  private _lastTs = 0;
  private _burnGlow = 0;

  constructor() { super('hero', 2, 2, 0); }

  get aabb(): AABB {
    return { minX: this.position.x - 0.4, minY: this.position.y - 0.4, maxX: this.position.x + 0.4, maxY: this.position.y + 0.4, baseZ: this.position.z };
  }

  setBurn(on: boolean): void {
    this._burnGlow = on ? Math.min(1, this._burnGlow + 0.1) : Math.max(0, this._burnGlow - 0.05);
  }

  update(ts?: number): void {
    const now = ts ?? performance.now();
    const dt  = this._lastTs === 0 ? 0.016 : Math.min((now - this._lastTs) / 1000, 0.1);
    this._lastTs = now;
    const moving = Math.hypot(this.velX, this.velY) > 0.01;
    this._bobPhase += moving ? dt * 5 : dt * 1.2;
    this.position.z = Math.sin(this._bobPhase) * (moving ? 3 : 1.5);
    this.position.x = Math.max(0.5, Math.min(COLS - 0.5, this.position.x + this.velX * dt));
    this.position.y = Math.max(0.5, Math.min(ROWS - 0.5, this.position.y + this.velY * dt));
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;
    const { x, y, z } = this.position;
    const { sx, sy } = project(x, y, z, tileW, tileH);
    const cx = originX + sx, cy = originY + sy;
    const s = 0.45;

    // 立方体
    const top   = project(x - s, y - s, z + s * 2, tileW, tileH);
    const tr    = project(x + s, y - s, z + s * 2, tileW, tileH);
    const br    = project(x + s, y + s, z + s * 2, tileW, tileH);
    const bl    = project(x - s, y + s, z + s * 2, tileW, tileH);
    const blB   = project(x - s, y + s, z,         tileW, tileH);
    const brB   = project(x + s, y + s, z,         tileW, tileH);
    const trB   = project(x + s, y - s, z,         tileW, tileH);
    const tlB   = project(x - s, y - s, z,         tileW, tileH);
    const ox = originX, oy = originY;

    ctx.beginPath();
    ctx.moveTo(ox + top.sx, oy + top.sy);
    ctx.lineTo(ox + bl.sx,  oy + bl.sy);
    ctx.lineTo(ox + blB.sx, oy + blB.sy);
    ctx.lineTo(ox + tlB.sx, oy + tlB.sy);
    ctx.closePath();
    ctx.fillStyle = '#4a8aff';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(ox + tr.sx,  oy + tr.sy);
    ctx.lineTo(ox + br.sx,  oy + br.sy);
    ctx.lineTo(ox + brB.sx, oy + brB.sy);
    ctx.lineTo(ox + trB.sx, oy + trB.sy);
    ctx.closePath();
    ctx.fillStyle = '#6aaaff';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(ox + top.sx, oy + top.sy);
    ctx.lineTo(ox + tr.sx,  oy + tr.sy);
    ctx.lineTo(ox + br.sx,  oy + br.sy);
    ctx.lineTo(ox + bl.sx,  oy + bl.sy);
    ctx.closePath();
    ctx.fillStyle = '#80c0ff';
    ctx.fill();

    // 灼烧光晕
    if (this._burnGlow > 0.05) {
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, tileW * 0.6);
      glow.addColorStop(0,   `rgba(255,120,20,${(this._burnGlow * 0.6).toFixed(2)})`);
      glow.addColorStop(1,   'rgba(255,60,0,0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.beginPath();
      ctx.arc(cx, cy, tileW * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

const hero = new Hero();
scene.addObject(hero);

// ── 跳跃垫脚石 ────────────────────────────────────────────────────────────────

interface Platform {
  x: number; y: number;
  age: number;
  duration: number;
}
const platforms: Platform[] = [];

class PlatformObj extends IsoObject {
  platforms: Platform[];
  constructor(p: Platform[]) { super('platforms', 0, 0, 0); this.platforms = p; this.castsShadow = false; }
  get aabb(): AABB { return { minX: 0, minY: 0, maxX: COLS, maxY: ROWS, baseZ: 0 }; }
  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;
    for (const p of this.platforms) {
      const t = p.age / p.duration;
      const alpha = 1 - t;
      const wz = 0.4 + Math.sin(p.age * 4) * 0.05;
      const s = 0.85;
      const tl  = project(p.x,     p.y,     wz + 0.2, tileW, tileH);
      const tr  = project(p.x + s, p.y,     wz + 0.2, tileW, tileH);
      const br  = project(p.x + s, p.y + s, wz + 0.2, tileW, tileH);
      const bl  = project(p.x,     p.y + s, wz + 0.2, tileW, tileH);
      const blB = project(p.x,     p.y + s, wz,       tileW, tileH);
      const brB = project(p.x + s, p.y + s, wz,       tileW, tileH);
      const trB = project(p.x + s, p.y,     wz,       tileW, tileH);
      const tlB = project(p.x,     p.y,     wz,       tileW, tileH);
      const ox = originX, oy = originY;

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(ox + tl.sx, oy + tl.sy); ctx.lineTo(ox + bl.sx, oy + bl.sy);
      ctx.lineTo(ox + blB.sx, oy + blB.sy); ctx.lineTo(ox + tlB.sx, oy + tlB.sy);
      ctx.closePath(); ctx.fillStyle = '#cc5500'; ctx.fill();

      ctx.beginPath();
      ctx.moveTo(ox + tr.sx, oy + tr.sy); ctx.lineTo(ox + br.sx, oy + br.sy);
      ctx.lineTo(ox + brB.sx, oy + brB.sy); ctx.lineTo(ox + trB.sx, oy + trB.sy);
      ctx.closePath(); ctx.fillStyle = '#ee7700'; ctx.fill();

      ctx.beginPath();
      ctx.moveTo(ox + tl.sx, oy + tl.sy); ctx.lineTo(ox + tr.sx, oy + tr.sy);
      ctx.lineTo(ox + br.sx, oy + br.sy); ctx.lineTo(ox + bl.sx, oy + bl.sy);
      ctx.closePath();
      ctx.fillStyle = `rgba(255,160,40,${alpha.toFixed(2)})`;
      ctx.fill();

      // 发光
      const { sx, sy } = project(p.x + s / 2, p.y + s / 2, wz + 0.2, tileW, tileH);
      const glow = ctx.createRadialGradient(ox + sx, oy + sy, 0, ox + sx, oy + sy, tileW * 0.5);
      glow.addColorStop(0, `rgba(255,180,60,${(alpha * 0.5).toFixed(2)})`);
      glow.addColorStop(1, 'rgba(255,100,0,0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.beginPath();
      ctx.arc(ox + sx, oy + sy, tileW * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }
}
const platformObj = new PlatformObj(platforms);
scene.addObject(platformObj);

// ── 输入 ──────────────────────────────────────────────────────────────────────

const input = new InputManager(canvas);
const SPEED = 4;

// ── 状态 ──────────────────────────────────────────────────────────────────────

let burnTimer = 0;
let lastTs = 0;

// ── 控制面板 ──────────────────────────────────────────────────────────────────

function $<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }
function bindSlider(id: string, valId: string, cb: (v: number) => void): void {
  const el = $<HTMLInputElement>(id);
  const vl = $<HTMLSpanElement>(valId);
  el.addEventListener('input', () => { const v = Number(el.value); vl.textContent = v.toFixed(1); cb(v); });
}
bindSlider('lava-speed',   'lava-speed-val',   v => { lavaRiver.waveSpeed = v; });
bindSlider('smoke-density','smoke-density-val', v => { smoke.densityMult = v; });

// ── 渲染循环 ──────────────────────────────────────────────────────────────────

engine.start(
  // postFrame — HUD
  (ts) => {
    const now = ts;
    const dt  = lastTs === 0 ? 0.016 : Math.min((now - lastTs) / 1000, 0.1);
    lastTs = now;

    // 输入移动
    hero.velX = 0; hero.velY = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp'))    hero.velY = -SPEED;
    if (input.isDown('KeyS') || input.isDown('ArrowDown'))  hero.velY =  SPEED;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft'))  hero.velX = -SPEED;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) hero.velX =  SPEED;

    // 裂缝喷发 → 生成平台
    for (const crack of cracks) {
      if (crack.isBursting && crack.burstAge < 0.05) {
        const existing = platforms.find(p => Math.hypot(p.x - crack.position.x, p.y - crack.position.y) < 0.5);
        if (!existing) {
          platforms.push({ x: crack.position.x - 0.4, y: crack.position.y - 0.4, age: 0, duration: 3 });
        }
      }
    }

    // 更新平台寿命
    for (let i = platforms.length - 1; i >= 0; i--) {
      platforms[i].age += dt;
      if (platforms[i].age >= platforms[i].duration) platforms.splice(i, 1);
    }

    // 检测熔岩伤害
    const onLava = lavaRiver.isLava(hero.position.x, hero.position.y);
    const onPlatform = platforms.some(p =>
      Math.hypot(hero.position.x - (p.x + 0.4), hero.position.y - (p.y + 0.4)) < 0.8
    );
    const burning = onLava && !onPlatform;
    hero.setBurn(burning);

    if (burning) {
      burnTimer += dt;
      if (burnTimer >= 1) {
        hero.hp = Math.max(0, hero.hp - 10);
        burnTimer -= 1;
      }
    } else {
      burnTimer = 0;
    }

    // HUD
    const ctx = engine.ctx;
    const w = canvas.width;

    // HP 条
    const hpW = 160, hpH = 12;
    const hpX = w / 2 - hpW / 2, hpY = 14;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(hpX - 2, hpY - 2, hpW + 4, hpH + 4);
    ctx.fillStyle = '#330000';
    ctx.fillRect(hpX, hpY, hpW, hpH);
    const hpFill = (hero.hp / 100) * hpW;
    const hpColor = hero.hp > 60 ? '#44cc44' : hero.hp > 30 ? '#ccaa00' : '#cc2200';
    ctx.fillStyle = hpColor;
    ctx.fillRect(hpX, hpY, hpFill, hpH);
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`HP ${hero.hp}`, w / 2, hpY + hpH - 1);

    // 灼烧提示
    if (burning) {
      const pulse = 0.6 + Math.sin(ts * 0.008) * 0.4;
      ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = `rgba(255,100,20,${pulse.toFixed(2)})`;
      ctx.fillText('🔥 灼烧中！', w / 2, hpY + hpH + 18);
    }

    ctx.restore();
    input.flush();
  },
  // preFrame — 背景
  (_ts) => {
    const ctx = engine.ctx;
    const w = canvas.width, h = canvas.height;

    // 火山天空（深红到黑色渐变）
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    sky.addColorStop(0,    '#000000');
    sky.addColorStop(0.3,  '#0d0505');
    sky.addColorStop(0.65, '#2a0a04');
    sky.addColorStop(1,    '#4a1a08');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // 远处火山剪影
    ctx.fillStyle = '#1a0804';
    const silhouetteY = h * 0.32;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w * 0.05, silhouetteY + 20);
    ctx.lineTo(w * 0.15, silhouetteY - 10);
    ctx.lineTo(w * 0.22, silhouetteY + 30);
    ctx.lineTo(w * 0.35, silhouetteY - 25);
    ctx.lineTo(w * 0.42, silhouetteY + 15);
    ctx.lineTo(w * 0.55, silhouetteY - 40);
    ctx.lineTo(w * 0.62, silhouetteY + 5);
    ctx.lineTo(w * 0.75, silhouetteY - 20);
    ctx.lineTo(w * 0.85, silhouetteY + 10);
    ctx.lineTo(w * 0.95, silhouetteY - 15);
    ctx.lineTo(w, silhouetteY + 20);
    ctx.lineTo(w, h * 0.5);
    ctx.closePath();
    ctx.fill();

    // 熔岩天空辉光
    const glowX = w * 0.5, glowY = h * 0.55;
    const skyGlow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, w * 0.55);
    skyGlow.addColorStop(0,   'rgba(180,50,10,0.18)');
    skyGlow.addColorStop(0.5, 'rgba(120,30,5,0.08)');
    skyGlow.addColorStop(1,   'rgba(80,10,0,0)');
    ctx.fillStyle = skyGlow;
    ctx.fillRect(0, 0, w, h);
  },
);
