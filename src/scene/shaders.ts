// Shader sources for the atlas scene. All shaders are authored for this project.

export const landVertexShader = /* glsl */ `
uniform float uProgress;
uniform float uThemeScale;
uniform float uPixelRatio;
uniform float uCameraDistance;
uniform float uIntro;
uniform float uPointScale;

attribute vec3 aTheme;
attribute vec3 aColor;
attribute vec3 aThemeColor;
attribute float aSeed;
attribute float aSize;

varying vec3 vColor;
varying float vAlpha;

const float PI = 3.14159265359;

void main() {
  float stagger = 0.38;
  float local = clamp((uProgress - aSeed * stagger) / (1.0 - stagger), 0.0, 1.0);
  float eased = local * local * (3.0 - 2.0 * local);
  vec3 target = aTheme * uThemeScale;
  vec3 p = mix(position, target, eased);

  float envelope = sin(eased * PI);
  p += envelope * 0.04 * vec3(
    sin(aSeed * 41.0 + eased * 6.2831),
    cos(aSeed * 29.0 - eased * 5.1),
    sin(aSeed * 53.0 + eased * 4.2)
  );

  vec4 worldPosition = modelMatrix * vec4(p, 1.0);
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 viewDirection = normalize(cameraPosition - worldPosition.xyz);
  vec3 sphereNormal = normalize(worldPosition.xyz - modelMatrix[3].xyz);
  float facing = dot(sphereNormal, viewDirection);
  float backside = mix(smoothstep(-0.02, 0.14, facing), 1.0, smoothstep(0.30, 0.70, uProgress));

  float size = uPointScale * aSize * (uCameraDistance / max(0.6, -mvPosition.z)) * uPixelRatio;
  gl_PointSize = clamp(size, 1.0, 7.5 * uPixelRatio);

  float globeAlpha = 0.40 + 0.60 * smoothstep(-0.08, 0.34, facing);
  float themeAlpha = 0.88;
  vAlpha = mix(globeAlpha, themeAlpha, smoothstep(0.16, 0.62, uProgress)) * backside * uIntro;
  vColor = mix(aColor, aThemeColor, smoothstep(0.0, 0.85, eased));
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const landFragmentShader = /* glsl */ `
precision highp float;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(uv, uv);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 5.4);
  float halo = exp(-r2 * 1.7);
  float alpha = vAlpha * (core * 0.62 + halo * 0.12);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(vColor * (0.74 + core * 0.42), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const dustVertexShader = /* glsl */ `
uniform float uProgress;
uniform float uThemeScale;
uniform float uPixelRatio;
uniform float uCameraDistance;
uniform float uIntro;
uniform float uPointScale;

attribute vec3 aTheme;
attribute vec3 aColor;
attribute vec3 aThemeColor;
attribute float aSeed;
attribute float aSize;

varying vec3 vColor;
varying float vAlpha;

const float PI = 3.14159265359;

void main() {
  float stagger = 0.52;
  float local = clamp((uProgress - aSeed * stagger) / (1.0 - stagger), 0.0, 1.0);
  float eased = local * local * (3.0 - 2.0 * local);
  vec3 target = aTheme * uThemeScale;
  vec3 p = mix(position, target, eased);

  float envelope = sin(eased * PI);
  p += envelope * 0.13 * vec3(
    sin(aSeed * 61.0 + eased * 7.1),
    cos(aSeed * 43.0 - eased * 4.7),
    sin(aSeed * 79.0 + eased * 5.3)
  );

  vec4 worldPosition = modelMatrix * vec4(p, 1.0);
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 viewDirection = normalize(cameraPosition - worldPosition.xyz);
  vec3 sphereNormal = normalize(worldPosition.xyz - modelMatrix[3].xyz);
  float facing = dot(sphereNormal, viewDirection);
  float backside = mix(smoothstep(-0.05, 0.20, facing), 1.0, smoothstep(0.25, 0.65, uProgress));

  float size = uPointScale * aSize * (uCameraDistance / max(0.8, -mvPosition.z)) * uPixelRatio;
  gl_PointSize = clamp(size, 0.8, 4.2 * uPixelRatio);

  vAlpha = (0.22 + 0.18 * smoothstep(-0.1, 0.45, facing)) * backside * uIntro;
  vColor = mix(aColor, aThemeColor, smoothstep(0.0, 0.8, eased));
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const dustFragmentShader = /* glsl */ `
precision highp float;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(uv, uv);
  if (r2 > 1.0) discard;
  float alpha = vAlpha * exp(-r2 * 2.7);
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(vColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const eventVertexShader = /* glsl */ `
uniform float uProgress;
uniform float uThemeScale;
uniform float uPixelRatio;
uniform float uCameraDistance;
uniform float uIntro;

attribute vec3 aTheme;
attribute vec3 aColor;
attribute float aSeed;
attribute float aSize;
attribute float aCull;

varying vec3 vColor;
varying float vAlpha;

const float PI = 3.14159265359;

void main() {
  float stagger = 0.34;
  float local = clamp((uProgress - aSeed * stagger) / (1.0 - stagger), 0.0, 1.0);
  float eased = local * local * (3.0 - 2.0 * local);
  vec3 target = aTheme * uThemeScale;
  vec3 p = mix(position, target, eased);

  float envelope = sin(eased * PI);
  p += envelope * 0.05 * vec3(
    sin(aSeed * 47.0 + eased * 5.7),
    cos(aSeed * 37.0 - eased * 4.3),
    sin(aSeed * 67.0 + eased * 6.1)
  );

  vec4 worldPosition = modelMatrix * vec4(p, 1.0);
  if (aCull < 0.5) {
    worldPosition = vec4(mix(p, worldPosition.xyz, eased), 1.0);
  }
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 viewDirection = normalize(cameraPosition - worldPosition.xyz);
  vec3 sphereNormal = normalize(worldPosition.xyz - modelMatrix[3].xyz);
  float facing = dot(sphereNormal, viewDirection);
  float placeBackside = mix(smoothstep(-0.03, 0.12, facing), 1.0, smoothstep(0.25, 0.62, uProgress));
  float presence = mix(smoothstep(0.25, 0.68, uProgress), placeBackside, aCull);

  float size = aSize * (uCameraDistance / max(0.6, -mvPosition.z)) * uPixelRatio;
  gl_PointSize = clamp(size, 2.0, 13.0 * uPixelRatio);
  vAlpha = presence * uIntro;
  vColor = aColor;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const eventFragmentShader = /* glsl */ `
precision highp float;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(uv, uv);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 5.0);
  float halo = exp(-r2 * 1.5);
  float alpha = vAlpha * (core * 0.82 + halo * 0.24);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(vColor * (0.9 + core * 0.5), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const starVertexShader = /* glsl */ `
uniform float uPixelRatio;
uniform float uIntro;
uniform float uTime;

attribute vec3 aColor;
attribute float aSeed;
attribute float aSize;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * uPixelRatio;
  float shimmer = 0.76 + 0.24 * sin(uTime * 0.33 + aSeed * 27.0);
  vAlpha = uIntro * shimmer;
  vColor = aColor;
}
`;

export const starFragmentShader = /* glsl */ `
precision highp float;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(uv, uv);
  if (r2 > 1.0) discard;
  float alpha = vAlpha * exp(-r2 * 3.6) * 0.72;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(vColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const backgroundVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.999, 1.0);
}
`;

export const backgroundFragmentShader = /* glsl */ `
precision highp float;

uniform vec3 uDeep;
uniform vec3 uGlow;
uniform vec3 uHorizon;
uniform vec2 uCenter;
uniform float uAspect;
uniform float uIntro;

varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 p = vec2((vUv.x - uCenter.x) * uAspect, vUv.y - uCenter.y);
  float radius = length(p);
  vec3 color = mix(uGlow, uDeep, smoothstep(0.02, 0.78, radius));
  float halo = exp(-radius * radius * 6.4);
  color += uHorizon * halo * 0.55;
  color *= 1.0 - 0.30 * smoothstep(0.28, 0.95, radius);

  vec2 edge = abs(vUv - 0.5) * 2.0;
  float corner = smoothstep(0.48, 1.0, max(edge.x, edge.y));
  color *= 1.0 - corner * 0.20;

  float grain = (hash21(gl_FragCoord.xy) - 0.5) * 0.005;
  color += grain;
  color *= uIntro;
  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const sphereVertexShader = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const sphereFragmentShader = /* glsl */ `
precision highp float;

uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uRim;
uniform float uOpacity;

varying vec3 vNormal;
varying vec3 vView;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 view = normalize(vView);
  float facing = clamp(dot(normal, view), 0.0, 1.0);
  float limb = pow(1.0 - facing, 2.8);
  float lift = smoothstep(-0.45, 0.95, normal.y);
  vec3 color = mix(uDeep, uMid, smoothstep(0.05, 0.92, facing) * (0.72 + lift * 0.28));
  color += uRim * limb * 0.34;
  gl_FragColor = vec4(color, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const atmosphereVertexShader = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const atmosphereFragmentShader = /* glsl */ `
precision highp float;

uniform vec3 uColor;
uniform float uOpacity;

varying vec3 vNormal;
varying vec3 vView;

void main() {
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  float rim = pow(1.0 - facing, 4.0);
  float alpha = rim * uOpacity * 0.19;
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(uColor * (0.55 + rim * 0.65), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const finishVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const finishFragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;

varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 centered = vUv - 0.5;
  float radius = dot(centered, centered);
  vec2 aberration = centered * radius * 0.0018;

  vec3 color;
  color.r = texture2D(tDiffuse, vUv + aberration).r;
  color.g = texture2D(tDiffuse, vUv).g;
  color.b = texture2D(tDiffuse, vUv - aberration).b;

  float vignette = smoothstep(0.95, 0.18, radius * 1.65);
  color *= mix(0.72, 1.0, vignette);

  float grain = hash21(vUv * uResolution + fract(uTime) * 91.7) - 0.5;
  color += grain * 0.012;

  gl_FragColor = vec4(color, 1.0);
}
`;