export class GLResourceRegistry {
  private readonly _buffers: WebGLBuffer[] = [];
  private readonly _vertexArrays: WebGLVertexArrayObject[] = [];
  private readonly _programs: WebGLProgram[] = [];
  private readonly _textures: WebGLTexture[] = [];
  private readonly _framebuffers: WebGLFramebuffer[] = [];

  constructor(private readonly _gl: WebGL2RenderingContext) {}

  buffer(): WebGLBuffer {
    const resource = this._gl.createBuffer();
    if (!resource) throw new Error('Unable to create WebGL buffer.');
    this._buffers.push(resource);
    return resource;
  }

  vertexArray(): WebGLVertexArrayObject {
    const resource = this._gl.createVertexArray();
    if (!resource) throw new Error('Unable to create WebGL vertex array.');
    this._vertexArrays.push(resource);
    return resource;
  }

  texture(): WebGLTexture {
    const resource = this._gl.createTexture();
    if (!resource) throw new Error('Unable to create WebGL texture.');
    this._textures.push(resource);
    return resource;
  }

  framebuffer(): WebGLFramebuffer {
    const resource = this._gl.createFramebuffer();
    if (!resource) throw new Error('Unable to create WebGL framebuffer.');
    this._framebuffers.push(resource);
    return resource;
  }

  program(vertexSource: string, fragmentSource: string): WebGLProgram {
    const vertex = this._shader(this._gl.VERTEX_SHADER, vertexSource);
    const fragment = this._shader(this._gl.FRAGMENT_SHADER, fragmentSource);
    const program = this._gl.createProgram();
    if (!program) throw new Error('Unable to create WebGL program.');
    this._gl.attachShader(program, vertex);
    this._gl.attachShader(program, fragment);
    this._gl.linkProgram(program);
    this._gl.deleteShader(vertex);
    this._gl.deleteShader(fragment);
    if (!this._gl.getProgramParameter(program, this._gl.LINK_STATUS)) {
      const log = this._gl.getProgramInfoLog(program) || 'Unknown shader link error.';
      this._gl.deleteProgram(program);
      throw new Error(log);
    }
    this._programs.push(program);
    return program;
  }

  dispose(): void {
    for (const resource of this._buffers) this._gl.deleteBuffer(resource);
    for (const resource of this._vertexArrays) this._gl.deleteVertexArray(resource);
    for (const resource of this._programs) this._gl.deleteProgram(resource);
    for (const resource of this._textures) this._gl.deleteTexture(resource);
    for (const resource of this._framebuffers) this._gl.deleteFramebuffer(resource);
    this._buffers.length = 0;
    this._vertexArrays.length = 0;
    this._programs.length = 0;
    this._textures.length = 0;
    this._framebuffers.length = 0;
  }

  private _shader(type: number, source: string): WebGLShader {
    const shader = this._gl.createShader(type);
    if (!shader) throw new Error('Unable to create WebGL shader.');
    this._gl.shaderSource(shader, source);
    this._gl.compileShader(shader);
    if (!this._gl.getShaderParameter(shader, this._gl.COMPILE_STATUS)) {
      const log = this._gl.getShaderInfoLog(shader) || 'Unknown shader compile error.';
      this._gl.deleteShader(shader);
      throw new Error(log);
    }
    return shader;
  }
}
