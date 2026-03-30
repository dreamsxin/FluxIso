/**
 * Sprite Editor — visual tool for configuring 8-direction character animations.
 *
 * Workflow:
 *   1. Upload a sprite sheet image (or enter a URL)
 *   2. Set frame size (w × h) and scale
 *   3. Define actions: name, starting row, frame count, fps
 *   4. Preview all 8 directions live on the canvas grid
 *   5. Export the SpriteSheet JSON config
 */
import { SpriteSheet } from '../animation/SpriteSheet';
import { DirectionalAnimator } from '../animation/DirectionalAnimator';
import { Direction } from '../animation/AnimationController';

// ── DOM ───────────────────────────────────────────────────────────────────────

const uploadInput   = document.getElementById('upload-img')    as HTMLInputElement;
const urlInput      = document.getElementById('img-url')       as HTMLInputElement;
const loadUrlBtn    = document.getElementById('btn-load-url')  as HTMLButtonElement;
const frameWInput   = document.getElementById('frame-w')       as HTMLInputElement;
const frameHInput   = document.getElementById('frame-h')       as HTMLInputElement;
const scaleInput    = document.getElementById('sprite-scale')  as HTMLInputElement;
const actionsList   = document.getElementById('actions-list')  as HTMLElement;
const addActionBtn  = document.getElementById('btn-add-action')as HTMLButtonElement;
const exportBtn     = document.getElementById('btn-export-sprite') as HTMLButtonElement;
const jsonOut       = document.getElementById('sprite-json')   as HTMLTextAreaElement;
const previewGrid   = document.getElementById('preview-grid')  as HTMLElement;
const sheetPreview  = document.getElementById('sheet-preview') as HTMLCanvasElement;
const sheetCtx      = sheetPreview.getContext('2d')!;
const activeActionSel = document.getElementById('active-action') as HTMLSelectElement;
const playBtn       = document.getElementById('btn-play')      as HTMLButtonElement;

// ── State ─────────────────────────────────────────────────────────────────────

interface ActionDef {
  id: number;
  name: string;
  rowStart: number;
  frameCount: number;
  fps: number;
  loop: boolean;
}

let imageEl: HTMLImageElement | null = null;
let imageUrl = '';
let frameW = 64, frameH = 64, drawScale = 1;
let actions: ActionDef[] = [
  { id: 1, name: 'idle', rowStart: 0, frameCount: 4, fps: 6,  loop: true },
  { id: 2, name: 'walk', rowStart: 8, frameCount: 8, fps: 12, loop: true },
];
let nextId = 3;

let sheet: SpriteSheet | null = null;
let animators: Map<Direction, DirectionalAnimator> = new Map();
let activeAction = 'idle';
let lastTs = 0;
let rafId = 0;

const DIRS: Direction[] = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];

// ── Image loading ─────────────────────────────────────────────────────────────

uploadInput.addEventListener('change', () => {
  const file = uploadInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => loadImageFromUrl(e.target!.result as string);
  reader.readAsDataURL(file);
});

loadUrlBtn.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (url) loadImageFromUrl(url);
});

function loadImageFromUrl(url: string): void {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    imageEl = img;
    imageUrl = url;
    drawSheetPreview();
    rebuildSheet();
  };
  img.onerror = () => alert(`Failed to load image: ${url}`);
  img.src = url;
}

// ── Sheet preview ─────────────────────────────────────────────────────────────

function drawSheetPreview(): void {
  if (!imageEl) return;
  const maxW = 400, maxH = 300;
  const scale = Math.min(maxW / imageEl.width, maxH / imageEl.height, 1);
  sheetPreview.width  = Math.round(imageEl.width  * scale);
  sheetPreview.height = Math.round(imageEl.height * scale);
  sheetCtx.clearRect(0, 0, sheetPreview.width, sheetPreview.height);
  sheetCtx.drawImage(imageEl, 0, 0, sheetPreview.width, sheetPreview.height);

  // Draw grid overlay
  const gw = frameW * scale, gh = frameH * scale;
  sheetCtx.strokeStyle = 'rgba(100,180,255,0.4)';
  sheetCtx.lineWidth = 0.5;
  for (let x = 0; x <= sheetPreview.width; x += gw) {
    sheetCtx.beginPath(); sheetCtx.moveTo(x, 0); sheetCtx.lineTo(x, sheetPreview.height); sheetCtx.stroke();
  }
  for (let y = 0; y <= sheetPreview.height; y += gh) {
    sheetCtx.beginPath(); sheetCtx.moveTo(0, y); sheetCtx.lineTo(sheetPreview.width, y); sheetCtx.stroke();
  }

  // Highlight active action rows
  actions.forEach((a, i) => {
    const hue = (i * 60) % 360;
    sheetCtx.fillStyle = `hsla(${hue},80%,60%,0.12)`;
    for (let d = 0; d < 8; d++) {
      const row = a.rowStart + d;
      sheetCtx.fillRect(0, row * gh, a.frameCount * gw, gh);
    }
  });
}

// ── Config inputs ─────────────────────────────────────────────────────────────

[frameWInput, frameHInput, scaleInput].forEach(el => {
  el.addEventListener('input', () => {
    frameW = parseInt(frameWInput.value) || 64;
    frameH = parseInt(frameHInput.value) || 64;
    drawScale = parseFloat(scaleInput.value) || 1;
    drawSheetPreview();
    rebuildSheet();
  });
});

// ── Actions list ──────────────────────────────────────────────────────────────

function renderActionsList(): void {
  actionsList.innerHTML = '';
  actions.forEach(a => {
    const row = document.createElement('div');
    row.className = 'action-row';
    row.innerHTML = `
      <input class="a-name"  type="text"   value="${a.name}"       placeholder="name" />
      <input class="a-row"   type="number" value="${a.rowStart}"   min="0" placeholder="row" />
      <input class="a-count" type="number" value="${a.frameCount}" min="1" placeholder="frames" />
      <input class="a-fps"   type="number" value="${a.fps}"        min="1" placeholder="fps" />
      <label><input class="a-loop" type="checkbox" ${a.loop ? 'checked' : ''} /> loop</label>
      <button class="btn-del-action" data-id="${a.id}">✕</button>
    `;
    const get = <T extends HTMLInputElement>(cls: string) => row.querySelector<T>(`.${cls}`)!;
    get('a-name').addEventListener('input',  e => { a.name       = (e.target as HTMLInputElement).value; rebuildSheet(); });
    get('a-row').addEventListener('input',   e => { a.rowStart   = parseInt((e.target as HTMLInputElement).value) || 0; drawSheetPreview(); rebuildSheet(); });
    get('a-count').addEventListener('input', e => { a.frameCount = parseInt((e.target as HTMLInputElement).value) || 1; rebuildSheet(); });
    get('a-fps').addEventListener('input',   e => { a.fps        = parseInt((e.target as HTMLInputElement).value) || 12; rebuildSheet(); });
    get('a-loop').addEventListener('change', e => { a.loop       = (e.target as HTMLInputElement).checked; rebuildSheet(); });
    row.querySelector<HTMLButtonElement>('.btn-del-action')!.addEventListener('click', () => {
      actions = actions.filter(x => x.id !== a.id);
      renderActionsList();
      rebuildSheet();
    });
    actionsList.appendChild(row);
  });

  // Sync active action selector
  activeActionSel.innerHTML = actions.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
  if (actions.find(a => a.name === activeAction)) {
    activeActionSel.value = activeAction;
  } else if (actions.length > 0) {
    activeAction = actions[0].name;
    activeActionSel.value = activeAction;
  }
}

addActionBtn.addEventListener('click', () => {
  actions.push({ id: nextId++, name: `action${nextId}`, rowStart: 0, frameCount: 4, fps: 8, loop: true });
  renderActionsList();
  rebuildSheet();
});

activeActionSel.addEventListener('change', () => {
  activeAction = activeActionSel.value;
  animators.forEach(a => a.setAction(activeAction));
});

// ── Sheet rebuild ─────────────────────────────────────────────────────────────

function rebuildSheet(): void {
  if (!imageEl || actions.length === 0) return;

  sheet = DirectionalAnimator.buildSheet(
    imageUrl, frameW, frameH,
    actions.map(a => ({ name: a.name, rowStart: a.rowStart, frameCount: a.frameCount, fps: a.fps, loop: a.loop })),
    drawScale,
  );

  // Manually inject the loaded image into AssetLoader cache via the sheet
  // (since we loaded it via FileReader, not fetch)
  (sheet as unknown as { _injectedImage: HTMLImageElement })._injectedImage = imageEl;

  // Patch: override the image getter to return our loaded image
  Object.defineProperty(sheet, 'image', { get: () => imageEl, configurable: true });

  animators = new Map(DIRS.map(dir => [
    dir,
    new DirectionalAnimator(sheet!, { initialAction: activeAction, initialDirection: dir }),
  ]));

  renderActionsList();
  buildPreviewGrid();
}

// ── Preview grid ──────────────────────────────────────────────────────────────

const DIR_LABELS: Record<Direction, string> = {
  N: '↑ N', NE: '↗ NE', E: '→ E', SE: '↘ SE',
  S: '↓ S', SW: '↙ SW', W: '← W', NW: '↖ NW',
};

function buildPreviewGrid(): void {
  previewGrid.innerHTML = '';
  DIRS.forEach(dir => {
    const cell = document.createElement('div');
    cell.className = 'preview-cell';
    const label = document.createElement('div');
    label.className = 'dir-label';
    label.textContent = DIR_LABELS[dir];
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(frameW * drawScale * 1.5);
    canvas.height = Math.round(frameH * drawScale * 1.5);
    canvas.dataset.dir = dir;
    cell.appendChild(label);
    cell.appendChild(canvas);
    previewGrid.appendChild(cell);
  });
}

// ── Animation loop ────────────────────────────────────────────────────────────

function tick(ts: number): void {
  const dt = Math.min((ts - lastTs) / 1000, 0.1);
  lastTs = ts;

  DIRS.forEach(dir => {
    const anim = animators.get(dir);
    if (!anim) return;
    anim.update(dt);

    const canvas = previewGrid.querySelector<HTMLCanvasElement>(`[data-dir="${dir}"]`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const result = anim.currentFrame();
    if (!result) return;
    const { frame, image } = result;
    const dw = frame.w * drawScale;
    const dh = frame.h * drawScale;
    const dx = (canvas.width  - dw) / 2;
    const dy = (canvas.height - dh) / 2;
    ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, dx, dy, dw, dh);

    // Clip name label
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, canvas.height - 14, canvas.width, 14);
    ctx.fillStyle = '#88aaff';
    ctx.font = '9px monospace';
    ctx.fillText(anim.clipName, 3, canvas.height - 3);
  });

  rafId = requestAnimationFrame(tick);
}

playBtn.addEventListener('click', () => {
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; playBtn.textContent = '▶ Play'; }
  else { lastTs = performance.now(); rafId = requestAnimationFrame(tick); playBtn.textContent = '⏸ Pause'; }
});

// Auto-start
lastTs = performance.now();
rafId = requestAnimationFrame(tick);
playBtn.textContent = '⏸ Pause';

// ── Export ────────────────────────────────────────────────────────────────────

exportBtn.addEventListener('click', () => {
  if (!sheet) { alert('Load an image and configure actions first.'); return; }
  const config = {
    url: imageUrl,
    frameW, frameH,
    scale: drawScale,
    actions: actions.map(a => ({
      name: a.name, rowStart: a.rowStart, frameCount: a.frameCount, fps: a.fps, loop: a.loop,
    })),
    // Full clips array for direct SpriteSheet construction
    clips: Array.from(sheet.clips.values()).map(c => ({
      name: c.name, fps: c.fps, loop: c.loop ?? true,
      frames: c.frames,
    })),
  };
  jsonOut.value = JSON.stringify(config, null, 2);
  jsonOut.select();
});

// ── Init ──────────────────────────────────────────────────────────────────────

renderActionsList();
buildPreviewGrid();
