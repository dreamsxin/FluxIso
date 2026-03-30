/**
 * AudioManager — Web Audio API wrapper for LuxIso.
 *
 * Features:
 *   - One-shot SFX playback (fire-and-forget)
 *   - Looping BGM with crossfade
 *   - Spatial distance attenuation for world-positioned sounds
 *   - Three volume buses: master, sfx, bgm
 *   - Lazy AudioContext creation (requires user gesture on most browsers)
 *   - Buffer cache: each URL is decoded once
 */
export interface SpatialOptions {
  /** World X of the sound source */
  x: number;
  /** World Y of the sound source */
  y: number;
  /** World X of the listener (usually the player) */
  listenerX: number;
  /** World Y of the listener */
  listenerY: number;
  /**
   * World-unit distance at which volume reaches 0.
   * Default: 12 world units.
   */
  maxDistance?: number;
  /**
   * World-unit distance at which volume starts falling off.
   * Default: 2 world units.
   */
  refDistance?: number;
}

export interface PlayOptions {
  /** Volume multiplier 0–1 (applied on top of the sfx bus). Default 1. */
  volume?: number;
  /** Playback rate (1 = normal speed). Default 1. */
  rate?: number;
  /** If true, loop the sound (use for BGM via playSfx if needed). Default false. */
  loop?: boolean;
  /** Spatial attenuation options. Omit for non-spatial (UI sounds etc.). */
  spatial?: SpatialOptions;
}

export class AudioManager {
  private _ctx: AudioContext | null = null;
  private _cache = new Map<string, AudioBuffer>();
  private _pending = new Map<string, Promise<AudioBuffer>>();

  // Volume buses
  private _masterGain!: GainNode;
  private _sfxGain!: GainNode;
  private _bgmGain!: GainNode;

  // BGM state
  private _bgmSource: AudioBufferSourceNode | null = null;
  private _bgmUrl = '';

  // Volume values (stored so they survive lazy init)
  private _masterVol = 1;
  private _sfxVol    = 1;
  private _bgmVol    = 0.6;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Initialise the AudioContext and gain buses.
   * Must be called from a user-gesture handler (click, keydown, etc.).
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  resume(): void {
    if (this._ctx) {
      if (this._ctx.state === 'suspended') this._ctx.resume();
      return;
    }
    this._ctx = new AudioContext();
    this._masterGain = this._ctx.createGain();
    this._sfxGain    = this._ctx.createGain();
    this._bgmGain    = this._ctx.createGain();

    this._sfxGain.connect(this._masterGain);
    this._bgmGain.connect(this._masterGain);
    this._masterGain.connect(this._ctx.destination);

    this._masterGain.gain.value = this._masterVol;
    this._sfxGain.gain.value    = this._sfxVol;
    this._bgmGain.gain.value    = this._bgmVol;
  }

  /** Suspend the AudioContext (e.g. when tab is hidden). */
  suspend(): void {
    this._ctx?.suspend();
  }

  // ── Volume buses ──────────────────────────────────────────────────────────

  get masterVolume(): number { return this._masterVol; }
  set masterVolume(v: number) {
    this._masterVol = clamp01(v);
    if (this._masterGain) this._masterGain.gain.value = this._masterVol;
  }

  get sfxVolume(): number { return this._sfxVol; }
  set sfxVolume(v: number) {
    this._sfxVol = clamp01(v);
    if (this._sfxGain) this._sfxGain.gain.value = this._sfxVol;
  }

  get bgmVolume(): number { return this._bgmVol; }
  set bgmVolume(v: number) {
    this._bgmVol = clamp01(v);
    if (this._bgmGain) this._bgmGain.gain.value = this._bgmVol;
  }

  // ── Buffer loading ────────────────────────────────────────────────────────

  /**
   * Preload an audio file into the buffer cache.
   * Safe to call before resume() — will decode once the context is ready.
   */
  async preload(url: string): Promise<void> {
    await this._loadBuffer(url);
  }

  /** Preload multiple files in parallel. */
  async preloadAll(urls: string[]): Promise<void> {
    await Promise.all(urls.map((u) => this.preload(u)));
  }

  // ── SFX ──────────────────────────────────────────────────────────────────

  /**
   * Play a one-shot sound effect.
   * Returns the AudioBufferSourceNode so callers can stop it early if needed.
   * Returns null if the AudioContext is not yet initialised.
   */
  playSfx(url: string, opts: PlayOptions = {}): AudioBufferSourceNode | null {
    const ctx = this._ctx;
    if (!ctx) return null;

    const buffer = this._cache.get(url);
    if (!buffer) {
      // Load in background and play when ready
      this._loadBuffer(url).then((buf) => this._playBuffer(buf, this._sfxGain, opts));
      return null;
    }
    return this._playBuffer(buffer, this._sfxGain, opts);
  }

  // ── BGM ───────────────────────────────────────────────────────────────────

  /**
   * Start looping background music.
   * If the same URL is already playing, this is a no-op.
   * Crossfades from the previous track over `fadeDuration` seconds.
   */
  async playBgm(url: string, fadeDuration = 1.0): Promise<void> {
    if (!this._ctx) return;
    if (url === this._bgmUrl && this._bgmSource) return;

    const buffer = await this._loadBuffer(url);
    const ctx = this._ctx;
    if (!ctx) return;

    // Fade out old track
    if (this._bgmSource) {
      const old = this._bgmSource;
      const fadeGain = ctx.createGain();
      fadeGain.gain.setValueAtTime(1, ctx.currentTime);
      fadeGain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeDuration);
      // Reconnect old source through fade gain
      old.disconnect();
      old.connect(fadeGain);
      fadeGain.connect(this._bgmGain);
      setTimeout(() => { try { old.stop(); } catch { /* already stopped */ } }, fadeDuration * 1000 + 100);
    }

    // Start new track
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    if (fadeDuration > 0 && this._bgmSource) {
      // Fade in
      const fadeIn = ctx.createGain();
      fadeIn.gain.setValueAtTime(0, ctx.currentTime);
      fadeIn.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeDuration);
      src.connect(fadeIn);
      fadeIn.connect(this._bgmGain);
    } else {
      src.connect(this._bgmGain);
    }

    src.start();
    this._bgmSource = src;
    this._bgmUrl = url;
  }

  /** Stop BGM immediately or with a fade-out. */
  stopBgm(fadeDuration = 0.5): void {
    const ctx = this._ctx;
    if (!ctx || !this._bgmSource) return;
    const src = this._bgmSource;
    this._bgmSource = null;
    this._bgmUrl = '';

    if (fadeDuration > 0) {
      const fadeGain = ctx.createGain();
      fadeGain.gain.setValueAtTime(1, ctx.currentTime);
      fadeGain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeDuration);
      src.disconnect();
      src.connect(fadeGain);
      fadeGain.connect(this._bgmGain);
      setTimeout(() => { try { src.stop(); } catch { /* already stopped */ } }, fadeDuration * 1000 + 100);
    } else {
      try { src.stop(); } catch { /* already stopped */ }
    }
  }

  // ── Spatial helper ────────────────────────────────────────────────────────

  /**
   * Compute a 0–1 volume factor based on world-space distance.
   * Use this to set `opts.volume` when calling playSfx with spatial audio.
   *
   * Uses a simple linear falloff from refDistance (full volume) to
   * maxDistance (silence), matching the SpatialOptions interface.
   */
  static spatialVolume(opts: SpatialOptions): number {
    const dx = opts.x - opts.listenerX;
    const dy = opts.y - opts.listenerY;
    const dist = Math.hypot(dx, dy);
    const ref = opts.refDistance ?? 2;
    const max = opts.maxDistance ?? 12;
    if (dist <= ref) return 1;
    if (dist >= max) return 0;
    return 1 - (dist - ref) / (max - ref);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async _loadBuffer(url: string): Promise<AudioBuffer> {
    const cached = this._cache.get(url);
    if (cached) return cached;

    const inFlight = this._pending.get(url);
    if (inFlight) return inFlight;

    const promise = (async () => {
      // Ensure context exists (may be called before resume())
      if (!this._ctx) {
        // Defer until context is available — poll briefly
        await waitForContext(() => this._ctx);
      }
      const ctx = this._ctx!;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`AudioManager: failed to fetch "${url}" (${res.status})`);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this._cache.set(url, audioBuffer);
      this._pending.delete(url);
      return audioBuffer;
    })();

    this._pending.set(url, promise);
    return promise;
  }

  private _playBuffer(
    buffer: AudioBuffer,
    bus: GainNode,
    opts: PlayOptions,
  ): AudioBufferSourceNode {
    const ctx = this._ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = opts.loop ?? false;
    src.playbackRate.value = opts.rate ?? 1;

    if (opts.volume !== undefined && opts.volume !== 1) {
      const vol = ctx.createGain();
      vol.gain.value = clamp01(opts.volume);
      src.connect(vol);
      vol.connect(bus);
    } else {
      src.connect(bus);
    }

    src.start();
    return src;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Poll until the context factory returns a non-null value (max 5 s). */
function waitForContext(getter: () => AudioContext | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (getter()) { resolve(); return; }
      if (Date.now() - start > 5000) { reject(new Error('AudioManager: context never initialised')); return; }
      setTimeout(check, 50);
    };
    check();
  });
}
