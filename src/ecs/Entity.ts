import { IsoObject, DrawContext } from '../elements/IsoObject';
import { AABB } from '../math/depthSort';
import { Component } from './Component';

/**
 * Entity extends IsoObject with a component map.
 * Subclass Entity instead of IsoObject when you need composable behaviours.
 *
 * Usage:
 *   class Crate extends Entity {
 *     get aabb() { ... }
 *     draw(dc) { ... }
 *   }
 *   const crate = new Crate('crate-1', 3, 4, 0);
 *   crate.addComponent(new HealthComponent(50));
 *   crate.addComponent(new AIComponent(patrolBehavior));
 */
/**
 * Entity — an IsoObject extended with a component map for composable behaviors.
 * Use this as a base for interactive objects like characters, props, and triggers.
 */
export abstract class Entity extends IsoObject {
  private _components = new Map<Function, Component>();

  constructor(id: string, x: number, y: number, z: number) {
    super(id, x, y, z);
  }

  // ── Component API ─────────────────────────────────────────────────────────

  addComponent<T extends Component>(component: T): T {
    this._components.set(component.constructor, component);
    component.onAttach?.(this);
    return component;
  }

  getComponent<T extends Component>(ctor: new(...a: any[]) => T): T | undefined {
    return this._components.get(ctor) as T | undefined;
  }

  hasComponent(ctor: new(...a: any[]) => Component): boolean {
    return this._components.has(ctor);
  }

  removeComponent(ctor: new(...a: any[]) => Component): void {
    const comp = this._components.get(ctor);
    if (comp) {
      comp.onDetach?.();
      this._components.delete(ctor);
    }
  }

  get components(): IterableIterator<Component> {
    return this._components.values();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Drive all attached components each frame. Call super.update() from subclasses. */
  update(ts?: number): void {
    for (const comp of this._components.values()) {
      comp.update?.(ts);
    }
  }

  // Subclasses must still implement aabb and draw
  abstract get aabb(): AABB;
  abstract draw(dc: DrawContext): void;
}
