import { describe, it, expect } from 'vitest';
import { project, unproject, depthKey } from '../math/IsoProjection';

const TW = 64;
const TH = 32;

describe('project', () => {
  it('origin maps to (0, 0)', () => {
    const { sx, sy } = project(0, 0, 0, TW, TH);
    expect(sx).toBe(0);
    expect(sy).toBe(0);
  });

  it('x+1 moves right and down', () => {
    const { sx, sy } = project(1, 0, 0, TW, TH);
    expect(sx).toBe(TW / 2);
    expect(sy).toBe(TH / 2);
  });

  it('y+1 moves left and down', () => {
    const { sx, sy } = project(0, 1, 0, TW, TH);
    expect(sx).toBe(-TW / 2);
    expect(sy).toBe(TH / 2);
  });

  it('z+1 moves up (sy decreases)', () => {
    const { sx, sy } = project(0, 0, 1, TW, TH);
    expect(sx).toBe(0);
    expect(sy).toBe(-1);
  });

  it('diagonal x=y cancels sx', () => {
    const { sx } = project(3, 3, 0, TW, TH);
    expect(sx).toBe(0);
  });
});

describe('unproject', () => {
  it('is the inverse of project at z=0', () => {
    const cases: [number, number][] = [[0, 0], [3, 2], [5, 5], [1, 9]];
    for (const [wx, wy] of cases) {
      const { sx, sy } = project(wx, wy, 0, TW, TH);
      const { x, y } = unproject(sx, sy, TW, TH);
      expect(x).toBeCloseTo(wx, 8);
      expect(y).toBeCloseTo(wy, 8);
    }
  });
});

describe('depthKey', () => {
  it('larger x+y = larger depth key', () => {
    expect(depthKey(2, 3, 0)).toBeGreaterThan(depthKey(1, 3, 0));
    expect(depthKey(1, 4, 0)).toBeGreaterThan(depthKey(1, 3, 0));
  });

  it('z has minimal influence compared to x+y', () => {
    // z=1000 should not overtake a 1-unit x+y difference
    expect(depthKey(2, 0, 0)).toBeGreaterThan(depthKey(0, 0, 1000));
  });
});
