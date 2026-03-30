import { OmniLight } from '../lighting/OmniLight';
import { DirectionalLight } from '../lighting/DirectionalLight';

export class LightmapCache {
  private _canvas: OffscreenCanvas;
  private _ctx: OffscreenCanvasRenderingContext2D;
  private _dirty = true;
  private _snapshot: string = '';

  constructor(width: number, height: number) {
    this._canvas = new OffscreenCanvas(width, height);
    this._ctx = this._canvas.getContext('2d')!;
  }

  get ctx(): OffscreenCanvasRenderingContext2D { return this._ctx; }
  get dirty(): boolean { return this._dirty; }

  resize(width: number, height: number): void {
    this._canvas = new OffscreenCanvas(width, height);
    this._ctx = this._canvas.getContext('2d')!;
    this._dirty = true;
    this._snapshot = '';
  }

  /**
   * Returns true if the floor needs to be re-baked.
   * Checks lights AND camera state (position + zoom) so panning/zooming
   * correctly invalidates the cached floor image.
   */
  isDirty(
    omniLights: OmniLight[],
    dirLights: DirectionalLight[],
    cameraX = 0,
    cameraY = 0,
    cameraZoom = 1,
  ): boolean {
    const snap = this._buildSnapshot(omniLights, dirLights, cameraX, cameraY, cameraZoom);
    if (snap !== this._snapshot) {
      this._dirty = true;
      this._snapshot = snap;
    }
    return this._dirty;
  }

  begin(): void {
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
  }

  end(): void {
    this._dirty = false;
  }

  blit(target: CanvasRenderingContext2D): void {
    target.drawImage(this._canvas, 0, 0);
  }

  invalidate(): void {
    this._dirty = true;
  }

  private _buildSnapshot(
    omniLights: OmniLight[],
    dirLights: DirectionalLight[],
    cx: number, cy: number, zoom: number,
  ): string {
    const parts: string[] = [`cam:${cx.toFixed(3)},${cy.toFixed(3)},${zoom.toFixed(3)}`];
    for (const l of omniLights) {
      parts.push(`o:${l.position.x.toFixed(2)},${l.position.y.toFixed(2)},${l.position.z.toFixed(2)},${l.color},${l.intensity.toFixed(3)},${l.radius}`);
    }
    for (const d of dirLights) {
      parts.push(`d:${d.angle.toFixed(3)},${d.elevation.toFixed(3)},${d.color},${d.intensity.toFixed(3)}`);
    }
    return parts.join('|');
  }
}
