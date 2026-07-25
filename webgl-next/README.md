# LuxIso WebGL Next

`webgl-next/` defines the `0.2.0-webgl` preview line. It is a renderer migration,
not a rewrite of gameplay, ECS, physics, pathfinding, input, or scene data.

## Decision

Use a focused WebGL2 renderer written in TypeScript. LuxIso is renderer-first:
its isometric occlusion graph, multi-pass lighting, shadow projection, editor
picking, and batching rules are the product. A general 2D or 3D engine would
hide the exact boundaries this migration needs to control.

Canvas2D remains available as a compatibility and visual-reference backend
during the preview cycle.

```text
Scene / ECS / physics / animation / input / serialization
                         |
                  RenderSnapshot
                    /         \
          Canvas2DRenderer   WebGLRenderer
             reference       new default after parity
```

## Goals

- Preserve the existing Scene, Entity, Component, System, EventBus, collider,
  pathfinding, and JSON contracts wherever possible.
- Replace immediate `draw(ctx)` calls with renderer-neutral render records.
- Batch floor tiles, walls, sprites, props, particles, and light data on GPU.
- Move lightmap, shadow, composition, and picking into explicit render passes.
- Resolve the legacy dual-Z convention at the new renderer boundary.
- Keep menus, settings, and text-heavy editor UI in DOM.
- Ship a Canvas2D fallback until WebGL parity and browser gates pass.

## Non-goals

- Converting LuxIso into a fully 3D engine.
- Moving simulation state into a WebGL scene graph.
- Replacing TileCollider, Pathfinder, ECS, or SceneManager.
- Shipping editor-authored GLB content in the first preview.
- Adding WebGPU before the WebGL2 resource and render contracts stabilize.

## Documents

- [ARCHITECTURE.md](./ARCHITECTURE.md): ownership, modules, render graph, data
  contracts, coordinates, assets, and lifecycle.
- [ROADMAP.md](./ROADMAP.md): incremental migration phases and rollback points.
- [ACCEPTANCE.md](./ACCEPTANCE.md): visual, performance, browser, API, and release
  gates.

## Implemented Preview Slice

The current preview implements the first runnable Phase 0-3 slice:

- renderer-neutral `RenderSnapshot` contracts and a reusable numeric geometry arena;
- extraction for Floor, Wall openings, Character, Crystal, Boulder, Chest, and Cloud;
- canonical world-Z conversion at the extraction boundary;
- WebGL2 resource lifecycle, dynamic batching, GPU ambient/directional/omni lighting;
- projected blob shadows, transparent cloud/light layers, and 24-bit GPU ID picking;
- context loss/restore handling, capability reporting, and live render diagnostics;
- WebGL, side-by-side comparison, and Canvas2D fallback modes at `/webgl-next/`.

Particles, sprite textures/atlases, editor selection overlays, and advanced shadow
passes remain on the later roadmap phases. Unsupported custom objects render as
visible diagnostics and are reported in the preview metrics.

Run the preview with `npm run dev`, then open `/webgl-next/`.

## Versioning

- Preview package/version: `0.2.0-webgl.x`.
- Canvas2D remains the default in early previews.
- WebGL2 becomes default only after the parity gate.
- Breaking removal of the legacy Canvas `draw()` extension API is reserved for
  a later major release; preview builds provide an adapter and migration warning.
