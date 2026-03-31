import { describe, it, expect } from 'vitest';
import { topoSort, Sortable } from '../math/depthSort';

function makeObj(minX: number, minY: number, maxX: number, maxY: number, baseZ = 0): Sortable {
  return { aabb: { minX, minY, maxX, maxY, baseZ } };
}

describe('topoSort', () => {
  it('returns empty array for empty input', () => {
    expect(topoSort([])).toEqual([]);
  });

  it('returns single item unchanged', () => {
    const obj = makeObj(0, 0, 1, 1);
    expect(topoSort([obj])).toEqual([obj]);
  });

  it('non-overlapping objects: smaller x+y drawn first', () => {
    const back  = makeObj(0, 0, 1, 1);   // centre (0.5, 0.5) → depth 1
    const front = makeObj(3, 3, 4, 4);   // centre (3.5, 3.5) → depth 7
    const result = topoSort([front, back]);
    expect(result[0]).toBe(back);
    expect(result[1]).toBe(front);
  });

  it('overlapping objects: the one with smaller maxX is drawn first', () => {
    // Two objects that share floor space — the one ending earlier on X is behind
    const behind = makeObj(0, 0, 2, 2);
    const inFront = makeObj(1, 1, 3, 3);
    const result = topoSort([inFront, behind]);
    expect(result[0]).toBe(behind);
    expect(result[1]).toBe(inFront);
  });

  it('preserves all items', () => {
    const objs = [
      makeObj(0, 0, 1, 1),
      makeObj(2, 0, 3, 1),
      makeObj(0, 2, 1, 3),
      makeObj(2, 2, 3, 3),
    ];
    const result = topoSort(objs);
    expect(result).toHaveLength(4);
    for (const o of objs) expect(result).toContain(o);
  });

  it('handles cycle gracefully (no infinite loop)', () => {
    // Pathological case: two objects with identical AABBs
    const a = makeObj(1, 1, 2, 2);
    const b = makeObj(1, 1, 2, 2);
    const result = topoSort([a, b]);
    expect(result).toHaveLength(2);
  });
});
