/**
 * Example 02 — Character Movement
 *
 * Demonstrates:
 *   - Character with A* pathfinding
 *   - TileCollider (blocked tiles)
 *   - Click-to-move
 *   - Arrow key nudge
 *   - MovementComponent
 */
import {
  Engine, Scene, Floor, Wall, OmniLight,
  Character, TileCollider, MovementComponent, InputManager,
} from '../../src/index';

const COLS = 10, ROWS = 10, TILE_W = 64, TILE_H = 32;

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width  = (COLS + ROWS) * (TILE_W / 2);
canvas.height = (COLS + ROWS) * (TILE_H / 2) + 60;

const engine = new Engine({ canvas });
engine.originX = canvas.width / 2;
engine.originY = ROWS * (TILE_H / 2) + 10;

// ── Scene ──────────────────────────────────────────────────────────────────

const scene = new Scene({ tileW: TILE_W, tileH: TILE_H, cols: COLS, rows: ROWS });

scene.addObject(new Floor({ id: 'floor', cols: COLS, rows: ROWS, color: '#4a7c59', altColor: '#3d6b4a' }));

// A few walls to demonstrate pathfinding around obstacles
for (const [col, row] of [[3,3],[3,4],[3,5],[6,2],[6,3]]) {
  scene.addObject(new Wall({ id: `w-${col}-${row}`, x: col, y: row, endX: col + 1, endY: row, color: '#8b7355' }));
}

scene.addLight(new OmniLight({ x: 5, y: 5, z: 140, color: '#ffe8a0', intensity: 1.3, radius: 350 }));

// ── Collision ──────────────────────────────────────────────────────────────

const collider = new TileCollider(COLS, ROWS);
// Block the wall tiles
for (const [col, row] of [[3,3],[3,4],[3,5],[6,2],[6,3]]) {
  collider.setWalkable(col, row, false);
}
scene.collider = collider;

// ── Character ──────────────────────────────────────────────────────────────

const character = new Character({ id: 'player', x: 1.5, y: 1.5 });
scene.addObject(character);

const mv = new MovementComponent({ speed: 3.5, radius: 0.35, collider });
mv.onAttach(character);

// ── Input ──────────────────────────────────────────────────────────────────

const input = new InputManager(canvas);

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const cy = (e.clientY - rect.top)  * (canvas.height / rect.height);
  const world = scene.camera.screenToWorld(cx, cy, canvas.width, canvas.height, TILE_W, TILE_H, engine.originX, engine.originY);
  const tx = Math.max(0.5, Math.min(COLS - 0.5, world.x));
  const ty = Math.max(0.5, Math.min(ROWS - 0.5, world.y));
  mv.pathTo(tx, ty, character.position.z);
});

// ── Loop ───────────────────────────────────────────────────────────────────

engine.setScene(scene);
engine.start(
  undefined,
  (ts) => {
    // Arrow key nudge
    if (input.isDown('ArrowUp'))    character.position.y -= 0.05;
    if (input.isDown('ArrowDown'))  character.position.y += 0.05;
    if (input.isDown('ArrowLeft'))  character.position.x -= 0.05;
    if (input.isDown('ArrowRight')) character.position.x += 0.05;

    mv.update(ts);
    input.flush();
  },
);
