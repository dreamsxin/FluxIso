/**
 * Lightweight asset preloader.
 * Caches HTMLImageElement by URL; returns cached instance on repeated calls.
 */
export class AssetLoader {
  private static cache = new Map<string, HTMLImageElement>();
  private static pending = new Map<string, Promise<HTMLImageElement>>();

  /** Load a single image (returns cached promise if already loading/loaded). */
  static loadImage(url: string): Promise<HTMLImageElement> {
    const cached = this.cache.get(url);
    if (cached) return Promise.resolve(cached);

    const inFlight = this.pending.get(url);
    if (inFlight) return inFlight;

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.cache.set(url, img);
        this.pending.delete(url);
        resolve(img);
      };
      img.onerror = () => {
        this.pending.delete(url);
        reject(new Error(`AssetLoader: failed to load image "${url}"`));
      };
      img.src = url;
    });

    this.pending.set(url, promise);
    return promise;
  }

  /** Load multiple images in parallel; resolves when all are ready. */
  static loadAll(urls: string[]): Promise<HTMLImageElement[]> {
    return Promise.all(urls.map((u) => this.loadImage(u)));
  }

  /** Synchronous get — returns undefined if not yet loaded. */
  static get(url: string): HTMLImageElement | undefined {
    return this.cache.get(url);
  }

  /** Clear the entire cache (e.g. on scene change). */
  static clear(): void {
    this.cache.clear();
    this.pending.clear();
  }
}
