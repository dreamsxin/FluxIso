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

/**
 * Draw a solid isometric cube onto a 2D canvas context.
 *
 * All coordinates are in world units; the function calls project() internally.
 * The three visible faces (top, left, right) are filled with the supplied colors.
 *
 * @param ctx        Canvas 2D context.
 * @param originX    Screen X of the world origin (engine.originX).
 * @param originY    Screen Y of the world origin (engine.originY).
 * @param tileW      Tile width in pixels (scene.tileW).
 * @param tileH      Tile height in pixels (scene.tileH).
 * @param wx         World X of the cube's back-left corner.
 * @param wy         World Y of the cube's back-left corner.
 * @param wz         World Z of the cube's bottom face.
 * @param w          Cube width  (X axis, world units).
 * @param d          Cube depth  (Y axis, world units).
 * @param h          Cube height (Z axis, world units).
 * @param topColor   CSS color for the top face.
 * @param leftColor  CSS color for the left face.
 * @param rightColor CSS color for the right face.
 */
export function drawIsoCube(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  tileW: number,
  tileH: number,
  wx: number,
  wy: number,
  wz: number,
  w: number,
  d: number,
  h: number,
  topColor: string,
  leftColor: string,
  rightColor: string,
): void {
  const tl  = project(wx,     wy,     wz + h, tileW, tileH);
  const tr  = project(wx + w, wy,     wz + h, tileW, tileH);
  const br  = project(wx + w, wy + d, wz + h, tileW, tileH);
  const bl  = project(wx,     wy + d, wz + h, tileW, tileH);
  const blB = project(wx,     wy + d, wz,     tileW, tileH);
  const brB = project(wx + w, wy + d, wz,     tileW, tileH);
  const trB = project(wx + w, wy,     wz,     tileW, tileH);
  const tlB = project(wx,     wy,     wz,     tileW, tileH);
  const ox = originX, oy = originY;

  // Left face
  ctx.beginPath();
  ctx.moveTo(ox + tl.sx,  oy + tl.sy);
  ctx.lineTo(ox + bl.sx,  oy + bl.sy);
  ctx.lineTo(ox + blB.sx, oy + blB.sy);
  ctx.lineTo(ox + tlB.sx, oy + tlB.sy);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();

  // Right face
  ctx.beginPath();
  ctx.moveTo(ox + tr.sx,  oy + tr.sy);
  ctx.lineTo(ox + br.sx,  oy + br.sy);
  ctx.lineTo(ox + brB.sx, oy + brB.sy);
  ctx.lineTo(ox + trB.sx, oy + trB.sy);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();

  // Top face
  ctx.beginPath();
  ctx.moveTo(ox + tl.sx, oy + tl.sy);
  ctx.lineTo(ox + tr.sx, oy + tr.sy);
  ctx.lineTo(ox + br.sx, oy + br.sy);
  ctx.lineTo(ox + bl.sx, oy + bl.sy);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();
}
