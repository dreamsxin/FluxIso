import { describe, it, expect } from 'vitest';
import { Pathfinder } from '../physics/Pathfinder';
import { TileCollider } from '../physics/TileCollider';

function makeGrid(cols: number, rows: number, blocked: [number, number][] = []): TileCollider {
  const c = new TileCollider(cols, rows);
  for (const [col, row] of blocked) c.setWalkable(col, row, false);
  return c;
}

describe('Pathfinder.find — basic', () => {
  it('returns single waypoint when start === goal tile', () => {
    const c = makeGrid(5, 5);
    const path = Pathfinder.find(c, { x: 2.3, y: 1.7 }, { x: 2.8, y: 1.1 });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(1);
  });

  it('finds straight path in open grid', () => {
    const c = makeGrid(10, 10);
    const path = Pathfinder.find(c, { x: 0.5, y: 0.5 }, { x: 5.5, y: 0.5 });
    expect(path).not.toBeNull();
    // All waypoints should be in row 0 (y ≈ 0.5)
    for (const wp of path!) {
      expect(wp.y).toBeCloseTo(0.5, 0);
    }
  });

  it('returns null when goal is blocked', () => {
    const c = makeGrid(5, 5, [[2, 2]]);
    const path = Pathfinder.find(c, { x: 0.5, y: 0.5 }, { x: 2.5, y: 2.5 });
    expect(path).toBeNull();
  });

  it('navigates around a wall', () => {
    // Block col 2 entirely — must go around
    const c = makeGrid(7, 5);
    for (let r = 0; r < 4; r++) c.setWalkable(2, r, false);
    // Leave row 4 open as the passage under the wall
    const path = Pathfinder.find(c, { x: 0.5, y: 2.5 }, { x: 5.5, y: 2.5 });
    expect(path).not.toBeNull();
    // Path must not cross col 2 before row 4
    for (const wp of path!) {
      if (wp.y < 4) {
        expect(wp.x).not.toBeCloseTo(2.5, 0);
      }
    }
  });

  it('finds diagonal path', () => {
    const c = makeGrid(6, 6);
    const path = Pathfinder.find(c, { x: 0.5, y: 0.5 }, { x: 5.5, y: 5.5 });
    expect(path).not.toBeNull();
    // Should be shorter than a Manhattan path (6+6=12 steps)
    expect(path!.length).toBeLessThan(10);
  });

  it('prevents diagonal corner-cutting through walls', () => {
    // Layout (7×3 grid):
    //   start=(0,1), goal=(6,1)
    //   Wall at col 3 rows 0,1,2 — EXCEPT row 2 is open
    //   The only passage is bottom (row 2), so path must dip down
    const c = makeGrid(7, 4, [[3, 0], [3, 1]]);
    // Diagonal from (2,0)→(4,2) would corner-cut through (3,1) which is blocked
    const path = Pathfinder.find(c, { x: 0.5, y: 1.5 }, { x: 6.5, y: 1.5 });
    expect(path).not.toBeNull();
    // Path must pass through row 2 to get past the wall
    const passesRow2 = path!.some(wp => wp.y >= 2.0 && wp.y < 3.0);
    expect(passesRow2).toBe(true);
  });

  it('handles isolated goal with no route', () => {
    // Surround goal with walls
    const c = makeGrid(5, 5, [
      [2, 1], [1, 2], [3, 2], [2, 3],
      [1, 1], [3, 1], [1, 3], [3, 3],
    ]);
    const path = Pathfinder.find(c, { x: 0.5, y: 0.5 }, { x: 2.5, y: 2.5 });
    expect(path).toBeNull();
  });
});

describe('Pathfinder.find — MovementComponent integration', () => {
  it('produces waypoints within grid bounds', () => {
    const cols = 8, rows = 8;
    const c = makeGrid(cols, rows, [[3, 0],[3,1],[3,2],[3,3],[3,4]]);
    const path = Pathfinder.find(c, { x: 1, y: 2 }, { x: 6, y: 2 });
    expect(path).not.toBeNull();
    for (const wp of path!) {
      expect(wp.x).toBeGreaterThanOrEqual(0);
      expect(wp.x).toBeLessThanOrEqual(cols);
      expect(wp.y).toBeGreaterThanOrEqual(0);
      expect(wp.y).toBeLessThanOrEqual(rows);
    }
  });
});
