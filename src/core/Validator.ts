/**
 * Validator — lightweight runtime validation for scene JSON and ECS lookups.
 *
 * All methods return a `ValidationResult` with `ok`, `errors`, and `warnings`.
 * Errors are structural problems that will cause runtime failures.
 * Warnings are non-fatal issues that may produce unexpected behaviour.
 */

export interface ValidationResult {
  ok: boolean;
  errors:   string[];
  warnings: string[];
}

function result(errors: string[], warnings: string[]): ValidationResult {
  return { ok: errors.length === 0, errors, warnings };
}

// ── Scene JSON validation ─────────────────────────────────────────────────────

export interface SceneJsonLike {
  name?: unknown;
  cols?: unknown; rows?: unknown;
  tileW?: unknown; tileH?: unknown;
  floor?: {
    id?: unknown; cols?: unknown; rows?: unknown;
    walkable?: unknown;
  };
  walls?: unknown[];
  lights?: unknown[];
  characters?: unknown[];
}

export function validateSceneJson(json: unknown): ValidationResult {
  const errors: string[]   = [];
  const warnings: string[] = [];

  if (typeof json !== 'object' || json === null) {
    return result(['Scene JSON must be a non-null object'], []);
  }

  const s = json as SceneJsonLike;

  // Dimensions
  const cols = Number(s.cols ?? 10);
  const rows = Number(s.rows ?? 10);
  if (!Number.isInteger(cols) || cols < 1 || cols > 128) errors.push(`cols must be an integer 1–128, got ${s.cols}`);
  if (!Number.isInteger(rows) || rows < 1 || rows > 128) errors.push(`rows must be an integer 1–128, got ${s.rows}`);

  const tileW = Number(s.tileW ?? 64);
  const tileH = Number(s.tileH ?? 32);
  if (tileW <= 0) errors.push(`tileW must be > 0, got ${s.tileW}`);
  if (tileH <= 0) errors.push(`tileH must be > 0, got ${s.tileH}`);
  if (tileW !== tileH * 2) warnings.push(`Standard iso ratio is tileW = 2 × tileH (got ${tileW} × ${tileH})`);

  // Floor
  if (s.floor !== undefined) {
    if (typeof s.floor !== 'object' || s.floor === null) {
      errors.push('floor must be an object');
    } else {
      if (!s.floor.id) errors.push('floor.id is required');
      if (s.floor.walkable !== undefined) {
        if (!Array.isArray(s.floor.walkable)) {
          errors.push('floor.walkable must be an array');
        } else if (Array.isArray(s.floor.walkable[0])) {
          // 2D array
          const grid = s.floor.walkable as unknown[][];
          if (grid.length !== rows) warnings.push(`floor.walkable has ${grid.length} rows, expected ${rows}`);
          for (let r = 0; r < grid.length; r++) {
            if (!Array.isArray(grid[r])) { errors.push(`floor.walkable[${r}] must be an array`); break; }
            if ((grid[r] as unknown[]).length !== cols) warnings.push(`floor.walkable[${r}] has ${(grid[r] as unknown[]).length} cols, expected ${cols}`);
          }
        } else {
          // Flat array
          const flat = s.floor.walkable as unknown[];
          if (flat.length !== cols * rows) warnings.push(`floor.walkable flat array length ${flat.length} ≠ cols×rows (${cols * rows})`);
        }
      }
    }
  }

  // Walls
  if (s.walls !== undefined) {
    if (!Array.isArray(s.walls)) {
      errors.push('walls must be an array');
    } else {
      s.walls.forEach((w, i) => {
        const wall = w as Record<string, unknown>;
        if (!wall.id) errors.push(`walls[${i}].id is required`);
        for (const k of ['x', 'y', 'endX', 'endY']) {
          if (typeof wall[k] !== 'number') errors.push(`walls[${i}].${k} must be a number`);
        }
        if (wall.x === wall.endX && wall.y === wall.endY) warnings.push(`walls[${i}] has zero length`);
      });
    }
  }

  // Lights
  if (s.lights !== undefined) {
    if (!Array.isArray(s.lights)) {
      errors.push('lights must be an array');
    } else {
      s.lights.forEach((l, i) => {
        const light = l as Record<string, unknown>;
        if (light.type !== 'omni' && light.type !== 'directional') {
          errors.push(`lights[${i}].type must be 'omni' or 'directional', got '${light.type}'`);
        }
        if (light.type === 'omni') {
          for (const k of ['x', 'y', 'z']) {
            if (typeof light[k] !== 'number') errors.push(`lights[${i}].${k} must be a number`);
          }
          if (typeof light.intensity === 'number' && (light.intensity < 0 || light.intensity > 10)) {
            warnings.push(`lights[${i}].intensity ${light.intensity} is outside typical range 0–10`);
          }
        }
      });
    }
  }

  // Characters
  if (s.characters !== undefined) {
    if (!Array.isArray(s.characters)) {
      errors.push('characters must be an array');
    } else {
      s.characters.forEach((c, i) => {
        const ch = c as Record<string, unknown>;
        if (!ch.id) errors.push(`characters[${i}].id is required`);
        for (const k of ['x', 'y']) {
          if (typeof ch[k] !== 'number') errors.push(`characters[${i}].${k} must be a number`);
        }
        const x = Number(ch.x), y = Number(ch.y);
        if (x < 0 || x > cols || y < 0 || y > rows) {
          warnings.push(`characters[${i}] position (${x}, ${y}) is outside scene bounds (${cols}×${rows})`);
        }
      });
    }
  }

  return result(errors, warnings);
}

// ── Component type-safe lookup ────────────────────────────────────────────────

/**
 * Type-safe component lookup with a helpful error message on miss.
 * Returns the component or throws if not found and `required` is true.
 */
export function requireComponent<T extends { componentType: string }>(
  entity: { getComponent<C>(type: string): C | undefined; id: string },
  type: string,
  required = true,
): T | undefined {
  const comp = entity.getComponent<T>(type);
  if (!comp && required) {
    throw new Error(
      `Entity "${entity.id}" is missing required component "${type}". ` +
      `Did you forget to call entity.addComponent(new ...Component(...))?`,
    );
  }
  return comp;
}

/**
 * Validate that an entity has all required component types.
 * Returns a ValidationResult listing any missing components.
 */
export function validateComponents(
  entity: { hasComponent(type: string): boolean; id: string },
  required: string[],
): ValidationResult {
  const errors = required
    .filter(t => !entity.hasComponent(t))
    .map(t => `Entity "${entity.id}" is missing component "${t}"`);
  return result(errors, []);
}
