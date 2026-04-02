# LuxIso

A 2D isometric rendering engine built with **TypeScript** and **Canvas 2D**, featuring dynamic lighting, shadow casting, occlusion sorting, a full ECS component system, particle effects, spatial audio, a visual scene editor, and a sprite sheet editor.

## Features

- **Isometric math** — `project()` / `unproject()` / `depthKey()` / `drawIsoCube()`; internal (X, Y, Z) space → screen
- **Topological depth sort** — 3-D AABB Kahn sort with containment detection; `maxZ` field for vertical extent; no Z-fighting
- **OmniLight** — RGB point light, per-channel accumulation, distance falloff, `illuminateAt()`; linear or quadratic falloff; `isGlobal` for ambient sky light; `enabled` toggle
- **DirectionalLight** — face-normal dot product; angle/elevation; per-channel color mix; `enabled` toggle
- **Lightmap cache** — `OffscreenCanvas` floor cache; auto-invalidates on light/camera change
- **Shadow casting** — `ShadowCaster` projects object silhouettes onto z=0 plane; circular footprint via `shadowRadius`; opt-in via `castsShadow = true`
- **Floor tile cache** — per-tile illumination color cached by lighting key; skips recomputation on static scenes; `invalidateCache()` for manual reset
- **Tile materials** — procedural color or `tileImage` texture; light multiply + screen blend
- **Wall openings** — door/window parallelogram clipping on wall faces
- **IsoView** — `scene.view` rotation + elevation; `scene.transitionView()` smooth animated transitions
- **Camera** — follow, pan, zoom, world-bounds clamping; frame-rate-independent lerp; `applyTransform()` fully wired into `Scene.draw()`
- **ClickMover** — click-to-move + keyboard movement helper; animated marker; collision-aware
- **Sprite animation** — `SpriteSheet` + `AnimationController` (idle/walk state machine, 8-direction)
- **Directional animator** — `DirectionalAnimator`; clip naming `action_DIR`; fallback chain; `playOnce()`
- **Particle system** — `ParticleSystem`; procedural circle/square + sprite mode; blend modes; presets: sparkBurst, emberTrail, dustPuff, crystalShatter, coinSpill, spriteExplosion, ambientDrift, smokePlume, lavaSparks
- **Tile collision** — `TileCollider` walkable grid; AABB slide-and-clamp; `sweepMove()` binary search with fast-path
- **A\* Pathfinder** — 8-directional, corner-cut prevention, Bresenham LoS string-pull, min-heap O(log n); LRU result cache; `Pathfinder.invalidateCache()`
- **ECS** — `Entity.addComponent()` / `getComponent()`; per-frame `component.update()`
- **EventBus** — typed events (Damage/Heal/Death/Move/Arrival/Trigger); `globalBus` singleton
- **Components** — `HealthComponent`, `MovementComponent`, `TimerComponent`, `TweenComponent` (8 easings, yoyo, repeat), `TweenSequence` (chained tweens), `TriggerZoneComponent`
- **Props** — `Crystal`, `Boulder`, `Chest`, `Cloud`, `FloatingText`; canvas-drawn, ECS-powered
- **Audio** — `AudioManager`; one-shot SFX, looping BGM with crossfade, spatial distance attenuation, 3-bus volume (master/sfx/bgm)
- **JSON scene loader** — `engine.loadScene(url)`; floor, walls, lights, characters, props, clouds, walkable collision map
- **Scene validator** — `validateSceneJson()`; runtime JSON schema check + ECS component assertions
- **Scene editor** — visual editor (`editor.ts`); undo/redo, collision paint, object list, JSON export/copy
- **Sprite editor** — sprite sheet frame inspector and animation clip builder (`sprite-editor.ts`); 8-direction preview; JSON export
- **Lib build** — `npm run build:lib` → ESM + CJS dual output; `luxiso.d.ts` rollup

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
npm run build:lib  # library bundle → dist/luxiso.mjs + luxiso.cjs + types
npx vitest --run   # run 157 unit tests (requires Node ≥ 22)
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
    scene.spawnFloatingText({ x: 3, y: 4, z: 20, text: 'DESTROYED', color: '#ff4444' });
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
  (ts) => { /* preFrame: background glow */ },
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
    { "id": "c1", "x": 2, "y": 1, "altitude": 6, "speed": 0.4, "angle": 0.3, "scale": 1.2, "seed": 0.7 }
  ]
}
```

## Architecture

```
Engine                     — canvas setup, RAF loop, JSON loader, pre/postFrame
└── Scene                  — object + light container; topoSort; frustum cull; LightmapCache; IsoView
    ├── Camera             — follow / pan / zoom / applyTransform (frame-rate-independent lerp)
    ├── LightmapCache      — OffscreenCanvas floor blit; auto-invalidate on light/camera delta
    ├── Floor              — tile grid; tileImage; per-tile color cache; OmniLight + DirectionalLight RGB mix
    ├── Wall               — parallelogram faces; door/window openings; face-normal lighting
    ├── ShadowCaster       — AABB silhouette → z=0 projection; radial gradient fill
    ├── Character          — sphere/sprite entity; moveTo / pathTo; AnimationController
    ├── Entity (ECS)       — addComponent / getComponent; per-frame component.update()
    │   ├── Crystal        — low-poly hexagonal crystal; HealthComponent
    │   ├── Boulder        — low-poly 7-sided rock; crack lines; HealthComponent
    │   ├── Chest          — isometric box; animated lid; HealthComponent
    │   ├── Cloud          — deterministic LCG low-poly puffs; drift + wrap; ground shadow
    │   └── FloatingText   — floating damage/status text; auto-expires; depth-sorted
    ├── ParticleSystem     — IsoObject; procedural + sprite particles; depth-sorted; 9 presets
    └── LightManager
        ├── OmniLight      — illuminateAt(); RGB channel accumulation
        └── DirectionalLight — angle/elevation; incidentDirection; face-normal dot
```

## Project Structure

```
src/
├── index.ts                     # Public API barrel — 80+ exports
├── main.ts                      # Interactive demo
├── core/
│   ├── AssetLoader.ts           # Promise image cache; loadImage / loadAll / get
│   ├── Camera.ts                # follow / pan / zoom / applyTransform / clamp; frame-rate-independent lerp
│   ├── ClickMover.ts            # Click-to-move + keyboard movement; animated marker; collision-aware
│   ├── DebugRenderer.ts         # Overlay: collision grid, AABB, light radii, triggers, FPS
│   ├── Engine.ts                # RAF loop; JSON loader (floor/walls/lights/chars/props/clouds); pre/postFrame
│   ├── HudLayer.ts              # Canvas-space UI: labels, bars, buttons, panels
│   ├── InputMap.ts              # Action-binding layer over InputManager; axis(); toJSON/fromJSON
│   ├── LightmapCache.ts         # OffscreenCanvas floor cache; isDirty snapshot; blit()
│   ├── Minimap.ts               # OffscreenCanvas HUD overlay; walkable grid + object dots
│   ├── ObjectPool.ts            # Generic object pool; acquire/release/releaseAll; prewarm
│   ├── Scene.ts                 # Object + light management; topoSort; frustum cull; IsoView; transitionView()
│   ├── SceneManager.ts          # Named scene stack; push/pop/replace/goto; lifecycle hooks
│   ├── SceneTransition.ts       # Canvas transition effects: fade, slide, circle-wipe; playIn/playOut/between
│   └── Validator.ts             # validateSceneJson(); validateComponents(); requireComponent()
├── elements/
│   ├── IsoObject.ts             # Abstract base: id, position (IsoVec3), aabb, draw, update
│   ├── Floor.ts                 # Tile grid + tileImage + per-tile color cache + multi-light RGB illumination
│   ├── Wall.ts                  # Parallelogram faces; openings; face-normal dir lighting
│   ├── Character.ts             # Sphere/sprite entity; moveTo / pathTo; AnimationController
│   └── props/
│       ├── Crystal.ts           # Low-poly crystal; Entity + HealthComponent
│       ├── Boulder.ts           # Low-poly rock; Entity + HealthComponent
│       ├── Chest.ts             # Isometric chest; animated lid; Entity + HealthComponent
│       ├── Cloud.ts             # Deterministic LCG low-poly cloud; drift + wrap; ground shadow
│       └── FloatingText.ts      # Floating text; auto-expires; depth-sorted; Scene.spawnFloatingText()
├── animation/
│   ├── SpriteSheet.ts           # AnimationClip (frames, fps, loop); AssetLoader preload
│   ├── AnimationController.ts   # State machine; 8-direction; idle↔walk; dt-based
│   ├── DirectionalAnimator.ts   # action_DIR clip naming; fallback chain; playOnce(); buildSheet()
│   └── ParticleSystem.ts        # IsoObject; circle/square + sprite particles; blend modes; 9 presets
├── physics/
│   ├── TileCollider.ts          # Walkable grid; canOccupy(); resolveMove(); sweepMove() fast-path
│   └── Pathfinder.ts            # A* 8-dir; Bresenham LoS string-pull; min-heap; LRU result cache
├── ecs/
│   ├── Component.ts             # Interface: componentType, onAttach, onDetach, update
│   ├── Entity.ts                # IsoObject + component Map; addComponent / getComponent
│   ├── EventBus.ts              # Typed events; on/off/emit; globalBus singleton
│   └── components/
│       ├── HealthComponent.ts   # hp / maxHp / fraction / isDead; takeDamage / heal; callbacks
│       ├── MovementComponent.ts # ECS moveTo / pathTo; TileCollider; EventBus arrival/move
│       ├── TimerComponent.ts    # delay / repeat / pause / restart
│       ├── TweenComponent.ts    # 8 easings; yoyo; repeat; delay; onComplete
│       ├── TweenSequence.ts     # Chain multiple TweenComponent steps; repeat; onComplete
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
│   ├── IsoProjection.ts         # project() / unproject() / depthKey() / drawIsoCube(); IsoVec3 / IsoView
│   ├── depthSort.ts             # AABB (with maxZ); topoSort<T>() — 3-D Kahn + containment detection
│   └── color.ts                 # hexToRgb / hexToRgba / shiftColor / blendColor / lerpColor
└── editor/
    ├── EditorState.ts           # Central store; undo/redo command stack (100 deep); walkable grid; JSON I/O
    ├── EditorRenderer.ts        # Engine-backed live preview; world↔screen coordinate mapping
    ├── editor.ts                # Full editor UI; toolbar; object list; property panel; keyboard shortcuts
    └── sprite-editor.ts         # Sprite sheet frame inspector and animation clip builder

examples/
├── index.html                   # Examples + tools gallery
├── 01-minimal-scene/            # Floor, walls, single OmniLight
├── 02-character-movement/       # WASD + collision + camera follow
├── 03-combat-system/            # HealthComponent, damage events, particles
├── 04-hud-debug-inputmap/       # HudLayer, DebugRenderer, InputMap
├── 05-whisper-plains/           # Full demo: day/night, multi-scene, animals, portals
│   ├── scenes/                  # PlainsScene, LakeScene, DeepSeaScene
│   ├── entities/                # CubeHero, Portal, Animals, AquaticLife
│   └── environment/             # LowPolyTree, DayNightCycle
├── 06-voxel-lake/               # Voxel wave simulation, seabed decor
├── 07-desert-ruins/             # Procedural terrain, interactive props, portals
└── 08-volcano/                  # Lava terrain, particle FX, burn damage, click-to-move

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
scene.getAll<T>(ctor): T[]                      // get all objects of a given class
scene.allObjects: readonly IsoObject[]          // read-only snapshot of all objects
scene.spawnFloatingText(opts): FloatingText     // convenience: create + add FloatingText
scene.omniLights: OmniLight[]
scene.dirLights: DirectionalLight[]
scene.getLightById(id: string): BaseLight | undefined
scene.camera: Camera
scene.collider: TileCollider | null
scene.view: IsoView                             // { rotation: degrees, elevation: 0.2–1.0 }
scene.transitionView(to: Partial<IsoView>, duration?): void  // smooth animated view change
scene.ambientColor: string                      // CSS hex; drives day/night tint
scene.ambientIntensity: number                  // 0–1
scene.dynamicLighting: boolean                  // true = re-bake floor lightmap every frame
scene.toJSON(): Record<string, unknown>         // full round-trip serialization
```

### `Camera`

```ts
new Camera(opts?: CameraOptions)
camera.follow(target: IsoObject): void
camera.unfollow(): void
camera.pan(dx: number, dy: number): void
camera.zoom: number                            // 0.25–4, default 1
camera.lerpFactor: number                      // 0–1; frame-rate-independent convergence
camera.setBounds(bounds: CameraBounds): void
camera.applyTransform(ctx, canvasW, canvasH, tileW, tileH, originX, originY): void
camera.restoreTransform(ctx): void
camera.worldToScreen(wx, wy, wz, tileW, tileH, originX, originY): { sx, sy }
camera.screenToWorld(cx, cy, canvasW, canvasH, tileW, tileH, originX, originY): { x, y }
```

### `ClickMover`

```ts
new ClickMover({ cols, rows, speed, radius?, collider? })
mover.update(dt, input, map, camera, tileW, tileH, originX, originY, canvasW, canvasH, entityX, entityY): void
mover.velX: number; mover.velY: number         // per-frame displacement (add to position)
mover.reset(): void                            // clear target + velocity (call on scene enter)
mover.drawMarker(ctx, camera, tileW, tileH, originX, originY, ts): void  // animated click ring
```

### `Character`

```ts
new Character({ id, x, y, z?, radius?, color?, spriteSheet?, speed? })
character.moveTo(x, y, z?): void               // direct smooth movement, no pathfinding
character.pathTo(tx, ty, collider, tz?): boolean // A* — returns false if unreachable
character.followPath(waypoints[], z?): void
character.stopMoving(): void
character.isMoving: boolean
character.remainingWaypoints: readonly IsoVec2[]
character.setSpriteSheet(sheet, initialClip?): void
character.playAnimation(name: string): void
```

### `Entity` (ECS base)

```ts
entity.addComponent<T extends Component>(c: T): T
entity.getComponent<T>(type: string): T | undefined
entity.hasComponent(type: string): boolean
entity.removeComponent(type: string): void
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
mv.pathTo(x, y, z?): boolean     // A* via attached collider; false = unreachable
mv.followPath(waypoints, z?): void
mv.stopMoving(): void
mv.isMoving: boolean
// Emits EventBus: 'move' each frame, 'arrival' on destination reached
```

### `TweenComponent`

```ts
new TweenComponent({
  targets: [{ prop: 'x'|'y'|'z', from, to }],
  duration,               // seconds
  easing?: Easing.easeOut,
  yoyo?: true,
  repeat?: -1,            // -1 = infinite
  delay?: 0.5,
  onComplete?: () => {},
})
// Easing: linear easeIn easeOut easeInOut easeInCubic easeOutCubic bounce elastic
tween.pause(); tween.resume(); tween.restart()
tween.progress: number   // 0–1
```

### `TweenSequence`

```ts
new TweenSequence(steps: TweenOptions[], { repeat?, onComplete? })
// Each step plays after the previous completes.
// repeat: -1 = infinite loop of the full sequence.
entity.addComponent(new TweenSequence([
  { targets: [{ prop: 'z', from: 0, to: 48 }], duration: 0.3, easing: Easing.easeOut },
  { targets: [{ prop: 'z', from: 48, to: 0 }], duration: 0.5, easing: Easing.bounce },
], { repeat: -1 }));
```

### `TimerComponent`

```ts
new TimerComponent({ duration, repeat?, onTick?, onComplete?, autoStart? })
// duration: seconds; repeat: loop; onTick: fires each cycle; onComplete: fires when non-repeating timer finishes
timer.pause(): void; timer.resume(): void; timer.restart(): void; timer.start(): void; timer.reset(): void
timer.elapsed: number   // seconds elapsed in current cycle
timer.fraction: number  // 0–1 progress through current cycle
timer.isDone: boolean; timer.isRunning: boolean
```

### `TriggerZoneComponent`

```ts
new TriggerZoneComponent({ radius?, onEnter?, onExit?, bus?, targets? })
trigger.radius: number
trigger.targets: IsoObject[]
trigger.contains(id: string): boolean
trigger.insideIds: ReadonlySet<string>
trigger.setOnEnter(cb: (id: string) => void): void   // update callback after construction
trigger.setOnExit(cb: (id: string) => void): void
// Emits EventBus: 'triggerEnter' / 'triggerExit'
```

### `ParticleSystem`

```ts
new ParticleSystem(id, x, y, z?)
ps.addEmitter(config: EmitterConfig): this
ps.burst(count?: number): this
ps.autoRemove: boolean          // default true — removes self when all particles die
ps.onExhausted: (() => void) | null

// Presets:
ParticleSystem.presets.sparkBurst({ color?, count? })
ParticleSystem.presets.emberTrail({ color? })
ParticleSystem.presets.dustPuff({ color? })
ParticleSystem.presets.crystalShatter({ color? })
ParticleSystem.presets.coinSpill({ count? })
ParticleSystem.presets.spriteExplosion(sheet, { clip?, count? })
ParticleSystem.presets.ambientDrift({ color?, count?, speed?, size?, alpha?, blend?, shape? })
ParticleSystem.presets.smokePlume({ color?, count? })
ParticleSystem.presets.lavaSparks({ color?, count? })
```

### `Pathfinder`

```ts
Pathfinder.find(collider, start: IsoVec2, goal: IsoVec2): IsoVec2[] | null
// Results are LRU-cached (capacity 64). Repeated calls with same inputs are O(1).

Pathfinder.invalidateCache(collider?): void
// Call after modifying walkability at runtime (e.g. opening a door).
// Omit collider to flush all cached results.
```

### `Floor`

```ts
new Floor({ id, cols, rows, color?, altColor?, tileImage?, altTileImage? })
floor.invalidateCache(): void   // force re-bake on next draw (after changing color/altColor)
await floor.preload()           // preload tile textures before engine.start()
```

### `IsoProjection`

```ts
project(x, y, z, tileW, tileH): { sx, sy }
unproject(sx, sy, tileW, tileH): { x, y }      // z=0 plane
depthKey(x, y, z): number
drawIsoCube(ctx, originX, originY, tileW, tileH, wx, wy, wz, w, d, h, topColor, leftColor, rightColor): void
topoSort<T extends Sortable>(objects: T[]): T[]
```

### `AABB`

```ts
interface AABB {
  minX: number; minY: number; maxX: number; maxY: number;
  baseZ: number;    // bottom Z of the bounding volume
  maxZ?: number;    // top Z; omit for flat/ground objects (treated as infinite upward extent)
}
// Setting maxZ enables vertical separation: objects that don't share Z space
// are sorted by baseZ rather than XY heuristic, preventing terrain from
// occluding elevated characters.
```

### `AudioManager`

```ts
const audio = new AudioManager()
audio.resume()
audio.masterVolume = 0.8
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

DirectionalAnimator.buildSheet(url, frameW, frameH, actions, scale)
DirectionalAnimator.auditSheet(sheet, action)   // { present, missing }
```

### `HudLayer`

```ts
const hud = new HudLayer()
hud.addLabel({ id, x, y, text?, color?, fontSize?, font?, visible?, shadow? }): HudLabel
hud.addBar({ id, x, y, w, h, value?, color?, bgColor?, borderColor?, label?, labelColor?, fontSize? }): HudBar
hud.addButton({ id, x, y, w, h, label?, color?, bgColor?, hoverColor?, fontSize?, onClick? }): HudButton
hud.addPanel({ id, x, y, w, h, bgColor?, borderColor?, radius? }): HudPanel
hud.get<T>(id: string): T | undefined
hud.remove(id: string): void
hud.clear(): void
hud.draw(ctx, canvasW?, canvasH?): void       // call in postFrame; resets transform to screen space
hud.handleClick(x, y): boolean               // returns true if a button was hit
hud.handleMove(x, y): void                   // update button hover states

// Mutate elements directly after creation:
const bar = hud.addBar({ id: 'hp', ... });
bar.value = player.hp / player.maxHp;        // update fill fraction each frame
const label = hud.addLabel({ id: 'score', ... });
label.text = `Score: ${score}`;
label.visible = false;                       // hide/show
```

### `Minimap`

```ts
new Minimap(scene, { cols, rows, style? })
minimap.draw(ctx, x, y, w, h)   // call in postFrame
minimap.setScene(scene)
minimap.alpha: number            // 0–1 transparency
minimap.isHit(px, py, mx, my, mw, mh): boolean  // hit-test the minimap rect

// Style options (all optional):
{
  bg: '#1a1a2e', walkable: '#2a3a4a', blocked: '#0a0a14',
  grid: 'rgba(255,255,255,0.06)',
  playerColor: '#5590cc', objectColor: '#cc8855',
  border: 'rgba(255,255,255,0.25)', radius: 6,
}
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
| Isometric math (project / unproject / depthKey / drawIsoCube) | |
| Topological depth sort — 3-D AABB + containment detection + maxZ | |
| Floor: OmniLight + DirectionalLight RGB illumination | |
| Floor: tileImage texture + AssetLoader | |
| Floor: per-tile color cache (dirty-flag, skips recomputation on static scenes) | |
| Wall: parallelogram faces + openings + directional lighting | |
| OmniLight: RGB point light with illuminateAt() | |
| DirectionalLight: face-normal dot product | |
| LightmapCache: OffscreenCanvas floor blit + auto-invalidate | |
| ShadowCaster: AABB → z=0 silhouette + radial gradient | |
| IsoView: scene rotation + elevation + transitionView() | |
| Camera: follow / pan / zoom — fully wired into Scene.draw() | |
| Camera: frame-rate-independent lerp | |
| ClickMover: click-to-move + keyboard + animated marker | |
| SpriteSheet + AnimationController (8-direction, idle/walk) | |
| DirectionalAnimator: action_DIR clips + fallback + playOnce | |
| ParticleSystem: procedural + sprite; 9 presets; depth-sorted | |
| TileCollider: walkable grid + AABB slide-and-clamp + sweepMove | |
| A* Pathfinder: 8-directional, corner-cut prevention, Bresenham LoS string-pull, min-heap O(log n) | |
| Pathfinder: LRU result cache + invalidateCache() | |
| ECS: Entity + Component + EventBus (typed events) | |
| HealthComponent / MovementComponent / TimerComponent | |
| TweenComponent: 8 easings, yoyo, repeat, delay | |
| TweenSequence: chained tween steps with repeat | |
| TriggerZoneComponent: circle enter/exit + EventBus | |
| Props: Crystal, Boulder, Chest, Cloud, FloatingText | |
| Scene.spawnFloatingText() convenience helper | |
| AudioManager: SFX + BGM crossfade + spatial volume | |
| JSON scene loader: floor/walls/lights/chars/props/clouds | |
| Scene.toJSON(): full round-trip serialization | |
| Validator: scene JSON + ECS component assertions | |
| Scene editor: object list, undo/redo, collision paint, JSON export/copy | |
| Sprite editor: frame inspector, clip builder, 8-direction preview, JSON export | |
| Minimap: OffscreenCanvas HUD overlay, walkable grid + object dots | |
| Precise AABB frustum culling | |
| Lib build: ESM + CJS dual output + .d.ts (npm run build:lib) | |
| Unit tests: 157 tests across 20 files (Vitest 4, Node ≥ 22) | |
| Examples: 8 progressive demos + tools gallery | |

## License

MIT
