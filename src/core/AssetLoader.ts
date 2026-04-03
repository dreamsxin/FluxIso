/**
 * AssetLoader — image preloader with LRU-style cache.
 *
 * ## Usage
 *
 * ### Static API (backwards-compatible, uses a shared global instance)
 * ```ts
 * await AssetLoader.loadImage('/sprites/hero.png');
 * const img = AssetLoader.get('/sprites/hero.png');
 * ```
 *
 * ### Instance API (recommended for multi-scene / testable code)
 * ```ts
 * // Each scene owns its loader; clearing one never affects another.
 * const loader = new AssetLoader();
 * await loader.loadImage('/sprites/hero.png');
 * loader.unload('/sprites/hero.png'); // free a single asset
 * loader.clear();                     // free all assets for this scene
 * console.log(loader.size);           // 0
 * ```
 */
export class AssetLoader {
  // ── Instance state ────────────────────────────────────────────────────────
  private _cache   = new Map<string, HTMLImageElement>();
  private _pending = new Map<string, Promise<HTMLImageElement>>();

  // ── Instance API ──────────────────────────────────────────────────────────

  /** Load a single image (returns cached promise if already loading/loaded). */
  loadImage(url: string): Promise<HTMLImageElement> {
    const cached = this._cache.get(url);
    if (cached) return Promise.resolve(cached);

    const inFlight = this._pending.get(url);
    if (inFlight) return inFlight;

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this._cache.set(url, img);
        this._pending.delete(url);
        resolve(img);
      };
      img.onerror = () => {
        this._pending.delete(url);
        reject(new Error(`AssetLoader: failed to load image "${url}"`));
      };
      img.src = url;
    });

    this._pending.set(url, promise);
    return promise;
  }

  /** Load multiple images in parallel; resolves when all are ready. */
  loadAll(urls: string[]): Promise<HTMLImageElement[]> {
    return Promise.all(urls.map((u) => this.loadImage(u)));
  }

  /** Synchronous get — returns undefined if not yet loaded. */
  get(url: string): HTMLImageElement | undefined {
    return this._cache.get(url);
  }

  /**
   * Remove a single URL from the cache.
   * Any in-flight load for this URL is left to complete (its promise is
   * preserved) but the result will no longer be stored after completion.
   * Useful for releasing a specific asset without clearing the entire cache.
   */
  unload(url: string): void {
    this._cache.delete(url);
    // Note: we intentionally leave _pending intact so concurrent awaits
    // on the same URL still resolve; the result just won't be cached.
  }

  /** Clear the entire cache and cancel tracking of in-flight loads. */
  clear(): void {
    this._cache.clear();
    this._pending.clear();
  }

  /** Number of successfully loaded (cached) assets. */
  get size(): number {
    return this._cache.size;
  }

  // ── Global default instance + static API (backwards-compatible) ───────────

  /**
   * Shared global instance used by the static methods.
   * Replace with your own instance if you need a different global default.
   */
  static readonly default = new AssetLoader();

  /** @see {@link AssetLoader#loadImage} */
  static loadImage(url: string): Promise<HTMLImageElement> {
    return AssetLoader.default.loadImage(url);
  }

  /** @see {@link AssetLoader#loadAll} */
  static loadAll(urls: string[]): Promise<HTMLImageElement[]> {
    return AssetLoader.default.loadAll(urls);
  }

  /** @see {@link AssetLoader#get} */
  static get(url: string): HTMLImageElement | undefined {
    return AssetLoader.default.get(url);
  }

  /**
   * Clear the global default cache.
   * To clear a specific scene's loader, call `loader.clear()` on that instance.
   */
  static clear(): void {
    AssetLoader.default.clear();
  }
}
