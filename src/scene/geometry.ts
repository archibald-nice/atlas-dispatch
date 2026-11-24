// Deterministic geometry builders for the atlas scene.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Line,
  LineBasicMaterial,
  ShaderMaterial,
} from 'three';
import type { ThemeId } from '../domain';
import { themes } from '../domain';
import {
  dustFragmentShader,
  dustVertexShader,
  landFragmentShader,
  landVertexShader,
  starFragmentShader,
  starVertexShader,
} from './shaders';

export const TAU = Math.PI * 2;

export const THEME_ORDER: readonly ThemeId[] = ['earth', 'economy', 'ai', 'space'];

export const THEME_CLUSTERS: Record<ThemeId, readonly [number, number, number]> = {
  earth: [-0.48, 0.38, 0.10],
  economy: [0.48, 0.38, -0.08],
  ai: [-0.48, -0.38, -0.06],
  space: [0.48, -0.38, 0.12],
};

export const THEME_LABEL_Y = 0.46;
export const THEME_EXTENT_X = 1;
export const THEME_EXTENT_Y = 0.78;

export const ORBIT_RADIUS = 1.32;
export const ORBIT_Z = 0;
export const GLOBAL_ORBIT_ANGLE = 2.72;
export const DEFAULT_TILT_X = -0.16;
export const DEFAULT_YAW_Y = -2.75;

const LAND_COLOR = new Color('#efe5d2');
const DUST_COLOR = new Color('#6f9b96');
const ORBIT_COLOR = '#587f77';
const STAR_WARM = new Color('#e6dbc3');
const STAR_COOL = new Color('#a9c8cd');

const themeColorCache = new Map<ThemeId, Color>();
function themeColor(id: ThemeId): Color {
  let color = themeColorCache.get(id);
  if (!color) {
    color = new Color(themes[id].color);
    themeColorCache.set(id, color);
  }
  return color;
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function stableUnit(value: string, salt: number): number {
  let x = (hashString(value) + Math.imul(salt, 0x9e3779b1)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export function pseudoRandom(index: number): number {
  let x = (index + 0x6d2b79f5) >>> 0;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

export function clusterScaleForAspect(aspect: number): number {
  if (aspect < 0.9) return 0.84;
  if (aspect < 1.25) return 0.92;
  return 1;
}

export function latLonToVector(lat: number, lon: number): [number, number, number] {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  return [cosPhi * Math.cos(lambda), Math.sin(phi), -cosPhi * Math.sin(lambda)];
}

export function themeAnchor(
  theme: ThemeId,
  key: string,
  scale: number,
): [number, number, number] {
  const center = THEME_CLUSTERS[theme];
  const angle = stableUnit(key, 3) * TAU + stableUnit(key, 9) * 1.7;
  const radius = 0.08 + Math.sqrt(stableUnit(key, 5)) * 0.25;
  return [
    (center[0] + Math.cos(angle) * radius + (stableUnit(key, 7) - 0.5) * 0.05) * scale,
    (center[1] + Math.sin(angle) * radius * 0.74 + (stableUnit(key, 11) - 0.5) * 0.16) * scale,
    (center[2] + (stableUnit(key, 13) - 0.5) * 0.3 + Math.sin(angle * 2) * 0.03) * scale,
  ];
}

export function eventSeed(key: string): number {
  return stableUnit(key, 17);
}

export function globalOrbitPoint(angle: number): [number, number, number] {
  return [Math.cos(angle) * ORBIT_RADIUS, Math.sin(angle) * ORBIT_RADIUS, ORBIT_Z];
}

interface LandBuffers {
  positions: Float32Array;
  themePositions: Float32Array;
  colors: Float32Array;
  themeColors: Float32Array;
  seeds: Float32Array;
  sizes: Float32Array;
  count: number;
}

function buildLandBuffers(points: readonly number[]): LandBuffers {
  const pairCount = Math.floor(points.length / 2);
  const positions = new Float32Array(pairCount * 3);
  const themePositions = new Float32Array(pairCount * 3);
  const colors = new Float32Array(pairCount * 3);
  const themeColors = new Float32Array(pairCount * 3);
  const seeds = new Float32Array(pairCount);
  const sizes = new Float32Array(pairCount);
  const palette = THEME_ORDER.map(id => themeColor(id));

  for (let i = 0; i < pairCount; i++) {
    const lat = points[i * 2];
    const lon = points[i * 2 + 1];
    const base = latLonToVector(lat, lon);
    const themeIndex = Math.min(3, Math.floor(pseudoRandom(i * 3 + 1) * 4));
    const themeId = THEME_ORDER[themeIndex];
    const center = THEME_CLUSTERS[themeId];
    const angle = pseudoRandom(i * 7 + 2) * TAU + pseudoRandom(i * 7 + 3) * 2.2;
    const radius = 0.055 + Math.sqrt(pseudoRandom(i * 7 + 4)) * 0.315;
    const height = (pseudoRandom(i * 7 + 5) - 0.5) * 0.17;
    const depth = (pseudoRandom(i * 7 + 6) - 0.5) * 0.29;

    const pi = i * 3;
    positions[pi] = base[0] * 1.0035;
    positions[pi + 1] = base[1] * 1.0035;
    positions[pi + 2] = base[2] * 1.0035;

    themePositions[pi] = center[0] + Math.cos(angle) * radius;
    themePositions[pi + 1] = center[1] + Math.sin(angle) * radius * 0.72 + height;
    themePositions[pi + 2] = center[2] + depth + Math.sin(angle * 2) * 0.025;

    const brightness = 0.66 + pseudoRandom(i * 11 + 1) * 0.34;
    colors[pi] = LAND_COLOR.r * brightness;
    colors[pi + 1] = LAND_COLOR.g * brightness;
    colors[pi + 2] = LAND_COLOR.b * brightness;

    const tint = 0.78 + pseudoRandom(i * 11 + 2) * 0.22;
    const paletteColor = palette[themeIndex];
    themeColors[pi] = paletteColor.r * tint;
    themeColors[pi + 1] = paletteColor.g * tint;
    themeColors[pi + 2] = paletteColor.b * tint;

    seeds[i] = pseudoRandom(i * 13 + 4);
    sizes[i] = 0.62 + pseudoRandom(i * 13 + 5) * 0.74;
  }

  return { positions, themePositions, colors, themeColors, seeds, sizes, count: pairCount };
}

export type LandMaterialUniforms = {
  uProgress: { value: number };
  uThemeScale: { value: number };
  uPixelRatio: { value: number };
  uCameraDistance: { value: number };
  uIntro: { value: number };
  uPointScale: { value: number };
};

export interface LandBuild {
  geometry: BufferGeometry;
  uniforms: LandMaterialUniforms;
  material: ShaderMaterial;
}

export function buildLand(points: readonly number[]): LandBuild {
  const buffers = buildLandBuffers(points);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('aTheme', new BufferAttribute(buffers.themePositions, 3));
  geometry.setAttribute('aColor', new BufferAttribute(buffers.colors, 3));
  geometry.setAttribute('aThemeColor', new BufferAttribute(buffers.themeColors, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(buffers.seeds, 1));
  geometry.setAttribute('aSize', new BufferAttribute(buffers.sizes, 1));
  geometry.setDrawRange(0, buffers.count);

  const uniforms: LandMaterialUniforms = {
    uProgress: { value: 0 },
    uThemeScale: { value: 1 },
    uPixelRatio: { value: 1 },
    uCameraDistance: { value: 4.3 },
    uIntro: { value: 0 },
    uPointScale: { value: 1.7 },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: landVertexShader,
    fragmentShader: landFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
  });
  return { geometry, uniforms, material };
}

interface DustBuffers {
  positions: Float32Array;
  themePositions: Float32Array;
  colors: Float32Array;
  themeColors: Float32Array;
  seeds: Float32Array;
  sizes: Float32Array;
  count: number;
}

function buildDustBuffers(count: number): DustBuffers {
  const positions = new Float32Array(count * 3);
  const themePositions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const themeColors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const y = pseudoRandom(i * 5 + 1) * 2 - 1;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = pseudoRandom(i * 5 + 2) * TAU;
    const shell = 1.08 + pseudoRandom(i * 5 + 3) * 0.62;
    const pi = i * 3;
    positions[pi] = Math.cos(angle) * radial * shell;
    positions[pi + 1] = y * shell;
    positions[pi + 2] = Math.sin(angle) * radial * shell;

    const themeId = THEME_ORDER[Math.min(3, Math.floor(pseudoRandom(i * 7 + 20) * 4))];
    const center = THEME_CLUSTERS[themeId];
    const themeAngle = pseudoRandom(i * 7 + 21) * TAU;
    const themeRadius = 0.30 + pseudoRandom(i * 7 + 22) * 0.62;
    themePositions[pi] = center[0] + Math.cos(themeAngle) * themeRadius;
    themePositions[pi + 1] = center[1] + Math.sin(themeAngle) * themeRadius * 0.68;
    themePositions[pi + 2] = center[2] + (pseudoRandom(i * 7 + 23) - 0.5) * 0.62;

    const brightness = 0.55 + pseudoRandom(i * 11 + 20) * 0.45;
    colors[pi] = DUST_COLOR.r * brightness;
    colors[pi + 1] = DUST_COLOR.g * brightness;
    colors[pi + 2] = DUST_COLOR.b * brightness;

    const tint = 0.72 + pseudoRandom(i * 11 + 21) * 0.28;
    const paletteColor = themeColor(themeId);
    themeColors[pi] = paletteColor.r * tint;
    themeColors[pi + 1] = paletteColor.g * tint;
    themeColors[pi + 2] = paletteColor.b * tint;

    seeds[i] = pseudoRandom(i * 13 + 20);
    sizes[i] = 0.7 + pseudoRandom(i * 13 + 21) * 1.5;
  }
  return { positions, themePositions, colors, themeColors, seeds, sizes, count };
}

export interface DustBuild {
  geometry: BufferGeometry;
  material: ShaderMaterial;
  uniforms: LandMaterialUniforms;
}

export function buildDust(count = 1800): DustBuild {
  const buffers = buildDustBuffers(count);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('aTheme', new BufferAttribute(buffers.themePositions, 3));
  geometry.setAttribute('aColor', new BufferAttribute(buffers.colors, 3));
  geometry.setAttribute('aThemeColor', new BufferAttribute(buffers.themeColors, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(buffers.seeds, 1));
  geometry.setAttribute('aSize', new BufferAttribute(buffers.sizes, 1));
  const uniforms: LandMaterialUniforms = {
    uProgress: { value: 0 },
    uThemeScale: { value: 1 },
    uPixelRatio: { value: 1 },
    uCameraDistance: { value: 4.3 },
    uIntro: { value: 0 },
    uPointScale: { value: 1.0 },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: dustVertexShader,
    fragmentShader: dustFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
  });
  return { geometry, material, uniforms };
}

export interface StarBuild {
  geometry: BufferGeometry;
  material: ShaderMaterial;
}

export function buildStars(count = 520): StarBuild {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const y = pseudoRandom(i * 4 + 1) * 2 - 1;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = pseudoRandom(i * 4 + 2) * TAU;
    const radius = 22 + pseudoRandom(i * 4 + 3) * 11;
    const pi = i * 3;
    positions[pi] = Math.cos(angle) * radial * radius;
    positions[pi + 1] = y * radius;
    positions[pi + 2] = Math.sin(angle) * radial * radius;

    const warm = pseudoRandom(i * 6 + 3);
    const mixed = warm > 0.62 ? STAR_WARM : STAR_COOL;
    const brightness = 0.26 + Math.pow(pseudoRandom(i * 6 + 4), 2.2) * 0.74;
    colors[pi] = mixed.r * brightness;
    colors[pi + 1] = mixed.g * brightness;
    colors[pi + 2] = mixed.b * brightness;
    sizes[i] = 0.55 + Math.pow(pseudoRandom(i * 6 + 5), 1.8) * 2.1;
    seeds[i] = pseudoRandom(i * 6 + 6);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  const material = new ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uIntro: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  });
  return { geometry, material };
}

export interface OrbitBuild {
  line: Line;
  material: LineBasicMaterial;
}

export function buildOrbit(): OrbitBuild {
  const segments = 220;
  const positions = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * TAU;
    const pi = i * 3;
    positions[pi] = Math.cos(angle) * ORBIT_RADIUS;
    positions[pi + 1] = Math.sin(angle) * ORBIT_RADIUS;
    positions[pi + 2] = ORBIT_Z + Math.sin(angle * 2) * 0.025;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const material = new LineBasicMaterial({
    color: ORBIT_COLOR,
    transparent: true,
    opacity: 0.20,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const line = new Line(geometry, material);
  line.frustumCulled = false;
  line.renderOrder = 1;
  return { line, material };
}

export function disposeNode(node: unknown): void {
  if (!node || typeof node !== 'object') return;
  const candidate = node as {
    geometry?: { dispose?: () => void };
    material?: { dispose?: () => void } | { dispose?: () => void }[];
    children?: unknown[];
  };
  candidate.geometry?.dispose?.();
  const material = candidate.material;
  if (Array.isArray(material)) {
    material.forEach(item => item.dispose?.());
  } else {
    material?.dispose?.();
  }
  if (candidate.children) {
    for (const child of candidate.children) disposeNode(child);
  }
}