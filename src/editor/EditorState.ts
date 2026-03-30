/**
 * EditorState — central store for the scene editor.
 *
 * Holds the mutable scene description (mirrors the JSON schema used by Engine)
 * and notifies listeners on any change.
 */

export type ToolType = 'select' | 'floor' | 'wall' | 'omnilight' | 'character' | 'crystal' | 'boulder' | 'chest';

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
  walls: EditorWall[];
  lights: EditorLight[];
  characters: EditorCharacter[];
  props: EditorProp[];
}

type Listener = () => void;

export class EditorState {
  scene: SceneData;
  activeTool: ToolType = 'select';
  selectedId: string | null = null;

  // Wall drawing state
  wallStart: { x: number; y: number } | null = null;

  private _listeners: Listener[] = [];

  constructor() {
    this.scene = EditorState.defaultScene();
  }

  static defaultScene(): SceneData {
    return {
      name: 'New Scene',
      cols: 10, rows: 10,
      tileW: 64, tileH: 32,
      floor: { id: 'mainFloor', cols: 10, rows: 10, color: '#2a2a3a', altColor: '#252535' },
      walls: [], lights: [], characters: [], props: [],
    };
  }

  // ── Mutation helpers ──────────────────────────────────────────────────────

  setTool(tool: ToolType): void {
    this.activeTool = tool;
    this.wallStart = null;
    this.emit();
  }

  select(id: string | null): void {
    this.selectedId = id;
    this.emit();
  }

  addWall(w: EditorWall): void {
    this.scene.walls.push(w);
    this.emit();
  }

  addLight(l: EditorLight): void {
    this.scene.lights.push(l);
    this.emit();
  }

  addCharacter(c: EditorCharacter): void {
    this.scene.characters.push(c);
    this.emit();
  }

  addProp(p: EditorProp): void {
    this.scene.props.push(p);
    this.emit();
  }

  removeById(id: string): void {
    this.scene.walls       = this.scene.walls.filter(o => o.id !== id);
    this.scene.lights      = this.scene.lights.filter(o => o.id !== id);
    this.scene.characters  = this.scene.characters.filter(o => o.id !== id);
    this.scene.props       = this.scene.props.filter(o => o.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    this.emit();
  }

  updateObject(id: string, patch: Partial<EditorObject>): void {
    const lists = [this.scene.walls, this.scene.lights, this.scene.characters, this.scene.props] as EditorObject[][];
    for (const list of lists) {
      const idx = list.findIndex(o => o.id === id);
      if (idx !== -1) { Object.assign(list[idx], patch); break; }
    }
    this.emit();
  }

  getById(id: string): EditorObject | undefined {
    return [
      ...this.scene.walls,
      ...this.scene.lights,
      ...this.scene.characters,
      ...this.scene.props,
    ].find(o => o.id === id);
  }

  allObjects(): EditorObject[] {
    return [
      ...this.scene.walls,
      ...this.scene.lights,
      ...this.scene.characters,
      ...this.scene.props,
    ];
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  toJSON(): string {
    const { name, cols, rows, tileW, tileH, floor, walls, lights, characters, props } = this.scene;
    const out = {
      name, cols, rows, tileW, tileH,
      floor: { ...floor },
      walls: walls.map(w => ({ ...w })),
      lights: lights.map(l => ({ ...l })),
      characters: characters.map(c => ({ ...c })),
      // Props are not part of the base JSON schema — embed as a comment-style extension
      objects: props.map(p => ({ ...p })),
    };
    return JSON.stringify(out, null, 2);
  }

  loadJSON(json: string): void {
    try {
      const data = JSON.parse(json);
      this.scene = {
        name:       data.name ?? 'Imported',
        cols:       data.cols ?? 10,
        rows:       data.rows ?? 10,
        tileW:      data.tileW ?? 64,
        tileH:      data.tileH ?? 32,
        floor:      data.floor ?? EditorState.defaultScene().floor,
        walls:      data.walls ?? [],
        lights:     data.lights ?? [],
        characters: data.characters ?? [],
        props:      (data.objects ?? []).filter((o: EditorProp) => o.kind),
      };
      this.selectedId = null;
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
}
