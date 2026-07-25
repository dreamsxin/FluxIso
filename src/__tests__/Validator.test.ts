import { describe, it, expect } from 'vitest';
import { validateSceneJson, validateComponents, requireComponent } from '../core/Validator';
import { Crystal } from '../elements/props/Crystal';
import { HealthComponent } from '../ecs/components/HealthComponent';
import { MovementComponent } from '../ecs/components/MovementComponent';

describe('validateSceneJson', () => {
  it('passes a valid minimal scene', () => {
    const r = validateSceneJson({ cols: 10, rows: 10, tileW: 64, tileH: 32 });
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('errors on non-object input', () => {
    expect(validateSceneJson(null).ok).toBe(false);
    expect(validateSceneJson('string').ok).toBe(false);
  });

  it('errors on invalid cols/rows', () => {
    const r = validateSceneJson({ cols: 0, rows: -1 });
    expect(r.errors.some(e => e.includes('cols'))).toBe(true);
    expect(r.errors.some(e => e.includes('rows'))).toBe(true);
  });

  it('warns on non-standard tile ratio', () => {
    const r = validateSceneJson({ cols: 5, rows: 5, tileW: 64, tileH: 64 });
    expect(r.warnings.some(w => w.includes('ratio'))).toBe(true);
  });

  it('errors on missing floor.id', () => {
    const r = validateSceneJson({ cols: 5, rows: 5, floor: { cols: 5, rows: 5 } });
    expect(r.errors.some(e => e.includes('floor.id'))).toBe(true);
  });

  it('warns on walkable row count mismatch', () => {
    const r = validateSceneJson({
      cols: 3, rows: 3,
      floor: { id: 'f', walkable: [[true, true, true], [true, true, true]] }, // only 2 rows
    });
    expect(r.warnings.some(w => w.includes('rows'))).toBe(true);
  });

  it('errors on invalid light type', () => {
    const r = validateSceneJson({ lights: [{ type: 'spot' }] });
    expect(r.errors.some(e => e.includes('type'))).toBe(true);
  });

  it('warns on character out of bounds', () => {
    const r = validateSceneJson({
      cols: 5, rows: 5,
      characters: [{ id: 'p', x: 10, y: 10 }],
    });
    expect(r.warnings.some(w => w.includes('outside'))).toBe(true);
  });
});

describe('validateComponents', () => {
  it('passes when all required components present', () => {
    const entity = new Crystal('e', 0, 0);
    entity.addComponent(new HealthComponent({ max: 10 }));
    const r = validateComponents(entity, [HealthComponent]);
    expect(r.ok).toBe(true);
  });

  it('accepts custom registry types supplied by the caller', () => {
    const r = validateSceneJson({
      lights: [{ type: 'spot', x: 1, y: 2 }],
      props: [{ id: 'door-1', type: 'door', x: 1, y: 2 }],
    }, {
      lightTypes: ['spot'],
      propTypes: ['door'],
    });
    expect(r.ok).toBe(true);
  });

  it('errors on missing component', () => {
    const entity = new Crystal('e', 0, 0);
    const r = validateComponents(entity, [HealthComponent, MovementComponent]);
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toContain('HealthComponent');
    expect(r.errors[1]).toContain('MovementComponent');
  });
});

describe('requireComponent', () => {
  it('returns component when present', () => {
    const entity = new Crystal('e', 0, 0);
    const comp = entity.addComponent(new HealthComponent({ max: 10 }));
    expect(requireComponent(entity, HealthComponent)).toBe(comp);
  });

  it('throws when required component missing', () => {
    const entity = new Crystal('e', 0, 0);
    expect(() => requireComponent(entity, HealthComponent)).toThrow(/HealthComponent/);
  });

  it('returns undefined when not required', () => {
    const entity = new Crystal('e', 0, 0);
    expect(requireComponent(entity, HealthComponent, false)).toBeUndefined();
  });
});
