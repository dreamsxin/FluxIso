import { describe, it, expect } from 'vitest';
import { Character } from '../elements/Character';
import { TileCollider } from '../physics/TileCollider';

function makeCollider(cols: number, rows: number, blocked: [number, number][] = []): TileCollider {
  const c = new TileCollider(cols, rows);
  for (const [col, row] of blocked) c.setWalkable(col, row, false);
  return c;
}

describe('Character.moveTo()', () => {
  it('starts moving and arrives at target', () => {
    const ch = new Character({ id: 'p', x: 0, y: 0, speed: 0.5 });
    ch.moveTo(2, 0);
    expect(ch.isMoving).toBe(true);

    let ts = 1000;
    for (let i = 0; i < 200; i++) { ch.update(ts); ts += 16.67; }

    expect(ch.position.x).toBeCloseTo(2, 1);
    expect(ch.isMoving).toBe(false);
  });

  it('stopMoving cancels movement immediately', () => {
    const ch = new Character({ id: 'p', x: 0, y: 0, speed: 0.1 });
    ch.moveTo(5, 0);
    ch.stopMoving();
    expect(ch.isMoving).toBe(false);
    expect(ch.remainingWaypoints.length).toBe(0);
  });
});

describe('Character.pathTo()', () => {
  it('returns true on open grid and moves toward goal', () => {
    const c = makeCollider(10, 10);
    const ch = new Character({ id: 'p', x: 0.5, y: 0.5, speed: 0.5 });
    const ok = ch.pathTo(8, 8, c);
    expect(ok).toBe(true);
    expect(ch.isMoving).toBe(true);
  });

  it('returns false when goal is unreachable', () => {
    const c = makeCollider(5, 5, [[2, 0],[2,1],[2,2],[2,3],[2,4]]);
    const ch = new Character({ id: 'p', x: 0.5, y: 2.5, speed: 0.5 });
    const ok = ch.pathTo(4, 2, c);
    expect(ok).toBe(false);
    expect(ch.isMoving).toBe(false);
  });

  it('actually reaches the goal after enough updates', () => {
    const c = makeCollider(10, 5);
    const ch = new Character({ id: 'p', x: 0.5, y: 2.5, speed: 0.3 });
    ch.pathTo(8, 2, c);

    let ts = 1000;
    for (let i = 0; i < 500; i++) { ch.update(ts, c); ts += 16.67; }

    expect(ch.position.x).toBeCloseTo(8.5, 0);
    expect(ch.isMoving).toBe(false);
  });

  it('falls back to direct moveTo when no collider given', () => {
    const ch = new Character({ id: 'p', x: 0, y: 0, speed: 0.5 });
    const ok = ch.pathTo(3, 3, null);
    expect(ok).toBe(true);
    expect(ch.isMoving).toBe(true);
  });

  it('navigates around a wall', () => {
    // Vertical wall at col 2, rows 0–3; open at row 4
    const c = makeCollider(8, 6);
    for (let r = 0; r < 4; r++) c.setWalkable(2, r, false);

    const ch = new Character({ id: 'p', x: 0.5, y: 2.5, speed: 0.4 });
    const ok = ch.pathTo(5, 2, c);
    expect(ok).toBe(true);

    let ts = 1000;
    for (let i = 0; i < 600; i++) { ch.update(ts, c); ts += 16.67; }

    expect(ch.position.x).toBeGreaterThan(4);
    expect(ch.isMoving).toBe(false);
  });
});

describe('Character.followPath()', () => {
  it('advances through pre-computed waypoints', () => {
    const ch = new Character({ id: 'p', x: 0.5, y: 0.5, speed: 0.5 });
    ch.followPath([
      { x: 2.5, y: 0.5 },
      { x: 4.5, y: 0.5 },
      { x: 4.5, y: 3.5 },
    ]);
    expect(ch.isMoving).toBe(true);

    let ts = 1000;
    for (let i = 0; i < 500; i++) { ch.update(ts); ts += 16.67; }

    expect(ch.position.x).toBeCloseTo(4.5, 0);
    expect(ch.position.y).toBeCloseTo(3.5, 0);
    expect(ch.isMoving).toBe(false);
  });
});
