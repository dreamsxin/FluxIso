/**
 * EventBus — lightweight typed event system for ECS inter-component communication.
 *
 * Components can emit and subscribe to named events without direct references
 * to each other, keeping game logic decoupled from rendering.
 *
 * Usage:
 *   const bus = new EventBus();
 *
 *   // Subscribe
 *   const unsub = bus.on('damage', ({ amount }) => console.log('hit for', amount));
 *
 *   // Emit
 *   bus.emit('damage', { amount: 25 });
 *
 *   // Unsubscribe
 *   unsub();
 *
 * A global singleton is exported as `globalBus` for scene-wide events.
 * Entities can also carry their own local bus for per-object events.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler<T = any> = (payload: T) => void;

export class EventBus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _handlers = new Map<string, Set<Handler<any>>>();

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on<T>(event: string, handler: Handler<T>): () => void {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Subscribe to an event once — auto-unsubscribes after first call.
   */
  once<T>(event: string, handler: Handler<T>): () => void {
    const wrapper: Handler<T> = (payload) => {
      handler(payload);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  /**
   * Unsubscribe a specific handler.
   */
  off<T>(event: string, handler: Handler<T>): void {
    this._handlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event, calling all registered handlers synchronously.
   */
  emit<T>(event: string, payload: T): void {
    const handlers = this._handlers.get(event);
    if (!handlers) return;
    for (const h of handlers) h(payload);
  }

  /**
   * Remove all handlers for a specific event, or all events if omitted.
   */
  clear(event?: string): void {
    if (event) {
      this._handlers.delete(event);
    } else {
      this._handlers.clear();
    }
  }

  /** Number of handlers registered for a given event. */
  listenerCount(event: string): number {
    return this._handlers.get(event)?.size ?? 0;
  }
}

/** Scene-wide global event bus. Import and use anywhere. */
export const globalBus = new EventBus();

// ── Common event payload types ────────────────────────────────────────────────

export interface DamageEvent   { amount: number; sourceId?: string }
export interface HealEvent     { amount: number }
export interface DeathEvent    { id: string }
export interface MoveEvent     { x: number; y: number; z: number }
export interface ArrivalEvent  { id: string; x: number; y: number }
export interface TriggerEvent  { triggerId: string; enterId: string }
