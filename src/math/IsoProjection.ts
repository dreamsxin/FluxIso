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
 * @param x  - world X (right)
 * @param y  - world Y (forward/depth)
 * @param z  - world Z (up), positive = above ground
 * @param tileW - width of one isometric tile in pixels
 * @param tileH - height of one isometric tile in pixels (= tileW / 2)
 */
export function project(
  x: number,
  y: number,
  z: number,
  tileW: number,
  tileH: number
): ScreenVec2 {
  return {
    sx: (x - y) * (tileW / 2),
    sy: (x + y) * (tileH / 2) - z,
  };
}

/** Convert tile grid coordinates (col, row) to isometric world origin */
export function tileOrigin(col: number, row: number): IsoVec3 {
  return { x: col, y: row, z: 0 };
}

/**
 * Unprojects screen coordinates back to isometric world XY (at z=0).
 * Inverse of project() with z=0.
 */
export function unproject(
  sx: number,
  sy: number,
  tileW: number,
  tileH: number
): { x: number; y: number } {
  // sx = (x - y) * tileW/2  =>  x - y = sx / (tileW/2)
  // sy = (x + y) * tileH/2  =>  x + y = sy / (tileH/2)
  const a = sx / (tileW / 2);
  const b = sy / (tileH / 2);
  return {
    x: (a + b) / 2,
    y: (b - a) / 2,
  };
}
