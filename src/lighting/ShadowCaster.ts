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

      const { minX, minY, maxX, maxY, baseZ, maxZ } = obj.aabb;
      // Use actual object height from aabb.maxZ if available, else fall back to a default
      const objTopZ = maxZ ?? (baseZ + (tileH * 1.1) / (tileH / 2));
      const cz = objTopZ - baseZ; // height above ground in world units

      if (cz <= 0 || baseZ >= lz) continue;

      let topCorners: [number, number, number][];
      if (obj.shadowRadius && obj.shadowRadius > 0) {
        const sr = obj.shadowRadius;
        const ocx = (minX + maxX) / 2;
        const ocy = (minY + maxY) / 2;
        topCorners = Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return [ocx + Math.cos(a) * sr, ocy + Math.sin(a) * sr, objTopZ] as [number, number, number];
        });
      } else {
        topCorners = [
          [minX, minY, objTopZ], [maxX, minY, objTopZ],
          [maxX, maxY, objTopZ], [minX, maxY, objTopZ],
        ];
      }

      const groundPts: [number, number][] = topCorners.map(([cx, cy, cornerZ]) => {
        const t = lz / (lz - (cornerZ - baseZ));
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

    // light.angle is in screen space. Convert the screen-space light direction
    // to world-space (iso x/y) so the shadow offset is applied correctly before
    // projecting tip points back to screen.
    //
    // Iso projection:  sx = (x - y) * tileW/2,  sy = (x + y) * tileH/2
    // Inverse:         x = sx/(tileW) + sy/(tileH)
    //                  y = sy/(tileH) - sx/(tileW)
    //
    // A unit screen vector (cos θ, sin θ) maps to world:
    const screenDx = Math.cos(light.angle);
    const screenDy = Math.sin(light.angle);
    const worldDx =  screenDx / (tileW / 2) + screenDy / (tileH / 2);  // toward light in world
    const worldDy = -screenDx / (tileW / 2) + screenDy / (tileH / 2);

    // Shadow falls opposite to the light direction, scaled by shadow length
    const shadowDx = -worldDx * shadowLen;
    const shadowDy = -worldDy * shadowLen;

    // Alpha: stronger at low elevation (long shadows at dawn/dusk), softer at noon
    const elevNorm = elev / (Math.PI / 2); // 0=horizon, 1=zenith
    const shadowAlphaFactor = 0.15 + 0.55 * (1 - elevNorm * elevNorm);
    const alpha = Math.min(0.60, light.intensity * shadowAlphaFactor);
    if (alpha < 0.01) return;

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;

    for (const obj of casters) {
      if (obj.castsShadow === false) continue;

      const { minX, minY, maxX, maxY, baseZ, maxZ } = obj.aabb;
      // Use actual object height from aabb.maxZ if available
      const objTopZ = maxZ ?? (baseZ + (tileH * 1.1) / (tileH / 2));
      const objHeightWorld = objTopZ - baseZ;

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
