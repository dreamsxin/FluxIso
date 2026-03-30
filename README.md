# LuxIso

A 2D isometric rendering engine built with **TypeScript** and **Canvas 2D**, featuring real-time dynamic lighting, topological depth sorting, a declarative JSON scene API, a lightweight ECS component system, sprite animation, a particle system, and visual editors.

## Features

- **Isometric coordinate system** — `sx = (x−y)·tileW/2`, `sy = (x+y)·tileH/2 − z`; `project()` / `unproject()` helpers
- **Topological depth sorting** — Per-frame AABB-based Kahn sort; no Z-fighting on overlapping objects
- **Dynamic lighting** — OmniLight (RGB point light, distance falloff) + DirectionalLight (face-normal dot product)
- **Tile materials** — Procedural color or image texture; lighting multiply + screen blend overlay
- **Wall openings** — Doors and windows cut into wall faces with isometric parallelogram clipping
- **Sprite animation** — `SpriteSheet` + `AnimationController` + `DirectionalAnimator`; 8-direction × multi-action clip selection with fallback chain; `playOnce` with completion callback; `buildSheet()` grid layout helper
- **Particle system** — `ParticleSystem` as `IsoObject`; procedural + sprite-sheet particles; 5 built-in presets; continuous emission + burst mode; per-particle color/size/alpha/rotation interpolation; blend modes
- **Tile collision** — `TileCollider` walkable grid; AABB slide-and-clamp resolution; `moveTo()` path collision
- **ECS components** — `Entity.addComponent()` / `getComponent()`; built-in `HealthComponent`; extensible component interface
- **Low Poly props** — `Crystal`, `Boulder`, `Chest`, `Cloud` — canvas-drawn, light-shaded, ECS-powered
- **Declarative scenes** — JSON scene file; `engine.loadScene(url)` instantiates floor, walls, lights, characters, collision layer
- **Camera system** — Follow (lerp), pan, zoom, world-bounds clamping; `worldToScreen` / `screenToWorld` zoom-aware helpers
- **Lightmap baking** — `LightmapCache` on `OffscreenCanvas`; floor re-baked only when lights or camera change
- **Shadow casting** — `ShadowCaster` ray-projects object AABBs from OmniLight onto ground plane; convex hull; distance falloff
- **Audio** — `AudioManager` (Web Audio API); one-shot SFX, looping BGM, spatial distance attenuation; master/sfx/bgm volume
- **Scene editor** — Visual placement of walls/lights/props; property panel; JSON export/import; keyboard shortcuts
- **Sprite editor** — 8-direction animation preview grid; upload/URL image loading; action config (row/frames/fps); JSON export for `SpriteSheet` config
- **Library packaging** — Vite lib mode; ESM + CJS dual output; `luxiso.d.ts`; npm-ready
- **TypeScript-first** — Strict mode, fully typed public API, ES module tree-shakeable exports

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5 (strict) |
| Renderer | Canvas 2D |
| Build | Vite 5 |
| Tests | Vitest (72 tests) |
| Runtime | ES2022 (top-level await) |

## Installation

```bash
npm install
npm run dev        # demo + editors dev server → http://localhost:5173
npm run build      # production build → dist/
npm run build:lib  # library bundle → dist/luxiso.mjs + dist/luxiso.cjs + dist/types/
npm run test       # run 72 unit tests
```

**Use as a library:**
```ts
import { Engine, Scene, OmniLight, Character, HealthComponent } from 'luxiso';
```

## Pages

| URL | Description |
|---|---|
| `/` | Interactive demo |
| `/editor.html` | Scene editor — place walls, lights, props |
| `/sprite-editor.html` | Sprite editor — configure 8-direction animations |

## Coordinate System

LuxIso uses a **right-handed isometric coordinate system** with the camera looking from the upper-right toward the lower-left.

```
World axes → Screen axes:
  sx = (x - y) * tileW / 2
  sy = (x + y) * tileH / 2 - z

  x increases → screen right-down  (East)
  y increases → screen left-down   (West)
  z increases → screen up          (altitude)
```

**Screen diamond for a single tile at world (col, row):**

```
         (col, row)          ← North tip (back)
        /          \
(col, row+1)    (col+1, row) ← West / East tips
        \          /
         (col+1, row+1)      ← South tip (front, closest to camera)
```

**Visible faces from camera:**
- Left face faces the camera from the left (−x direction)
- Right face faces the camera from the right (−y direction)
- Top face is the horizontal surface

**Depth sorting:** objects with larger `x + y` are drawn later (in front). The topological sort handles overlapping AABBs correctly.

```ts
import { project, unproject } from 'luxiso';

// World → screen
const { sx, sy } = project(3, 4, 0, 64, 32);

// Screen → world (z=0 plane)
const { x, y } = unproject(sx, sy, 64, 32);
```

## Quick Start

```ts
import { Engine, OmniLight, Character, Crystal, HealthComponent } from 'luxiso';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width  = 640;
canvas.height = 480;

const engine = new Engine({ canvas });
engine.originX = canvas.width  / 2;
engine.originY = canvas.height / 2;

// Load scene from JSON
const scene = await engine.loadScene('/scenes/level1.json');
engine.setScene(scene);

// Add a prop with health
const crystal = new Crystal('gem', 3, 4, '#8060e0');
crystal.addComponent(new HealthComponent({
  max: 60,
  onDeath: () => scene.removeById('gem'),
}));
scene.addObject(crystal);

// Damage it
crystal.getComponent<HealthComponent>('health')?.takeDamage(20);

engine.start(
  (ts) => { /* postFrame: overlays, HUD */ },
  (ts) => { /* preFrame: background effects */ },
);
```

## Demo Controls

| Interaction | Action |
|---|---|
| **Drag ball** | Reposition character |
| **Click floor** | Move character to tile (smooth `moveTo` with collision) |
| **Click Crystal / Boulder / Chest** | Deal 15 HP damage; triggers particle effect |
| **Arrow keys** | Nudge character ±0.5 world units |
| **M key** | Toggle light Orbit ↔ Manual mode |
| **Drag light** | Reposition light (Manual mode only) |
| **Ball elevation** slider | Adjust character hover height (0–160 px) |
| **Light elevation / intensity / color** | Real-time light control |
| **Orbit speed** slider | Auto-orbit speed |

## Scene JSON Schema

```json
{
  "name": "Level 1",
  "cols": 10, "rows": 10, "tileW": 64, "tileH": 32,
  "floor": {
    "id": "mainFloor", "cols": 10, "rows": 10,
    "color": "#2a2a3a",
    "tileImage": "/tiles/stone.png",
    "walkable": [
      [true, true, false, true, true, true, true, true, true, true]
    ]
  },
  "walls": [
    {
      "id": "wall-north", "x": 0, "y": 0, "endX": 10, "endY": 0, "height": 80,
      "openings": [
        { "type": "window", "offsetX": 0.3, "width": 0.4, "height": 0.45, "offsetY": 0.3 },
        { "type": "door",   "offsetX": 0.7, "width": 0.25, "height": 0.85 }
      ]
    }
  ],
  "lights": [
    { "type": "omni", "x": 5, "y": 5, "z": 120, "color": "#ffd080", "intensity": 1, "radius": 320 },
    { "type": "directional", "angle": 45, "elevation": 45, "color": "#c0d8ff", "intensity": 0.25 }
  ],
  "characters": [
    { "id": "player", "x": 5, "y": 5, "z": 48, "radius": 26, "color": "#5590cc" }
  ]
}
```

**Walkable map:** row-major 2D boolean array. `false` = blocked tile. Characters cannot enter blocked tiles.

**Wall openings:** `offsetX` and `width` are fractions of wall length (0–1). `height` and `offsetY` are fractions of wall height.

## Architecture

```
Engine                    — canvas setup, RAF loop, JSON scene loading, TileCollider build
└── Scene                 — world container; topoSort depth sort; collider dispatch
    ├── Camera            — follow (lerp) / pan / zoom / worldToScreen / screenToWorld
    ├── LightmapCache     — OffscreenCanvas floor bake; dirty-check snapshot; blit()
    ├── Floor             — tile grid; OmniLight + DirectionalLight RGB illumination; tileImage
    ├── Wall              — parallelogram faces; door/window openings; face-normal dir lighting
    ├── Character         — sphere/sprite entity; moveTo collision; AnimationController
    ├── Entity (ECS)      — addComponent / getComponent; per-frame component.update()
    │   ├── Crystal       — low-poly hexagonal crystal; HealthComponent; light-shaded
    │   ├── Boulder       — low-poly 7-sided rock; HealthComponent; crack lines
    │   ├── Chest         — correct iso geometry; animated lid; HealthComponent; inner glow
    │   └── Cloud         — drifting low-poly cloud; seed-based shape; ground shadow
    ├── ParticleSystem    — IsoObject; Emitter pool; procedural + sprite particles; presets
    ├── ShadowCaster      — AABB projection from OmniLight; convex hull; distance falloff
    ├── AudioManager      — Web Audio API; SFX / BGM; spatial attenuation; volume buses
    └── LightManager
        ├── OmniLight     — point light; RGB channel accumulation; illuminateAt()
        └── DirectionalLight — face-normal dot product; angle/elevation; incidentDirection
```

### Rendering Pipeline

```
1. preFrame callback   — caller updates orbit, state, particles
2. clearRect           — clear canvas
3. preFrame draw       — background radial glow
4. Scene.update(ts)    — camera lerp + IsoObject.update(ts, collider)
5. Lightmap bake       — floor re-drawn to OffscreenCanvas if lights/camera changed
6. Lightmap blit       — cached floor stamped onto main canvas
7. Shadow cast         — ShadowCaster draws ground shadows (camera space)
8. topoSort            — AABB overlap → Kahn topological sort
9. Scene.draw()        — sorted objects drawn; light halos on top
10. postFrame callback — overlays, HUD, hint rings
```

## Project Structure

```
src/
├── index.ts                    # Public API barrel export
├── main.ts                     # Interactive demo
├── editor/
│   ├── editor.ts               # Scene editor entry point
│   ├── EditorState.ts          # Central store: scene data, tool state, serialization
│   ├── EditorRenderer.ts       # Engine-backed preview; grid overlay; selection highlight
│   └── sprite-editor.ts        # Sprite editor entry point
├── core/
│   ├── AssetLoader.ts          # Promise image cache; loadImage / loadAll / get
│   ├── Camera.ts               # follow (lerp) / pan / zoom / worldToScreen / screenToWorld
│   ├── LightmapCache.ts        # OffscreenCanvas floor bake; snapshot dirty-check; blit()
│   ├── Scene.ts                # Object + light management; topoSort; lightmap; shadow dispatch
│   └── Engine.ts               # RAF loop; JSON loader; TileCollider build; pre/postFrame
├── elements/
│   ├── IsoObject.ts            # Abstract base: id, position, aabb, draw
│   ├── Floor.ts                # Tile grid + tileImage + OmniLight/DirLight RGB mix
│   ├── Wall.ts                 # Parallelogram faces; openings; face-normal lighting
│   ├── Character.ts            # Sphere/sprite entity; moveTo; AnimationController
│   └── props/
│       ├── Crystal.ts          # Low-poly crystal; Entity + HealthComponent
│       ├── Boulder.ts          # Low-poly rock; Entity + HealthComponent
│       ├── Chest.ts            # Correct iso geometry; animated lid; inner glow; HealthComponent
│       └── Cloud.ts            # Drifting low-poly cloud; seed-based shape; wrapping
├── animation/
│   ├── SpriteSheet.ts          # AnimationClip (frames, fps, loop); AssetLoader preload
│   ├── AnimationController.ts  # State machine; 8-direction; idle↔walk; playOnce; dt-based
│   ├── DirectionalAnimator.ts  # 8-dir × multi-action; fallback chain; buildSheet() helper
│   └── ParticleSystem.ts       # IsoObject; Emitter pool; 5 presets; sprite + procedural
├── audio/
│   └── AudioManager.ts         # Web Audio API; SFX / BGM; spatial attenuation; volume buses
├── physics/
│   └── TileCollider.ts         # Walkable grid; canOccupy(); resolveMove() slide-and-clamp
├── ecs/
│   ├── Component.ts            # Interface: componentType, onAttach, onDetach, update
│   ├── Entity.ts               # IsoObject + component Map; addComponent / getComponent
│   └── components/
│       └── HealthComponent.ts  # hp / maxHp / fraction / isDead; takeDamage / heal; callbacks
├── lighting/
│   ├── BaseLight.ts            # Abstract: color, intensity
│   ├── OmniLight.ts            # Point light; illuminateAt(sx, sy, lsx, lsy)
│   ├── DirectionalLight.ts     # angle/elevation; direction / incidentDirection vectors
│   └── ShadowCaster.ts         # AABB → ground shadow polygons; distance falloff; multiply blend
└── math/
    ├── IsoProjection.ts        # project() / unproject() / depthKey()
    ├── depthSort.ts            # AABB interface; topoSort<T extends Sortable>() — Kahn's algorithm
    └── color.ts                # hexToRgb / hexToRgba / shiftColor / blendColor / lerpColor

public/
└── scenes/
    └── level1.json             # 10×10 demo scene

index.html          # Demo page
editor.html         # Scene editor page
sprite-editor.html  # Sprite editor page
```

## API Reference

### `Engine`

```ts
new Engine({ canvas: HTMLCanvasElement })

engine.originX: number          // iso origin X in canvas pixels
engine.originY: number          // iso origin Y in canvas pixels
engine.canvasW: number          // canvas width (read-only)
engine.canvasH: number          // canvas height (read-only)
engine.ctx: CanvasRenderingContext2D
engine.scene: Scene | null

engine.loadScene(url: string): Promise<Scene>   // fetch + parse JSON
engine.buildScene(json: object): Scene          // synchronous, no fetch
engine.setScene(scene: Scene): void
engine.start(postFrame?, preFrame?): void       // postFrame: after draw; preFrame: before draw
engine.stop(): void
```

**`originX` / `originY`** define where world `(0, 0, 0)` maps to on the canvas. For a 10×10 scene with `tileH=32`:
```ts
engine.originX = canvasW / 2;
engine.originY = ROWS * (tileH / 2) + 20;  // shift down so the scene is centred
```

### `Scene`

```ts
scene.addObject(obj: IsoObject): void
scene.removeById(id: string): void
scene.getById(id: string): IsoObject | undefined
scene.addLight(light: BaseLight): void
scene.omniLights: OmniLight[]
scene.dirLights: DirectionalLight[]
scene.camera: Camera
scene.collider: TileCollider | null
scene.tileW: number
scene.tileH: number
scene.cols: number
scene.rows: number
```

### `Camera`

```ts
new Camera({ x?, y?, zoom?, lerpFactor?, bounds? })

camera.x: number          // world X of camera centre
camera.y: number          // world Y of camera centre
camera.zoom: number       // 0.25–4
camera.lerpFactor: number // 0–1; 1 = instant snap, 0.08 = smooth follow

camera.follow(obj: IsoObject): void   // lerp toward obj.position each frame
camera.unfollow(): void
camera.pan(dx, dy): void
camera.setZoom(zoom): void            // clamped to [0.25, 4]
camera.setBounds(bounds: CameraBounds): void

// Coordinate conversion (zoom + pan aware)
camera.worldToScreen(wx, wy, wz, tileW, tileH, originX, originY): { sx, sy }
camera.screenToWorld(cx, cy, canvasW, canvasH, tileW, tileH, originX, originY): { x, y }
```

**Smooth follow example:**
```ts
scene.camera.lerpFactor = 0.08;   // smooth
scene.camera.follow(character);
scene.camera.setBounds({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
```

### `Character`

```ts
new Character({ id, x, y, z?, radius?, color?, spriteSheet?, speed? })

character.position: IsoVec3          // { x, y, z } — mutable
character.moveTo(x, y, z?): void     // smooth interpolation with collision
character.stopMoving(): void
character.isMoving: boolean
character.setSpriteSheet(sheet, initialClip?): void
character.playAnimation(name: string): void
```

### `IsoObject` (custom objects)

Extend `IsoObject` to create any renderable world object:

```ts
import { IsoObject, DrawContext, AABB } from 'luxiso';

class Torch extends IsoObject {
  constructor(id: string, x: number, y: number) {
    super(id, x, y, 0);
  }

  get aabb(): AABB {
    return { minX: this.position.x - 0.3, minY: this.position.y - 0.3,
             maxX: this.position.x + 0.3, maxY: this.position.y + 0.3, baseZ: 0 };
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;
    const { sx, sy } = project(this.position.x, this.position.y, 0, tileW, tileH);
    // draw at (originX + sx, originY + sy)
  }
}
```

For objects that need components, extend `Entity` instead:

```ts
import { Entity } from 'luxiso';

class Crate extends Entity {
  get aabb(): AABB { ... }
  draw(dc: DrawContext): void { ... }
}

const crate = new Crate('crate-1', 3, 4, 0);
crate.addComponent(new HealthComponent({ max: 50 }));
```

### `Entity` (ECS base)

```ts
entity.addComponent<T extends Component>(c: T): T
entity.getComponent<T>(type: string): T | undefined
entity.hasComponent(type: string): boolean
entity.removeComponent(type: string): void
entity.components: IterableIterator<Component>
```

**Custom component:**
```ts
import { Component, IsoObject } from 'luxiso';

class BurnComponent implements Component {
  readonly componentType = 'burn';
  private _owner: IsoObject | null = null;
  private _elapsed = 0;

  constructor(private damagePerSec: number) {}

  onAttach(owner: IsoObject): void { this._owner = owner; }
  onDetach(): void { this._owner = null; }

  update(ts?: number): void {
    // called every frame by Entity.update()
    this._elapsed += 1/60;
    if (this._elapsed >= 1) {
      this._elapsed = 0;
      const hp = (this._owner as Entity).getComponent<HealthComponent>('health');
      hp?.takeDamage(this.damagePerSec);
    }
  }
}

entity.addComponent(new BurnComponent(5));
```

### `HealthComponent`

```ts
new HealthComponent({ max, current?, onDeath?, onChange? })

hp.hp: number           // current HP
hp.maxHp: number
hp.fraction: number     // 0–1
hp.isDead: boolean
hp.takeDamage(amount): void
hp.heal(amount): void
hp.setMax(max, scaleCurrentHp?): void
```

### `TileCollider`

```ts
new TileCollider(cols, rows)
TileCollider.fromArray(cols, rows, data: boolean[][] | boolean[])

collider.isWalkable(col, row): boolean
collider.setWalkable(col, row, walkable): void
collider.canOccupy(minX, minY, maxX, maxY): boolean
collider.resolveMove(x, y, dx, dy, r?): { dx, dy }  // slide-and-clamp
```

### `OmniLight`

```ts
new OmniLight({ x, y, z, color?, intensity?, radius? })

light.position: IsoVec3   // mutable — move the light each frame
light.color: string        // CSS hex, e.g. '#ffd080'
light.intensity: number    // 0–3+
light.radius: number       // falloff radius in screen pixels (default 320)
light.illuminateAt(sx, sy, lsx, lsy): number  // returns 0–1
```

### `DirectionalLight`

```ts
new DirectionalLight({ angle?, elevation?, color?, intensity? })
// angle: degrees (0 = right, 90 = down). Default 45.
// elevation: degrees above ground (0–90). Default 45.

light.direction: { dx, dy }          // unit vector toward light source
light.incidentDirection: { dx, dy }  // unit vector of incoming rays
```

### `SpriteSheet` + `AnimationController`

```ts
const sheet = new SpriteSheet({
  url: '/sprites/hero.png',
  scale: 2,
  anchorY: 1,   // 0 = top-anchored, 1 = bottom-anchored (default)
  clips: [
    { name: 'idle', frames: [{ x:0, y:0, w:32, h:48 }], fps: 4, loop: true },
    { name: 'walk', frames: [
      { x:0, y:48, w:32, h:48 }, { x:32, y:48, w:32, h:48 }, // ...8 frames
    ], fps: 12, loop: true },
    { name: 'attack', frames: [...], fps: 16, loop: false },
  ],
});
await sheet.preload();

character.setSpriteSheet(sheet, 'idle');
character.playAnimation('walk');
```

**`AnimationController` directly:**
```ts
const ctrl = new AnimationController(sheet, 'idle');
ctrl.play('walk');
ctrl.playOnce('attack', () => console.log('attack done'), 'idle');
ctrl.update(dt);  // call each frame with delta-time in seconds
const frame = ctrl.currentClip.frames[ctrl.frameIndex];
```

### `DirectionalAnimator`

Manages 8-direction × multi-action animations with automatic clip fallback.

**Clip naming convention:** `{action}_{direction}` — e.g. `walk_SE`, `idle_N`, `attack_SW`.

**Direction fallback chain** (used when a specific direction clip is missing):
```
NW → W → SW → S
NE → E → SE → S
N  → NE → NW → E → W → S
```

**Standard grid layout** (rows: S, SW, W, NW, N, NE, E, SE):
```ts
import { DirectionalAnimator, AnimationController } from 'luxiso';

// Build sheet from a standard 8-row-per-action grid
const sheet = DirectionalAnimator.buildSheet(
  '/sprites/hero.png',
  64,   // frame width
  64,   // frame height
  [
    { name: 'idle',   rowStart: 0,  frameCount: 4, fps: 6  },
    { name: 'walk',   rowStart: 8,  frameCount: 8, fps: 12 },
    { name: 'attack', rowStart: 16, frameCount: 6, fps: 16, loop: false },
  ],
  2,    // draw scale
);
await sheet.preload();

const anim = new DirectionalAnimator(sheet, { initialAction: 'idle' });
```

**Per-frame update in a custom IsoObject:**
```ts
update(ts?: number): void {
  const dt = /* delta time in seconds */;
  const dx = this.position.x - this._prevX;
  const dy = this.position.y - this._prevY;

  if (Math.hypot(dx, dy) > 0.001) {
    const dir = AnimationController.directionFrom(dx, dy);
    this.anim.set('walk', dir);
  } else {
    this.anim.setAction('idle');
  }
  this.anim.update(dt);
}

draw(dc: DrawContext): void {
  const result = this.anim.currentFrame();
  if (!result) return;
  const { frame, image } = result;
  const w = frame.w * sheet.scale;
  const h = frame.h * sheet.scale;
  dc.ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h,
    screenX - w / 2, screenY - h, w, h);
}
```

**One-shot actions (attack, die):**
```ts
// Play 'attack' once, then return to 'idle'
anim.playOnce('attack', 'idle', () => console.log('attack finished'));
```

**Audit a sheet for missing clips:**
```ts
const { present, missing } = DirectionalAnimator.auditSheet(sheet, 'walk');
console.log('Missing:', missing);  // e.g. ['walk_NW', 'walk_N']
```

### `ParticleSystem`

`ParticleSystem` is an `IsoObject` — add it to the scene and it participates in depth sorting automatically.

```ts
import { ParticleSystem } from 'luxiso';

// One-shot burst at world position (3, 4)
const ps = new ParticleSystem('hit-fx', 3, 4, 0);
ps.addEmitter(ParticleSystem.presets.sparkBurst({ color: '#ff8040', count: 20 }));
ps.onExhausted = () => scene.removeById('hit-fx');
ps.burst();
scene.addObject(ps);
```

**Built-in presets:**

| Preset | Description | Key options |
|---|---|---|
| `sparkBurst` | Colorful sparks flying outward | `color`, `count` |
| `emberTrail` | Continuous glowing embers (fire/magic) | `color` |
| `dustPuff` | Expanding dust ring (footstep/landing) | `color` |
| `crystalShatter` | Rotating square shards | `color` |
| `coinSpill` | Gold coins arcing upward | `count` |
| `spriteExplosion` | Sprite-sheet frames on each particle | `sheet`, `clip`, `count` |

**Continuous emitter (fire torch):**
```ts
const fire = new ParticleSystem('torch-fire', 5, 3, 0);
fire.addEmitter(ParticleSystem.presets.emberTrail({ color: '#ff6020' }));
fire.autoRemove = false;  // keep alive indefinitely
scene.addObject(fire);
// fire.burst() is not needed — rate > 0 emits continuously
```

**Custom emitter config:**
```ts
ps.addEmitter({
  maxParticles: 32,
  rate: 0,                        // burst-only
  shape: 'ring',
  spawnRadius: 0.5,
  lifetime: [0.3, 0.8],
  speed: [1, 4],
  vz: [2, 5],
  gravity: -8,
  size: [3, 8],
  sizeFinal: 0,
  colorStart: '#80c0ff',
  colorEnd: '#ffffff',
  alphaStart: 1,
  alphaEnd: 0,
  blend: 'screen',
  particleShape: 'circle',
});
ps.burst(24);
```

**Sprite-sheet particles:**
```ts
ps.addEmitter(ParticleSystem.presets.spriteExplosion(explosionSheet, {
  clip: 'explode',
  count: 6,
}));
```

### `AudioManager`

```ts
const audio = new AudioManager();

// Must call from a user gesture (click / keydown)
audio.resume(): void
audio.suspend(): void

// Volume buses (0–1)
audio.masterVolume: number
audio.sfxVolume:    number
audio.bgmVolume:    number

// Preload
await audio.preload(url: string): Promise<void>
await audio.preloadAll(urls: string[]): Promise<void>

// One-shot SFX
audio.playSfx(url, opts?): AudioBufferSourceNode | null
// opts: { volume?, rate?, loop? }

// Looping BGM with crossfade
await audio.playBgm(url, fadeDuration?): Promise<void>
audio.stopBgm(fadeDuration?): void

// Spatial volume helper
AudioManager.spatialVolume({ x, y, listenerX, listenerY, refDistance?, maxDistance? }): number
```

**Spatial SFX:**
```ts
canvas.addEventListener('click', () => audio.resume());  // unlock AudioContext

const vol = AudioManager.spatialVolume({
  x: crystal.position.x, y: crystal.position.y,
  listenerX: player.position.x, listenerY: player.position.y,
  refDistance: 1.5, maxDistance: 10,
});
audio.playSfx('/sfx/hit.mp3', { volume: vol });
```

### `Cloud`

```ts
new Cloud({
  id: string,
  x: number, y: number,
  altitude?: number,   // world units above ground (default 6)
  speed?: number,      // world units/sec (default 0.4)
  angle?: number,      // drift direction in radians (default 0)
  scale?: number,      // visual size multiplier (default 1)
  seed?: number,       // shape seed 0–1 (default 0.5)
})

cloud.boundsX = scene.cols;  // set for correct wrapping
cloud.boundsY = scene.rows;
```

### `IsoProjection` utilities

```ts
project(x, y, z, tileW, tileH): { sx, sy }    // world → screen (relative to origin)
unproject(sx, sy, tileW, tileH): { x, y }     // screen → world (z=0 plane)
depthKey(x, y, z): number                      // simple depth heuristic
topoSort<T extends Sortable>(objects: T[]): T[] // Kahn topological sort
```

### Color utilities

```ts
import { hexToRgb, hexToRgba, shiftColor, blendColor, lerpColor } from 'luxiso';

hexToRgb('#ff8040')              // → [255, 128, 64]
hexToRgba('#ff8040', 0.5)        // → 'rgba(255,128,64,0.5)'
shiftColor('#ff8040', 30)        // → '#ff9e5e'  (lighten)
shiftColor('#ff8040', -50)       // → '#cd5210'  (darken)
blendColor('#ff8040', 0.5)       // → 'rgb(128,64,32)'  (scale channels)
lerpColor('#ff0000', '#0000ff', 0.5)  // → 'rgb(128,0,128)'
```

## Editor Guides

### Scene Editor (`/editor.html`)

The scene editor lets you visually build and export scene JSON files.

**Toolbar (left side):**

| Button | Key | Tool |
|---|---|---|
| ↖ | `V` | Select — click to select and edit object properties |
| ▬ | `W` | Wall — click start point, click end point |
| ✦ | `L` | Omni Light — click to place |
| ◉ | `C` | Character — click to place (snaps to tile centre) |
| ◆ | `1` | Crystal prop |
| ⬟ | `2` | Boulder prop |
| ▣ | `3` | Chest prop |

**Other shortcuts:**
- `Esc` — cancel current operation / deselect
- `Delete` / `Backspace` — remove selected object

**Property panel (right side):** When an object is selected, its numeric and color properties appear as editable fields. Changes apply immediately.

**JSON workflow:**
1. Build your scene visually
2. Click **Export** — the JSON appears in the textarea
3. Copy and save as a `.json` file in `public/scenes/`
4. Load it with `engine.loadScene('/scenes/my-scene.json')`

To import an existing scene: paste its JSON into the textarea and click **Import**.

---

### Sprite Editor (`/sprite-editor.html`)

The sprite editor helps you configure `SpriteSheet` clips for 8-direction character animations.

**Workflow:**

1. **Load image** — upload a file or paste a URL. The sheet preview shows the image with a grid overlay.

2. **Set frame size** — enter the pixel dimensions of a single frame (Frame W × Frame H). The grid updates live.

3. **Configure actions** — each action row defines:
   - `name` — action identifier (e.g. `idle`, `walk`, `attack`)
   - `row` — starting row index (0-based) for the South direction
   - `frames` — number of frames per direction
   - `fps` — playback speed
   - `loop` — whether the clip loops

   The standard layout expects 8 consecutive rows per action (S, SW, W, NW, N, NE, E, SE).

4. **Preview** — the right panel shows all 8 directions playing simultaneously. Use the action selector to switch between actions. The clip name shown under each preview confirms which clip is resolved (including fallbacks).

5. **Export** — click **Export JSON** to get the full `SpriteSheet` config. Use it directly:

```ts
import { SpriteSheet } from 'luxiso';

const config = /* paste exported JSON */;
const sheet = new SpriteSheet(config);
await sheet.preload();
character.setSpriteSheet(sheet, 'idle');
```

Or use `DirectionalAnimator.buildSheet()` with the exported `actions` array:

```ts
const sheet = DirectionalAnimator.buildSheet(
  config.url, config.frameW, config.frameH,
  config.actions, config.scale,
);
```

## Recipes

### Smooth camera follow with bounds

```ts
const cam = scene.camera;
cam.lerpFactor = 0.08;
cam.follow(character);
cam.setBounds({ minX: 1, minY: 1, maxX: scene.cols - 1, maxY: scene.rows - 1 });
```

### Click-to-move with collision

```ts
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const cy = (e.clientY - rect.top)  * (canvas.height / rect.height);
  const world = scene.camera.screenToWorld(cx, cy, canvas.width, canvas.height,
    scene.tileW, scene.tileH, engine.originX, engine.originY);
  character.moveTo(world.x, world.y);
});
```

### Particle burst on hit

```ts
let fxId = 0;
function spawnHitFx(x: number, y: number, color: string): void {
  const id = `fx-${++fxId}`;
  const ps = new ParticleSystem(id, x, y, 0);
  ps.addEmitter(ParticleSystem.presets.sparkBurst({ color, count: 16 }));
  ps.onExhausted = () => scene.removeById(id);
  ps.burst();
  scene.addObject(ps);
}

// In HealthComponent onChange:
onChange: () => spawnHitFx(entity.position.x, entity.position.y, '#ff8040'),
```

### 8-direction character with DirectionalAnimator

```ts
import { DirectionalAnimator, AnimationController } from 'luxiso';

class Hero extends Entity {
  private _anim: DirectionalAnimator;
  private _prevX = 0;
  private _prevY = 0;
  private _lastTs = 0;

  constructor(id: string, x: number, y: number, sheet: SpriteSheet) {
    super(id, x, y, 0);
    this._anim = new DirectionalAnimator(sheet, { initialAction: 'idle' });
    this._prevX = x; this._prevY = y;
  }

  get aabb(): AABB {
    return { minX: this.position.x - 0.4, minY: this.position.y - 0.4,
             maxX: this.position.x + 0.4, maxY: this.position.y + 0.4, baseZ: 0 };
  }

  update(ts?: number): void {
    super.update(ts);
    const now = ts ?? performance.now();
    const dt = Math.min((now - this._lastTs) / 1000, 0.1);
    this._lastTs = now;

    const dx = this.position.x - this._prevX;
    const dy = this.position.y - this._prevY;
    this._prevX = this.position.x;
    this._prevY = this.position.y;

    if (Math.hypot(dx, dy) > 0.0005) {
      const dir = AnimationController.directionFrom(dx, dy);
      this._anim.set('walk', dir);
    } else {
      this._anim.setAction('idle');
    }
    this._anim.update(dt);
  }

  draw(dc: DrawContext): void {
    const { ctx, tileW, tileH, originX, originY } = dc;
    const { sx, sy } = project(this.position.x, this.position.y, 0, tileW, tileH);
    const result = this._anim.currentFrame();
    if (!result) return;
    const { frame, image } = result;
    const scale = this._anim.spriteSheet.scale;
    const w = frame.w * scale, h = frame.h * scale;
    ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h,
      originX + sx - w / 2, originY + sy - h, w, h);
  }
}
```

### Spatial audio on prop damage

```ts
const audio = new AudioManager();
canvas.addEventListener('pointerdown', () => audio.resume(), { once: true });

// In click handler:
const vol = AudioManager.spatialVolume({
  x: prop.position.x, y: prop.position.y,
  listenerX: character.position.x, listenerY: character.position.y,
  refDistance: 1, maxDistance: 12,
});
audio.playSfx('/sfx/hit.mp3', { volume: vol });
```

## Roadmap

### Completed ✅

| Module | Status |
|---|---|
| Isometric math (project / unproject / depthKey) | ✅ |
| Topological depth sort (AABB + Kahn) | ✅ |
| Floor: OmniLight + DirectionalLight RGB illumination | ✅ |
| Floor: tileImage texture + AssetLoader | ✅ |
| Wall: parallelogram faces + openings + directional lighting | ✅ |
| Character: sphere rendering + moveTo + collision | ✅ |
| OmniLight: RGB point light with illuminateAt() | ✅ |
| DirectionalLight: face-normal dot product rendering | ✅ |
| SpriteSheet + AnimationController (8-direction, idle/walk) | ✅ |
| DirectionalAnimator — 8-dir × multi-action; fallback chain; buildSheet() | ✅ |
| TileCollider: walkable grid + AABB slide-and-clamp | ✅ |
| ECS: Entity + Component + HealthComponent | ✅ |
| Low Poly props: Crystal, Boulder, Chest (correct iso geometry) | ✅ |
| Low Poly Cloud — drifting, seed-based shape, ground shadow | ✅ |
| Particle system — 5 presets; procedural + sprite; burst + continuous | ✅ |
| JSON scene loading with walkable map | ✅ |
| Interactive demo: drag, click-to-move, damage, HUD, particles | ✅ |
| Camera pipeline — lerp follow; zoom-aware unproject; worldToScreen / screenToWorld | ✅ |
| Lightmap baking — OffscreenCanvas floor cache; camera + light dirty-check | ✅ |
| Shadow casting — ray-projection from OmniLight; convex hull; distance falloff | ✅ |
| Audio — AudioManager (Web Audio API); SFX/BGM; spatial attenuation; hit sounds | ✅ |
| Color utilities — centralized src/math/color.ts | ✅ |
| Unit tests — Vitest; 72 tests: IsoProjection, color, depthSort, TileCollider, Camera, HealthComponent, Engine | ✅ |
| Scene editor — visual placement, property panel, JSON export/import, keyboard shortcuts | ✅ |
| Sprite editor — 8-direction preview grid; upload/URL; action config; JSON export | ✅ |
| Library packaging — Vite lib mode; ESM + CJS dual output; luxiso.d.ts; npm-ready | ✅ |

### Next Up

| Priority | Item | Notes |
|---|---|---|
| P5 | **ECS: MovementComponent + EventBus** | Reusable movement logic; inter-component events |
| P5 | **Physics hardening** | Diagonal corner-slide fix; continuous collision detection |
| P5 | **Performance: dirty-flag sort + frustum culling** | Skip topoSort when nothing moved |
| P5 | **Editor: undo/redo + collision layer editor** | Command stack; visual walkable grid toggle |
| P5 | **Validation layer** | JSON schema validation; component type-safe lookup |
| P5 | **Extended ECS components** | TimerComponent, TweenComponent, TriggerZoneComponent |

## License

MIT
