# WebGL Next Architecture

## Ownership Rules

1. Simulation owns authoritative state: entities, components, timers, health,
   collision, pathfinding, progression, and serializable values.
2. The renderer owns GPU resources, render passes, animation presentation,
   camera matrices, picking buffers, and diagnostics.
3. `RenderSnapshot` is the only simulation-to-render bridge. Renderer objects
   never become save data or gameplay truth.
4. Input remains action-based. DOM/editor controls and playfield pointer events
   map to actions before changing simulation state.
5. Text-heavy HUD, menus, settings, and accessible controls remain DOM overlays.

## Module Shape

```text
webgl-next/src/
  contracts/
    RenderBackend.ts
    RenderSnapshot.ts
    RenderPrimitive.ts
    ResourceHandle.ts
  extraction/
    SceneExtractor.ts
    LegacyDrawAdapter.ts
    VisibilityIndex.ts
  device/
    WebGLDevice.ts
    ContextLifecycle.ts
    Capabilities.ts
    StateCache.ts
  resources/
    ResourceRegistry.ts
    TextureAtlas.ts
    BufferArena.ts
    ShaderLibrary.ts
    AssetManifest.ts
  passes/
    FloorPass.ts
    OpaquePass.ts
    ShadowPass.ts
    LightPass.ts
    CompositePass.ts
    TransparentPass.ts
    PickingPass.ts
    DebugPass.ts
  batching/
    TileBatch.ts
    QuadBatch.ts
    WallBatch.ts
    ParticleBatch.ts
  camera/
    IsoCamera.ts
    CameraUniforms.ts
  diagnostics/
    FrameProfiler.ts
    GpuTimer.ts
    DebugOverlayModel.ts
  testing/
    DeterministicScenes.ts
    PixelDiff.ts
    ContextLossHarness.ts
```

The eventual production code may live under `src/render/`; this directory keeps
the preview isolated until its contracts are proven.

## Public Boundary

```ts
interface RenderBackend {
  readonly kind: 'canvas2d' | 'webgl2';
  resize(width: number, height: number, dpr: number): void;
  render(snapshot: RenderSnapshot): RenderStats;
  pick(x: number, y: number): PickResult | null;
  dispose(): void;
}

interface RenderSnapshot {
  frame: number;
  camera: CameraSnapshot;
  environment: EnvironmentSnapshot;
  floors: readonly FloorRecord[];
  opaque: readonly OpaqueRecord[];
  transparent: readonly TransparentRecord[];
  lights: readonly LightRecord[];
}
```

Snapshots are reused double buffers. Extraction writes numeric structs and
stable resource handles; it does not allocate renderer-specific objects per
entity per frame.

## Coordinate Convention

- X and Y: world tile units.
- Z: world vertical units, where one Z unit equals `tileH / 2` projected pixels
  at zoom 1 and default elevation.
- Projection scale belongs to the camera/view, not individual objects.
- GPU uses camera-relative coordinates to reduce precision loss on large maps.
- Legacy `position.z` pixel values enter through `LegacyDrawAdapter` and are
  converted once with `Z_UNITS_PER_PX`.
- New WebGL APIs never accept ambiguous pixel-height Z values.

This is the migration point for removing the dual-Z public contract without
changing serialized legacy scenes immediately.

## Render Graph

```text
Scene extraction + frustum cull
              |
      depth constraints / buckets
              |
  floor pass -> shadow mask ----+
              light accumulation |
                    |             |
opaque batches -> composite <-----+
                    |
       transparent / particles
                    |
          picking + debug overlays
```

### Pass Policy

- Floor: instanced diamonds or chunk meshes, atlas-indexed materials.
- Opaque: depth-sorted batches. Preserve LuxIso graph ordering where overlapping
  AABBs require it; batch only within compatible order segments.
- Shadows: project caster geometry into a mask render target. Cache static
  caster geometry and invalidate by transform/light/view revision.
- Lights: pack directional and omni lights into uniforms initially; move to a
  texture buffer only when limits require it.
- Composite: combine albedo, ambient, light accumulation, and shadow mask.
- Transparent: particles, halos, clouds, and floating effects after opaque
  composition with explicit blend modes.
- Picking: render stable 24-bit object IDs into a small on-demand framebuffer;
  editor selection never depends on color-visible pixels.

## Resource Lifecycle

- `ResourceRegistry` owns every texture, buffer, program, framebuffer, and VAO.
- Handles are stable keys; filenames are not public API.
- Reference counts are scene/manifest based, with explicit `dispose()`.
- Context loss stops submission but not simulation. Context restore recreates
  resources from manifests and CPU-side descriptors.
- Resize recreates size-dependent targets only.
- Shader compilation failures include source key and mapped line diagnostics.

## Assets

```text
assets/manifest.json
  environment/*
  characters/*
  props/*
  fx/*
  ui/*
  audio/*
```

- 2D content uses atlas keys with PNG/WebP sources and metadata.
- Color space, premultiplication, filtering, wrap mode, and mip policy are
  declared in the manifest.
- Optional future 3D props use GLB/glTF 2.0 with consistent pivots, meters-to-
  world-unit scale, compressed textures, collision proxies, and LOD metadata.
- Raw authoring assets are never loaded directly by runtime code.

## Input, UI, Save, and Debug

- Existing `InputMap` remains the physical-input-to-action boundary.
- WebGL playfield receives pointer coordinates; picking resolves object IDs;
  game/editor commands remain outside renderer callbacks.
- Save data continues to use Scene/ECS serialization, never GPU handles.
- Debug UI reads `RenderStats` in DOM or the existing HUD layer.
- Required probes: CPU extraction, graph sort, upload bytes, draw calls, batch
  breaks, GPU pass timings, texture memory, and context-loss count.

## Compatibility Strategy

- Add renderer selection to Engine without changing Scene ownership.
- Canvas2D and WebGL2 consume the same extracted snapshot during parity work.
- Built-in objects implement extraction first; custom `draw(ctx)` objects use a
  compatibility surface or remain Canvas-only with a clear diagnostic.
- Scene JSON remains renderer-neutral.
- Editor preview can switch backends at runtime for A/B comparison.
