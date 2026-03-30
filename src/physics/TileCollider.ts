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
   * Slide-and-clamp collision resolution.
   * Given a desired move from (x, y) by (dx, dy) with a half-size footprint `r`,
   * returns the largest allowed displacement that does not enter a blocked tile.
   * Tries X and Y axes independently (AABB sliding).
   */
  resolveMove(
    x: number, y: number,
    dx: number, dy: number,
    r = 0.4,
  ): { dx: number; dy: number } {
    // Try full move
    const nx = x + dx;
    const ny = y + dy;
    if (this.canOccupy(nx - r, ny - r, nx + r, ny + r)) {
      return { dx, dy };
    }

    // Try X only
    const xOnly = this.canOccupy(nx - r, y - r, nx + r, y + r);
    // Try Y only
    const yOnly = this.canOccupy(x - r, ny - r, x + r, ny + r);

    return {
      dx: xOnly ? dx : 0,
      dy: yOnly ? dy : 0,
    };
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
