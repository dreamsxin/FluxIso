/**
 * Topological depth sort for isometric objects.
 *
 * Each object declares a 3-D axis-aligned bounding box (AABB) in world space.
 * Two objects need an explicit ordering only when their AABBs overlap on ALL
 * THREE axes (X, Y, Z) — i.e. they could visually occlude each other.
 *
 * Z-axis check prevents ground tiles from being sorted against elevated
 * characters: if the character's baseZ is above the tile's maxZ they simply
 * don't overlap in Z and no ordering edge is emitted.
 */

export interface AABB {
  /** Minimum world X */
  minX: number;
  /** Minimum world Y */
  minY: number;
  /** Maximum world X */
  maxX: number;
  /** Maximum world Y */
  maxY: number;
  /** Ground-plane Z of the object base */
  baseZ: number;
  /**
   * Top Z of the object's bounding volume.
   * Defaults to baseZ when omitted (flat / ground-level objects).
   * Set this to baseZ + height for objects with vertical extent so that
   * elevated objects are not incorrectly sorted against ground tiles.
   */
  maxZ?: number;
}

export interface Sortable {
  aabb: AABB;
}

/**
 * Returns true if A must be drawn before B (A is behind B).
 * Uses a full 3-D AABB overlap test before applying the XY heuristic.
 */
function isBehind(a: AABB, b: AABB): boolean {
  // Check if AABBs overlap on X axis
  const overlapX = a.minX < b.maxX && a.maxX > b.minX;
  // Check if AABBs overlap on Y axis
  const overlapY = a.minY < b.maxY && a.maxY > b.minY;

  if (overlapX && overlapY) {
    // Check Z overlap — only objects that share vertical space can occlude each other.
    // When maxZ is omitted, treat the object as having infinite upward extent so that
    // flat (baseZ-only) objects always overlap in Z and fall through to the XY heuristic.
    const aMaxZ = a.maxZ ?? Infinity;
    const bMaxZ = b.maxZ ?? Infinity;
    const overlapZ = a.baseZ < bMaxZ && aMaxZ > b.baseZ;

    if (!overlapZ) {
      // Vertically separated: the lower object is always drawn first (behind).
      return a.baseZ < b.baseZ;
    }

    // Full 3-D overlap — determine ordering.
    //
    // If B completely contains A in XY (A is a small object inside a large one,
    // e.g. a character standing on a terrain tile), A should be drawn AFTER B
    // (A is in the foreground). So isBehind(A, B) = false, isBehind(B, A) = true.
    const bContainsA = b.minX <= a.minX && b.maxX >= a.maxX &&
                       b.minY <= a.minY && b.maxY >= a.maxY;
    if (bContainsA) return false; // A is on top of / inside B → draw A after B

    const aContainsB = a.minX <= b.minX && a.maxX >= b.maxX &&
                       a.minY <= b.minY && a.maxY >= b.maxY;
    if (aContainsB) return true;  // B is inside A → draw B after A

    // Partial overlap — use the dominant XY separation axis.
    const sepX = Math.min(b.maxX - a.minX, a.maxX - b.minX);
    const sepY = Math.min(b.maxY - a.minY, a.maxY - b.minY);

    if (sepX < sepY) {
      return a.maxX <= b.maxX;
    } else {
      return a.maxY <= b.maxY;
    }
  }

  // Non-overlapping in XY: simple (x+y) heuristic
  const centerA = (a.minX + a.maxX) / 2 + (a.minY + a.maxY) / 2;
  const centerB = (b.minX + b.maxX) / 2 + (b.minY + b.maxY) / 2;
  return centerA <= centerB;
}

/**
 * Stable topological depth sort.
 * Returns a new sorted array; input is not modified.
 */
export function topoSort<T extends Sortable>(objects: T[]): T[] {
  const n = objects.length;
  if (n <= 1) return [...objects];

  // Build "must draw before" graph: edges[i] contains indices that i must precede
  const inDegree = new Int32Array(n);
  const graph: number[][] = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (isBehind(objects[i].aabb, objects[j].aabb)) {
        graph[i].push(j);
        inDegree[j]++;
      }
    }
  }

  // Kahn's algorithm (BFS topological sort)
  // Use a head-pointer instead of queue.shift() to avoid O(n) array shifts.
  const queue: number[] = [];
  let head = 0;
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  const result: T[] = [];
  while (head < queue.length) {
    const idx = queue[head++];
    result.push(objects[idx]);
    for (const next of graph[idx]) {
      if (--inDegree[next] === 0) queue.push(next);
    }
  }

  // Fallback: if cycle detected, append remaining in original order.
  // Use a Set for O(1) membership test instead of result.includes() O(n).
  if (result.length < n) {
    const inResult = new Set<T>(result);
    for (let i = 0; i < n; i++) {
      if (!inResult.has(objects[i])) result.push(objects[i]);
    }
  }

  return result;
}
