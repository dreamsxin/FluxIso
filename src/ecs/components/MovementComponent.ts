import { IsoObject } from '../../elements/IsoObject';
import { Component } from '../Component';
import { TileCollider } from '../../physics/TileCollider';
import { EventBus, ArrivalEvent, MoveEvent } from '../EventBus';

export interface MovementOptions {
  /** Movement speed in world units per second. Default 2.0. */
  speed?: number;
  /** Collision footprint radius in world units. Default 0.4. */
  radius?: number;
  /** Optional EventBus to emit move/arrival events on. */
  bus?: EventBus;
  /** Optional TileCollider for collision resolution. */
  collider?: TileCollider | null;
}

/**
 * MovementComponent — reusable smooth movement with collision resolution.
 *
 * Attach to any Entity to give it `moveTo()` / `stopMoving()` behaviour,
 * decoupled from the Character class.
 *
 * Emits on the provided EventBus:
 *   'move'    — every frame while moving: { x, y, z }
 *   'arrival' — when destination is reached: { id, x, y }
 *
 * @example
 *   const mv = entity.addComponent(new MovementComponent({ speed: 3, bus: globalBus }));
 *   mv.moveTo(5, 7);
 *   bus.on<ArrivalEvent>('arrival', ({ id }) => console.log(id, 'arrived'));
 */
export class MovementComponent implements Component {
  readonly componentType = 'movement' as const;

  speed:  number;
  radius: number;

  private _owner:    IsoObject | null = null;
  private _target:   { x: number; y: number; z: number } | null = null;
  private _bus:      EventBus | null;
  private _collider: TileCollider | null;
  private _lastTs  = 0;

  constructor(opts: MovementOptions = {}) {
    this.speed    = opts.speed   ?? 2.0;
    this.radius   = opts.radius  ?? 0.4;
    this._bus     = opts.bus     ?? null;
    this._collider = opts.collider ?? null;
  }

  onAttach(owner: IsoObject): void { this._owner = owner; }
  onDetach(): void                 { this._owner = null; }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Begin smooth movement toward world position (x, y, z). */
  moveTo(x: number, y: number, z?: number): void {
    this._target = { x, y, z: z ?? (this._owner?.position.z ?? 0) };
  }

  /** Cancel any in-progress movement. */
  stopMoving(): void { this._target = null; }

  get isMoving(): boolean { return this._target !== null; }

  /** Attach or replace the TileCollider used for collision resolution. */
  setCollider(collider: TileCollider | null): void { this._collider = collider; }

  // ── Per-frame update ──────────────────────────────────────────────────────

  update(ts?: number): void {
    if (!this._owner || !this._target) return;

    const now = ts ?? performance.now();
    const dt  = this._lastTs === 0 ? 0 : Math.min((now - this._lastTs) / 1000, 0.1);
    this._lastTs = now;
    if (dt === 0) return;

    const pos = this._owner.position;
    const dx  = this._target.x - pos.x;
    const dy  = this._target.y - pos.y;
    const dz  = this._target.z - pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const step = this.speed * dt;

    if (dist <= step) {
      // Arrived
      const r = this.radius;
      const ok = !this._collider || this._collider.canOccupy(
        this._target.x - r, this._target.y - r,
        this._target.x + r, this._target.y + r,
      );
      if (ok) {
        pos.x = this._target.x;
        pos.y = this._target.y;
        pos.z = this._target.z;
      }
      this._target = null;
      this._bus?.emit<ArrivalEvent>('arrival', { id: this._owner.id, x: pos.x, y: pos.y });
    } else {
      const nx = (dx / dist) * step;
      const ny = (dy / dist) * step;

      let rdx = nx, rdy = ny;
      if (this._collider) {
        const resolved = this._collider.resolveMove(pos.x, pos.y, nx, ny, this.radius);
        rdx = resolved.dx;
        rdy = resolved.dy;
        if (rdx === 0 && rdy === 0) { this._target = null; return; }
      }

      pos.x += rdx;
      pos.y += rdy;
      pos.z += (dz / dist) * step;

      this._bus?.emit<MoveEvent>('move', { x: pos.x, y: pos.y, z: pos.z });
    }
  }
}
