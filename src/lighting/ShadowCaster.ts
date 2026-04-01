import { OmniLight } from './OmniLight';
import { IsoObject } from '../elements/IsoObject';
import { project } from '../math/IsoProjection';

/**
 * Ground-plane shadow casting for OmniLights.
 *
 * Algorithm (correct iso projection):
 *   For each caster, take the 4 top corners of its AABB (at baseZ + objectHeight).
 *   For each top corner, cast a ray from the light source (wx, wy, wz) through
 *   the corner (cx, cy, cz) and find where it hits the ground plane (z = 0):
 *
 *     t = lz / (lz - cz)          (parametric ray: P = light + t*(corner - light))
 *     groundX = lx + t*(cx - lx)
 *     groundY = ly + t*(cy - ly)
 *
 *   Project the ground intersection to screen space and fill the resulting polygon.
 *
 * The shadow is drawn into the lightmap offscreen canvas (floor layer) so it
 * appears correctly beneath all objects.
 */
export class ShadowCaster {
  /**
   * Draw ground shadows for all casters under a single OmniLight.
   *
   * IMPORTANT: call this into the *floor/lightmap* canvas context, not the
   * main scene context, so shadows appear under objects.
   *
   * @param ctx      2D context to draw into (floor layer, camera transform already applied)
   * @param light    The OmniLight casting shadows
   * @param casters  Scene objects that cast shadows (Floor excluded)
   * @param tileW    Tile width in pixels
   * @param tileH    Tile height in pixels
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
    const lz = light.position.z;   // world-space height of light

    if (lz <= 0) return;           // light on the ground casts no shadow

    const maxAlpha = Math.min(0.50, light.intensity * 0.42);

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';

    for (const obj of casters) {
      // Skip objects that handle their own shadow
      if (obj.castsShadow === false) continue;

      const { minX, minY, maxX, maxY, baseZ } = obj.aabb;

      // Estimate object height in world units from its screen-pixel baseZ.
      // baseZ in AABB is the ground-plane z (usually 0 for props).
      // We use a fixed world-unit height derived from the object's visual size.
      // tileH/2 ≈ 1 world unit in screen pixels, so we convert:
      const objHeightPx = baseZ + tileH * 1.1;          // screen pixels
      const objHeightWorld = objHeightPx / (tileH / 2); // world units (approx)
      const cz = objHeightWorld;                         // top of object in world z

      if (cz >= lz) continue;  // object taller than light — no shadow

      // Build the set of footprint points to project.
      // If the object declares a shadowRadius, sample a circle of points
      // (gives a round shadow for spheres/cylinders instead of a rectangle).
      // Otherwise fall back to the 4 AABB corners.
      let topCorners: [number, number, number][];

      if (obj.shadowRadius && obj.shadowRadius > 0) {
        const sr = obj.shadowRadius;
        const ocx = (minX + maxX) / 2;
        const ocy = (minY + maxY) / 2;
        const CIRCLE_SAMPLES = 8;
        topCorners = Array.from({ length: CIRCLE_SAMPLES }, (_, i) => {
          const a = (i / CIRCLE_SAMPLES) * Math.PI * 2;
          return [ocx + Math.cos(a) * sr, ocy + Math.sin(a) * sr, cz] as [number, number, number];
        });
      } else {
        // 4 top corners of the AABB (world space, at height cz)
        topCorners = [
          [minX, minY, cz],
          [maxX, minY, cz],
          [maxX, maxY, cz],
          [minX, maxY, cz],
        ];
      }

      // Project each top corner through the light onto z=0 (ground plane)
      const groundPts: [number, number][] = topCorners.map(([cx, cy, cornerZ]) => {
        // Ray: P(t) = light + t * (corner - light)
        // At z=0: lz + t*(cornerZ - lz) = 0  →  t = lz / (lz - cornerZ)
        const t = lz / (lz - cornerZ);
        const gx = lx + t * (cx - lx);
        const gy = ly + t * (cy - ly);
        return [gx, gy];
      });

      // Project ground points to screen space
      const screenPts = groundPts.map(([gx, gy]) => {
        const p = project(gx, gy, 0, tileW, tileH);
        return [p.sx, p.sy] as [number, number];
      });

      // Also project the base footprint corners (z=0) for the shadow "base"
      let basePts: [number, number][];
      if (obj.shadowRadius && obj.shadowRadius > 0) {
        const sr = obj.shadowRadius;
        const ocx = (minX + maxX) / 2;
        const ocy = (minY + maxY) / 2;
        const CIRCLE_SAMPLES = 8;
        basePts = Array.from({ length: CIRCLE_SAMPLES }, (_, i) => {
          const a = (i / CIRCLE_SAMPLES) * Math.PI * 2;
          const bx = ocx + Math.cos(a) * sr;
          const by = ocy + Math.sin(a) * sr;
          const p = project(bx, by, 0, tileW, tileH);
          return [p.sx, p.sy] as [number, number];
        });
      } else {
        basePts = [
          [minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY],
        ].map(([bx, by]) => {
          const p = project(bx, by, 0, tileW, tileH);
          return [p.sx, p.sy] as [number, number];
        });
      }

      // Convex hull of base + projected top = full shadow polygon
      const allPts = [...basePts, ...screenPts];
      const hull = convexHull(allPts);
      if (hull.length < 3) continue;

      // Distance-based alpha falloff
      // dist is in world units; light.radius is in screen pixels.
      // Convert radius to world units: radius_world ≈ radius_px / (tileW/2)
      const objCx = (minX + maxX) / 2;
      const objCy = (minY + maxY) / 2;
      const dist = Math.hypot(objCx - lx, objCy - ly);   // world units
      const radiusWorld = light.radius / (tileW / 2);
      const falloff = Math.max(0, 1 - dist / radiusWorld);
      const alpha = maxAlpha * falloff;
      if (alpha < 0.01) continue;

      // Soft edge: use a radial gradient centred on the object base
      const baseCx = (basePts[0][0] + basePts[2][0]) / 2;
      const baseCy = (basePts[0][1] + basePts[2][1]) / 2;
      const shadowRadius = Math.max(
        ...hull.map(([hx, hy]) => Math.hypot(hx - baseCx, hy - baseCy)),
      ) * 1.1;

      const grad = ctx.createRadialGradient(baseCx, baseCy, 0, baseCx, baseCy, shadowRadius);
      grad.addColorStop(0,   `rgba(0,0,0,${alpha.toFixed(3)})`);
      grad.addColorStop(0.6, `rgba(0,0,0,${(alpha * 0.6).toFixed(3)})`);
      grad.addColorStop(1,   'rgba(0,0,0,0)');

      ctx.beginPath();
      ctx.moveTo(hull[0][0], hull[0][1]);
      for (let i = 1; i < hull.length; i++) {
        ctx.lineTo(hull[i][0], hull[i][1]);
      }
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

// ── Convex hull (gift wrapping) ───────────────────────────────────────────────

function convexHull(pts: [number, number][]): [number, number][] {
  if (pts.length <= 3) return pts;

  // Find leftmost point
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
