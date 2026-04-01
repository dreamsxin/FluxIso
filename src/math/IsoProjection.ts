export interface IsoVec3 {
  x: number;
  y: number;
  z: number;
}

export interface ScreenVec2 {
  sx: number;
  sy: number;
}

/**
 * IsoView — defines the camera's isometric projection parameters.
 *
 * Both rotation and elevation are applied as canvas 2D transform operations
 * in Camera.applyTransform — NOT inside project(). This means all existing
 * draw() calls using project() automatically respond to view changes without
 * any code modifications.
 *
 * rotation: horizontal rotation in degrees (0=NE, 90=NW, 180=SW, 270=SE).
 *   Implemented as a 2×2 canvas transform matrix.
 *
 * elevation: vertical tilt ratio tileH/tileW. 0.5 = standard 2:1 iso.
 *   Implemented as ctx.scale(1, elevation/0.5).
 */
export interface IsoView {
  rotation: number;
  elevation: number;
}

export const DEFAULT_ISO_VIEW: IsoView = { rotation: 0, elevation: 0.5 };

/**
 * Projects isometric world coordinates to screen coordinates.
 * Always uses standard tileW/tileH — view transforms are applied by the
 * canvas context, not here.
 */
export function project(
  x: number,
  y: number,
  z: number,
  tileW: number,
  tileH: number,
  _view?: IsoView,
): ScreenVec2 {
  return {
    sx: (x - y) * (tileW / 2),
    sy: (x + y) * (tileH / 2) - z,
  };
}

/**
 * Unprojects screen coordinates back to isometric world XY (at z=0).
 * Inverse of project() with z=0.
 */
export function unproject(
  sx: number,
  sy: number,
  tileW: number,
  tileH: number,
  _view?: IsoView,
): { x: number; y: number } {
  const a = sx / (tileW / 2);
  const b = sy / (tileH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/**
 * Depth sort key: higher value = drawn later (on top).
 */
export function depthKey(x: number, y: number, z: number): number {
  return x + y + z * 0.001;
}
