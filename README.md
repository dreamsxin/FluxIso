# LuxIso

A 2D isometric rendering engine built with **TypeScript** and **Canvas 2D**, featuring real-time dynamic lighting, occlusion sorting, a declarative JSON scene API, and a lightweight ECS component system.

## Features

- **Isometric coordinate system** — Internal (X, Y, Z) space projected to screen via `sx = (x−y)·tileW/2`, `sy = (x+y)·tileH/2 − z`
- **Topological depth sorting** — Per-frame AABB-based Kahn sort for correct occlusion, no Z-fighting
- **Dynamic lighting** — OmniLight (RGB point light, distance falloff) + DirectionalLight (face-normal dot product, per-channel color mix)
- **Tile materials** — Procedural color or image texture per tile; lighting multiply + screen blend overlay
- **Wall openings** — Doors and windows cut into wall faces with isometric parallelogram clipping
- **Sprite animation** — `SpriteSheet` + `AnimationController`; idle/walk state machine; 8-direction support
- **Tile collision** — `TileCollider` walkable grid; AABB slide-and-clamp resolution; `moveTo()` path collision
- **ECS components** — `Entity.addComponent()` / `getComponent()`; built-in `HealthComponent` (hp/damage/heal/callbacks)
- **Low Poly props** — `Crystal`, `Boulder`, `Chest` — canvas-drawn, light-shaded, ECS-powered with health bars
- **Declarative scenes** — JSON scene file; `engine.loadScene(url)` instantiates floor, walls, lights, characters, collision layer
- **Camera system** — Follow (lerp), pan, zoom, world-bounds clamping; `worldToScreen` / `screenToWorld` zoom-aware helpers
- **Lightmap baking** — `LightmapCache` on `OffscreenCanvas`; floor re-baked only when lights change
- **Shadow casting** — `ShadowCaster` projects object AABBs from OmniLight onto ground plane; distance-attenuated alpha
- **Audio** — `AudioManager` (Web Audio API); one-shot SFX, looping BGM, spatial distance attenuation; master/sfx/bgm volume
- **TypeScript-first** — Strict mode, fully typed public API, ES module tree-shakeable exports

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5 (strict) |
| Renderer | Canvas 2D |
| Build | Vite 5 |
| Runtime | ES2022 (top-level await) |

## Installation

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

## Demo Controls

The interactive demo (`src/main.ts`) loads `public/scenes/level1.json`:

| Interaction | Action |
|---|---|
| **Drag ball** | Reposition character on the isometric grid |
| **Click floor** | Move character to clicked tile (smooth `moveTo` with collision) |
| **Click Crystal / Boulder / Chest** | Deal 15 HP damage; health bar updates live |
| **Arrow keys** | Nudge character ±0.5 world units |
| **M key** | Toggle light Orbit ↔ Manual mode |
| **Drag light** | Reposition light (Manual mode only) |
| **Ball elevation** slider | Adjust character hover height (0–160 px) |
| **Light elevation** slider | Adjust light height (20–300 px) |
| **Light intensity** slider | Adjust brightness (0.1–3×) |
| **Light color** picker | Change light color in real-time |
| **Orbit speed** slider | Control auto-orbit speed (disabled in Manual) |

HUD (top-right of canvas): live world coordinates for player and light, plus HP bars for all props.

## Quick Start

```ts
import { Engine, Scene, OmniLight, Character, Crystal, HealthComponent } from './src/index';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const engine = new Engine({ canvas });
engine.originX = canvas.width / 2;
engine.originY = canvas.height / 2;

// Load scene from JSON (floor, walls, lights, collision layer)
const scene = await engine.loadScene('/scenes/level1.json');
engine.setScene(scene);

// Add a Low Poly prop with HealthComponent
const crystal = new Crystal('gem', 3, 4, '#8060e0');
crystal.addComponent(new HealthComponent({
  max: 60,
  onDeath: () => scene.removeById('gem'),
}));
scene.addObject(crystal);

// Retrieve and damage it
const hp = crystal.getComponent<HealthComponent>('health');
hp?.takeDamage(20); // hp.fraction → 0.67, health bar turns yellow

engine.start(
  (ts) => { /* postFrame: overlays, HUD */ },
  (ts) => { /* preFrame: orbit update, background glow */ },
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
      [true, true, false, true, true, true, true, true, true, true],
      "..."
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
    │   └── Chest         — correct iso geometry; animated lid; HealthComponent; inner glow
    ├── ShadowCaster      — AABB projection from OmniLight; distance-attenuated ground shadows
    ├── AudioManager      — Web Audio API; SFX / BGM; spatial attenuation; volume control
    └── LightManager
        ├── OmniLight     — point light; RGB channel accumulation; illuminateAt()
        └── DirectionalLight — face-normal dot product; angle/elevation; incidentDirection
```

### Rendering Pipeline

```
1. preFrame callback   — caller updates orbit, state
2. clearRect           — clear canvas
3. preFrame draw       — background radial glow from OmniLight
4. Scene.update(ts)    — camera + IsoObject.update(ts, collider) → Character moveTo + AnimationController dt
5. topoSort            — AABB overlap → Kahn topological sort each frame
6. Scene.draw()        — Floor → Walls → Characters/Props (sorted); light halos on top
7. postFrame callback  — hint rings, HUD update
```

## Project Structure

```
src/
├── index.ts                    # Public API barrel export
├── main.ts                     # Interactive demo
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
│       └── Chest.ts            # Correct iso geometry; animated lid; inner glow; HealthComponent
├── animation/
│   ├── SpriteSheet.ts          # AnimationClip (frames, fps, loop); AssetLoader preload
│   └── AnimationController.ts  # State machine; 8-direction; idle↔walk auto-switch; dt-based
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
│   ├── BaseLight.ts            # Abstract: color, intensity, illuminate()
│   ├── OmniLight.ts            # Point light; illuminateAt(sx, sy, lsx, lsy)
│   ├── DirectionalLight.ts     # angle/elevation; direction / incidentDirection vectors
│   └── ShadowCaster.ts         # AABB → ground shadow polygons; distance falloff; multiply blend
└── math/
    ├── IsoProjection.ts        # project() / unproject() / depthKey()
    ├── depthSort.ts            # AABB interface; topoSort<T extends Sortable>() — Kahn's algorithm
    └── color.ts                # Shared color utils: hexToRgb / hexToRgba / shiftColor / blendColor / lerpColor

public/
└── scenes/
    └── level1.json             # 10×10 floor with walkable map, 4 walls, OmniLight + DirectionalLight, player
```

## API Reference

### `Engine`

```ts
new Engine({ canvas: HTMLCanvasElement })

engine.originX: number                         // iso origin X in canvas pixels (set after resize)
engine.originY: number                         // iso origin Y in canvas pixels
engine.loadScene(url: string): Promise<Scene>  // fetch + parse JSON; builds floor/walls/lights/collider
engine.buildScene(json: object): Scene         // synchronous, no fetch
engine.setScene(scene: Scene): void
engine.start(postFrame?, preFrame?): void      // postFrame: after draw; preFrame: before draw
engine.stop(): void
engine.ctx: CanvasRenderingContext2D
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

### `Character`

```ts
new Character({ id, x, y, z?, radius?, color?, spriteSheet?, speed? })

character.position: IsoVec3
character.moveTo(x, y, z?): void       // smooth interpolation with collision resolution
character.stopMoving(): void
character.isMoving: boolean
character.setSpriteSheet(sheet, initialClip?): void
character.playAnimation(name: string): void
```

### `Entity` (ECS base)

```ts
// Extend Entity instead of IsoObject for component-based objects
class MyProp extends Entity {
  get aabb(): AABB { ... }
  draw(dc: DrawContext): void { ... }
}

entity.addComponent<T extends Component>(c: T): T
entity.getComponent<T>(type: string): T | undefined
entity.hasComponent(type: string): boolean
entity.removeComponent(type: string): void
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
new TileCollider(cols, rows, walkable??)
TileCollider.fromArray(cols, rows, data: boolean[][] | boolean[])

collider.isWalkable(col, row): boolean
collider.canOccupy(minX, minY, maxX, maxY): boolean
collider.resolveMove(x, y, dx, dy, r?): { dx, dy }  // slide-and-clamp
collider.setWalkable(col, row, walkable): void
```

### `OmniLight`

```ts
new OmniLight({ x, y, z, color?, intensity?, radius? })

light.position: IsoVec3   // mutable
light.color: string        // CSS hex
light.intensity: number
light.radius: number       // screen-px falloff
light.illuminateAt(sx, sy, lsx, lsy): number
```

### `SpriteSheet` + `AnimationController`

```ts
const sheet = new SpriteSheet({
  url: '/sprites/hero.png',
  scale: 2,
  anchorY: 1,           // bottom-anchored (default)
  clips: [
    { name: 'idle', frames: [{ x:0, y:0, w:32, h:48 }], fps: 4, loop: true },
    { name: 'walk', frames: [...8 frames...],             fps: 12, loop: true },
  ],
});
await sheet.preload();
character.setSpriteSheet(sheet, 'idle');
character.playAnimation('walk');
```

### `IsoProjection`

```ts
project(x, y, z, tileW, tileH): { sx, sy }    // world → screen
unproject(sx, sy, tileW, tileH): { x, y }     // screen → world (z=0 plane)
depthKey(x, y, z): number
topoSort<T extends Sortable>(objects: T[]): T[]
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
// opts: { volume?, rate?, loop?, spatial? }

// Looping BGM with crossfade
await audio.playBgm(url, fadeDuration?): Promise<void>
audio.stopBgm(fadeDuration?): void

// Spatial volume helper (world-space distance attenuation)
AudioManager.spatialVolume({ x, y, listenerX, listenerY, refDistance?, maxDistance? }): number
```

**Spatial SFX example:**
```ts
// Play a hit sound attenuated by distance from the player
const vol = AudioManager.spatialVolume({
  x: crystal.position.x, y: crystal.position.y,
  listenerX: player.position.x, listenerY: player.position.y,
  refDistance: 1.5, maxDistance: 10,
});
audio.playSfx('/sfx/hit.ogg', { volume: vol });
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
| TileCollider: walkable grid + AABB slide-and-clamp | ✅ |
| ECS: Entity + Component + HealthComponent | ✅ |
| Low Poly props: Crystal, Boulder, Chest (correct iso geometry) | ✅ |
| JSON scene loading with walkable map | ✅ |
| Interactive demo: drag, click-to-move, damage, HUD | ✅ |
| Camera pipeline — lerp follow; zoom-aware unproject; `worldToScreen` / `screenToWorld` | ✅ |
| Lightmap baking — `OffscreenCanvas` floor cache; camera + light dirty-check | ✅ |
| Shadow casting — ray-projection from OmniLight; convex hull; distance falloff | ✅ |
| Audio — `AudioManager` (Web Audio API); SFX/BGM; spatial attenuation; hit sounds | ✅ |
| Color utilities — centralized `src/math/color.ts`; removed 8× duplicate helpers | ✅ |

### Pending

| Priority | Item |
|---|---|
| P4 | **Unit tests** — Vitest for math, sort, collider, engine lifecycle |
| P4 | **Library packaging** — Vite lib mode; ESM + CJS dual output; `luxiso.d.ts`; npm publish |
| P4 | **Scene editor UI** — visual placement of walls/lights/objects; JSON export |
| P4 | **Performance** — frustum culling; dirty-flag sort skip; object pooling |

## License

MIT
