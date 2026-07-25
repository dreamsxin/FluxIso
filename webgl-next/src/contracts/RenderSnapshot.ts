export const RENDER_VERTEX_FLOATS = 17;
export const MAX_OMNI_LIGHTS = 8;

export interface RenderRange {
  first: number;
  count: number;
}

export interface RenderGeometry {
  data: Float32Array;
  vertexCount: number;
  floor: RenderRange;
  shadows: RenderRange;
  opaque: RenderRange;
  transparent: RenderRange;
  debug: RenderRange;
  segments: RenderDrawSegment[];
}

export type RenderBlendMode = 'alpha' | 'add' | 'multiply';

export interface RenderDrawSegment extends RenderRange {
  blend: RenderBlendMode;
  textureUrl?: string;
}

export interface RenderCamera {
  worldX: number;
  worldY: number;
  zoom: number;
  rotation: number;
  elevation: number;
  originX: number;
  originY: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface RenderEnvironment {
  clearColor: readonly [number, number, number];
  ambientColor: readonly [number, number, number];
  ambientIntensity: number;
}

export interface RenderOmniLight {
  x: number;
  y: number;
  radius: number;
  color: readonly [number, number, number];
  intensity: number;
  global: boolean;
  quadratic: boolean;
}

export interface RenderDirectionalLight {
  x: number;
  y: number;
  color: readonly [number, number, number];
  intensity: number;
}

export interface UnsupportedRenderObject {
  id: string;
  type: string;
  reason: string;
}

export interface RenderTextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  alpha: number;
  fontSize: number;
}

export interface RenderMinimapItem {
  id: string;
  x: number;
  y: number;
  character: boolean;
}

export interface RenderMinimapSource {
  cols: number;
  rows: number;
  walkable: Uint8Array;
  items: RenderMinimapItem[];
}

export interface RenderSnapshot {
  frame: number;
  tileW: number;
  tileH: number;
  camera: RenderCamera;
  environment: RenderEnvironment;
  geometry: RenderGeometry;
  omniLights: RenderOmniLight[];
  directionalLights: RenderDirectionalLight[];
  textOverlays: RenderTextOverlay[];
  minimap: RenderMinimapSource;
  pickLookup: ReadonlyMap<number, string>;
  unsupported: UnsupportedRenderObject[];
}
