/**
 * EditorState — central store for the scene editor.
 */

export type ToolType =
  | 'select' | 'move'
  | 'wall' | 'omnilight' | 'character'
  | 'crystal' | 'boulder' | 'chest'
  | 'walkable' | 'blocked';

export interface EditorFloor {
  id: string;
  cols: number;
  rows: number;
  color?: string;
  altColor?: string;
}

export interface EditorWall {
  id: string;
  x: number; y: number;
  endX: number; endY: number;
  height: number;
  color?: string;
}

export interface EditorLight {
  id: string;
  type: 'omni';
  x: number; y: number; z: number;
  color: string;
  intensity: number;
  radius: number;
}

export interface EditorCharacter {
  id: string;
  x: number; y: number; z: number;
  radius: number;
  color: string;
}

export interface EditorProp {
  id: string;
  kind: 'crystal' | 'boulder' | 'chest';
  x: number; y: number;
  color: string;
}

export type EditorObject = EditorWall | EditorLight | EditorCharacter | EditorProp;

export interface SceneData {
  name: string;
  cols: number;
  rows: number;
  tileW: number;
  tileH: number;
  floor: EditorFloor;
  /** Row-major walkable grid. true = walkable, false = blocked. */
  walkable: boolean[][];
  walls: EditorWall[];
  lights: EditorLight[];
  characters: EditorCharacter[];
  props: EditorProp[];
}

type Listener = () => void;

// ── Command interface for undo/redo ───────────────────────────────────────────

interface Command {
  execute(): void;
  undo(): void;
  description: string;
}

export class EditorState {
  scene: SceneData;
  activeTool: ToolType = 'select';
  selectedId: string | null = null;

  // Wall drawing state
  wallStart: { x: number; y: number } | null = null;

  // Drag state
  dragId: string | null = null;
  dragOffsetX = 0;
  dragOffsetY = 0;

  // Undo/redo stacks
  private _undoStack: Command[] = [];
  private _redoStack: Command[] = [];

  private _listeners: Listener[] = [];

  constructor() {
    this.scene = EditorState.defaultScene();
  }

  static defaultScene(): SceneData {
    const cols = 10, rows = 10;
    return {
      name: 'New Scene',
      cols, rows,
      tileW: 64, tileH: 32,
      floor: { id: 'mainFloor', cols, rows, color: '#2a2a3a', altColor: '#252535' },
      walkable: Array.from({ length: rows }, () => Array(cols).fill(true)),
      walls: [], lights: [], characters: [], props: [],
    };
  }

  // ── Walkable grid ─────────────────────────────────────────────────────────

  isWalkable(col: number, row: number): boolean {
    return this.scene.walkable[row]?.[col] ?? true;
  }

  setWalkable(col: number, row: number, value: boolean): void {
    if (row < 0 || row >= this.scene.rows || col < 0 || col >= this.scene.cols) return;
    const prev = this.scene.walkable[row][col];
    if (prev === value) return;
    this._execute({
      description: `set tile (${col},${row}) ${value ? 'walkable' : 'blocked'}`,
      execute: () => { this.scene.walkable[row][col] = value; this.emit(); },
      undo:    () => { this.scene.walkable[row][col] = prev;  this.emit(); },
    });
  }

  resizeWalkable(cols: number, rows: number): void {
    const grid: boolean[][] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (__, c) => this.scene.walkable[r]?.[c] ?? true),
    );
    this.scene.walkable = grid;
  }

  // ── Tool ─────────────────────────────────────────────────────────────────

  setTool(tool: ToolType): void {
    this.activeTool = tool;
    this.wallStart = null;
    this.dragId = null;
    this.emit();
  }

  select(id: string | null): void {
    this.selectedId = id;
    this.emit();
  }

  // ── Mutations (with undo) ─────────────────────────────────────────────────

  addWall(w: EditorWall): void {
    this._execute({
      description: `add wall ${w.id}`,
      execute: () => { this.scene.walls.push(w); this.emit(); },
      undo:    () => { this.scene.walls = this.scene.walls.filter(o => o.id !== w.id); this.emit(); },
    });
  }

  addLight(l: EditorLight): void {
    this._execute({
      description: `add light ${l.id}`,
      execute: () => { this.scene.lights.push(l); this.emit(); },
      undo:    () => { this.scene.lights = this.scene.lights.filter(o => o.id !== l.id); this.emit(); },
    });
  }

  addCharacter(c: EditorCharacter): void {
    this._execute({
      description: `add character ${c.id}`,
      execute: () => { this.scene.characters.push(c); this.emit(); },
      undo:    () => { this.scene.characters = this.scene.characters.filter(o => o.id !== c.id); this.emit(); },
    });
  }

  addProp(p: EditorProp): void {
    this._execute({
      description: `add prop ${p.id}`,
      execute: () => { this.scene.props.push(p); this.emit(); },
      undo:    () => { this.scene.props = this.scene.props.filter(o => o.id !== p.id); this.emit(); },
    });
  }

  removeById(id: string): void {
    const obj = this.getById(id);
    if (!obj) return;
    const snapshot = JSON.parse(JSON.stringify(obj)) as EditorObject;
    const listKey = this._listKeyFor(id);
    this._execute({
      description: `remove ${id}`,
      execute: () => {
        this.scene.walls       = this.scene.walls.filter(o => o.id !== id);
        this.scene.lights      = this.scene.lights.filter(o => o.id !== id);
        this.scene.characters  = this.scene.characters.filter(o => o.id !== id);
        this.scene.props       = this.scene.props.filter(o => o.id !== id);
        if (this.selectedId === id) this.selectedId = null;
        this.emit();
      },
      undo: () => {
        if (listKey === 'walls')      this.scene.walls.push(snapshot as EditorWall);
        if (listKey === 'lights')     this.scene.lights.push(snapshot as EditorLight);
        if (listKey === 'characters') this.scene.characters.push(snapshot as EditorCharacter);
        if (listKey === 'props')      this.scene.props.push(snapshot as EditorProp);
        this.emit();
      },
    });
  }

  updateObject(id: string, patch: Partial<EditorObject>): void {
    const lists = [this.scene.walls, this.scene.lights, this.scene.characters, this.scene.props] as EditorObject[][];
    for (const list of lists) {
      const idx = list.findIndex(o => o.id === id);
      if (idx !== -1) { Object.assign(list[idx], patch); break; }
    }
    this.emit();
  }

  /** Move an object to a new world position (with undo). */
  moveObject(id: string, x: number, y: number): void {
    const obj = this.getById(id) as { x: number; y: number } | undefined;
    if (!obj) return;
    const prevX = obj.x, prevY = obj.y;
    if (Math.abs(prevX - x) < 0.001 && Math.abs(prevY - y) < 0.001) return;
    this._execute({
      description: `move ${id}`,
      execute: () => { this.updateObject(id, { x, y } as never); },
      undo:    () => { this.updateObject(id, { x: prevX, y: prevY } as never); },
    });
  }

  getById(id: string): EditorObject | undefined {
    return this.allObjects().find(o => o.id === id);
  }

  allObjects(): EditorObject[] {
    return [
      ...this.scene.walls,
      ...this.scene.lights,
      ...this.scene.characters,
      ...this.scene.props,
    ];
  }

  // ── Scene settings ────────────────────────────────────────────────────────

  setSceneSize(cols: number, rows: number): void {
    this.scene.cols = cols;
    this.scene.rows = rows;
    this.scene.floor.cols = cols;
    this.scene.floor.rows = rows;
    this.resizeWalkable(cols, rows);
    this.emit();
  }

  // ── Undo / Redo ───────────────────────────────────────────────────────────

  get canUndo(): boolean { return this._undoStack.length > 0; }
  get canRedo(): boolean { return this._redoStack.length > 0; }
  get undoDescription(): string { return this._undoStack.length ? this._undoStack[this._undoStack.length - 1].description : ''; }
  get redoDescription(): string { return this._redoStack.length ? this._redoStack[this._redoStack.length - 1].description : ''; }

  undo(): void {
    const cmd = this._undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this._redoStack.push(cmd);
    this.emit();
  }

  redo(): void {
    const cmd = this._redoStack.pop();
    if (!cmd) return;
    cmd.execute();
    this._undoStack.push(cmd);
    this.emit();
  }

  private _execute(cmd: Command): void {
    cmd.execute();
    this._undoStack.push(cmd);
    this._redoStack = [];          // clear redo on new action
    if (this._undoStack.length > 100) this._undoStack.shift();
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  toJSON(): string {
    const { name, cols, rows, tileW, tileH, floor, walkable, walls, lights, characters, props } = this.scene;
    const out = {
      name, cols, rows, tileW, tileH,
      floor: { ...floor, walkable },
      walls: walls.map(w => ({ ...w })),
      lights: lights.map(l => ({ ...l })),
      characters: characters.map(c => ({ ...c })),
      objects: props.map(p => ({ ...p })),
    };
    return JSON.stringify(out, null, 2);
  }

  loadJSON(json: string): void {
    try {
      const data = JSON.parse(json);
      const cols = data.cols ?? 10;
      const rows = data.rows ?? 10;
      this.scene = {
        name:       data.name ?? 'Imported',
        cols, rows,
        tileW:      data.tileW ?? 64,
        tileH:      data.tileH ?? 32,
        floor:      data.floor ?? EditorState.defaultScene().floor,
        walkable:   data.floor?.walkable
          ? (Array.isArray(data.floor.walkable[0])
              ? data.floor.walkable
              : Array.from({ length: rows }, (_: unknown, r: number) =>
                  Array.from({ length: cols }, (__: unknown, c: number) => data.floor.walkable[r * cols + c] ?? true)))
          : Array.from({ length: rows }, () => Array(cols).fill(true)),
        walls:      data.walls ?? [],
        lights:     data.lights ?? [],
        characters: data.characters ?? [],
        props:      (data.objects ?? []).filter((o: EditorProp) => o.kind),
      };
      this.selectedId = null;
      this._undoStack = [];
      this._redoStack = [];
      this.emit();
    } catch (e) {
      console.error('EditorState.loadJSON failed:', e);
    }
  }

  // ── Listeners ─────────────────────────────────────────────────────────────

  onChange(fn: Listener): () => void {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  }

  emit(): void {
    for (const fn of this._listeners) fn();
  }

  // ── ID generation ─────────────────────────────────────────────────────────

  nextId(prefix: string): string {
    const existing = this.allObjects().map(o => o.id);
    let n = 1;
    while (existing.includes(`${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
  }

  private _listKeyFor(id: string): 'walls' | 'lights' | 'characters' | 'props' | null {
    if (this.scene.walls.find(o => o.id === id))       return 'walls';
    if (this.scene.lights.find(o => o.id === id))      return 'lights';
    if (this.scene.characters.find(o => o.id === id))  return 'characters';
    if (this.scene.props.find(o => o.id === id))       return 'props';
    return null;
  }
}
