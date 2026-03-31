import { describe, it, expect, vi } from 'vitest';
import { MovementComponent } from '../ecs/components/MovementComponent';
import { TileCollider } from '../physics/TileCollider';
import { EventBus } from '../ecs/EventBus';
import { IsoObject } from '../elements/IsoObject';

function makeOwner(x = 0, y = 0, z = 0): IsoObject {
  return { id: 'e', position: { x, y, z }, aabb: { minX: 0, minY: 0, maxX: 1, maxY: 1, baseZ: 0 }, draw: () => {} } as unknown as IsoObject;
}

describe('MovementComponent — basic movement', () => {
  it('moves toward target over time', () => {
    const owner = makeOwner(0, 0, 0);
    const mv = new MovementComponent({ speed: 2 });
    mv.onAttach(owner);
    mv.moveTo(2, 0);

    // Simulate 0.5 s at 60 fps (ts increments)
    let ts = 1000;
    for (let i = 0; i < 30; i++) { mv.update(ts); ts += 16.67; }

    expect(owner.position.x).toBeGreaterThan(0);
    expect(mv.isMoving).toBe(true);
  });

  it('arrives and stops', () => {
    const owner = makeOwner(0, 0, 0);
    const mv = new MovementComponent({ speed: 10 });
    mv.onAttach(owner);
    mv.moveTo(0.5, 0);

    let ts = 1000;
    for (let i = 0; i < 60; i++) { mv.update(ts); ts += 16.67; }

    expect(owner.position.x).toBeCloseTo(0.5, 1);
    expect(mv.isMoving).toBe(false);
  });

  it('emits arrival event', () => {
    const bus = new EventBus();
    const onArrival = vi.fn();
    bus.on('arrival', onArrival);

    const owner = makeOwner(0, 0, 0);
    const mv = new MovementComponent({ speed: 10, bus });
    mv.onAttach(owner);
    mv.moveTo(0.1, 0);

    let ts = 1000;
    for (let i = 0; i < 30; i++) { mv.update(ts); ts += 16.67; }

    expect(onArrival).toHaveBeenCalled();
  });

  it('stopMoving cancels target', () => {
    const owner = makeOwner(0, 0, 0);
    const mv = new MovementComponent({ speed: 1 });
    mv.onAttach(owner);
    mv.moveTo(5, 0);
    mv.stopMoving();
    expect(mv.isMoving).toBe(false);
  });
});

describe('MovementComponent — collision', () => {
  it('stops when blocked', () => {
    const collider = new TileCollider(5, 5);
    for (let r = 0; r < 5; r++) collider.setWalkable(2, r, false);

    const owner = makeOwner(1.5, 2.5, 0);
    const mv = new MovementComponent({ speed: 5, collider });
    mv.onAttach(owner);
    mv.moveTo(3, 2.5);

    let ts = 1000;
    for (let i = 0; i < 60; i++) { mv.update(ts); ts += 16.67; }

    // Should not have crossed into col 2
    expect(owner.position.x).toBeLessThan(2);
  });
});
