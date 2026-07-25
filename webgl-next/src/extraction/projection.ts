import { Z_UNITS_PER_PX } from '../../../src/math/IsoProjection';

export interface ProjectedPoint {
  x: number;
  y: number;
}

export function legacyPixelsToWorldZ(zPixels: number): number {
  return zPixels * Z_UNITS_PER_PX;
}

export function projectWorld(
  x: number,
  y: number,
  zWorld: number,
  tileW: number,
  tileH: number,
): ProjectedPoint {
  return {
    x: (x - y) * (tileW / 2),
    y: (x + y) * (tileH / 2) - zWorld * (tileH / 2),
  };
}

export function projectLegacy(
  x: number,
  y: number,
  zPixels: number,
  tileW: number,
  tileH: number,
): ProjectedPoint {
  return projectWorld(x, y, legacyPixelsToWorldZ(zPixels), tileW, tileH);
}
