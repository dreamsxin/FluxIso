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
 * rotation: horizontal view direction in degrees. Standard iso uses 45°
 *   increments (NE=0, NW=90, SW=180, SE=270). Arbitrary values are supported
 *   for smooth rotation transitions.
 *
 * elevation: vertical tilt ratio (tileH / tileW). Standard 2:1 iso = 0.5.
 *   Range 0.2 (near-side view) → 1.0 (near-top-down).
 *   Affects both the projection and the depth sort.
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
 *
 * With default view (rotation=0, elevation=0.5):
 *   sx = (x - y) * tileW/2
 *   sy = (x + y) * tileH/2 - z
 *
 * rotation rotates the world around the vertical axis in the iso plane.
 * elevation scales the vertical compression (tileH = tileW * elevation).
 */
export function project(
  x: number,
  y: number,
  z: number,
  tileW: number,
  tileH: number,
  view?: IsoView,
): ScreenVec2 {
  if (!view || (view.rotation === 0 && view.elevation === 0.5)) {
    // Fast path: standard 2:1 iso
    return {
      sx: (x - y) * (tileW / 2),
      sy: (x + y) * (tileH / 2) - z,
    };
  }

  // Apply horizontal rotation: rotate world XY around the iso vertical axis
  const rad = (view.rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const rx = x * cos - y * sin;
  const ry = x * sin + y * cos;

  // Apply elevation: tileH = tileW * elevation
  const effTileH = tileW * view.elevation;
  return {
    sx: (rx - ry) * (tileW / 2),
    sy: (rx + ry) * (effTileH / 2) - z,
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
  view?: IsoView,
): { x: number; y: number } {
  const effTileH = view ? tileW * view.elevation : tileH;
  const a = sx / (tileW / 2);
  const b = sy / (effTileH / 2);
  const rx = (a + b) / 2;
  const ry = (b - a) / 2;

  if (!view || view.rotation === 0) return { x: rx, y: ry };

  // Undo rotation
  const rad = -(view.rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return {
    x: rx * cos - ry * sin,
    y: rx * sin + ry * cos,
  };
}

/**
 * Depth sort key: higher value = drawn later (on top).
 * Objects with greater (x + y) are further "in front" in isometric view.
 */
export function depthKey(x: number, y: number, z: number): number {
  return x + y + z * 0.001;
}
