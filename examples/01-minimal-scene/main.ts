/**
 * Example 01 — Minimal Scene
 *
 * The smallest possible LuxIso setup:
 *   - 8×8 floor grid
 *   - One omni light
 *   - One wall
 *
 * No JSON file needed — everything is built in code.
 */
import { Engine, Scene, Floor, Wall, OmniLight } from '../../src/index';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width  = 800;
canvas.height = 500;

// 1. Create engine
const engine = new Engine({ canvas });
engine.originX = canvas.width / 2;
engine.originY = 160;

// 2. Build scene manually (no JSON required)
const scene = new Scene({ tileW: 64, tileH: 32, cols: 8, rows: 8 });

// 3. Add a floor
scene.addObject(new Floor({ id: 'floor', cols: 8, rows: 8, color: '#4a7c59', altColor: '#3d6b4a' }));

// 4. Add a wall
scene.addObject(new Wall({ id: 'wall-1', x: 2, y: 2, endX: 3, endY: 2, color: '#8b7355' }));

// 5. Add a light
scene.addLight(new OmniLight({ x: 4, y: 4, z: 120, color: '#ffe8a0', intensity: 1.2, radius: 300 }));

// 6. Start
engine.setScene(scene);
engine.start();
