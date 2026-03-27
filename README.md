# LuxIso

A modern 2D isometric rendering engine built with TypeScript and WebGL, featuring real-time dynamic lighting, occlusion sorting, and a declarative scene API.

## Features

- **Isometric coordinate system** — Internal (X, Y, Z) space with automatic screen projection
- **Real-time depth sorting** — Per-frame Z/Y-axis sorting for correct occlusion
- **Dynamic lighting** — Point lights (OmniLight) and directional lights with shadow casting onto floors and walls
- **Declarative scenes** — Define maps in JSON; load and hot-reload at runtime
- **Camera system** — Follow targets, pan, zoom, and clamp to world bounds
- **TypeScript-first** — Fully typed API with tree-shakeable ES modules

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5 |
| Renderer | WebGL 2 (with Canvas 2D fallback) |
| Build | Vite |
| Package | ESM + CJS dual output |
| Testing | Vitest |

## Installation

```bash
npm install luxiso
```

## Quick Start

```ts
import { Engine, Scene, OmniLight, Character } from 'luxiso';

// 1. Mount the engine to a canvas element
const engine = new Engine({ canvas: document.getElementById('canvas') as HTMLCanvasElement });

// 2. Load a scene from JSON config
const scene = await engine.loadScene('/scenes/level1.json');

// 3. Add a character at isometric coordinates (x, y, z)
const hero = scene.createCharacter({ id: 'player', asset: 'Hero', x: 100, y: 100, z: 0 });

// 4. Add a point light
scene.addLight(new OmniLight({ x: 250, y: 250, z: 150, color: 0xffffff, intensity: 500 }));

// 5. Camera follows the hero
scene.camera.follow(hero);

// 6. Start the render loop
engine.start();
```

## Scene Configuration

Scenes are defined in JSON. The engine parses the file, instantiates all elements, and binds lighting automatically.

```json
{
  "name": "MyFirstScene",
  "width": 800,
  "height": 600,
  "floor": {
    "id": "mainFloor",
    "x": 0, "y": 0,
    "width": 500, "depth": 500,
    "material": "ConcreteFloorMaterial"
  },
  "walls": [
    {
      "id": "northWall",
      "x": 0, "y": 0, "endX": 500, "endY": 0,
      "height": 200,
      "material": "BrickWallMaterial",
      "openings": [
        { "type": "window", "offsetX": 120, "width": 80, "height": 60 }
      ]
    }
  ],
  "lights": [
    { "id": "mainLight", "type": "omni", "x": 250, "y": 250, "z": 150, "color": "#ffffff", "intensity": 500 }
  ]
}
```

## Architecture

```
Engine                         — singleton; manages the render loop and scene lifecycle
└── Scene                      — isometric world container; owns all child elements
    ├── Floor                  — ground plane renderer
    ├── Wall                   — occlusion geometry; supports openings and dynamic shadow receipt
    ├── Object / Character     — scene entities occupying isometric space
    └── LightManager
        ├── OmniLight          — point light; projects shadows onto floors and walls
        └── DirectionalLight   — global directional shadow caster
```

### Rendering Pipeline

```
1. Parse     JSON scene definition → internal element graph
2. Project   Isometric (X, Y, Z) → screen (x, y)  via:  sx = (X - Y) * tileW/2,  sy = (X + Y) * tileH/2 - Z
3. Lighting  Compute light→object angles; generate shadow masks per surface
4. Sort      Topological depth sort by (Z, Y) each frame; update draw order
5. Draw      Submit batched draw calls to WebGL renderer
```

### Key Classes

| Class | Responsibility |
|---|---|
| `Engine` | Canvas setup, RAF loop, scene switching |
| `Scene` | World container, per-frame sort + light update |
| `Floor` | Ground tile rendering |
| `Wall` | Boundary geometry with opening (door/window) support |
| `IsoObject` | Base class for all space-occupying entities |
| `Character` | Extends `IsoObject`; adds animation states and pathfinding |
| `OmniLight` | Point light with real-time shadow projection |
| `Camera` | Viewport control: follow, pan, zoom, bounds clamping |

## API Reference

### `Engine`

```ts
new Engine(options: EngineOptions)

engine.loadScene(url: string): Promise<Scene>
engine.start(): void
engine.stop(): void
engine.setScene(scene: Scene): void
```

### `Scene`

```ts
scene.createCharacter(options: CharacterOptions): Character
scene.addObject(obj: IsoObject): void
scene.addLight(light: BaseLight): void
scene.removeById(id: string): void
scene.camera: Camera
```

### `Character`

```ts
character.moveTo(x: number, y: number, z?: number): void   // pathfinding move
character.playAnimation(name: string): void                 // e.g. 'walk', 'idle'
character.position: IsoVector3                              // { x, y, z }
```

### `OmniLight`

```ts
new OmniLight({ x, y, z, color, intensity, radius })

light.position: IsoVector3
light.intensity: number
light.radius: number
```

## Development

```bash
# Install dependencies
npm install

# Start dev server with hot reload
npm run dev

# Run tests
npm test

# Build for production (ESM + CJS)
npm run build

# Type check
npm run typecheck
```

## Project Structure

```
src/
├── core/
│   ├── Engine.ts
│   ├── Scene.ts
│   └── Camera.ts
├── elements/
│   ├── Floor.ts
│   ├── Wall.ts
│   ├── IsoObject.ts
│   └── Character.ts
├── lighting/
│   ├── OmniLight.ts
│   └── DirectionalLight.ts
├── renderer/
│   ├── WebGLRenderer.ts
│   └── CanvasRenderer.ts
├── math/
│   └── IsoProjection.ts
└── index.ts
```

## License

MIT
