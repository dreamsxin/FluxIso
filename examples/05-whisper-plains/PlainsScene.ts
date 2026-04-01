/**
 * PlainsScene — 低语草原场景构建器
 *
 * - 绿色地面 + 半透明网格线
 * - 低多边形树木、小草、彩色小花
 * - 柔和方向光 + 暖色补光
 * - 低多边形云朵
 * - 发光传送阵
 */
import { Scene } from '../../src/core/Scene';
import { Floor } from '../../src/elements/Floor';
import { Cloud } from '../../src/elements/props/Cloud';
import { DirectionalLight } from '../../src/lighting/DirectionalLight';
import { OmniLight } from '../../src/lighting/OmniLight';
import { LowPolyTree, LowPolyGrass, LowPolyFlower } from './LowPolyTree';
import { Portal } from './Portal';

export const PLAINS_COLS = 14;
export const PLAINS_ROWS = 14;
export const PORTAL_X = 10;
export const PORTAL_Y = 10;

export function buildPlainsScene(): { scene: Scene; portal: Portal } {
  const scene = new Scene({
    tileW: 64, tileH: 32,
    cols: PLAINS_COLS, rows: PLAINS_ROWS,
  });

  // ── 地面 ──────────────────────────────────────────────────────────────────
  scene.addObject(new Floor({
    id: 'floor',
    cols: PLAINS_COLS,
    rows: PLAINS_ROWS,
    color:    '#5a9e4a',
    altColor: '#4e8e3e',
  }));

  // ── 光照 ──────────────────────────────────────────────────────────────────
  // 柔和方向光（模拟太阳）
  scene.addLight(new DirectionalLight({
    angle: 210,
    elevation: 50,
    color: '#fff4d0',
    intensity: 0.85,
  }));

  // 暖色补光（环境光）— z 不宜过高，否则 ShadowCaster 投影会拉伸
  scene.addLight(new OmniLight({
    x: PLAINS_COLS / 2, y: PLAINS_ROWS / 2, z: 120,
    color: '#ffd080',
    intensity: 0.5,
    radius: 800,
  }));

  // ── 树木 ──────────────────────────────────────────────────────────────────
  const treeData = [
    { x: 1.5, y: 1.5, scale: 1.2, color: '#4a8c3f', seed: 0.1 },
    { x: 2.5, y: 5.5, scale: 0.9, color: '#3d7a35', seed: 0.4 },
    { x: 1.5, y: 9.5, scale: 1.1, color: '#5a9e4a', seed: 0.7 },
    { x: 4.5, y: 12.5, scale: 0.8, color: '#4a8c3f', seed: 0.2 },
    { x: 12.5, y: 1.5, scale: 1.0, color: '#3d7a35', seed: 0.5 },
    { x: 12.5, y: 4.5, scale: 1.3, color: '#5a9e4a', seed: 0.8 },
    { x: 11.5, y: 8.5, scale: 0.9, color: '#4a8c3f', seed: 0.3 },
    { x: 13.5, y: 11.5, scale: 1.1, color: '#3d7a35', seed: 0.6 },
    { x: 6.5, y: 0.5, scale: 0.8, color: '#5a9e4a', seed: 0.9 },
    { x: 0.5, y: 13.5, scale: 1.0, color: '#4a8c3f', seed: 0.15 },
  ];
  for (const [i, t] of treeData.entries()) {
    scene.addObject(new LowPolyTree(`tree-${i}`, t.x, t.y, { color: t.color, scale: t.scale, seed: t.seed }));
  }

  // ── 小草（随机分布，避开传送阵附近） ──────────────────────────────────────
  const grassSeeds = [
    [3, 2], [5, 3], [7, 1], [9, 2], [3, 6], [6, 7], [8, 5],
    [2, 10], [4, 11], [6, 12], [8, 11], [10, 12],
    [3, 4], [5, 8], [7, 9], [9, 6],
  ];
  for (const [i, [gx, gy]] of grassSeeds.entries()) {
    // 避开传送阵区域
    if (Math.hypot(gx - PORTAL_X, gy - PORTAL_Y) < 2.5) continue;
    scene.addObject(new LowPolyGrass(`grass-${i}`, gx + 0.5, gy + 0.5, {
      color: ['#5aaa40', '#4a9a35', '#6aba50'][i % 3],
      height: 8 + (i % 4) * 2,
      seed: i * 0.3,
    }));
  }

  // ── 小花 ──────────────────────────────────────────────────────────────────
  const flowerSeeds = [
    [3.5, 3.5], [5.5, 2.5], [7.5, 4.5], [4.5, 7.5],
    [6.5, 9.5], [8.5, 8.5], [2.5, 8.5], [9.5, 3.5],
  ];
  for (const [i, [fx, fy]] of flowerSeeds.entries()) {
    if (Math.hypot(fx - PORTAL_X, fy - PORTAL_Y) < 2.5) continue;
    scene.addObject(new LowPolyFlower(`flower-${i}`, fx, fy, { seed: i * 0.15 }));
  }

  // ── 云朵 ──────────────────────────────────────────────────────────────────
  const cloudData = [
    { x: 2,  y: 1,  altitude: 8,  speed: 0.3, angle: 0.2,  scale: 1.1, seed: 0.18 },
    { x: 8,  y: 3,  altitude: 10, speed: 0.2, angle: -0.1, scale: 0.8, seed: 0.55 },
    { x: 5,  y: 10, altitude: 7,  speed: 0.4, angle: 0.35, scale: 1.3, seed: 0.82 },
    { x: 11, y: 7,  altitude: 9,  speed: 0.15,angle: -0.25,scale: 0.7, seed: 0.4  },
  ];
  for (const [i, c] of cloudData.entries()) {
    const cloud = new Cloud({ id: `cloud-${i}`, ...c });
    cloud.boundsX = PLAINS_COLS;
    cloud.boundsY = PLAINS_ROWS;
    scene.addObject(cloud);
  }

  // ── 传送阵 ────────────────────────────────────────────────────────────────
  const portal = new Portal('portal', PORTAL_X, PORTAL_Y);
  scene.addObject(portal);

  return { scene, portal };
}
