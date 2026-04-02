/**
 * LuxIso Scene Editor — main entry point.
 * Wires together EditorState, EditorRenderer, and the HTML UI panels.
 */
import { EditorState, ToolType, EditorWall, EditorLight, EditorCharacter, EditorProp } from './EditorState';
import { EditorRenderer } from './EditorRenderer';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const canvas   = document.getElementById('editor-canvas') as HTMLCanvasElement;

// Size canvas to match the default 10×10 scene
const COLS = 10, ROWS = 10, TILE_W = 64, TILE_H = 32;
canvas.width  = (COLS + ROWS) * (TILE_W / 2);
canvas.height = (COLS + ROWS) * (TILE_H / 2) + 120;

const toolBtns = document.querySelectorAll<HTMLButtonElement>('[data-tool]');
const propPanel = document.getElementById('prop-panel')!;
const propContent = document.getElementById('prop-content')!;
const jsonOutput  = document.getElementById('json-output') as HTMLTextAreaElement;
const exportBtn   = document.getElementById('btn-export')!;
const importBtn   = document.getElementById('btn-import')!;
const clearBtn    = document.getElementById('btn-clear')!;
const deleteBtn   = document.getElementById('btn-delete')!;
const undoBtn     = document.getElementById('btn-undo') as HTMLButtonElement;
const redoBtn     = document.getElementById('btn-redo') as HTMLButtonElement;
const sceneNameInput = document.getElementById('scene-name') as HTMLInputElement;
const sceneColsInput = document.getElementById('scene-cols') as HTMLInputElement;
const sceneRowsInput = document.getElementById('scene-rows') as HTMLInputElement;
const objectList  = document.getElementById('object-list')!;
// ── State & renderer ──────────────────────────────────────────────────────────

const state    = new EditorState();
const renderer = new EditorRenderer(canvas, state);

// ── Tool buttons ──────────────────────────────────────────────────────────────

toolBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    state.setTool(btn.dataset.tool as ToolType);
    updateToolUI();
  });
});

function updateToolUI(): void {
  toolBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === state.activeTool);
  });
}
updateToolUI();

// ── Canvas interaction ────────────────────────────────────────────────────────

function getCanvasPos(e: MouseEvent): { cx: number; cy: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    cx: (e.clientX - rect.left) * (canvas.width  / rect.width),
    cy: (e.clientY - rect.top)  * (canvas.height / rect.height),
  };
}

canvas.addEventListener('mousemove', (e) => {
  const { cx, cy } = getCanvasPos(e);
  renderer.hoverWorld = renderer.canvasToWorld(cx, cy);
});

canvas.addEventListener('mouseleave', () => {
  renderer.hoverWorld = null;
});

canvas.addEventListener('click', (e) => {
  const { cx, cy } = getCanvasPos(e);
  const world = renderer.canvasToWorld(cx, cy);
  const s = state.scene;

  // Clamp to scene bounds
  if (world.x < 0 || world.x > s.cols || world.y < 0 || world.y > s.rows) return;

  const tool = state.activeTool;

  if (tool === 'select') {
    // Hit-test objects (simple distance check)
    const hit = findObjectAt(world.x, world.y);
    state.select(hit ?? null);
    updatePropPanel();
    return;
  }

  if (tool === 'wall') {
    const snapped = renderer.snapToGrid(world.x, world.y);
    if (!state.wallStart) {
      state.wallStart = snapped;
    } else {
      const w: EditorWall = {
        id: state.nextId('wall'),
        x: state.wallStart.x, y: state.wallStart.y,
        endX: snapped.x, endY: snapped.y,
        height: 80,
      };
      state.wallStart = null;
      state.addWall(w);
    }
    return;
  }

  if (tool === 'omnilight') {
    const l: EditorLight = {
      id: state.nextId('light'),
      type: 'omni',
      x: parseFloat(world.x.toFixed(2)),
      y: parseFloat(world.y.toFixed(2)),
      z: 120,
      color: '#ffd080',
      intensity: 1,
      radius: 320,
    };
    state.addLight(l);
    return;
  }

  if (tool === 'character') {
    const snapped = renderer.snapToTile(world.x, world.y);
    const c: EditorCharacter = {
      id: state.nextId('player'),
      x: snapped.x, y: snapped.y, z: 48,
      radius: 26, color: '#5590cc',
    };
    state.addCharacter(c);
    return;
  }

  const propKinds: Record<string, 'crystal' | 'boulder' | 'chest'> = {
    crystal: 'crystal', boulder: 'boulder', chest: 'chest',
  };
  if (tool in propKinds) {
    const snapped = renderer.snapToTile(world.x, world.y);
    const defaultColors: Record<string, string> = {
      crystal: '#8060e0', boulder: '#7a7a8a', chest: '#a05c18',
    };
    const p: EditorProp = {
      id: state.nextId(tool),
      kind: propKinds[tool],
      x: snapped.x, y: snapped.y,
      color: defaultColors[tool],
    };
    state.addProp(p);
    return;
  }
});

// ── Hit testing ───────────────────────────────────────────────────────────────

function findObjectAt(wx: number, wy: number): string | undefined {
  const all = state.allObjects();
  for (const obj of all) {
    const x = (obj as { x: number }).x;
    const y = (obj as { y: number }).y;
    if (Math.hypot(wx - x, wy - y) < 0.7) return obj.id;
  }
  return undefined;
}

// ── Property panel ────────────────────────────────────────────────────────────

function updatePropPanel(): void {
  const id = state.selectedId;
  if (!id) {
    propPanel.classList.add('hidden');
    return;
  }
  const obj = state.getById(id);
  if (!obj) { propPanel.classList.add('hidden'); return; }

  propPanel.classList.remove('hidden');
  propContent.innerHTML = buildPropForm(obj);

  // Bind inputs
  propContent.querySelectorAll<HTMLInputElement>('[data-field]').forEach(input => {
    input.addEventListener('input', () => {
      const field = input.dataset.field!;
      const val   = input.type === 'number' ? parseFloat(input.value) : input.value;
      state.updateObject(id, { [field]: val } as never);
    });
  });
}

function buildPropForm(obj: ReturnType<EditorState['getById']>): string {
  if (!obj) return '';
  const fields = Object.entries(obj)
    .filter(([k]) => k !== 'id' && k !== 'kind' && k !== 'type')
    .map(([k, v]) => {
      const isNum   = typeof v === 'number';
      const isColor = typeof v === 'string' && v.startsWith('#');
      const inputType = isColor ? 'color' : isNum ? 'number' : 'text';
      const step = isNum && !Number.isInteger(v) ? '0.01' : '1';
      return `
        <div class="field-row">
          <label>${k}</label>
          <input type="${inputType}" data-field="${k}" value="${v}"
            ${isNum ? `step="${step}"` : ''} />
        </div>`;
    }).join('');
  return `<div class="obj-id">${obj.id}</div>${fields}`;
}

state.onChange(() => {
  if (state.selectedId) updatePropPanel();
  else propPanel.classList.add('hidden');
  updateObjectList();
});

function updateObjectList(): void {
  const objs = state.allObjects();
  if (objs.length === 0) {
    objectList.innerHTML = '<div class="obj-list-empty">No objects</div>';
    return;
  }
  const kindLabel = (o: ReturnType<EditorState['getById']>): string => {
    if (!o) return '';
    if ('kind' in o) return (o as { kind: string }).kind;
    if ('type' in o) return (o as { type: string }).type;
    if ('radius' in o && 'color' in o) return 'char';
    if ('endX' in o) return 'wall';
    return '?';
  };
  objectList.innerHTML = objs.map(o => `
    <div class="obj-list-item${o.id === state.selectedId ? ' active' : ''}" data-id="${o.id}">
      <span class="obj-kind">${kindLabel(o)}</span>
      <span class="obj-name">${o.id}</span>
    </div>`).join('');
  objectList.querySelectorAll<HTMLElement>('[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      state.select(el.dataset.id!);
      updatePropPanel();
    });
  });
}
updateObjectList();

// ── Toolbar actions ───────────────────────────────────────────────────────────

deleteBtn.addEventListener('click', () => {
  if (state.selectedId) {
    state.removeById(state.selectedId);
    updatePropPanel();
  }
});

exportBtn.addEventListener('click', () => {
  jsonOutput.value = state.toJSON();
  jsonOutput.select();
  navigator.clipboard?.writeText(jsonOutput.value).catch(() => {});
});

importBtn.addEventListener('click', () => {
  const json = jsonOutput.value.trim();
  if (json) state.loadJSON(json);
});

clearBtn.addEventListener('click', () => {
  if (confirm('Clear scene?')) {
    Object.assign(state.scene, EditorState.defaultScene());
    state.selectedId = null;
    state.emit();
    updatePropPanel();
  }
});

sceneNameInput.addEventListener('input', () => {
  state.scene.name = sceneNameInput.value;
});
sceneNameInput.value = state.scene.name;

// ── Scene size ────────────────────────────────────────────────────────────────

function applySceneSize(): void {
  const cols = Math.max(2, Math.min(32, parseInt(sceneColsInput.value) || 10));
  const rows = Math.max(2, Math.min(32, parseInt(sceneRowsInput.value) || 10));
  sceneColsInput.value = String(cols);
  sceneRowsInput.value = String(rows);
  state.setSceneSize(cols, rows);
  // Resize canvas
  const s = state.scene;
  canvas.width  = (s.cols + s.rows) * (s.tileW / 2);
  canvas.height = (s.cols + s.rows) * (s.tileH / 2) + 120;
}
sceneColsInput.addEventListener('change', applySceneSize);
sceneRowsInput.addEventListener('change', applySceneSize);

// ── Undo / Redo ───────────────────────────────────────────────────────────────

function updateUndoRedo(): void {
  undoBtn.disabled = !state.canUndo;
  redoBtn.disabled = !state.canRedo;
  undoBtn.title = state.canUndo ? `Undo: ${state.undoDescription} (Ctrl+Z)` : 'Nothing to undo';
  redoBtn.title = state.canRedo ? `Redo: ${state.redoDescription} (Ctrl+Y)` : 'Nothing to redo';
}
undoBtn.addEventListener('click', () => { state.undo(); updateUndoRedo(); });
redoBtn.addEventListener('click', () => { state.redo(); updateUndoRedo(); });
updateUndoRedo();
state.onChange(updateUndoRedo);

// ── Start rendering ───────────────────────────────────────────────────────────

renderer.start();

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

const keyMap: Record<string, ToolType> = {
  v: 'select', w: 'wall', l: 'omnilight',
  c: 'character', '1': 'crystal', '2': 'boulder', '3': 'chest',
};
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); state.undo(); updateUndoRedo(); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Z')) { e.preventDefault(); state.redo(); updateUndoRedo(); return; }
  const tool = keyMap[e.key.toLowerCase()];
  if (tool) { state.setTool(tool); updateToolUI(); }
  if (e.key === 'Escape') { state.wallStart = null; state.select(null); updatePropPanel(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
    state.removeById(state.selectedId);
    updatePropPanel();
  }
});

// ── Statusbar ─────────────────────────────────────────────────────────────────

const statusbar = document.getElementById('statusbar')!;
const toolHints: Record<ToolType, string> = {
  select:    'Click an object to select it. Delete key removes selection.',
  move:      'Click and drag to reposition the selected object.',
  wall:      'Click to set wall start, click again to set end.',
  omnilight: 'Click to place an Omni Light.',
  character: 'Click to place a Character.',
  crystal:   'Click to place a Crystal.',
  boulder:   'Click to place a Boulder.',
  chest:     'Click to place a Chest.',
  blocked:   'Click tiles to toggle blocked (unwalkable) areas.',
  walkable:  'Click tiles to mark them as walkable.',
};
state.onChange(() => {
  statusbar.textContent = toolHints[state.activeTool] ?? '';
});
