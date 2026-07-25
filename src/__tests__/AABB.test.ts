import { describe, it, expect } from 'vitest';
import { Z_UNITS_PER_PX } from '../math/IsoProjection';
import { Wall } from '../elements/Wall';
import { Character } from '../elements/Character';
import { Floor } from '../elements/Floor';
import { Crystal } from '../elements/props/Crystal';
import { Boulder } from '../elements/props/Boulder';
import { Chest } from '../elements/props/Chest';
import { Cloud } from '../elements/props/Cloud';
import { FloatingText } from '../elements/props/FloatingText';

/**
 * Z-unit convention: 1 AABB-Z unit == tileH/2 pixels (≈16 px for tileH=32),
 * exposed as Z_UNITS_PER_PX = 1/16. position.z stays in screen pixels for
 * rendering (project() subtracts it from sy directly); the pixel->world-unit
 * conversion happens only inside each get aabb() getter. These tests lock the
 * convention so depth-sort overlapZ comparisons are meaningful across classes.
 */

describe('Z_UNITS_PER_PX constant', () => {
  it('is 1/16 (≈ 1 / (tileH/2) for standard tileH=32)', () => {
    expect(Z_UNITS_PER_PX).toBe(1 / 16);
  });
});

describe('Wall - aabb Z units', () => {
  it('maxZ = wallHeight * Z_UNITS_PER_PX (80px wall -> 5 units)', () => {
    const wall = new Wall({ id: 'w', x: 0, y: 0, endX: 4, endY: 0, height: 80 });
    expect(wall.aabb.maxZ).toBeCloseTo(80 * Z_UNITS_PER_PX, 10);
    expect(wall.aabb.maxZ).toBeCloseTo(5, 10);
    expect(wall.aabb.baseZ).toBe(0);
  });

  it('scales linearly with wall height', () => {
    const w1 = new Wall({ id: 'w1', x: 0, y: 0, endX: 1, endY: 0, height: 32 });
    const w2 = new Wall({ id: 'w2', x: 0, y: 0, endX: 1, endY: 0, height: 64 });
    expect(w2.aabb.maxZ!).toBeCloseTo(w1.aabb.maxZ! * 2, 10);
  });
});

describe('Character - aabb Z units', () => {
  it('maxZ = position.z(units) + radius * Z_UNITS_PER_PX (radius 22 -> 1.375)', () => {
    const ch = new Character({ id: 'p', x: 0, y: 0, z: 0, radius: 22 });
    const zHeight = Math.max(1, 22 * Z_UNITS_PER_PX);
    expect(ch.aabb.maxZ).toBeCloseTo(0 + zHeight, 10);
    expect(zHeight).toBeCloseTo(1.375, 10);   // was 2.75 under the old /8 rule
  });

  it('baseZ converts position.z (pixels) to world units', () => {
    const ch = new Character({ id: 'p', x: 0, y: 0, z: 32, radius: 22 });
    expect(ch.aabb.baseZ).toBeCloseTo(32 * Z_UNITS_PER_PX, 10);  // 2.0
    expect(ch.aabb.maxZ!).toBeGreaterThan(ch.aabb.baseZ);
  });

  it('clamps tiny radius to a minimum 1-unit slab', () => {
    const ch = new Character({ id: 'p', x: 0, y: 0, z: 0, radius: 1 });
    expect(ch.aabb.maxZ!).toBeGreaterThanOrEqual(1);
  });
});

describe('Crystal - aabb Z units', () => {
  it('maxZ = heightPx * Z_UNITS_PER_PX (48px -> 3.0, no longer omitted)', () => {
    const c = new Crystal('c', 0, 0, '#8060e0', 48);
    expect(c.aabb.maxZ).toBeDefined();
    expect(c.aabb.maxZ).toBeCloseTo(48 * Z_UNITS_PER_PX, 10);
    expect(c.aabb.maxZ).toBeCloseTo(3, 10);
  });
});

describe('Boulder - aabb Z units', () => {
  it('maxZ = (2*radius) * Z_UNITS_PER_PX (radius 18 -> 2.25)', () => {
    const b = new Boulder('b', 0, 0, '#7a7a8a', 18);
    expect(b.aabb.maxZ).toBeDefined();
    expect(b.aabb.maxZ).toBeCloseTo(36 * Z_UNITS_PER_PX, 10);
    expect(b.aabb.maxZ).toBeCloseTo(2.25, 10);
  });
});

describe('Chest - aabb Z units', () => {
  it('maxZ is present and reflects body+lid pixel height', () => {
    const ch = new Chest('ch', 0, 0);
    expect(ch.aabb.maxZ).toBeDefined();
    expect(ch.aabb.maxZ!).toBeGreaterThan(0);
    // Approx: (32*1.1 + 32*0.5) = 51.2 px -> 51.2/16 = 3.2
    expect(ch.aabb.maxZ).toBeCloseTo(51.2 * Z_UNITS_PER_PX, 10);
    expect(ch.aabb.maxZ).toBeCloseTo(3.2, 10);
  });
});

describe('Cloud - aabb Z units', () => {
  it('baseZ converts altitude (position.z in px) to world units', () => {
    const cl = new Cloud({ id: 'cl', x: 0, y: 0, altitude: 6 });
    // position.z = altitude * 32 = 192 px; baseZ = 192/16 = 12 world units
    expect(cl.position.z).toBe(192);
    expect(cl.aabb.baseZ).toBeCloseTo(192 * Z_UNITS_PER_PX, 10);
    expect(cl.aabb.baseZ).toBeCloseTo(12, 10);
  });

  it('maxZ is above baseZ (cloud has thickness)', () => {
    const cl = new Cloud({ id: 'cl', x: 0, y: 0, altitude: 6, scale: 1 });
    expect(cl.aabb.maxZ).toBeDefined();
    expect(cl.aabb.maxZ!).toBeGreaterThan(cl.aabb.baseZ);
  });
});

describe('FloatingText - aabb Z units', () => {
  it('baseZ converts position.z (px) to world units', () => {
    const ft = new FloatingText({ id: 'ft', x: 1, y: 1, z: 48, text: 'hi' });
    expect(ft.aabb.baseZ).toBeCloseTo(48 * Z_UNITS_PER_PX, 10);  // 3.0
    expect(ft.aabb.maxZ).toBeCloseTo(48 * Z_UNITS_PER_PX + 1, 10);
  });
});

describe('Floor - aabb', () => {
  it('is a flat slab covering the grid (no maxZ)', () => {
    const f = new Floor({ id: 'f', cols: 10, rows: 8 });
    expect(f.aabb.minX).toBe(0);
    expect(f.aabb.minY).toBe(0);
    expect(f.aabb.maxX).toBe(10);
    expect(f.aabb.maxY).toBe(8);
    expect(f.aabb.baseZ).toBe(0);
    // Floor omits maxZ -> depthSort treats it as a 1-unit slab (intended).
  });
});

describe('AABB invariants across all object classes', () => {
  const cases = [
    ['Wall',      () => new Wall({ id: 'w', x: 0, y: 0, endX: 3, endY: 0, height: 64 })],
    ['Character', () => new Character({ id: 'p', x: 2, y: 2, z: 16, radius: 22 })],
    ['Crystal',   () => new Crystal('c', 2, 2, '#fff', 48)],
    ['Boulder',   () => new Boulder('b', 2, 2, '#fff', 18)],
    ['Chest',     () => new Chest('ch', 2, 2)],
    ['Cloud',     () => new Cloud({ id: 'cl', x: 2, y: 2, altitude: 6 })],
    ['FloatingText', () => new FloatingText({ id: 'ft', x: 2, y: 2, z: 16, text: 'x' })],
  ] as const;

  for (const [name, factory] of cases) {
    it(`${name}: minX <= maxX, minY <= maxY, maxZ > baseZ`, () => {
      const obj = factory();
      const a = obj.aabb;
      expect(a.minX).toBeLessThanOrEqual(a.maxX);
      expect(a.minY).toBeLessThanOrEqual(a.maxY);
      expect(a.maxZ!).toBeGreaterThan(a.baseZ);
    });
  }
});

describe('Cross-class Z-scale consistency', () => {
  it('Wall(80px) and Character(r=22) use the same Z unit', () => {
    // Before unification: Wall maxZ=5 (÷16), Character maxZ=2.75 (÷8) - the
    // character claimed the same height as a 44px wall. Now both use ÷16:
    // Wall=5, Character≈1.375, so a wall correctly towers over a character.
    const wall = new Wall({ id: 'w', x: 0, y: 0, endX: 4, endY: 0, height: 80 });
    const char = new Character({ id: 'p', x: 2, y: 0, z: 0, radius: 22 });
    expect(wall.aabb.maxZ!).toBeGreaterThan(char.aabb.maxZ!);
    // A 16px-tall object and a Character of radius 8 should match in Z scale.
    const smallWall = new Wall({ id: 'w2', x: 0, y: 0, endX: 1, endY: 0, height: 16 });
    const smallChar = new Character({ id: 'p2', x: 0, y: 0, z: 0, radius: 8 });
    expect(smallWall.aabb.maxZ).toBeCloseTo(smallChar.aabb.maxZ!, 2);
  });
});
