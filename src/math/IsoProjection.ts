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
 * rotation: horizontal view direction in degrees.
 *   Rotation is applied as a canvas 2D transform matrix in Camera.applyTransform,
 *   so individual project() calls do NOT need to handle rotation.
 *
 * elevation: vertical tilt ratio (tileH / tileW). Standard 2:1 iso = 0.5.
 *   Range 0.2 (near-side view) → 1.0 (near-top-down).
 *   This IS applied inside project() via effTileH = tileW * elevation.
 */
export interface IsoView {
  /** Horizontal rotation in degrees (0 = NE-facing, 90 = NW, 180 = SW, 270 = SE). Default 0. */
  rotation: number;
  /** Vertical elevation ratio tileH/tileW. 0.5 = standard 2:1 iso. Default 0.5. */
  elevation: number;
}

export const DEFAULT_ISO_VIEW: IsoView = { rotation: 0, elevation: 0.5 };

/**
 * Projects isometric world coordinates to screen coordinates.
 * Standard 2:1 isometric ratio: tileW = 2 * tileH.
 *
 * Rotation is NOT applied here — it is handled by the canvas transform matrix
 * in Camera.applyTransform. Only elevation scaling is applied.
 */
export function project(
  x: number,
  y: number,
  z: number,
  tileW: number,
  tileH: number,
  view?: IsoView,
): ScreenVec2 {
  const effTileH = view ? tileW * view.elevation : tileH;
  return {
    sx: (x - y) * (tileW / 2),
    sy: (x + y) * (effTileH / 2) - z,
  };
}

/**
 * Unprojects screen coordinates back to isometric world XY (at z=0).
 * Inverse of project() with z=0. Rotation is NOT handled here.
 */
export function unproject(
  sx: number,
  sy: number,
  tileW: number,
  tileH: number,
  view?: IsoView,
): { x: number; y: number } {
  const effTileH = view ? tileW * view.elevation : tileH;
  const a = sx / (tileW / 2);
  const b = sy / (effTileH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/**
 * Depth sort key: higher value = drawn later (on top).
 * Objects with greater (x + y) are further "in front" in isometric view.
 */
export function depthKey(x: number, y: number, z: number): number {
  return x + y + z * 0.001;
}
