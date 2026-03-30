import { SpriteSheet, AnimationClip } from './SpriteSheet';

/**
 * 8-direction enum for isometric characters.
 * SE = moving right+down on screen (positive x+y in iso world).
 */
export type Direction = 'S' | 'SW' | 'W' | 'NW' | 'N' | 'NE' | 'E' | 'SE';

/**
 * Controls animation playback for a single character.
 * Tracks the current clip, elapsed time, and current frame index.
 */
export class AnimationController {
  private sheet: SpriteSheet;
  private clip: AnimationClip;
  private elapsed = 0; // seconds since clip start
  private _frame = 0;
  private _done = false;

  direction: Direction = 'S';

  constructor(sheet: SpriteSheet, initialClip = 'idle') {
    this.sheet = sheet;
    this.clip = sheet.getClip(initialClip);
  }

  /** Switch to a named animation clip. No-op if already playing the same clip. */
  play(name: string): void {
    if (this.clip.name === name) return;
    this.clip = this.sheet.getClip(name);
    this.elapsed = 0;
    this._frame = 0;
    this._done = false;
  }

  /** Advance animation by `dt` seconds (call once per frame). */
  update(dt: number): void {
    if (this._done) return;
    this.elapsed += dt;
    const frameDuration = 1 / this.clip.fps;
    const totalFrames = this.clip.frames.length;
    const totalDuration = frameDuration * totalFrames;

    if (this.clip.loop ?? true) {
      this._frame = Math.floor((this.elapsed % totalDuration) / frameDuration);
    } else {
      if (this.elapsed >= totalDuration) {
        this._frame = totalFrames - 1;
        this._done = true;
      } else {
        this._frame = Math.floor(this.elapsed / frameDuration);
      }
    }
  }

  /** Current frame index within the active clip. */
  get frameIndex(): number {
    return this._frame;
  }

  /** True when a non-looping animation has finished. */
  get done(): boolean {
    return this._done;
  }

  get currentClip(): AnimationClip {
    return this.clip;
  }

  get spriteSheet(): SpriteSheet {
    return this.sheet;
  }

  /**
   * Infer movement direction from world-space delta vector.
   * Handles 8 directions with 45° sectors.
   */
  static directionFrom(dx: number, dy: number): Direction {
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return 'S';
    const angle = Math.atan2(dy, dx) * (180 / Math.PI); // -180..180
    const a = ((angle + 360) % 360); // 0..360
    if (a < 22.5 || a >= 337.5) return 'E';
    if (a < 67.5)  return 'SE';
    if (a < 112.5) return 'S';
    if (a < 157.5) return 'SW';
    if (a < 202.5) return 'W';
    if (a < 247.5) return 'NW';
    if (a < 292.5) return 'N';
    return 'NE';
  }
}
