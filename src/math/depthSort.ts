/**
 * Topological depth sort for isometric objects.
 *
 * Each object declares an axis-aligned bounding box (AABB) in world space.
 * Two objects A and B need an explicit ordering only when their AABBs overlap
 * on both X and Y axes — i.e. one could visually occlude the other.
 * In that case we compare on the axis of greater separation to determine
 * which is "behind".
 *
 * For non-overlapping pairs we fall back to the simple (x+y) heuristic.
 * This eliminates Z-fighting on diagonals without a full topological sort.
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
}

export interface Sortable {
  aabb: AABB;
}

/**
 * Returns true if A must be drawn before B (A is behind B).
 * Uses AABB overlap test; falls back to (x+y) heuristic for non-overlapping pairs.
 */
function isBehind(a: AABB, b: AABB): boolean {
  // Check if AABBs overlap on X axis
  const overlapX = a.minX < b.maxX && a.maxX > b.minX;
  // Check if AABBs overlap on Y axis
  const overlapY = a.minY < b.maxY && a.maxY > b.minY;

  if (overlapX && overlapY) {
    // Objects occupy the same floor space — use the one that ends earlier
    // on the dominant separation axis
    const sepX = Math.min(b.maxX - a.minX, a.maxX - b.minX);
    const sepY = Math.min(b.maxY - a.minY, a.maxY - b.minY);

    if (sepX < sepY) {
      // X axis separates them more cleanly: the one with smaller maxX is behind
      return a.maxX <= b.maxX;
    } else {
      return a.maxY <= b.maxY;
    }
  }

  // Non-overlapping: simple (x+y) heuristic
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
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  const result: T[] = [];
  while (queue.length > 0) {
    const idx = queue.shift()!;
    result.push(objects[idx]);
    for (const next of graph[idx]) {
      inDegree[next]--;
      if (inDegree[next] === 0) queue.push(next);
    }
  }

  // Fallback: if cycle detected (shouldn't happen with well-formed scenes),
  // append remaining objects in original order
  if (result.length < n) {
    for (let i = 0; i < n; i++) {
      if (!result.includes(objects[i])) result.push(objects[i]);
    }
  }

  return result;
}
