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
 *
 * Standard isometric rule: A is behind B if A's far corner (maxX, maxY) is
 * closer to the origin than B's far corner on both axes simultaneously.
 * When only one axis separates them, use that axis alone.
 *
 * Special cases:
 * - When XY footprints are identical (bContainsA && aContainsB):
 *   Use center-depth to determine ordering. Do NOT add a directed edge
 *   (which would create cycles with the bContainsA path).
 * - When B strictly contains A in XY (and not vice-versa): A is inside B → A behind B.
 * - When A strictly contains B in XY: B is inside A → B behind A → A is NOT behind B.
 */
function isBehind(a: AABB, b: AABB): boolean {
  const overlapX = a.minX < b.maxX && a.maxX > b.minX;
  const overlapY = a.minY < b.maxY && a.maxY > b.minY;

  // Precompute center depths (used by both the overlap and non-overlap paths)
  const centerA = (a.minX + a.maxX) / 2 + (a.minY + a.maxY) / 2;
  const centerB = (b.minX + b.maxX) / 2 + (b.minY + b.maxY) / 2;

  if (overlapX && overlapY) {
    const aMaxZ = a.maxZ ?? (a.baseZ + 1);
    const bMaxZ = b.maxZ ?? (b.baseZ + 1);
    const overlapZ = a.baseZ < bMaxZ && aMaxZ > b.baseZ;

    if (!overlapZ) {
      return a.baseZ < b.baseZ;
    }

    const bContainsA = b.minX <= a.minX && b.maxX >= a.maxX &&
                       b.minY <= a.minY && b.maxY >= a.maxY;
    const aContainsB = a.minX <= b.minX && a.maxX >= b.maxX &&
                       a.minY <= b.minY && a.maxY >= b.maxY;

    if (bContainsA && aContainsB) {
      // Identical XY footprints: use center-depth. No directed edge (avoids cycles).
      return centerA < centerB;
    }

    // One object's XY footprint contains the other's.
    // This often happens with thin-padded walls: a character straddling the wall's
    // Y-extent will have aContainsB=true, yet its center may be BEHIND the wall.
    // Far-corner comparison would give wrong results here (the far corner is
    // "forward" because the object extends past the wall). Use center-depth instead.
    if (bContainsA || aContainsB) {
      return centerA < centerB;
    }

    // Partial overlap (neither contains the other): use far-corner comparison.
    // This is the canonical isometric rule: the object whose far corner is
    // closer to the origin (smaller maxX+maxY) should be drawn first.
    const aFarX = a.maxX <= b.maxX;
    const aFarY = a.maxY <= b.maxY;
    if (aFarX && aFarY) return true;
    if (!aFarX && !aFarY) return false;
    // Mixed axis result: use total far-corner depth as tiebreaker.
    return (a.maxX + a.maxY) <= (b.maxX + b.maxY);
  }

  // No XY overlap: compare center depths as a tiebreaker.
  // Larger center = closer to viewer in isometric space = drawn last = on top.
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

          const ij = isBehind(objects[i].aabb, objects[j].aabb);
          const ji = !ij && isBehind(objects[j].aabb, objects[i].aabb);
          if (ij) {
            // i draws before j
            graph[i].push(j);
            inDegree[j]++;
          } else if (ji) {
            // j draws before i
            graph[j].push(i);
            inDegree[i]++;
          }
          // else: no ordering constraint between i and j
        }
      }
    }
  }

  // Precompute center depths (used for Kahn tiebreaker when multiple nodes
  // have the same in-degree — e.g. orphan groups and isolated components)
  const centers = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = objects[i].aabb;
    centers[i] = (a.minX + a.maxX) / 2 + (a.minY + a.maxY) / 2;
  }

  // 3. Kahn's Algorithm with center-depth tiebreaker
  // Objects with smaller center (further from viewer) are processed first,
  // ensuring consistent ordering when multiple nodes are simultaneously
  // available at the same in-degree level.
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }
  // Sort by center ascending so the "smallest" depth is dequeued first
  queue.sort((a, b) => centers[a] - centers[b]);

  const result: T[] = [];
  while (queue.length > 0) {
    const idx = queue.shift()!;
    result.push(objects[idx]);
    for (const next of graph[idx]) {
      if (--inDegree[next] === 0) {
        // Insert next in sorted position (smallest center first)
        const nc = centers[next];
        let lo = 0, hi = queue.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (centers[queue[mid]] < nc) lo = mid + 1;
          else hi = mid;
        }
        queue.splice(lo, 0, next);
      }
    }
  }

  // Fallback for cycles: append objects not yet in result (in original order)
  if (result.length < n) {
    const inResult = new Set<T>(result);
    for (let i = 0; i < n; i++) {
      if (!inResult.has(objects[i])) result.push(objects[i]);
    }
  }

  // ── Orphan-fix pass ───────────────────────────────────────────────────────────
  // The spatial hash bucket optimization only compares objects that share at least
  // one bucket cell.  Objects in completely different buckets (e.g. a character
  // at (2,2) vs a wall at (4,4)) are never compared and get no graph edge, so
  // Kahn's algorithm outputs them in arbitrary insertion order.
  //
  // Correct fix: after Kahn, identify "orphan" objects (inDegree=0 && no outgoing
  // edges) and compare them globally via center-depth against every other object,
  // adding backward edges so Kahn re-sorts them correctly.
  //
  // Re-run Kahn on the augmented graph.
  {
    // Rebuild degree arrays from scratch with orphan-edges added
    const inDeg2  = new Int32Array(n);
    const graph2: number[][] = Array.from({ length: n }, () => []);

    // Copy existing edges
    for (let i = 0; i < n; i++) {
      for (const j of graph[i]) {
        graph2[i].push(j);
        inDeg2[j]++;
      }
    }

    // Find orphans: objects with no incoming AND no outgoing edges in the
    // original graph. These were never compared with anyone.
    const isOrphan = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (inDegree[i] === 0 && graph[i].length === 0) {
        isOrphan[i] = 1;
      }
    }

    // For each orphan, compare center-depth with all non-orphans.
    // If orphan is behind (centerA < centerB), add edge orphan → other
    // so other is drawn first.
    for (let o = 0; o < n; o++) {
      if (!isOrphan[o]) continue;
      for (let m = 0; m < n; m++) {
        if (isOrphan[m] || o === m) continue;
        if (isBehind(objects[o].aabb, objects[m].aabb)) {
          // o is behind m → m must be drawn first → edge o→m
          graph2[o].push(m);
          inDeg2[m]++;
        }
      }
    }

    // Re-run Kahn on the augmented graph
    const queue2: number[] = [];
    for (let i = 0; i < n; i++) {
      if (inDeg2[i] === 0) queue2.push(i);
    }
    // Sort by center ascending (smaller center = further from viewer = drawn first)
    queue2.sort((a, b) => centers[a] - centers[b]);

    const result2: T[] = [];
    while (queue2.length > 0) {
      const idx = queue2.shift()!;
      result2.push(objects[idx]);
      for (const next of graph2[idx]) {
        if (--inDeg2[next] === 0) {
          // Insert in sorted order (binary-search insertion)
          const nc = centers[next];
          let lo = 0, hi = queue2.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (centers[queue2[mid]] < nc) lo = mid + 1;
            else hi = mid;
          }
          queue2.splice(lo, 0, next);
        }
      }
    }

    if (result2.length === n) {
      // Augmentation succeeded: replace result
      return result2;
    }
    // else: augmentation introduced cycles — fall back to original Kahn result
  }

  // DEBUG: expose sort order globally for inspection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = result.map((o: any) => o.id ?? '?');
  if (ids.some((id: string) => id === 'w1' || id === 'w2' || id === 'player')) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__lastTopoSort = ids.join(' → ');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__lastAabbs = objects.map((o: any) =>
      `${o.id}:X[${o.aabb.minX.toFixed(2)},${o.aabb.maxX.toFixed(2)}]Y[${o.aabb.minY.toFixed(2)},${o.aabb.maxY.toFixed(2)}]`
    ).join(', ');
  }

  return result;
}
