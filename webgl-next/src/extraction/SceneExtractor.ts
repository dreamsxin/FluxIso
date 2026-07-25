import type { Scene } from '../../../src/core/Scene';
import { Character } from '../../../src/elements/Character';
import { Floor } from '../../../src/elements/Floor';
import type { IsoObject } from '../../../src/elements/IsoObject';
import { Wall } from '../../../src/elements/Wall';
import { Boulder } from '../../../src/elements/props/Boulder';
import { Chest } from '../../../src/elements/props/Chest';
import { Cloud } from '../../../src/elements/props/Cloud';
import { Crystal } from '../../../src/elements/props/Crystal';
import { hexToRgb, shiftColor } from '../../../src/math/color';
import { topoSort } from '../../../src/math/depthSort';
import type {
  RenderDirectionalLight,
  RenderOmniLight,
  RenderSnapshot,
  UnsupportedRenderObject,
} from '../contracts/RenderSnapshot';
import { GeometryBuilder, type RenderColor, type RenderPoint } from './GeometryBuilder';
import { legacyPixelsToWorldZ, projectLegacy, projectWorld } from './projection';

export interface ExtractOptions {
  viewportWidth: number;
  viewportHeight: number;
  originX?: number;
  originY?: number;
  clearColor?: string;
}

/**
 * Converts the mutable Canvas scene graph into renderer-owned numeric data.
 * The geometry arena and metadata arrays are reused between frames.
 */
export class SceneExtractor {
  private readonly _builder = new GeometryBuilder();
  private readonly _pickIds = new WeakMap<IsoObject, number>();
  private readonly _pickLookup = new Map<number, string>();
  private readonly _omniLights: RenderOmniLight[] = [];
  private readonly _directionalLights: RenderDirectionalLight[] = [];
  private readonly _unsupported: UnsupportedRenderObject[] = [];
  private _nextPickId = 1;
  private _frame = 0;

  extract(scene: Scene, options: ExtractOptions): RenderSnapshot {
    this._builder.reset();
    this._pickLookup.clear();
    this._omniLights.length = 0;
    this._directionalLights.length = 0;
    this._unsupported.length = 0;

    const floorObjects = scene.allObjects.filter(
      (object): object is Floor => object.visible && object instanceof Floor,
    );
    const renderables = scene.allObjects.filter(
      (object) => object.visible && !(object instanceof Floor) && !object.isGroundLayer,
    );
    const sorted = topoSort([...renderables]);

    const floorStart = this._builder.mark();
    for (const floor of floorObjects) this._extractFloor(floor, scene.tileW, scene.tileH);
    const floorRange = this._builder.range(floorStart);

    const shadowStart = this._builder.mark();
    for (const object of sorted) this._extractShadow(object, scene.tileW, scene.tileH);
    const shadowRange = this._builder.range(shadowStart);

    const opaqueStart = this._builder.mark();
    for (const object of sorted) {
      if (!(object instanceof Cloud)) this._extractObject(object, scene.tileW, scene.tileH);
    }
    const opaqueRange = this._builder.range(opaqueStart);

    const transparentStart = this._builder.mark();
    for (const object of sorted) {
      if (object instanceof Cloud) this._extractCloud(object, scene.tileW, scene.tileH);
    }
    this._extractLightHalos(scene, scene.tileW, scene.tileH);
    const transparentRange = this._builder.range(transparentStart);

    this._extractLights(scene, scene.tileW, scene.tileH);
    const clearColor = rgb(options.clearColor ?? '#12161d');
    const ambientColor = rgb(scene.ambientColor);

    return {
      frame: ++this._frame,
      tileW: scene.tileW,
      tileH: scene.tileH,
      camera: {
        worldX: scene.camera.x,
        worldY: scene.camera.y,
        zoom: scene.camera.zoom,
        rotation: scene.view.rotation,
        elevation: scene.view.elevation,
        originX: options.originX ?? options.viewportWidth / 2,
        originY: options.originY ?? Math.min(180, options.viewportHeight * 0.24),
        viewportWidth: options.viewportWidth,
        viewportHeight: options.viewportHeight,
      },
      environment: {
        clearColor,
        ambientColor,
        ambientIntensity: scene.ambientIntensity,
      },
      geometry: this._builder.geometry(
        floorRange,
        shadowRange,
        opaqueRange,
        transparentRange,
      ),
      omniLights: this._omniLights,
      directionalLights: this._directionalLights,
      pickLookup: this._pickLookup,
      unsupported: this._unsupported,
    };
  }

  private _extractFloor(floor: Floor, tileW: number, tileH: number): void {
    const pickId = this._pickId(floor);
    for (let row = 0; row < floor.rows; row++) {
      for (let col = 0; col < floor.cols; col++) {
        const top = point(projectWorld(col, row, 0, tileW, tileH));
        const right = point(projectWorld(col + 1, row, 0, tileW, tileH));
        const bottom = point(projectWorld(col + 1, row + 1, 0, tileW, tileH));
        const left = point(projectWorld(col, row + 1, 0, tileW, tileH));
        const center = point(projectWorld(col + 0.5, row + 0.5, 0, tileW, tileH));
        const color = rgba(
          (col + row) % 2 === 0
            ? floor.color
            : floor.altColor || shiftColor(floor.color, -8),
        );
        this._builder.quad(top, right, bottom, left, {
          color,
          sample: center,
          normal: [0, -1],
          pickId,
        });
      }
    }
  }

  private _extractShadow(object: IsoObject, tileW: number, tileH: number): void {
    if (!(object.castsShadow || object instanceof Character || object instanceof Cloud)) return;

    const ground = point(projectWorld(object.position.x, object.position.y, 0, tileW, tileH));
    const radius = object instanceof Character
      ? object.radius * 1.25
      : object instanceof Cloud
        ? 28 * object.scale * (tileW / 64)
        : Math.max(8, (object.shadowRadius ?? 0.3) * tileW);
    const alpha = object instanceof Cloud ? 0.11 : 0.28;
    this._builder.ellipse(ground, radius, radius * 0.38, {
      color: [0.02, 0.03, 0.05, alpha],
      sample: ground,
      lit: false,
    }, 18);
  }

  private _extractObject(object: IsoObject, tileW: number, tileH: number): void {
    if (object instanceof Wall) {
      this._extractWall(object, tileW, tileH);
    } else if (object instanceof Character) {
      this._extractCharacter(object, tileW, tileH);
    } else if (object instanceof Crystal) {
      this._extractCrystal(object, tileW, tileH);
    } else if (object instanceof Boulder) {
      this._extractBoulder(object, tileW, tileH);
    } else if (object instanceof Chest) {
      this._extractChest(object, tileW, tileH);
    } else {
      this._unsupported.push({
        id: object.id,
        type: object.constructor.name,
        reason: 'No WebGL geometry extractor is registered for this object type.',
      });
      this._extractDiagnostic(object, tileW, tileH);
    }
  }

  private _extractWall(wall: Wall, tileW: number, tileH: number): void {
    const start = point(projectWorld(wall.position.x, wall.position.y, 0, tileW, tileH));
    const end = point(projectWorld(wall.endX, wall.endY, 0, tileW, tileH));
    const topEnd: RenderPoint = [end[0], end[1] - wall.wallHeight];
    const topStart: RenderPoint = [start[0], start[1] - wall.wallHeight];
    const sample: RenderPoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const isXWall = wall.position.y === wall.endY;
    const normal: RenderPoint = isXWall ? [0.8944, -0.4472] : [-0.8944, -0.4472];
    const pickId = this._pickId(wall);

    this._builder.quad(start, end, topEnd, topStart, {
      color: rgba(wall.color),
      sample,
      normal,
      pickId,
    });

    for (const opening of wall.openings) {
      const startT = opening.offsetX;
      const endT = opening.offsetX + opening.width;
      const bottom = opening.offsetY ?? 0;
      const top = bottom + opening.height;
      const p0 = lerpPoint(start, end, startT, bottom * wall.wallHeight);
      const p1 = lerpPoint(start, end, endT, bottom * wall.wallHeight);
      const p2 = lerpPoint(start, end, endT, top * wall.wallHeight);
      const p3 = lerpPoint(start, end, startT, top * wall.wallHeight);
      this._builder.quad(p0, p1, p2, p3, {
        color: opening.type === 'door'
          ? [0.015, 0.02, 0.03, 0.96]
          : [0.18, 0.42, 0.62, 0.8],
        sample,
        lit: false,
        pickId,
      });
    }
  }

  private _extractCharacter(character: Character, tileW: number, tileH: number): void {
    const center = point(projectLegacy(
      character.position.x,
      character.position.y,
      character.position.z,
      tileW,
      tileH,
    ));
    const pickId = this._pickId(character);
    const radius = character.radius;
    this._builder.ellipse(center, radius, radius, {
      color: rgba(shiftColor(character.color, -24)),
      sample: center,
      normal: [-0.35, -0.94],
      pickId,
    }, 24);
    this._builder.ellipse([center[0] - radius * 0.18, center[1] - radius * 0.22], radius * 0.68, radius * 0.68, {
      color: rgba(shiftColor(character.color, 28)),
      sample: center,
      normal: [-0.62, -0.78],
      pickId,
    }, 20);
  }

  private _extractCrystal(crystal: Crystal, tileW: number, tileH: number): void {
    const center = point(projectWorld(crystal.position.x, crystal.position.y, 0, tileW, tileH));
    const pickId = this._pickId(crystal);
    const height = crystal.propHeightPx;
    const width = tileW * 0.28;
    const tip: RenderPoint = [center[0], center[1] - height * 1.15];
    const middle: RenderPoint = [center[0], center[1] - height * 0.6];
    this._builder.polygon([
      center,
      [center[0] - width * 0.9, center[1] - height * 0.5],
      [center[0] - width * 0.4, center[1] - height],
      middle,
    ], { color: rgba(shiftColor(crystal.propColor, -52)), sample: center, normal: [-0.8, -0.4], pickId });
    this._builder.polygon([
      center,
      middle,
      [center[0] + width * 0.35, center[1] - height],
      [center[0] + width * 0.9, center[1] - height * 0.4],
    ], { color: rgba(crystal.propColor), sample: center, normal: [0.8, -0.4], pickId });
    this._builder.triangle(
      [center[0] - width * 0.4, center[1] - height],
      [center[0] + width * 0.35, center[1] - height],
      tip,
      { color: rgba(shiftColor(crystal.propColor, 58)), sample: center, normal: [0, -1], pickId },
    );
  }

  private _extractBoulder(boulder: Boulder, tileW: number, tileH: number): void {
    const center = point(projectWorld(boulder.position.x, boulder.position.y, 0, tileW, tileH));
    const pickId = this._pickId(boulder);
    const radius = boulder.propRadius;
    this._builder.ellipse([center[0], center[1] - radius * 0.42], radius, radius * 0.72, {
      color: rgba(shiftColor(boulder.propColor, -18)),
      sample: center,
      normal: [0.35, -0.94],
      pickId,
    }, 12);
    this._builder.polygon([
      [center[0] - radius * 0.55, center[1] - radius * 0.55],
      [center[0] - radius * 0.1, center[1] - radius * 1.05],
      [center[0] + radius * 0.55, center[1] - radius * 0.72],
      [center[0] + radius * 0.2, center[1] - radius * 0.35],
    ], { color: rgba(shiftColor(boulder.propColor, 30)), sample: center, normal: [-0.4, -0.9], pickId });
  }

  private _extractChest(chest: Chest, tileW: number, tileH: number): void {
    const { x, y } = chest.position;
    const half = 0.38;
    const north = point(projectWorld(x - half, y - half, 0, tileW, tileH));
    const east = point(projectWorld(x + half, y - half, 0, tileW, tileH));
    const south = point(projectWorld(x + half, y + half, 0, tileW, tileH));
    const west = point(projectWorld(x - half, y + half, 0, tileW, tileH));
    const height = tileH * 1.1;
    const lift = (p: RenderPoint): RenderPoint => [p[0], p[1] - height];
    const sample = point(projectWorld(x, y, 0, tileW, tileH));
    const pickId = this._pickId(chest);
    this._builder.quad(west, south, lift(south), lift(west), {
      color: rgba(shiftColor(chest.propColor, -18)), sample, normal: [-0.8944, -0.4472], pickId,
    });
    this._builder.quad(south, east, lift(east), lift(south), {
      color: rgba(shiftColor(chest.propColor, -38)), sample, normal: [0.8944, -0.4472], pickId,
    });
    const lidLift = chest.isOpen ? height + tileH * 0.7 : height + tileH * 0.24;
    this._builder.quad(
      [north[0], north[1] - lidLift],
      [east[0], east[1] - lidLift],
      [south[0], south[1] - height],
      [west[0], west[1] - height],
      { color: rgba(shiftColor(chest.propColor, 24)), sample, normal: [0, -1], pickId },
    );
  }

  private _extractCloud(cloud: Cloud, tileW: number, tileH: number): void {
    const center = point(projectLegacy(cloud.position.x, cloud.position.y, cloud.position.z, tileW, tileH));
    const pickId = this._pickId(cloud);
    const scale = cloud.scale * (tileW / 64);
    const puffs: ReadonlyArray<readonly [number, number, number, number, string]> = [
      [-18, 0, 25, 12, '#c8dff5'],
      [8, -5, 29, 15, '#e8f2fc'],
      [27, 2, 22, 11, '#b8d4ee'],
      [-2, -12, 24, 13, '#f0f6ff'],
    ];
    for (const [x, y, rx, ry, color] of puffs) {
      this._builder.ellipse(
        [center[0] + x * scale, center[1] + y * scale],
        rx * scale,
        ry * scale,
        { color: rgba(color, 0.82), sample: center, normal: [0, -1], pickId },
        14,
      );
    }
  }

  private _extractDiagnostic(object: IsoObject, tileW: number, tileH: number): void {
    const center = point(projectWorld(
      object.position.x,
      object.position.y,
      legacyPixelsToWorldZ(object.position.z),
      tileW,
      tileH,
    ));
    const pickId = this._pickId(object);
    this._builder.quad(
      [center[0], center[1] - 13],
      [center[0] + 13, center[1]],
      [center[0], center[1] + 13],
      [center[0] - 13, center[1]],
      { color: [1, 0.15, 0.45, 0.9], sample: center, lit: false, pickId },
    );
  }

  private _extractLightHalos(scene: Scene, tileW: number, tileH: number): void {
    for (const light of scene.omniLights) {
      if (light.isGlobal) continue;
      const center = point(projectLegacy(
        light.position.x,
        light.position.y,
        light.position.z,
        tileW,
        tileH,
      ));
      this._builder.ellipse(center, 12, 12, {
        color: rgba(light.color, Math.min(0.7, light.intensity * 0.5)),
        sample: center,
        lit: false,
      }, 18);
    }
  }

  private _extractLights(scene: Scene, tileW: number, tileH: number): void {
    for (const light of scene.omniLights) {
      const projected = projectLegacy(
        light.position.x,
        light.position.y,
        light.position.z,
        tileW,
        tileH,
      );
      this._omniLights.push({
        x: projected.x,
        y: projected.y,
        radius: light.radius,
        color: rgb(light.color),
        intensity: light.intensity,
        global: light.isGlobal,
        quadratic: light.falloff === 'quadratic',
      });
    }
    for (const light of scene.dirLights) {
      const direction = light.direction;
      this._directionalLights.push({
        x: direction.dx,
        y: direction.dy,
        color: rgb(light.color),
        intensity: light.intensity * Math.max(0, Math.sin(light.elevation)),
      });
    }
  }

  private _pickId(object: IsoObject): number {
    let id = this._pickIds.get(object);
    if (id === undefined) {
      id = this._nextPickId++;
      if (id > 0xffffff) throw new Error('WebGL picking ID space exhausted.');
      this._pickIds.set(object, id);
    }
    this._pickLookup.set(id, object.id);
    return id;
  }
}

function point(value: { x: number; y: number }): RenderPoint {
  return [value.x, value.y];
}

function rgb(color: string): readonly [number, number, number] {
  const [r, g, b] = hexToRgb(color);
  return [r / 255, g / 255, b / 255];
}

function rgba(color: string, alpha = 1): RenderColor {
  const [r, g, b] = rgb(color);
  return [r, g, b, alpha];
}

function lerpPoint(a: RenderPoint, b: RenderPoint, t: number, lift: number): RenderPoint {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - lift];
}
