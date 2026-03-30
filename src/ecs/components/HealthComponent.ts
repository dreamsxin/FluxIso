import { IsoObject } from '../../elements/IsoObject';
import { Component } from '../Component';

export interface HealthOptions {
  max: number;
  current?: number;
  /** Called when hp drops to 0. */
  onDeath?: (owner: IsoObject) => void;
  /** Called on any hp change. */
  onChange?: (current: number, max: number, owner: IsoObject) => void;
}

/**
 * Built-in health component.
 * Attach to any Entity to give it HP, damage, and healing logic.
 *
 * @example
 * entity.addComponent(new HealthComponent({ max: 100, onDeath: (e) => scene.removeById(e.id) }));
 * entity.getComponent<HealthComponent>('health').takeDamage(25);
 */
export class HealthComponent implements Component {
  readonly componentType = 'health' as const;

  private _max: number;
  private _current: number;
  private _owner: IsoObject | null = null;
  private readonly _onDeath?: (owner: IsoObject) => void;
  private readonly _onChange?: (current: number, max: number, owner: IsoObject) => void;

  constructor(opts: HealthOptions) {
    this._max = opts.max;
    this._current = opts.current ?? opts.max;
    this._onDeath = opts.onDeath;
    this._onChange = opts.onChange;
  }

  onAttach(owner: IsoObject): void {
    this._owner = owner;
  }

  onDetach(): void {
    this._owner = null;
  }

  // No per-frame logic needed; update is a no-op
  update(_ts?: number): void {}

  // ── Stats ─────────────────────────────────────────────────────────────────

  get hp(): number { return this._current; }
  get maxHp(): number { return this._max; }
  get fraction(): number { return this._current / this._max; }
  get isDead(): boolean { return this._current <= 0; }

  // ── Mutations ─────────────────────────────────────────────────────────────

  takeDamage(amount: number): void {
    if (this.isDead) return;
    this._current = Math.max(0, this._current - amount);
    this._notify();
    if (this._current === 0 && this._owner) {
      this._onDeath?.(this._owner);
    }
  }

  heal(amount: number): void {
    if (this.isDead) return;
    this._current = Math.min(this._max, this._current + amount);
    this._notify();
  }

  setMax(max: number, scaleCurrentHp = false): void {
    const ratio = scaleCurrentHp ? this._current / this._max : 1;
    this._max = max;
    this._current = scaleCurrentHp ? Math.round(max * ratio) : Math.min(this._current, max);
    this._notify();
  }

  private _notify(): void {
    if (this._owner) this._onChange?.(this._current, this._max, this._owner);
  }
}
