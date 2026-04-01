import { OmniLight } from './OmniLight';
import { DirectionalLight } from './DirectionalLight';
import { IsoObject } from '../elements/IsoObject';
import { project } from '../math/IsoProjection';

/**
 * Ground-plane shadow casting for OmniLights and DirectionalLights.
 *
 * OmniLight shadows: perspective projection from point source.
 * DirectionalLight shadows: parallel projection along sun direction.
 *
 * Shadows are drawn into the floor/lightmap offscreen canvas so they
 * appear correctly beneath all objects.
 */
export class ShadowCaster {
  /**
   * Draw OmniLight ground shadows.
   * ctx must already have the camera transform applied.
   */
  static draw(
    ctx: CanvasRenderingContext2D,
    light: OmniLight,
    casters: IsoObject[],
    tileW: number,
    tileH: number,
  ): void {
    const lx = light.position.x;
    const ly = light.position.y;
    const lz = light.position.z;

    if (lz <= 0) return;

    const maxAlpha = Math.min(0.50, light.intensity * 0.42);

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';

    for (const obj of casters) {
      if (obj.castsShadow === false) continue;

      const { minX, minY, maxX, maxY } = obj.aabb;
      const objHeightPx = tileH * 1.1;
      const objHeightWorld = objHeightPx / (tileH / 2);
      const cz = objHeightWorld;

      if (cz >= lz) continue;

      let topCorners: [number, number, number][];
      if (obj.shadowRadius && obj.shadowRadius > 0) {
        const sr = obj.shadowRadius;
        const ocx = (minX + maxX) / 2;
        const ocy = (minY + maxY) / 2;
        topCorners = Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return [ocx + Math.cos(a) * sr, ocy + Math.sin(a) * sr, cz] as [number, number, number];
        });
      } else {
        topCorners = [
          [minX, minY, cz], [maxX, minY, cz],
          [maxX, maxY, cz], [minX, maxY, cz],
        ];
      }

      const groundPts: [number, number][] = topCorners.map(([cx, cy, cornerZ]) => {
        const t = lz / (lz - cornerZ);
        return [lx + t * (cx - lx), ly + t * (cy - ly)];
      });

      const screenPts = groundPts.map(([gx, gy]) => {
        const p = project(gx, gy, 0, tileW, tileH);
        return [p.sx, p.sy] as [number, number];
      });

      let basePts: [number, number][];
      if (obj.shadowRadius && obj.shadowRadius > 0) {
        const sr = obj.shadowRadius;
        const ocx = (minX + maxX) / 2;
        const ocy = (minY + maxY) / 2;
        basePts = Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          const p = project(ocx + Math.cos(a) * sr, ocy + Math.sin(a) * sr, 0, tileW, tileH);
          return [p.sx, p.sy] as [number, number];
        });
      } else {
        basePts = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]].map(([bx, by]) => {
          const p = project(bx, by, 0, tileW, tileH);
          return [p.sx, p.sy] as [number, number];
        });
      }

      const hull = convexHull([...basePts, ...screenPts]);
      if (hull.length < 3) continue;

      const objCx = (minX + maxX) / 2;
      const objCy = (minY + maxY) / 2;
      const dist = Math.hypot(objCx - lx, objCy - ly);
      const radiusWorld = light.radius / (tileW / 2);
      const falloff = Math.max(0, 1 - dist / radiusWorld);
      const alpha = maxAlpha * falloff;
      if (alpha < 0.01) continue;

      const baseCx = basePts.reduce((s, p) => s + p[0], 0) / basePts.length;
      const baseCy = basePts.reduce((s, p) => s + p[1], 0) / basePts.length;
      const shadowR = Math.max(...hull.map(([hx, hy]) => Math.hypot(hx - baseCx, hy - baseCy))) * 1.1;

      const grad = ctx.createRadialGradient(baseCx, baseCy, 0, baseCx, baseCy, shadowR);
      grad.addColorStop(0,   `rgba(0,0,0,${alpha.toFixed(3)})`);
      grad.addColorStop(0.6, `rgba(0,0,0,${(alpha * 0.6).toFixed(3)})`);
      grad.addColorStop(1,   'rgba(0,0,0,0)');

      ctx.beginPath();
      ctx.moveTo(hull[0][0], hull[0][1]);
      for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i][0], hull[i][1]);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  /**
   * Draw DirectionalLight parallel shadows (sun/moon shadows).
   * Shadow direction is derived from light angle + elevation.
   * ctx must already have the camera transform applied.
   */
  static drawDirectional(
    ctx: CanvasRenderingContext2D,
    light: DirectionalLight,
    casters: IsoObject[],
    tileW: number,
    tileH: number,
  ): void {
    const elev = light.elevation; // radians
    if (elev <= 0.01) return;     // sun below horizon — no shadow

    // Shadow length per unit of object height (cot of elevation)
    const shadowLen = 1 / Math.tan(elev);
    // Shadow direction: opposite to light source direction
    const shadowDx = -Math.cos(light.angle) * shadowLen;
    const shadowDy = -Math.sin(light.angle) * shadowLen;

    // Alpha: stronger at low elevation (long shadows), weaker at high noon
    const alpha = Math.min(0.55, light.intensity * 0.35 * (1 - elev / (Math.PI / 2)));
    if (alpha < 0.01) return;

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;

    for (const obj of casters) {
      if (obj.castsShadow === false) continue;

      const { minX, minY, maxX, maxY } = obj.aabb;
      const objHeightWorld = (tileH * 1.1) / (tileH / 2);

      // Footprint corners at ground level
      let footprint: [number, number][];
      if (obj.shadowRadius && obj.shadowRadius > 0) {
        const sr = obj.shadowRadius;
        const ocx = (minX + maxX) / 2;
        const ocy = (minY + maxY) / 2;
        footprint = Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return [ocx + Math.cos(a) * sr, ocy + Math.sin(a) * sr] as [number, number];
        });
      } else {
        footprint = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
      }

      // Project footprint to screen (base)
      const basePts = footprint.map(([fx, fy]) => {
        const p = project(fx, fy, 0, tileW, tileH);
        return [p.sx, p.sy] as [number, number];
      });

      // Shadow tip: footprint shifted by shadow direction × object height
      const tipPts = footprint.map(([fx, fy]) => {
        const gx = fx + shadowDx * objHeightWorld;
        const gy = fy + shadowDy * objHeightWorld;
        const p = project(gx, gy, 0, tileW, tileH);
        return [p.sx, p.sy] as [number, number];
      });

      const hull = convexHull([...basePts, ...tipPts]);
      if (hull.length < 3) continue;

      ctx.beginPath();
      ctx.moveTo(hull[0][0], hull[0][1]);
      for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i][0], hull[i][1]);
      ctx.closePath();
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

// ── Convex hull (gift wrapping) ───────────────────────────────────────────────

function convexHull(pts: [number, number][]): [number, number][] {
  if (pts.length <= 3) return pts;
  let start = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] < pts[start][0]) start = i;
  }
  const hull: [number, number][] = [];
  let cur = start;
  do {
    hull.push(pts[cur]);
    let next = (cur + 1) % pts.length;
    for (let i = 0; i < pts.length; i++) {
      if (cross(pts[cur], pts[next], pts[i]) < 0) next = i;
    }
    cur = next;
  } while (cur !== start && hull.length <= pts.length);
  return hull;
}

function cross(O: [number, number], A: [number, number], B: [number, number]): number {
  return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
}
