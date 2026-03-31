import { describe, it, expect } from 'vitest';
import { validateSceneJson, validateComponents, requireComponent } from '../core/Validator';

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
    const entity = { id: 'e', hasComponent: (t: string) => t === 'health' };
    const r = validateComponents(entity, ['health']);
    expect(r.ok).toBe(true);
  });

  it('errors on missing component', () => {
    const entity = { id: 'e', hasComponent: () => false };
    const r = validateComponents(entity, ['health', 'movement']);
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(2);
  });
});

describe('requireComponent', () => {
  it('returns component when present', () => {
    const comp = { componentType: 'health' };
    const entity = { id: 'e', getComponent: () => comp };
    expect(requireComponent(entity, 'health')).toBe(comp);
  });

  it('throws when required component missing', () => {
    const entity = { id: 'e', getComponent: () => undefined };
    expect(() => requireComponent(entity, 'health')).toThrow(/health/);
  });

  it('returns undefined when not required', () => {
    const entity = { id: 'e', getComponent: () => undefined };
    expect(requireComponent(entity, 'health', false)).toBeUndefined();
  });
});
