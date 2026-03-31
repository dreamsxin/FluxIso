/**
 * Tile-based collision layer.
 *
 * Each cell (col, row) is either walkable (true) or blocked (false).
 * Provides AABB overlap queries for character movement validation.
 */
export class TileCollider {
  private grid: boolean[][];
  readonly cols: number;
  readonly rows: number;

  constructor(cols: number, rows: number, walkable?: boolean[][]) {
    this.cols = cols;
    this.rows = rows;
    // Default: all tiles walkable
    this.grid = walkable ?? Array.from({ length: rows }, () => Array(cols).fill(true));
  }

  // ── Grid mutation ─────────────────────────────────────────────────────────

  setWalkable(col: number, row: number, walkable: boolean): void {
    if (this.inBounds(col, row)) this.grid[row][col] = walkable;
  }

  isWalkable(col: number, row: number): boolean {
    if (!this.inBounds(col, row)) return false;
    return this.grid[row][col];
  }

  private inBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  // ── AABB queries ──────────────────────────────────────────────────────────

  /**
   * Test whether a world-space AABB (minX..maxX, minY..maxY) overlaps
   * any blocked tile. Returns true if the area is fully walkable.
   */
  canOccupy(minX: number, minY: number, maxX: number, maxY: number): boolean {
    // Convert to tile indices (floor for min, ceil-1 for max)
    const c0 = Math.floor(minX);
    const r0 = Math.floor(minY);
    const c1 = Math.floor(maxX - 0.001); // exclusive end
    const r1 = Math.floor(maxY - 0.001);

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!this.isWalkable(c, r)) return false;
      }
    }
    return true;
  }

  /**
   * Slide-and-clamp collision resolution with diagonal corner handling.
   *
   * Tries the full move first, then each axis independently.
   * When both axes are blocked (corner case), attempts a small diagonal
   * push-out to prevent the entity from getting stuck in corners.
   */
  resolveMove(
    x: number, y: number,
    dx: number, dy: number,
    r = 0.4,
  ): { dx: number; dy: number } {
    const nx = x + dx;
    const ny = y + dy;

    // Full move
    if (this.canOccupy(nx - r, ny - r, nx + r, ny + r)) {
      return { dx, dy };
    }

    // X only
    const xOnly = this.canOccupy(nx - r, y - r, nx + r, y + r);
    // Y only
    const yOnly = this.canOccupy(x - r, ny - r, x + r, ny + r);

    if (xOnly) return { dx, dy: 0 };
    if (yOnly) return { dx: 0, dy };

    // Both axes blocked — try a small diagonal slide away from the corner.
    // Find which corner of the current tile we're closest to and nudge away.
    const cx = Math.round(x), cy = Math.round(y);
    const pushX = x < cx ? -0.01 : 0.01;
    const pushY = y < cy ? -0.01 : 0.01;
    if (this.canOccupy(x + pushX - r, y + pushY - r, x + pushX + r, y + pushY + r)) {
      return { dx: pushX, dy: pushY };
    }

    return { dx: 0, dy: 0 };
  }

  /**
   * Continuous collision detection for fast-moving objects.
   * Sweeps the AABB along the movement vector and returns the safe fraction
   * of the move (0 = fully blocked, 1 = fully free).
   *
   * Use when `speed * dt` could exceed a tile width in a single frame.
   */
  sweepMove(
    x: number, y: number,
    dx: number, dy: number,
    r = 0.4,
    steps = 4,
  ): { dx: number; dy: number } {
    // Binary-search the largest safe fraction
    let lo = 0, hi = 1;
    for (let i = 0; i < steps; i++) {
      const mid = (lo + hi) / 2;
      const tx = x + dx * mid;
      const ty = y + dy * mid;
      if (this.canOccupy(tx - r, ty - r, tx + r, ty + r)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return { dx: dx * lo, dy: dy * lo };
  }

  /**
   * Build a TileCollider from a flat JSON boolean array or 2D array.
   * `data` is row-major: data[row][col] or data[row * cols + col].
   */
  static fromArray(
    cols: number,
    rows: number,
    data: boolean[][] | boolean[],
  ): TileCollider {
    let grid: boolean[][];
    if (Array.isArray(data[0])) {
      grid = data as boolean[][];
    } else {
      const flat = data as boolean[];
      grid = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (__, c) => flat[r * cols + c] ?? true),
      );
    }
    return new TileCollider(cols, rows, grid);
  }
}
