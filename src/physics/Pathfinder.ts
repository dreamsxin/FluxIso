import { TileCollider } from './TileCollider';

export interface IsoVec2 { x: number; y: number; }

interface Node {
  col: number;
  row: number;
  g: number;   // cost from start
  h: number;   // heuristic to goal
  f: number;   // g + h
  parent: Node | null;
  /** Heap index — kept in sync by BinaryHeap for O(1) decrease-key. */
  _heapIdx: number;
}
// ── Binary min-heap keyed on Node.f ─────────────────────────────────────────
// Standard array-backed heap. push O(log n), pop O(log n), update O(log n).

class BinaryHeap {
  private _data: Node[] = [];

  get size(): number { return this._data.length; }

  push(node: Node): void {
    node._heapIdx = this._data.length;
    this._data.push(node);
    this._bubbleUp(this._data.length - 1);
  }

  pop(): Node {
    const top  = this._data[0];
    const last = this._data.pop()!;
    if (this._data.length > 0) {
      last._heapIdx = 0;
      this._data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  /** Call after decreasing node.f to restore heap invariant. */
  decreased(node: Node): void {
    this._bubbleUp(node._heapIdx);
  }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._data[parent].f <= this._data[i].f) break;
      this._swap(parent, i);
      i = parent;
    }
  }

  private _sinkDown(i: number): void {
    const n = this._data.length;
    for (;;) {
      let smallest = i;
      const l = (i << 1) + 1;
      const r = l + 1;
      if (l < n && this._data[l].f < this._data[smallest].f) smallest = l;
      if (r < n && this._data[r].f < this._data[smallest].f) smallest = r;
      if (smallest === i) break;
      this._swap(i, smallest);
      i = smallest;
    }
  }

  private _swap(a: number, b: number): void {
    const da = this._data[a];
    const db = this._data[b];
    da._heapIdx = b;
    db._heapIdx = a;
    this._data[a] = db;
    this._data[b] = da;
  }
}

const key = (col: number, row: number) => `${col},${row}`;

// ── Path result cache ─────────────────────────────────────────────────────────
// LRU cache keyed by "sc,sr→gc,gr". Invalidated when the collider changes.
// Capacity is intentionally small — pathfinding is typically called for a
// handful of agents, and stale entries waste memory.

const CACHE_CAPACITY = 64;

interface CacheEntry {
  result: IsoVec2[] | null;
  lruOrder: number;
}

let _cacheCollider: TileCollider | null = null;
let _cacheVersion  = 0;   // bumped on collider swap
let _lruClock      = 0;
const _cache       = new Map<string, CacheEntry & { version: number }>();

function _cacheGet(collider: TileCollider, cacheKey: string): IsoVec2[] | null | undefined {
  if (collider !== _cacheCollider) return undefined; // miss — different collider
  const entry = _cache.get(cacheKey);
  if (!entry || entry.version !== _cacheVersion) return undefined;
  entry.lruOrder = ++_lruClock;
  return entry.result;
}

function _cacheSet(collider: TileCollider, cacheKey: string, result: IsoVec2[] | null): void {
  if (collider !== _cacheCollider) {
    // New collider — flush everything
    _cache.clear();
    _cacheCollider = collider;
    _cacheVersion++;
  }
  if (_cache.size >= CACHE_CAPACITY) {
    // Evict LRU entry
    let oldest = Infinity, oldestKey = '';
    for (const [k, v] of _cache) {
      if (v.lruOrder < oldest) { oldest = v.lruOrder; oldestKey = k; }
    }
    if (oldestKey) _cache.delete(oldestKey);
  }
  _cache.set(cacheKey, { result, lruOrder: ++_lruClock, version: _cacheVersion });
}

/**
 * Invalidate the path cache for a specific collider.
 * Call this whenever you modify walkability (e.g. a door opens/closes).
 */
function invalidateCache(collider?: TileCollider): void {
  if (!collider || collider === _cacheCollider) {
    _cacheVersion++;
    _cache.clear();
  }
}

/**
 * A* pathfinder over a TileCollider grid.
 *
 * Returns a list of world-space waypoints (tile centres) from the tile
 * containing `start` to the tile containing `goal`, or null if no path exists.
 *
 * - Supports 8-directional movement (diagonal cost = √2).
 * - Diagonal moves are blocked when both adjacent cardinal tiles are blocked
 *   (corner-cutting prevention).
 * - Open list uses a binary min-heap for O(log n) push/pop.
 * - Path is post-processed with Bresenham LoS string-pulling to straighten
 *   zigzag routes across open areas.
 * - Results are cached per (collider, start-tile, goal-tile). The cache is
 *   automatically flushed when a different collider is passed. Call
 *   `Pathfinder.invalidateCache()` after modifying walkability at runtime.
 *
 * @example
 *   const path = Pathfinder.find(collider, { x: 1, y: 1 }, { x: 7, y: 5 });
 *   if (path) mv.followPath(path);
 */
export class Pathfinder {
  /**
   * Find a path from `start` to `goal` on the given collider grid.
   * Returns tile-centre world coordinates, or `null` if unreachable.
   * Results are cached — repeated calls with the same inputs are O(1).
   */
  static find(
    collider: TileCollider,
    start: IsoVec2,
    goal: IsoVec2,
  ): IsoVec2[] | null {
    const sc = Math.floor(start.x);
    const sr = Math.floor(start.y);
    const gc = Math.floor(goal.x);
    const gr = Math.floor(goal.y);

    const cacheKey = `${sc},${sr}→${gc},${gr}`;
    const cached = _cacheGet(collider, cacheKey);
    if (cached !== undefined) return cached;

    const result = Pathfinder._search(collider, sc, sr, gc, gr);
    _cacheSet(collider, cacheKey, result);
    return result;
  }

  /**
   * Invalidate the path result cache.
   * Call after modifying collider walkability at runtime (e.g. opening a door).
   * If `collider` is omitted, all cached results are cleared.
   */
  static invalidateCache(collider?: TileCollider): void {
    invalidateCache(collider);
  }

  // ── Internal A* search ───────────────────────────────────────────────────

  private static _search(
    collider: TileCollider,
    sc: number, sr: number,
    gc: number, gr: number,
  ): IsoVec2[] | null {
    if (!collider.isWalkable(gc, gr)) return null;
    if (sc === gc && sr === gr) return [{ x: gc + 0.5, y: gr + 0.5 }];

    const open   = new BinaryHeap();
    const closed = new Set<string>();
    const best   = new Map<string, number>(); // key → best g seen
    const nodeMap = new Map<string, Node>();  // key → open-list node (for decrease-key)

    const startNode: Node = {
      col: sc, row: sr,
      g: 0, h: Pathfinder._h(sc, sr, gc, gr), f: 0,
      parent: null, _heapIdx: 0,
    };
    startNode.f = startNode.h;
    open.push(startNode);
    best.set(key(sc, sr), 0);
    nodeMap.set(key(sc, sr), startNode);

    while (open.size > 0) {
      const cur = open.pop();
      const ck  = key(cur.col, cur.row);

      if (closed.has(ck)) continue;
      closed.add(ck);
      nodeMap.delete(ck);

      if (cur.col === gc && cur.row === gr) {
        return Pathfinder._reconstruct(cur, collider);
      }

      for (const [dc, dr, cost] of Pathfinder._neighbors(collider, cur.col, cur.row)) {
        const nc = cur.col + dc;
        const nr = cur.row + dr;
        const nk = key(nc, nr);
        if (closed.has(nk)) continue;

        const g = cur.g + cost;
        if ((best.get(nk) ?? Infinity) <= g) continue;
        best.set(nk, g);

        const h = Pathfinder._h(nc, nr, gc, gr);
        const existing = nodeMap.get(nk);
        if (existing) {
          // Decrease-key: update in place and restore heap invariant
          existing.g      = g;
          existing.h      = h;
          existing.f      = g + h;
          existing.parent = cur;
          open.decreased(existing);
        } else {
          const node: Node = { col: nc, row: nr, g, h, f: g + h, parent: cur, _heapIdx: 0 };
          open.push(node);
          nodeMap.set(nk, node);
        }
      }
    }

    return null; // unreachable
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  /** Octile heuristic for 8-directional grids. */
  private static _h(c: number, r: number, gc: number, gr: number): number {
    const dx = Math.abs(c - gc);
    const dy = Math.abs(r - gr);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  }

  /**
   * Returns valid neighbor offsets [dc, dr, moveCost].
   * Diagonal moves blocked when either shared cardinal tile is blocked.
   */
  private static _neighbors(
    collider: TileCollider,
    col: number,
    row: number,
  ): [number, number, number][] {
    const dirs: [number, number, number][] = [
      [ 0, -1, 1],           // N
      [ 1,  0, 1],           // E
      [ 0,  1, 1],           // S
      [-1,  0, 1],           // W
      [ 1, -1, Math.SQRT2],  // NE
      [ 1,  1, Math.SQRT2],  // SE
      [-1,  1, Math.SQRT2],  // SW
      [-1, -1, Math.SQRT2],  // NW
    ];
    const result: [number, number, number][] = [];
    for (const [dc, dr, cost] of dirs) {
      const nc = col + dc;
      const nr = row + dr;
      if (!collider.isWalkable(nc, nr)) continue;
      if (dc !== 0 && dr !== 0) {
        if (!collider.isWalkable(col + dc, row) || !collider.isWalkable(col, row + dr)) continue;
      }
      result.push([dc, dr, cost]);
    }
    return result;
  }

  /** Reconstruct path from goal node back to start; apply string-pulling. */
  private static _reconstruct(goal: Node, collider: TileCollider): IsoVec2[] {
    const raw: IsoVec2[] = [];
    let n: Node | null = goal;
    while (n) {
      raw.push({ x: n.col + 0.5, y: n.row + 0.5 });
      n = n.parent;
    }
    raw.reverse();
    return Pathfinder._stringPull(raw, collider);
  }

  /**
   * String-pulling via Bresenham grid line-of-sight.
   *
   * Walks the path from an anchor point and advances the anchor whenever
   * there is a clear LoS to a further waypoint, skipping everything in
   * between. This converts staircased A* paths into straight-line segments
   * wherever the terrain is open.
   */
  private static _stringPull(path: IsoVec2[], collider: TileCollider): IsoVec2[] {
    if (path.length <= 2) return path;

    const out: IsoVec2[] = [path[0]];
    let anchor = 0;

    for (let i = 2; i < path.length; i++) {
      // Check LoS from current anchor to path[i]
      if (!Pathfinder._hasLoS(path[anchor], path[i], collider)) {
        // Lost LoS: keep path[i-1] as the last valid intermediate point
        out.push(path[i - 1]);
        anchor = i - 1;
      }
    }

    out.push(path[path.length - 1]);
    return out;
  }

  /**
   * Bresenham line walk to check grid LoS between two tile-centre points.
   * Returns true if every tile along the line is walkable.
   */
  private static _hasLoS(a: IsoVec2, b: IsoVec2, collider: TileCollider): boolean {
    let c0 = Math.floor(a.x);
    let r0 = Math.floor(a.y);
    const c1 = Math.floor(b.x);
    const r1 = Math.floor(b.y);

    const dc = Math.abs(c1 - c0);
    const dr = Math.abs(r1 - r0);
    const sc = c0 < c1 ? 1 : -1;
    const sr = r0 < r1 ? 1 : -1;
    let err = dc - dr;

    for (;;) {
      if (!collider.isWalkable(c0, r0)) return false;
      if (c0 === c1 && r0 === r1) break;
      const e2 = err << 1;
      if (e2 > -dr) { err -= dr; c0 += sc; }
      if (e2 <  dc) { err += dc; r0 += sr; }
    }
    return true;
  }
}
