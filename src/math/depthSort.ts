/**
 * Topological depth sort for isometric objects.
 *
 * Each object declares a 3-D axis-aligned bounding box (AABB) in world space.
 * Two objects need an explicit ordering only when their AABBs overlap on ALL
 * THREE axes (X, Y, Z) — i.e. they could visually occlude each other.
 */

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  baseZ: number;
  maxZ?: number;
}

export interface Sortable {
  aabb: AABB;
}

/**
 * Returns true if A must be drawn before B (A is behind B).
 */
function isBehind(a: AABB, b: AABB): boolean {
  const overlapX = a.minX < b.maxX && a.maxX > b.minX;
  const overlapY = a.minY < b.maxY && a.maxY > b.minY;

  if (overlapX && overlapY) {
    const aMaxZ = a.maxZ ?? Infinity;
    const bMaxZ = b.maxZ ?? Infinity;
    const overlapZ = a.baseZ < bMaxZ && aMaxZ > b.baseZ;

    if (!overlapZ) {
      return a.baseZ < b.baseZ;
    }

    // B contains A in XY?
    const bContainsA = b.minX <= a.minX && b.maxX >= a.maxX &&
                       b.minY <= a.minY && b.maxY >= a.maxY;
    if (bContainsA) return false; 

    const aContainsB = a.minX <= b.minX && a.maxX >= b.maxX &&
                       a.minY <= b.minY && a.maxY >= b.maxY;
    if (aContainsB) return true;  

    const sepX = Math.min(b.maxX - a.minX, a.maxX - b.minX);
    const sepY = Math.min(b.maxY - a.minY, a.maxY - b.minY);

    if (sepX < sepY) {
      return a.maxX <= b.maxX;
    } else {
      return a.maxY <= b.maxY;
    }
  }

  const centerA = (a.minX + a.maxX) / 2 + (a.minY + a.maxY) / 2;
  const centerB = (b.minX + b.maxX) / 2 + (b.minY + b.maxY) / 2;
  return centerA <= centerB;
}

const BUCKET_SIZE = 2;

/**
 * Stable topological depth sort with 2D spatial partitioning to avoid O(n²) bottlenecks.
 */
export function topoSort<T extends Sortable>(objects: T[]): T[] {
  const n = objects.length;
  if (n <= 1) return [...objects];

  const inDegree = new Int32Array(n);
  const graph: number[][] = Array.from({ length: n }, () => []);

  // 1. Spatial Hash (2D Grid)
  // Maps "gx,gy" -> list of object indices
  const grid = new Map<string, number[]>();
  
  for (let i = 0; i < n; i++) {
    const a = objects[i].aabb;
    const gx1 = Math.floor(a.minX / BUCKET_SIZE);
    const gy1 = Math.floor(a.minY / BUCKET_SIZE);
    const gx2 = Math.floor(a.maxX / BUCKET_SIZE);
    const gy2 = Math.floor(a.maxY / BUCKET_SIZE);

    for (let x = gx1; x <= gx2; x++) {
      for (let y = gy1; y <= gy2; y++) {
        const key = `${x},${y}`;
        let list = grid.get(key);
        if (!list) {
          list = [];
          grid.set(key, list);
        }
        list.push(i);
      }
    }
  }

  // 2. Build graph using spatial proximity
  const compared = new Set<number>(); // pack (i << 16 | j)

  for (let i = 0; i < n; i++) {
    const a = objects[i].aabb;
    const gx1 = Math.floor(a.minX / BUCKET_SIZE);
    const gy1 = Math.floor(a.minY / BUCKET_SIZE);
    const gx2 = Math.floor(a.maxX / BUCKET_SIZE);
    const gy2 = Math.floor(a.maxY / BUCKET_SIZE);

    for (let x = gx1; x <= gx2; x++) {
      for (let y = gy1; y <= gy2; y++) {
        const list = grid.get(`${x},${y}`);
        if (!list) continue;

        for (const j of list) {
          if (i === j) continue;
          
          // Ensure we only compare each pair (i, j) once
          const pairKey = i < j ? (i << 16) | j : (j << 16) | i;
          if (compared.has(pairKey)) continue;
          compared.add(pairKey);

          if (isBehind(objects[i].aabb, objects[j].aabb)) {
            graph[i].push(j);
            inDegree[j]++;
          } else {
            // j must be behind i
            graph[j].push(i);
            inDegree[i]++;
          }
        }
      }
    }
  }

  // 3. Kahn's Algorithm
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

  // Fallback for cycles
  if (result.length < n) {
    const inResult = new Set<T>(result);
    for (let i = 0; i < n; i++) {
      if (!inResult.has(objects[i])) result.push(objects[i]);
    }
  }

  return result;
}
