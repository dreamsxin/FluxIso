import { GLResourceRegistry } from '../device/GLResourceRegistry';

interface TextureRecord {
  texture: WebGLTexture | null;
  loading: boolean;
  failed: boolean;
}

/** Lazy URL-to-texture registry. CPU image loading survives normal render frames. */
export class TextureRegistry {
  readonly white: WebGLTexture;
  private readonly _records = new Map<string, TextureRecord>();

  constructor(
    private readonly _gl: WebGL2RenderingContext,
    private readonly _resources: GLResourceRegistry,
  ) {
    this.white = this._resources.texture();
    this._gl.bindTexture(this._gl.TEXTURE_2D, this.white);
    this._gl.texImage2D(
      this._gl.TEXTURE_2D,
      0,
      this._gl.RGBA,
      1,
      1,
      0,
      this._gl.RGBA,
      this._gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]),
    );
    this._configureTexture();
    this._gl.bindTexture(this._gl.TEXTURE_2D, null);
  }

  resolve(url: string): WebGLTexture | null {
    let record = this._records.get(url);
    if (!record) {
      record = { texture: null, loading: true, failed: false };
      this._records.set(url, record);
      this._load(url, record);
    }
    return record.texture;
  }

  get size(): number {
    let count = 0;
    for (const record of this._records.values()) {
      if (record.texture) count++;
    }
    return count;
  }

  private _load(url: string, record: TextureRecord): void {
    const image = new Image();
    if (!url.startsWith('data:') && !url.startsWith('blob:')) image.crossOrigin = 'anonymous';
    image.onload = () => {
      const texture = this._resources.texture();
      const gl = this._gl;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      this._configureTexture();
      gl.bindTexture(gl.TEXTURE_2D, null);
      record.texture = texture;
      record.loading = false;
    };
    image.onerror = () => {
      record.loading = false;
      record.failed = true;
    };
    image.src = url;
  }

  private _configureTexture(): void {
    const gl = this._gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
}
