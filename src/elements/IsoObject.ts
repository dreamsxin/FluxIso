import { IsoVec3 } from '../math/IsoProjection';
import { OmniLight } from '../lighting/OmniLight';
import { DirectionalLight } from '../lighting/DirectionalLight';
import { AABB } from '../math/depthSort';

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  tileW: number;
  tileH: number;
  originX: number;
  originY: number;
  omniLights: OmniLight[];
  dirLights: DirectionalLight[];
}

export abstract class IsoObject {
  id: string;
  position: IsoVec3;

  constructor(id: string, x: number, y: number, z: number) {
    this.id = id;
    this.position = { x, y, z };
  }

  /** World-space axis-aligned bounding box used for depth sorting. */
  abstract get aabb(): AABB;

  abstract draw(dc: DrawContext): void;
}
