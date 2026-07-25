export const vertexShader = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aSample;
layout(location = 2) in vec4 aColor;
layout(location = 3) in vec2 aNormal;
layout(location = 4) in float aLit;
layout(location = 5) in vec3 aPick;

uniform vec2 uViewport;
uniform vec2 uOrigin;
uniform vec2 uCameraIso;
uniform float uZoom;
uniform float uElevation;
uniform float uRotation;
uniform float uAspect;

out vec2 vSample;
out vec4 vColor;
out vec2 vNormal;
out float vLit;
out vec3 vPick;

void main() {
  vec2 p = aPosition - uCameraIso;
  p.y *= uElevation / 0.5;
  float c = cos(uRotation);
  float s = sin(uRotation);
  p = vec2(c * p.x + s * uAspect * p.y, -s * p.x / uAspect + c * p.y);
  vec2 screen = uOrigin + p * uZoom;
  vec2 clip = vec2(screen.x / uViewport.x * 2.0 - 1.0, 1.0 - screen.y / uViewport.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  vSample = aSample;
  vColor = aColor;
  vNormal = aNormal;
  vLit = aLit;
  vPick = aPick;
}
`;

export const visualFragmentShader = `#version 300 es
precision highp float;

in vec2 vSample;
in vec4 vColor;
in vec2 vNormal;
in float vLit;

uniform vec3 uAmbientColor;
uniform float uAmbientIntensity;
uniform int uOmniCount;
uniform vec2 uOmniPosition[8];
uniform vec3 uOmniColor[8];
uniform vec4 uOmniParams[8];
uniform int uDirectionalCount;
uniform vec2 uDirectionalDirection[4];
uniform vec3 uDirectionalColor[4];
uniform float uDirectionalIntensity[4];

out vec4 outColor;

void main() {
  vec3 light = uAmbientColor * uAmbientIntensity;
  vec2 normal = normalize(vNormal);

  for (int i = 0; i < 4; i++) {
    if (i >= uDirectionalCount) break;
    float facing = max(dot(normal, normalize(uDirectionalDirection[i])), 0.0);
    if (normal.y < -0.9) facing = max(facing, 0.55);
    light += uDirectionalColor[i] * uDirectionalIntensity[i] * facing;
  }

  for (int i = 0; i < 8; i++) {
    if (i >= uOmniCount) break;
    float globalLight = uOmniParams[i].y;
    float attenuation = 1.0;
    if (globalLight < 0.5) {
      float radius = max(1.0, uOmniParams[i].x);
      attenuation = max(0.0, 1.0 - distance(vSample, uOmniPosition[i]) / radius);
      if (uOmniParams[i].z > 0.5) attenuation *= attenuation;
    }
    light += uOmniColor[i] * uOmniParams[i].w * attenuation;
  }

  vec3 litColor = vColor.rgb * clamp(light, vec3(0.0), vec3(1.45));
  vec3 color = mix(vColor.rgb, litColor, clamp(vLit, 0.0, 1.0));
  outColor = vec4(color, vColor.a);
}
`;

export const pickingFragmentShader = `#version 300 es
precision highp float;

in vec3 vPick;
out vec4 outColor;

void main() {
  outColor = vec4(vPick, 1.0);
}
`;
