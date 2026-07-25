import { describe, expect, it } from 'vitest';
import { WebGLRenderer, WebGLUnavailableError } from '../../webgl-next/src/renderer/WebGLRenderer';
import {
  pickingFragmentShader,
  shadowCompositeFragmentShader,
  shadowMaskFragmentShader,
  vertexShader,
  visualFragmentShader,
} from '../../webgl-next/src/renderer/shaders';

describe('WebGL Next renderer contract', () => {
  it('fails explicitly when WebGL2 is unavailable so callers can fall back', () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() => new WebGLRenderer(canvas)).toThrow(WebGLUnavailableError);
  });

  it('keeps visual and picking passes on the same vertex transform', () => {
    expect(vertexShader).toContain('uCameraIso');
    expect(vertexShader).toContain('uRotation');
    expect(visualFragmentShader).toContain('uOmniPosition[8]');
    expect(visualFragmentShader).toContain('uDirectionalDirection[4]');
    expect(shadowMaskFragmentShader).toContain('vColor.rgb + vec3(1.0 - vColor.a)');
    expect(shadowCompositeFragmentShader).toContain('uShadowMask');
    expect(pickingFragmentShader).toContain('vPick');
  });
});
