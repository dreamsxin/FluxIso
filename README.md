# LuxIso

A 2D isometric rendering engine built with **TypeScript** and **Canvas 2D**, featuring dynamic lighting, shadow casting, occlusion sorting, a full ECS component system, particle effects, spatial audio, and a visual scene editor.

## Features

- **Isometric math** — `project()` / `unproject()` / `depthKey()`; internal (X, Y, Z) space → screen
- **Topological depth sort** — per-frame AABB-based Kahn sort; no Z-fighting
- **OmniLight** — RGB point light, per-channel accumulation, distance falloff, `illuminateAt()`
- **DirectionalLight** — face-normal dot product; angle/elevation; per-channel color mix
- **Lightmap cache** — `OffscreenCanvas` floor cache; auto-invalidates on light/camera change
- **Shadow casting** — `ShadowCaster` projects AABB silhouettes onto z=0 plane with radial gradient
- **Tile materials** — procedural color or `tileImage` texture; light multiply + screen blend
- **Wall openings** — door/window parallelogram clipping on wall faces
- **Camera** — follow, pan, zoom, world-bounds clamping; `applyTransform()` fully wired into `Scene.draw()`
- **Sprite animation** — `SpriteSheet` + `AnimationController` (idle/walk state machine, 8-direction)
- **Directional animator** — `DirectionalAnimator`; clip naming `action_DIR`; fallback chain; `playOnce()`
- **Particle system** — `ParticleSystem`; procedural circle/square + sprite mode; blend modes; presets: sparkBurst, fire, dustPuff, crystalShatter, coinSpill, spriteExplosion
- **Tile collision** — `TileCollider` walkable grid; AABB slide-and-clamp; `sweepMove()` binary search with fast-path
- **ECS** — `Entity.addComponent()` / `getComponent()`; per-frame `component.update()`
- **EventBus** — typed events (Damage/Heal/Death/Move/Arrival/Trigger); `globalBus` singleton
- **Components** — `HealthComponent`, `MovementComponent`, `TimerComponent`, `TweenComponent` (8 easings, yoyo, repeat), `TriggerZoneComponent`
- **Props** — `Crystal`, `Boulder`, `Chest`, `Cloud`; canvas-drawn, ECS-powered, health bars
- **Audio** — `AudioManager`; one-shot SFX, looping BGM with crossfade, spatial distance attenuation, 3-bus volume (master/sfx/bgm)
- **JSON scene loader** — `engine.loadScene(url)`; floor, walls, lights, characters, props, clouds, walkable collision map
- **Scene validator** — `validateSceneJson()`; runtime JSON schema check + ECS component assertions
- **Scene editor** — visual drag-and-drop editor (`editor.ts`); undo/redo, collision paint, sprite frame inspector, JSON export

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5 (strict) |
| Renderer | Canvas 2D |
| Build | Vite 5 |
| Runtime | ES2022 |
| Tests | Vitest 4 (Node ≥ 22) |

## Installation

```bash
npm install
npm run dev        # http://localhost:5173 — interactive demo
npm run build      # production build → dist/
npx vitest --run   # run 116 unit tests (requires Node ≥ 22)
```

## Demo Controls

`src/main.ts` loads `public/scenes/level1.json`:

| Interaction | Action |
|---|---|
| **Click floor tile** | Move character to tile (smooth `moveTo` with collision) |
| **Click Crystal / Boulder / Chest** | Deal 15 HP damage; health bar updates |
| **Arrow keys** | Nudge character ±0.5 world units |
| **M key** | Toggle light orbit ↔ manual mode |
| **Drag light** | Reposition light (manual mode) |
| **Ball elevation** slider | Character height 0–160 px |
| **Light elevation** slider | Light height 20–300 px |
| **Light intensity** slider | Brightness 0.1–3× |
| **Light color** picker | Real-time color change |
| **Orbit speed** slider | Auto-orbit rate |

## Quick Start

```ts
import { Engine, OmniLight, Crystal, HealthComponent, ParticleSystem, AudioManager } from './src/index';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const engine = new Engine({ canvas });
engine.originX = canvas.width / 2;
engine.originY = canvas.height / 2;

// Load scene from JSON
const scene = await engine.loadScene('/scenes/level1.json');
engine.setScene(scene);

// Add a prop with health
const crystal = new Crystal('gem', 3, 4, '#8060e0');
crystal.addComponent(new HealthComponent({
  max: 60,
  onDeath: () => {
    const fx = scene.getById('gem-fx') as ParticleSystem;
    fx?.burst(20);
    scene.removeById('gem');
  },
}));
scene.addObject(crystal);

// Spatial audio
const audio = new AudioManager();
document.addEventListener('click', () => audio.resume(), { once: true });
audio.playSfx('/sfx/hit.ogg', {
  volume: AudioManager.spatialVolume({ x: 3, y: 4, listenerX: 5, listenerY: 5 }),
});

engine.start(
  (ts) => { /* postFrame: HUD, overlays */ },
  (ts) => { /* preFrame: orbit, background glow */ },
);
```

## Scene JSON Schema

```json
{
  "name": "Level 1",
  "cols": 10, "rows": 10, "tileW": 64, "tileH": 32,
  "floor": {
    "id": "mainFloor", "cols": 10, "rows": 10,
    "tileImage": "/tiles/stone.png",
    "walkable": [
      [true, true, false, true, true, true, true, true, true, true]
    ]
  },
  "walls": [
    {
      "id": "wall-n", "x": 0, "y": 0, "endX": 10, "endY": 0, "height": 80,
      "openings": [
        { "type": "window", "offsetX": 0.3, "width": 0.4, "height": 0.45, "offsetY": 0.3 },
        { "type": "door",   "offsetX": 0.7, "width": 0.25, "height": 0.85 }
      ]
    }
  ],
  "lights": [
    { "type": "omni",        "x": 5, "y": 5, "z": 120, "color": "#ffd080", "intensity": 1,    "radius": 320 },
    { "type": "directional", "angle": 45,    "elevation": 45, "color": "#c0d8ff", "intensity": 0.25 }
  ],
  "characters": [
    { "id": "player", "x": 5, "y": 5, "z": 48, "radius": 26, "color": "#5590cc" }
  ],
  "clouds": [
    { "id": "c1", "x": 2, "y": 1, "altitude": 6, "speed": 0.4, "angle": 0.3, "scale": 1.2, "seed": 0.7 },
    { "id": "c2", "x": 8, "y": 6, "altitude": 8, "speed": 0.25, "angle": 0.1, "scale": 0.8, "seed": 0.3 }
  ]
}
```

## Architecture

```
Engine                     — canvas setup, RAF loop, JSON loader, TileCollider, pre/postFrame
└── Scene                  — object + light container; topoSort; frustum cull; LightmapCache
    ├── Camera             — follow / pan / zoom / applyTransform (fully wired into draw)
    ├── LightmapCache      — OffscreenCanvas floor blit; auto-invalidate on light/camera delta
    ├── Floor              — tile grid; tileImage; OmniLight + DirectionalLight RGB mix
    ├── Wall               — parallelogram faces; door/window openings; face-normal lighting
    ├── ShadowCaster       — AABB silhouette → z=0 projection; radial gradient fill
    ├── Character          — sphere/sprite entity; moveTo; AnimationController
    ├── Entity (ECS)       — addComponent / getComponent; per-frame component.update()
    │   ├── Crystal        — low-poly hexagonal crystal; HealthComponent
    │   ├── Boulder        — low-poly 7-sided rock; crack lines; HealthComponent
    │   ├── Chest          — isometric box; animated lid; HealthComponent
    │   └── Cloud          — deterministic LCG low-poly puffs; drift + wrap; ground shadow
    ├── ParticleSystem     — IsoObject; procedural + sprite particles; depth-sorted
    └── LightManager
        ├── OmniLight      — illuminateAt(); RGB channel accumulation
        └── DirectionalLight — angle/elevation; incidentDirection; face-normal dot
```

### Rendering Pipeline

```
1. preFrame callback       — caller updates orbit, state
2. clearRect               — clear canvas
3. preFrame draw           — background radial glow from OmniLight
4. LightmapCache.blit()    — floor rendered into OffscreenCanvas, blit to main ctx
5. camera.applyTransform() — translate + scale ctx for camera follow/zoom
6. ShadowCaster.draw()     — project silhouettes onto z=0 in camera space
7. Scene.update(ts)        — camera + IsoObject.update(); Character moveTo; ECS components
8. topoSort                — AABB overlap → Kahn each frame
9. Scene.draw()            — Floor → Walls → sorted Characters/Props/Particles → halos
10. postFrame callback     — hint rings, HUD
```

### ECS Component System

```
Entity extends IsoObject
  addComponent<T>(c)       — attach + onAttach(owner)
  getComponent<T>(type)    — typed lookup by componentType string
  hasComponent(type)
  removeComponent(type)    — onDetach()

Components (all implement Component interface):
  HealthComponent          — hp/maxHp/fraction/isDead; takeDamage/heal; onDeath/onChange
  MovementComponent        — ECS-ified moveTo; TileCollider; EventBus arrival/move events
  TimerComponent           — delay/repeat countdown; pause/reset/restart
  TweenComponent           — 8 easings (linear/easeIn/Out/InOut/cubic/bounce/elastic)
                             yoyo ping-pong; repeat -1=infinite; delay; onComplete
  TriggerZoneComponent     — circle-radius enter/exit detection; EventBus trigger events

EventBus (typed):
  events: damage | heal | death | move | arrival | trigger
  globalBus singleton for cross-entity communication
```

## Project Structure

```
src/
├── index.ts                     # Public API barrel — 75+ exports
├── main.ts                      # Interactive demo
├── core/
│   ├── AssetLoader.ts           # Promise image cache; loadImage / loadAll / get
│   ├── Camera.ts                # follow / pan / zoom / applyTransform / clamp
│   ├── Engine.ts                # RAF loop; JSON loader (floor/walls/lights/chars/props/clouds); pre/postFrame
│   ├── LightmapCache.ts         # OffscreenCanvas floor cache; isDirty snapshot; blit()
│   ├── Scene.ts                 # Object + light management; topoSort; frustum cull; LightmapCache; ShadowCaster
│   └── Validator.ts             # validateSceneJson(); validateComponents(); requireComponent()
├── elements/
│   ├── IsoObject.ts             # Abstract base: id, position (IsoVec3), aabb, draw, update
│   ├── Floor.ts                 # Tile grid + tileImage + multi-light RGB illumination
│   ├── Wall.ts                  # Parallelogram faces; openings; face-normal dir lighting
│   ├── Character.ts             # Sphere/sprite entity; moveTo; AnimationController
│   └── props/
│       ├── Crystal.ts           # Low-poly crystal; Entity + HealthComponent
│       ├── Boulder.ts           # Low-poly rock; Entity + HealthComponent
│       ├── Chest.ts             # Isometric chest; animated lid; Entity + HealthComponent
│       └── Cloud.ts             # Deterministic LCG low-poly cloud; drift + wrap; ground shadow
├── animation/
│   ├── SpriteSheet.ts           # AnimationClip (frames, fps, loop); AssetLoader preload
│   ├── AnimationController.ts   # State machine; 8-direction; idle↔walk; dt-based
│   ├── DirectionalAnimator.ts   # action_DIR clip naming; fallback chain; playOnce(); buildSheet()
│   └── ParticleSystem.ts        # IsoObject; circle/square + sprite particles; blend modes; presets
├── physics/
│   └── TileCollider.ts          # Walkable grid; canOccupy(); resolveMove(); sweepMove() fast-path
├── ecs/
│   ├── Component.ts             # Interface: componentType, onAttach, onDetach, update
│   ├── Entity.ts                # IsoObject + component Map; addComponent / getComponent
│   ├── EventBus.ts              # Typed events; on/off/emit; globalBus singleton
│   └── components/
│       ├── HealthComponent.ts   # hp / maxHp / fraction / isDead; takeDamage / heal; callbacks
│       ├── MovementComponent.ts # ECS moveTo; TileCollider; EventBus arrival/move
│       ├── TimerComponent.ts    # delay / repeat / pause / restart
│       ├── TweenComponent.ts    # 8 easings; yoyo; repeat; delay; onComplete
│       └── TriggerZoneComponent.ts # Circle enter/exit; EventBus trigger
├── lighting/
│   ├── BaseLight.ts             # Abstract: color, intensity, illuminate()
│   ├── OmniLight.ts             # Point light; illuminateAt(sx, sy, lsx, lsy)
│   ├── DirectionalLight.ts      # angle/elevation; direction / incidentDirection vectors
│   └── ShadowCaster.ts          # AABB → z=0 silhouette projection; radial gradient
├── audio/
│   └── AudioManager.ts          # Web Audio API; SFX (fire-and-forget); BGM crossfade;
│                                #   spatial volume; master/sfx/bgm gain buses; buffer cache
├── math/
│   ├── IsoProjection.ts         # project() / unproject() / depthKey(); IsoVec3 / ScreenVec2
│   ├── depthSort.ts             # AABB; topoSort<T extends Sortable>() — Kahn's algorithm
│   └── color.ts                 # hexToRgb / hexToRgba / shiftColor / blendColor / lerpColor
└── editor/
    ├── EditorState.ts           # Central store; undo/redo command stack (100 deep); walkable grid; JSON I/O
    ├── EditorRenderer.ts        # Engine-backed live preview; world↔screen coordinate mapping
    ├── EditorRenderer.ts        # (see below)
    ├── editor.ts                # Full editor UI; toolbar; property panel; keyboard shortcuts
    └── sprite-editor.ts         # Sprite sheet frame inspector and clip builder

public/
└── scenes/
    └── level1.json              # 10×10 demo scene: floor + walkable map, 4 walls, OmniLight + DirectionalLight, player
```

## API Reference

### `Engine`

```ts
new Engine({ canvas: HTMLCanvasElement })
engine.originX: number                          // iso origin X in canvas pixels
engine.originY: number                          // iso origin Y
engine.loadScene(url: string): Promise<Scene>   // fetch + parse JSON; builds all objects + collider
engine.buildScene(json: object): Scene          // synchronous, no fetch
engine.setScene(scene: Scene): void
engine.start(postFrame?, preFrame?): void       // postFrame runs after draw; preFrame before draw
engine.stop(): void
engine.ctx: CanvasRenderingContext2D
engine.canvas: HTMLCanvasElement
```

### `Scene`

```ts
scene.addObject(obj: IsoObject): void
scene.addLight(light: BaseLight): void
scene.removeById(id: string): void
scene.getById(id: string): IsoObject | undefined
scene.omniLights: OmniLight[]
scene.dirLights: DirectionalLight[]
scene.camera: Camera
scene.collider: TileCollider | null
```

### `Camera`

```ts
new Camera(opts?: CameraOptions)
camera.follow(target: IsoObject, lerp?: number): void  // attach follow target
camera.pan(dx: number, dy: number): void
camera.zoom: number                                     // 0.1–4, default 1
camera.bounds: CameraBounds | null
camera.applyTransform(ctx, originX, originY): void     // called by Scene.draw()
camera.restoreTransform(ctx): void
camera.worldToScreen(wx, wy, originX, originY, tileW, tileH): ScreenVec2
camera.screenToWorld(sx, sy, originX, originY, tileW, tileH): IsoVec2
```

### `Character`

```ts
new Character({ id, x, y, z?, radius?, color?, spriteSheet?, speed? })
character.moveTo(x, y, z?): void       // smooth interpolation with collision
character.stopMoving(): void
character.isMoving: boolean
character.setSpriteSheet(sheet, initialClip?): void
character.playAnimation(name: string): void
```

### `Entity` (ECS base)

```ts
entity.addComponent<T extends Component>(c: T): T
entity.getComponent<T>(type: string): T | undefined
entity.hasComponent(type: string): boolean
entity.removeComponent(type: string): void
// Entity extends IsoObject — must implement aabb and draw()
```

### `HealthComponent`

```ts
new HealthComponent({ max, current?, onDeath?, onChange? })
hp.hp: number; hp.maxHp: number; hp.fraction: number; hp.isDead: boolean
hp.takeDamage(amount): void
hp.heal(amount): void
hp.setMax(max, scaleCurrentHp?): void
```

### `MovementComponent`

```ts
new MovementComponent({ speed?, collider?, bus? })
mv.moveTo(x, y, z?): void
mv.stopMoving(): void
mv.isMoving: boolean
// Emits EventBus: 'move' each frame, 'arrival' on destination reached
```

### `TimerComponent`

```ts
new TimerComponent({ delay, repeat?, onTick?, onComplete? })
timer.pause(): void; timer.resume(): void; timer.restart(): void
timer.elapsed: number; timer.isDone: boolean
```

### `TweenComponent`

```ts
new TweenComponent({
  targets: [{ prop: 'x'|'y'|'z', from, to }],
  duration,               // seconds
  easing?: Easing.easeOut,
  yoyo?: true,            // ping-pong
  repeat?: -1,            // -1 = infinite
  delay?: 0.5,
  onComplete?: () => {},
})
// Easing: linear easeIn easeOut easeInOut easeInCubic easeOutCubic bounce elastic
tween.pause(); tween.resume(); tween.restart()
tween.progress: number   // 0–1
```

### `TriggerZoneComponent`

```ts
new TriggerZoneComponent({ radius, onEnter?, onExit?, bus? })
trigger.check(candidates: IsoObject[]): void  // call each frame
// Emits EventBus: 'trigger' with { entered, exited } entity lists
```

### `ParticleSystem`

```ts
new ParticleSystem(id, x, y, z?)
ps.addEmitter(config: EmitterConfig): void
ps.burst(count: number): void           // fire-and-forget
ps.start(): void; ps.stop(): void       // continuous emitter
// scene.addObject(ps) — depth-sorted with everything else

// Presets:
ParticleSystem.presets.sparkBurst({ color? })
ParticleSystem.presets.fire({ color? })
ParticleSystem.presets.dustPuff({ color? })
ParticleSystem.presets.crystalShatter({ color? })
ParticleSystem.presets.coinSpill({ count? })
ParticleSystem.presets.spriteExplosion(sheet, { clip?, count? })
```

### `AudioManager`

```ts
const audio = new AudioManager()
audio.resume()                            // call from user gesture
audio.suspend()
audio.masterVolume = 0.8                  // 0–1
audio.sfxVolume = 1
audio.bgmVolume = 0.6
audio.playSfx(url, { volume?, rate?, loop?, spatial? }): AudioBufferSourceNode | null
audio.playBgm(url, fadeDuration?): Promise<void>
audio.stopBgm(fadeDuration?)
audio.preload(url): Promise<void>
audio.preloadAll(urls): Promise<void>
AudioManager.spatialVolume({ x, y, listenerX, listenerY, refDistance?, maxDistance? }): number
```

### `DirectionalAnimator`

```ts
// Clip naming: '{action}_{direction}' e.g. 'walk_SE', 'idle_N'
const anim = new DirectionalAnimator(sheet, { initialAction: 'idle', initialDirection: 'S' })
anim.setAction('walk')
anim.setDirection('NE')
anim.set('attack', 'SW')
anim.playOnce('attack', 'idle', onComplete?)
anim.update(dt)
anim.currentFrame(): { frame: FrameRect; image: HTMLImageElement } | null

// Static helpers:
DirectionalAnimator.buildSheet(url, frameW, frameH, actions, scale)  // grid-layout sheet builder
DirectionalAnimator.auditSheet(sheet, action)   // { present, missing } clip names
```

### `IsoProjection`

```ts
project(x, y, z, tileW, tileH): { sx, sy }
unproject(sx, sy, tileW, tileH): { x, y }      // z=0 plane
depthKey(x, y, z): number
topoSort<T extends Sortable>(objects: T[]): T[]
```

### `Validator`

```ts
validateSceneJson(json: unknown): ValidationResult   // { ok, errors[], warnings[] }
validateComponents(entity: Entity, required: string[]): ValidationResult
requireComponent<T>(entity: Entity, type: string): T  // throws if missing
```

## Roadmap

### Completed ✅

| Module | Notes |
|---|---|
| Isometric math (project / unproject / depthKey) | |
| Topological depth sort (AABB + Kahn) | |
| Floor: OmniLight + DirectionalLight RGB illumination | |
| Floor: tileImage texture + AssetLoader | |
| Wall: parallelogram faces + openings + directional lighting | |
| OmniLight: RGB point light with illuminateAt() | |
| DirectionalLight: face-normal dot product | |
| LightmapCache: OffscreenCanvas floor blit + auto-invalidate | |
| ShadowCaster: AABB → z=0 silhouette + radial gradient | |
| Camera: follow / pan / zoom — fully wired into Scene.draw() | |
| SpriteSheet + AnimationController (8-direction, idle/walk) | |
| DirectionalAnimator: action_DIR clips + fallback + playOnce | |
| ParticleSystem: procedural + sprite; 6 presets; depth-sorted | |
| TileCollider: walkable grid + AABB slide-and-clamp + sweepMove | |
| ECS: Entity + Component + EventBus (typed events) | |
| HealthComponent / MovementComponent / TimerComponent | |
| TweenComponent: 8 easings, yoyo, repeat, delay | |
| TriggerZoneComponent: circle enter/exit + EventBus | |
| Props: Crystal, Boulder, Chest, Cloud | |
| AudioManager: SFX + BGM crossfade + spatial volume | |
| JSON scene loader: floor/walls/lights/chars/props/clouds | |
| Validator: scene JSON + ECS component assertions | |
| Scene editor: drag-drop, undo/redo, collision paint, JSON export | |
| Unit tests: 116 tests across 12 files (Vitest 4, Node ≥ 22) | |

### Pending

| Priority | Item |
|---|---|
| P2 | **Camera lerp dt-based** — current `x += (tx-x)*factor` is frame-rate dependent; replace with `1-(1-factor)^dt` or explicit lerp speed (units/sec) |
| P2 | **Frustum culling refinement** — currently uses simple AABB vs viewport rect; add camera-space clip before topoSort |
| P3 | **Pathfinding** — A* over TileCollider grid; `character.pathTo(x, y)` with waypoint queue |
| P3 | **Minimap** — `OffscreenCanvas` overview rendered from top-down tile grid + object positions |
| P4 | **Vite lib mode** — ESM + CJS dual output; `luxiso.d.ts` rollup; npm publish |
| P4 | **Performance** — dirty-flag topoSort skip when nothing moved; instanced floor tile rendering |
| P4 | **Cloud in editor** — add `cloud` tool to `EditorState.ToolType` + `EditorRenderer._rebuild()` |

## License

MIT
