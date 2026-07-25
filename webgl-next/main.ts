import { Scene } from '../src/core/Scene';
import { Character } from '../src/elements/Character';
import { Floor } from '../src/elements/Floor';
import { Wall } from '../src/elements/Wall';
import { Boulder } from '../src/elements/props/Boulder';
import { Chest } from '../src/elements/props/Chest';
import { Cloud } from '../src/elements/props/Cloud';
import { Crystal } from '../src/elements/props/Crystal';
import { DirectionalLight } from '../src/lighting/DirectionalLight';
import { OmniLight } from '../src/lighting/OmniLight';
import { SceneExtractor } from './src/extraction/SceneExtractor';
import { WebGLRenderer, WebGLUnavailableError } from './src/renderer/WebGLRenderer';

type ViewMode = 'webgl' | 'compare' | 'canvas';

const viewport = required<HTMLElement>('viewport');
const webglCanvas = required<HTMLCanvasElement>('webgl-canvas');
const referenceCanvas = required<HTMLCanvasElement>('canvas-reference');
const referenceContext = getCanvasContext(referenceCanvas);

const scene = createScene();
const orbitLight = scene.getLightById('work-light') as OmniLight;
const extractor = new SceneExtractor();
let renderer: WebGLRenderer | null = null;
let mode: ViewMode = 'webgl';
let selectedId = '';
let lastFrame = performance.now();
let fpsWindowStart = lastFrame;
let fpsFrames = 0;
let currentFps = 0;

try {
  renderer = new WebGLRenderer(webglCanvas);
  const capabilities = renderer.capabilities;
  required('backend-status').textContent = `就绪 · ${capabilities.renderer}`;
} catch (error) {
  mode = 'canvas';
  viewport.dataset.mode = mode;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode="webgl"], [data-mode="compare"]')) {
    button.disabled = true;
    button.classList.remove('active');
  }
  document.querySelector<HTMLButtonElement>('[data-mode="canvas"]')?.classList.add('active');
  required('backend-status').textContent = error instanceof WebGLUnavailableError
    ? 'WebGL 2 不可用 · Canvas fallback'
    : `初始化失败 · ${error instanceof Error ? error.message : String(error)}`;
}

bindControls();
bindViewportInput();
new ResizeObserver(resizeSurfaces).observe(viewport);
resizeSurfaces();
requestAnimationFrame(frame);

function createScene(): Scene {
  const next = new Scene({ name: 'WebGL Next Lab', tileW: 64, tileH: 32, cols: 12, rows: 10 });
  next.ambientColor = '#d9e6ef';
  next.ambientIntensity = 0.38;
  next.camera.x = 6;
  next.camera.y = 4.8;

  next.addObject(new Floor({
    id: 'floor', cols: 12, rows: 10, color: '#355d4b', altColor: '#3c6752',
  }));
  next.addObject(new Wall({
    id: 'north-wall', x: 1, y: 1, endX: 10.5, endY: 1, height: 72, color: '#58636d',
    openings: [{ type: 'window', offsetX: 0.3, width: 0.15, height: 0.32, offsetY: 0.42 }],
  }));
  next.addObject(new Wall({
    id: 'west-wall', x: 1, y: 1, endX: 1, endY: 8.5, height: 72, color: '#65717c',
    openings: [{ type: 'door', offsetX: 0.58, width: 0.18, height: 0.72 }],
  }));
  next.addObject(new Wall({
    id: 'divider', x: 7.5, y: 3, endX: 7.5, endY: 7.5, height: 48, color: '#4d5963',
  }));

  next.addObject(new Character({ id: 'runner', x: 4.2, y: 5.1, radius: 20, color: '#d96355' }));
  next.addObject(new Crystal('violet-crystal', 3.1, 3.4, '#7c62d9', 54));
  next.addObject(new Crystal('cyan-crystal', 8.6, 6.7, '#3ab5b0', 42));
  next.addObject(new Boulder('boulder-a', 5.8, 7.3, '#69727a', 21));
  next.addObject(new Boulder('boulder-b', 9.1, 3.3, '#777066', 17));
  next.addObject(new Chest('supply-chest', 6.1, 3.2, '#a86526'));
  next.addObject(new Cloud({ id: 'cloud-a', x: 2.2, y: 6.7, altitude: 5.2, speed: 0.22, angle: -0.18, scale: 0.85, seed: 0.42 }));

  next.addLight(new DirectionalLight({ id: 'sun', angle: 220, elevation: 48, color: '#e8f3ff', intensity: 0.48 }));
  next.addLight(new OmniLight({
    id: 'work-light', x: 7.8, y: 4.6, z: 82, radius: 270, color: '#ffd27a', intensity: 1.3, falloff: 'quadratic',
  }));
  next.addLight(new OmniLight({
    id: 'sky-fill', x: 0, y: 0, z: 0, color: '#7ba7cf', intensity: 0.14, isGlobal: true,
  }));
  return next;
}

function bindControls(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('.mode')) {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      mode = button.dataset.mode as ViewMode;
      viewport.dataset.mode = mode;
      for (const candidate of document.querySelectorAll('.mode')) candidate.classList.toggle('active', candidate === button);
      resizeSurfaces();
    });
  }

  bindRange('rotation', 'rotation-value', (value) => {
    scene.view.rotation = value;
    return `${Math.round(value)}°`;
  });
  bindRange('elevation', 'elevation-value', (value) => {
    scene.view.elevation = value;
    return value.toFixed(2);
  });
  bindRange('zoom', 'zoom-value', (value) => {
    scene.camera.setZoom(value);
    return value.toFixed(2);
  });
  bindRange('ambient', 'ambient-value', (value) => {
    scene.ambientIntensity = value;
    return value.toFixed(2);
  });
  bindRange('light-intensity', 'light-value', (value) => {
    orbitLight.intensity = value;
    return value.toFixed(2);
  });
}

function bindViewportInput(): void {
  let pointerStart: { x: number; y: number; cameraX: number; cameraY: number } | null = null;

  webglCanvas.addEventListener('pointerdown', (event) => {
    webglCanvas.setPointerCapture(event.pointerId);
    pointerStart = { x: event.clientX, y: event.clientY, cameraX: scene.camera.x, cameraY: scene.camera.y };
  });
  webglCanvas.addEventListener('pointermove', (event) => {
    if (!pointerStart || !(event.buttons & 1)) return;
    const dx = (event.clientX - pointerStart.x) / (scene.tileW * scene.camera.zoom);
    const dy = (event.clientY - pointerStart.y) / (scene.tileH * scene.camera.zoom);
    scene.camera.x = pointerStart.cameraX - dx - dy;
    scene.camera.y = pointerStart.cameraY + dx - dy;
  });
  webglCanvas.addEventListener('pointerup', (event) => {
    if (!pointerStart) return;
    const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = null;
    if (moved > 5 || !renderer) return;
    const rect = webglCanvas.getBoundingClientRect();
    const result = renderer.pick(event.clientX - rect.left, event.clientY - rect.top);
    selectedId = result?.objectId ?? '';
    required('selection').textContent = selectedId ? `已选择 · ${selectedId}` : '未选择对象';
    const chest = scene.getById(selectedId);
    if (chest instanceof Chest) chest.toggle();
  });
  webglCanvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    scene.camera.setZoom(scene.camera.zoom * (event.deltaY > 0 ? 0.92 : 1.08));
    const zoom = required<HTMLInputElement>('zoom');
    zoom.value = String(scene.camera.zoom);
    required<HTMLOutputElement>('zoom-value').value = scene.camera.zoom.toFixed(2);
  }, { passive: false });
}

function resizeSurfaces(): void {
  if (renderer && mode !== 'canvas') {
    const rect = webglCanvas.parentElement!.getBoundingClientRect();
    renderer.resize(rect.width, rect.height);
  }
  if (mode !== 'webgl') resizeReferenceCanvas();
}

function resizeReferenceCanvas(): void {
  const rect = referenceCanvas.parentElement!.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (referenceCanvas.width !== width || referenceCanvas.height !== height) {
    referenceCanvas.width = width;
    referenceCanvas.height = height;
  }
  referenceCanvas.style.width = `${rect.width}px`;
  referenceCanvas.style.height = `${rect.height}px`;
}

function frame(now: number): void {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  fpsFrames++;
  if (now - fpsWindowStart >= 500) {
    currentFps = fpsFrames * 1000 / (now - fpsWindowStart);
    fpsFrames = 0;
    fpsWindowStart = now;
  }

  if (required<HTMLInputElement>('orbit').checked) {
    const angle = now * 0.00038;
    orbitLight.position.x = 6 + Math.cos(angle) * 3.4;
    orbitLight.position.y = 5 + Math.sin(angle) * 2.6;
  }
  scene.update(now);

  if (renderer && mode !== 'canvas') {
    const rect = webglCanvas.getBoundingClientRect();
    const snapshot = extractor.extract(scene, {
      viewportWidth: rect.width,
      viewportHeight: rect.height,
      originX: rect.width / 2,
      originY: sceneOriginY(rect.height),
    });
    renderer.render(snapshot);
  }
  if (mode !== 'webgl') renderCanvasReference();
  updateMetrics(dt);
  requestAnimationFrame(frame);
}

function renderCanvasReference(): void {
  const rect = referenceCanvas.getBoundingClientRect();
  const dpr = referenceCanvas.width / Math.max(1, rect.width);
  referenceContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  referenceContext.fillStyle = '#12161d';
  referenceContext.fillRect(0, 0, rect.width, rect.height);
  scene.draw(referenceContext, rect.width, rect.height, rect.width / 2, sceneOriginY(rect.height));
}

function updateMetrics(_dt: number): void {
  required('fps').textContent = currentFps.toFixed(0);
  if (!renderer || mode === 'canvas') return;
  const stats = renderer.stats;
  required('cpu').textContent = `${stats.cpuMs.toFixed(2)} ms`;
  required('draw-calls').textContent = String(stats.drawCalls);
  required('triangles').textContent = Math.round(stats.triangles).toLocaleString();
  required('buffer').textContent = `${(stats.bufferBytes / 1024).toFixed(1)} KB`;
  required('lights').textContent = String(stats.omniLights);
  required('fallbacks').textContent = String(stats.unsupportedObjects);
}

function bindRange(
  inputId: string,
  outputId: string,
  apply: (value: number) => string,
): void {
  const input = required<HTMLInputElement>(inputId);
  const output = required<HTMLOutputElement>(outputId);
  input.addEventListener('input', () => { output.value = apply(Number(input.value)); });
}

function required<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}.`);
  return element as T;
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  return context;
}

function sceneOriginY(height: number): number {
  return Math.max(135, Math.min(400, height * 0.36));
}
