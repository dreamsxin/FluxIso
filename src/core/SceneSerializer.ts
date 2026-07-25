import type { Scene } from './Scene';
import { Floor } from '../elements/Floor';
import { Wall } from '../elements/Wall';
import { Character } from '../elements/Character';
import { Cloud } from '../elements/props/Cloud';
import { Crystal } from '../elements/props/Crystal';
import { Boulder } from '../elements/props/Boulder';
import { Chest } from '../elements/props/Chest';
import { Tree } from '../elements/props/Tree';
import { FlowerPatch } from '../elements/props/FlowerPatch';
import { Lantern } from '../elements/props/Lantern';
import { OmniLight } from '../lighting/OmniLight';
import { DirectionalLight } from '../lighting/DirectionalLight';
import { HealthComponent } from '../ecs/components/HealthComponent';

/** Serializes the built-in scene schema consumed by Engine.buildScene(). */
export class SceneSerializer {
  static toJSON(scene: Scene): Record<string, unknown> {
    const objects = scene.allObjects;
    const floors     = objects.filter((o): o is Floor     => o instanceof Floor);
    const walls      = objects.filter((o): o is Wall      => o instanceof Wall);
    const characters = objects.filter((o): o is Character => o instanceof Character);
    const clouds     = objects.filter((o): o is Cloud     => o instanceof Cloud);
    const crystals   = objects.filter((o): o is Crystal   => o instanceof Crystal);
    const boulders   = objects.filter((o): o is Boulder   => o instanceof Boulder);
    const chests     = objects.filter((o): o is Chest     => o instanceof Chest);
    const trees      = objects.filter((o): o is Tree      => o instanceof Tree);
    const flowers    = objects.filter((o): o is FlowerPatch => o instanceof FlowerPatch);
    const lanterns   = objects.filter((o): o is Lantern   => o instanceof Lantern);
    const omniLights = scene.allLights.filter((l): l is OmniLight => l instanceof OmniLight);
    const dirLights = scene.allLights.filter((l): l is DirectionalLight => l instanceof DirectionalLight);

    const floor = floors[0];
    const walkable = scene.collider
      ? Array.from({ length: scene.collider.rows }, (_, row) =>
          Array.from({ length: scene.collider!.cols }, (__, col) => scene.collider!.isWalkable(col, row)),
        )
      : undefined;

    return {
      name: scene.name,
      cols: scene.cols,
      rows: scene.rows,
      tileW: scene.tileW,
      tileH: scene.tileH,
      ambientColor: scene.ambientColor,
      ambientIntensity: scene.ambientIntensity,
      dynamicLighting: scene.dynamicLighting,
      view: { ...scene.view },
      camera: {
        x: scene.camera.x,
        y: scene.camera.y,
        zoom: scene.camera.zoom,
        lerpFactor: scene.camera.lerpFactor,
      },

      ...(floor ? {
        floor: {
          id: floor.id,
          cols: floor.cols,
          rows: floor.rows,
          color: floor.color,
          ...(floor.altColor ? { altColor: floor.altColor } : {}),
          ...(floor.tileImageUrl ? { tileImage: floor.tileImageUrl } : {}),
          ...(floor.altTileImageUrl ? { altTileImage: floor.altTileImageUrl } : {}),
          ...(walkable ? { walkable } : {}),
        },
      } : {}),

      walls: walls.map((wall) => ({
        id: wall.id,
        x: wall.position.x,
        y: wall.position.y,
        endX: wall.endX,
        endY: wall.endY,
        height: wall.wallHeight,
        color: wall.color,
        openings: wall.openings,
      })),

      lights: [
        ...omniLights.map((light) => ({
          type: 'omni' as const,
          ...(light.id ? { id: light.id } : {}),
          enabled: light.enabled,
          x: light.position.x,
          y: light.position.y,
          z: light.position.z,
          color: light.color,
          intensity: light.intensity,
          radius: light.radius,
          isGlobal: light.isGlobal,
          falloff: light.falloff,
        })),
        ...dirLights.map((light) => ({
          type: 'directional' as const,
          ...(light.id ? { id: light.id } : {}),
          enabled: light.enabled,
          angle: SceneSerializer._degrees(light.angle),
          elevation: SceneSerializer._degrees(light.elevation),
          color: light.color,
          intensity: light.intensity,
        })),
      ],

      characters: characters.map((character) => ({
        id: character.id,
        x: character.position.x,
        y: character.position.y,
        z: character.position.z,
        radius: character.radius,
        color: character.color,
      })),

      clouds: clouds.map((cloud) => ({
        id: cloud.id,
        x: cloud.position.x,
        y: cloud.position.y,
        altitude: cloud.altitude,
        speed: cloud.speed,
        angle: cloud.angle,
        scale: cloud.scale,
        seed: cloud.seed,
      })),

      props: [
        ...crystals.map((prop) => ({
          type: 'crystal' as const,
          id: prop.id,
          x: prop.position.x,
          y: prop.position.y,
          color: prop.propColor,
          heightPx: prop.propHeightPx,
          ...SceneSerializer._health(prop),
        })),
        ...boulders.map((prop) => ({
          type: 'boulder' as const,
          id: prop.id,
          x: prop.position.x,
          y: prop.position.y,
          color: prop.propColor,
          radius: prop.propRadius,
          ...SceneSerializer._health(prop),
        })),
        ...chests.map((prop) => ({
          type: 'chest' as const,
          id: prop.id,
          x: prop.position.x,
          y: prop.position.y,
          color: prop.propColor,
          ...SceneSerializer._health(prop),
        })),
        ...trees.map((prop) => ({
          type: 'tree' as const,
          id: prop.id,
          x: prop.position.x,
          y: prop.position.y,
          color: prop.propCanopyColor,
          trunkColor: prop.propTrunkColor,
          heightPx: prop.propHeightPx,
          scale: prop.propScale,
        })),
        ...flowers.map((prop) => ({
          type: 'flowers' as const,
          id: prop.id,
          x: prop.position.x,
          y: prop.position.y,
          color: prop.propColor,
          accentColor: prop.propAccentColor,
          count: prop.propCount,
          seed: prop.propSeed,
        })),
        ...lanterns.map((prop) => ({
          type: 'lantern' as const,
          id: prop.id,
          x: prop.position.x,
          y: prop.position.y,
          color: prop.propGlowColor,
          postColor: prop.propPostColor,
          heightPx: prop.propHeightPx,
        })),
      ],
    };
  }

  private static _health(entity: Crystal | Boulder | Chest): { health?: number } {
    const health = entity.getComponent(HealthComponent);
    return health ? { health: health.maxHp } : {};
  }

  private static _degrees(radians: number): number {
    return Math.round((radians * 180 / Math.PI) * 1_000_000) / 1_000_000;
  }
}
