# WebGL Next Roadmap

Each phase must leave `main` releasable. Canvas2D is the rollback path until the
final cutover gate.

## Phase 0 - Baseline and Contracts

- Capture deterministic reference scenes and screenshots.
- Record CPU frame time, draw cost, allocations, and memory for Canvas2D.
- Define `RenderBackend`, `RenderSnapshot`, primitive records, resource handles,
  and renderer selection in an experimental package.
- Freeze the new world-Z convention and legacy conversion rules.

Exit: contracts compile without WebGL implementation; reference fixtures and
benchmark commands are reproducible.

## Phase 1 - Device and Resource Core

- Create WebGL2 context, capability checks, state cache, shader library, buffer
  arenas, texture registry, resize handling, and context loss/restore.
- Implement clear/composite smoke pass and GPU/CPU frame diagnostics.
- Add a graceful unsupported-browser message and Canvas fallback.

Exit: context restore works in an automated harness; no leaked GPU resources
after repeated create/dispose cycles.

## Phase 2 - Geometry Parity

- Extract Floor, Wall, Character, Crystal, Boulder, Chest, and Cloud records.
- Implement floor chunks, quad/wall batches, atlas sampling, camera transforms,
  frustum culling, and order-preserving batch segments.
- Run Canvas2D/WebGL side-by-side screenshots for deterministic scenes.

Exit: unlit scenes meet visual-diff and performance gates with zero missing
built-in object types.

## Phase 3 - Lighting and Shadows

- Implement ambient, directional, omni, global light, falloff, shadow mask,
  light accumulation, and composite passes.
- Cache static shadow geometry and invalidate by revisions.
- Match current view rotation/elevation and light halo behavior.

Exit: lighting fixtures pass tolerance at all supported camera views; moving a
caster/light cannot leave stale shadows.

## Phase 4 - Effects and Editor

- Add particles, floating text bridge, blend modes, sprites, animation frame
  selection, minimap source data, and debug overlays.
- Add ID-buffer picking, editor backend toggle, and selection parity tests.
- Keep editor panels and accessibility-sensitive controls in DOM.

Exit: the demo, editor, and every example load with WebGL2; editor place/select/
delete/import/export flows pass.

## Phase 5 - Preview Release

- Publish `0.2.0-webgl.0` with Canvas2D default and opt-in WebGL2.
- Run browser matrix, long-session memory test, resize/DPR test, context-loss
  test, and package declaration checks.
- Document custom object migration from `draw(ctx)` to render primitives.

Exit: no severity-1 parity defects; fallback telemetry and diagnostics are
actionable.

## Phase 6 - Default Cutover

- Make WebGL2 the default after two preview iterations meet acceptance gates.
- Retain `renderer: 'canvas2d'` for compatibility.
- Deprecate direct Canvas draw extensions with a versioned removal plan.

Exit: all acceptance gates pass on release CI and representative integrated
projects.

## Work Order

1. Contracts and deterministic fixtures.
2. Device/resource lifecycle before object shaders.
3. Unlit geometry before lighting.
4. Built-in parity before custom extension APIs.
5. Editor picking after stable object IDs.
6. Optimization only after pass-level profiling.

Do not start with a monolithic shader, a renderer-owned scene graph, or a full
asset conversion. Those approaches erase rollback points and mix migration risk.
