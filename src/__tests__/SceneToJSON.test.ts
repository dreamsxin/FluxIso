import { describe, it, expect } from 'vitest';
import { Scene } from '../core/Scene';
import { Floor } from '../elements/Floor';
import { Wall } from '../elements/Wall';
import { Character } from '../elements/Character';
import { Cloud } from '../elements/props/Cloud';
import { OmniLight } from '../lighting/OmniLight';
import { DirectionalLight } from '../lighting/DirectionalLight';
import { TileCollider } from '../physics/TileCollider';

function buildScene(): Scene {
  const scene = new Scene({ tileW: 64, tileH: 32, cols: 6, rows: 6 });

  scene.addObject(new Floor({ id: 'floor', cols: 6, rows: 6, color: '#333344' }));
  scene.addObject(new Wall({ id: 'w1', x: 0, y: 0, endX: 6, endY: 0, height: 64, color: '#445566' }));
  scene.addObject(new Character({ id: 'player', x: 2, y: 3, z: 0, radius: 20, color: '#5590cc' }));
  scene.addObject(new Cloud({ id: 'c1', x: 1, y: 1, altitude: 5, speed: 0.3, angle: 0.2, scale: 1.1, seed: 0.6 }));

  scene.addLight(new OmniLight({ x: 3, y: 3, z: 100, color: '#ffcc66', intensity: 1.2, radius: 300 }));
  scene.addLight(new DirectionalLight({ angle: 45, elevation: 60, color: '#aabbff', intensity: 0.3 }));

  const collider = new TileCollider(6, 6);
  collider.setWalkable(0, 0, false);
  scene.collider = collider;

  return scene;
}

describe('Scene.toJSON()', () => {
  it('exports correct top-level fields', () => {
    const json = buildScene().toJSON();
    expect(json.cols).toBe(6);
    expect(json.rows).toBe(6);
    expect(json.tileW).toBe(64);
    expect(json.tileH).toBe(32);
  });

  it('exports floor with color and walkable grid', () => {
    const json = buildScene().toJSON() as Record<string, unknown>;
    const floor = json.floor as Record<string, unknown>;
    expect(floor).toBeTruthy();
    expect(floor.id).toBe('floor');
    expect(floor.cols).toBe(6);
    expect(floor.color).toBe('#333344');
    // walkable grid from collider
    const walkable = floor.walkable as boolean[][];
    expect(walkable[0][0]).toBe(false);   // blocked
    expect(walkable[0][1]).toBe(true);    // walkable
  });

  it('exports walls correctly', () => {
    const json = buildScene().toJSON() as Record<string, unknown>;
    const walls = json.walls as Record<string, unknown>[];
    expect(walls).toHaveLength(1);
    expect(walls[0].id).toBe('w1');
    expect(walls[0].x).toBe(0);
    expect(walls[0].endX).toBe(6);
    expect(walls[0].height).toBe(64);
  });

  it('exports omni and directional lights', () => {
    const json = buildScene().toJSON() as Record<string, unknown>;
    const lights = json.lights as Record<string, unknown>[];
    expect(lights).toHaveLength(2);

    const omni = lights.find(l => l.type === 'omni')!;
    expect(omni.x).toBe(3);
    expect(omni.color).toBe('#ffcc66');
    expect(omni.intensity).toBe(1.2);

    const dir = lights.find(l => l.type === 'directional')!;
    expect(dir.angle).toBe(45);
    expect(dir.elevation).toBe(60);
    expect(dir.intensity).toBe(0.3);
  });

  it('exports characters', () => {
    const json = buildScene().toJSON() as Record<string, unknown>;
    const chars = json.characters as Record<string, unknown>[];
    expect(chars).toHaveLength(1);
    expect(chars[0].id).toBe('player');
    expect(chars[0].x).toBe(2);
    expect(chars[0].color).toBe('#5590cc');
  });

  it('exports clouds with correct altitude', () => {
    const json = buildScene().toJSON() as Record<string, unknown>;
    const clouds = json.clouds as Record<string, unknown>[];
    expect(clouds).toHaveLength(1);
    expect(clouds[0].id).toBe('c1');
    expect(clouds[0].altitude).toBeCloseTo(5, 1);
    expect(clouds[0].speed).toBeCloseTo(0.3, 3);
    expect(clouds[0].seed).toBeCloseTo(0.6, 3);
  });

  it('produces JSON that JSON.stringify round-trips cleanly', () => {
    const json = buildScene().toJSON();
    const str  = JSON.stringify(json);
    const back = JSON.parse(str);
    expect(back.cols).toBe(6);
    expect((back.lights as unknown[]).length).toBe(2);
  });
});
