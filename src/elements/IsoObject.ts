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
  /**
   * Scene-level ambient light as a pre-multiplied RGB triple [r, g, b] in 0–1.
   * Injected by Scene.draw() from scene.ambientColor × scene.ambientIntensity.
   * Floor and Wall use this as the minimum illumination floor, so the whole
   * scene darkens/tints automatically when you change scene.ambientColor.
   */
  ambientRgb: [number, number, number];
}

/**
 * IsoObject — base class for all entities rendered in the isometric scene.
 * Provides a position and requires an AABB for depth sorting.
 */
export abstract class IsoObject {
  id: string;
  position: IsoVec3;

  /**
   * When set to a positive number, ShadowCaster uses a circular footprint
   * (radius in world units) instead of the rectangular AABB for shadow projection.
   * Ideal for spheres, cylinders, and other round objects.
   * Default undefined = use AABB rectangle.
   */
  shadowRadius?: number;

  /**
   * Set to false to opt out of the ShadowCaster system entirely.
   * Use this when the object draws its own shadow in draw().
   * Default false — objects must explicitly opt in to system shadow casting.
   * Set to true (with optional shadowRadius) for objects that want ground shadows.
   */
  castsShadow: boolean = false;

  /**
   * When false, the object is skipped during draw() and update().
   * Default true.
   */
  visible: boolean = true;

  constructor(id: string, x: number, y: number, z: number) {
    this.id = id;
    this.position = { x, y, z };
  }

  /** World-space axis-aligned bounding box used for depth sorting. */
  abstract get aabb(): AABB;

  abstract draw(dc: DrawContext): void;
}
