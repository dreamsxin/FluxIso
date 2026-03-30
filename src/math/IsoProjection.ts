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
 * Projects isometric world coordinates to screen coordinates.
 * Standard 2:1 isometric ratio: tileW = 2 * tileH.
 *
 * sx = (x - y) * tileW/2
 * sy = (x + y) * tileH/2 - z
 */
export function project(
  x: number,
  y: number,
  z: number,
  tileW: number,
  tileH: number,
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
): { x: number; y: number } {
  const a = sx / (tileW / 2);
  const b = sy / (tileH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/**
 * Depth sort key: higher value = drawn later (on top).
 * Objects with greater (x + y) are further "in front" in isometric view.
 */
export function depthKey(x: number, y: number, z: number): number {
  return x + y + z * 0.001;
}
