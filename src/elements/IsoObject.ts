import { IsoVec3 } from '../math/IsoProjection';
import { OmniLight } from '../lighting/OmniLight';
import { DirectionalLight } from '../lighting/DirectionalLight';
import { AABB } from '../math/depthSort';

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  tileW: number;
  tileH: number;
  /**
   * The current drawing origin in pixels.
   * When drawing inside the scene's camera transform, these are typically 0.
   */
  originX: number;
  originY: number;
  omniLights: OmniLight[];
  dirLights: DirectionalLight[];
}

/**
 * IsoObject — base class for all entities rendered in the isometric scene.
 * Provides a position and requires an AABB for depth sorting.
 */
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
