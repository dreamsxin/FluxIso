import { describe, expect, it } from 'vitest';
import { RENDER_VERTEX_FLOATS } from '../../webgl-next/src/contracts/RenderSnapshot';
import {
  decodePickId,
  encodePickId,
  GeometryBuilder,
} from '../../webgl-next/src/extraction/GeometryBuilder';
import {
  legacyPixelsToWorldZ,
  projectLegacy,
  projectWorld,
} from '../../webgl-next/src/extraction/projection';

describe('WebGL Next geometry contracts', () => {
  it('converts legacy pixel Z into canonical world Z', () => {
    expect(legacyPixelsToWorldZ(32)).toBe(2);
    expect(projectWorld(2, 1, 2, 64, 32)).toEqual({ x: 32, y: 16 });
    expect(projectLegacy(2, 1, 32, 64, 32)).toEqual({ x: 32, y: 16 });
  });

  it('encodes the complete 24-bit picking ID range', () => {
    for (const id of [0, 1, 255, 256, 65_535, 0xabcdef, 0xffffff]) {
      const encoded = encodePickId(id);
      expect(decodePickId(
        Math.round(encoded[0] * 255),
        Math.round(encoded[1] * 255),
        Math.round(encoded[2] * 255),
      )).toBe(id);
    }
  });

  it('builds contiguous ranges and grows its reusable arena', () => {
    const builder = new GeometryBuilder();
    const floorStart = builder.mark();
    builder.quad([0, 0], [1, 0], [1, 1], [0, 1], {
      color: [1, 0, 0, 1], sample: [0.5, 0.5], pickId: 41,
    });
    const floor = builder.range(floorStart);
    const opaqueStart = builder.mark();
    for (let i = 0; i < 220; i++) {
      builder.ellipse([i, i], 4, 2, {
        color: [0, 1, 0, 1], sample: [i, i], pickId: i + 1,
      }, 8);
    }
    const opaque = builder.range(opaqueStart);
    const geometry = builder.geometry(floor, { first: floor.count, count: 0 }, opaque);

    expect(floor).toEqual({ first: 0, count: 6 });
    expect(opaque.first).toBe(6);
    expect(geometry.vertexCount).toBe(6 + 220 * 8 * 3);
    expect(geometry.data.length).toBeGreaterThanOrEqual(geometry.vertexCount * RENDER_VERTEX_FLOATS);
    expect(geometry.data[11]).toBeCloseTo(41 / 255);
  });
});
