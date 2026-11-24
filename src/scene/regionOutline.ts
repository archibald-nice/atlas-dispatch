// Country anchor outline: a lifted great-circle ribbon that hugs the globe.
// Coordinates arrive as flat [lon, lat, lon, lat, ...] rings from the shared
// country-boundaries asset. No map projection or picking is involved here.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three';
import { latLonToVector } from './geometry';
import type { AnchorRegion } from '../regions';

export interface RegionOutline {
  readonly root: Group;
  readonly material: ShaderMaterial;
  readonly ringCount: number;
  readonly segmentCount: number;
}

const OUTLINE_LIFT = 0.0042;
const OUTLINE_HALF_WIDTH = 0.0032;
const MAX_ARC_STEP = 0.018;
const SEAM_EPSILON = 1e-6;
const OUTLINE_COLOR = '#e6bc8a';

const outlineVertexShader = /* glsl */ `
attribute float aEdge;
varying float vEdge;
varying float vFacing;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vec3 sphereNormal = normalize(worldPosition.xyz - modelMatrix[3].xyz);
  vFacing = dot(sphereNormal, normalize(cameraPosition - worldPosition.xyz));
  vEdge = aEdge;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const outlineFragmentShader = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
varying float vEdge;
varying float vFacing;

void main() {
  float front = smoothstep(-0.04, 0.16, vFacing);
  // Perspective interpolation can overshoot the ribbon's [-1, 1] edges.
  // A negative base in pow() can seed NaNs that bloom spreads across the frame.
  float edge = clamp(1.0 - abs(vEdge), 0.0, 1.0);
  float core = smoothstep(0.56, 0.92, edge);
  float halo = pow(edge, 2.6);
  float alpha = (halo * 0.26 + core * 0.92) * front * uOpacity;
  if (!(alpha >= 0.004)) discard;
  gl_FragColor = vec4(uColor * (0.82 + core * 0.36), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface RingPoint {
  lon: number;
  lat: number;
  x: number;
  y: number;
  z: number;
}

interface OutlineStats {
  ringCount: number;
  segmentCount: number;
}

// Scratch vectors reused for the one-time geometry build.
const segmentFrom = new Vector3();
const segmentTo = new Vector3();
const tangentFrom = new Vector3();
const tangentTo = new Vector3();
const sideFrom = new Vector3();
const sideTo = new Vector3();
const arcCurrent = new Vector3();
const arcPrevious = new Vector3();

function readRing(flat: readonly number[]): RingPoint[] {
  const points: RingPoint[] = [];
  if (!Array.isArray(flat)) return points;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const lon = flat[i];
    const lat = flat[i + 1];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const clampedLat = lat < -90 ? -90 : lat > 90 ? 90 : lat;
    const point = latLonToVector(clampedLat, lon);
    points.push({ lon, lat: clampedLat, x: point[0], y: point[1], z: point[2] });
  }
  return points;
}

// GeoJSON polygons clipped at the antimeridian carry an artificial edge whose
// endpoints both sit on ±180°. Those edges are not borders.
function isSeamCut(a: RingPoint, b: RingPoint): boolean {
  return Math.abs(Math.abs(a.lon) - 180) <= SEAM_EPSILON
    && Math.abs(Math.abs(b.lon) - 180) <= SEAM_EPSILON;
}

function sameRingPoint(a: RingPoint, b: RingPoint): boolean {
  return Math.abs(a.lon - b.lon) < 1e-9 && Math.abs(a.lat - b.lat) < 1e-9;
}

function slerpUnit(a: Vector3, b: Vector3, angle: number, t: number, target: Vector3): Vector3 {
  const sinAngle = Math.sin(angle);
  if (sinAngle < 1e-7) {
    target.copy(a).lerp(b, t);
    return target.normalize();
  }
  const wa = Math.sin((1 - t) * angle) / sinAngle;
  const wb = Math.sin(t * angle) / sinAngle;
  target.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb);
  return target.normalize();
}

function appendQuad(a: Vector3, b: Vector3, radius: number, positions: number[], edges: number[]): void {
  const surface = radius * (1 + OUTLINE_LIFT);
  const half = radius * OUTLINE_HALF_WIDTH;
  tangentFrom.subVectors(b, a);
  tangentFrom.addScaledVector(a, -tangentFrom.dot(a));
  if (tangentFrom.lengthSq() < 1e-12) return;
  tangentFrom.normalize();
  tangentTo.subVectors(b, a);
  tangentTo.addScaledVector(b, -tangentTo.dot(b));
  if (tangentTo.lengthSq() < 1e-12) return;
  tangentTo.normalize();
  sideFrom.crossVectors(a, tangentFrom).normalize();
  sideTo.crossVectors(b, tangentTo).normalize();

  const ax = a.x * surface;
  const ay = a.y * surface;
  const az = a.z * surface;
  const bx = b.x * surface;
  const by = b.y * surface;
  const bz = b.z * surface;
  const axp = ax + sideFrom.x * half;
  const ayp = ay + sideFrom.y * half;
  const azp = az + sideFrom.z * half;
  const axm = ax - sideFrom.x * half;
  const aym = ay - sideFrom.y * half;
  const azm = az - sideFrom.z * half;
  const bxp = bx + sideTo.x * half;
  const byp = by + sideTo.y * half;
  const bzp = bz + sideTo.z * half;
  const bxm = bx - sideTo.x * half;
  const bym = by - sideTo.y * half;
  const bzm = bz - sideTo.z * half;

  positions.push(
    axp, ayp, azp, axm, aym, azm, bxp, byp, bzp,
    bxp, byp, bzp, axm, aym, azm, bxm, bym, bzm,
  );
  edges.push(1, -1, 1, 1, -1, -1);
}

// Straight lon/lat interpolation cuts through the globe and ignores the
// antimeridian; slerping on the unit sphere keeps the short path and lets the
// ribbon follow the surface on long edges.
function appendArc(a: Vector3, b: Vector3, radius: number, positions: number[], edges: number[], stats: OutlineStats): void {
  const dot = a.dot(b);
  const angle = Math.acos(dot < -1 ? -1 : dot > 1 ? 1 : dot);
  if (!Number.isFinite(angle) || angle < 1e-5) return;
  const steps = Math.max(1, Math.ceil(angle / MAX_ARC_STEP));
  if (steps === 1) {
    appendQuad(a, b, radius, positions, edges);
    stats.segmentCount++;
    return;
  }
  arcPrevious.copy(a);
  for (let step = 1; step <= steps; step++) {
    if (step === steps) arcCurrent.copy(b);
    else slerpUnit(a, b, angle, step / steps, arcCurrent);
    appendQuad(arcPrevious, arcCurrent, radius, positions, edges);
    stats.segmentCount++;
    arcPrevious.copy(arcCurrent);
  }
}

function appendRing(flat: readonly number[], radius: number, positions: number[], edges: number[], stats: OutlineStats): void {
  const points = readRing(flat);
  if (points.length < 2) return;
  const closed = sameRingPoint(points[0], points[points.length - 1]);
  const edgeCount = closed ? points.length - 1 : points.length;
  if (edgeCount < 1) return;
  const before = stats.segmentCount;
  for (let index = 0; index < edgeCount; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    if (sameRingPoint(a, b) || isSeamCut(a, b)) continue;
    segmentFrom.set(a.x, a.y, a.z);
    segmentTo.set(b.x, b.y, b.z);
    appendArc(segmentFrom, segmentTo, radius, positions, edges, stats);
  }
  if (stats.segmentCount > before) stats.ringCount++;
}

export function buildRegionOutline(region: AnchorRegion, radius: number): RegionOutline | null {
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1;
  const positions: number[] = [];
  const edges: number[] = [];
  const stats: OutlineStats = { ringCount: 0, segmentCount: 0 };
  for (const polygon of region.polygons) {
    for (const ring of polygon) appendRing(ring, safeRadius, positions, edges, stats);
  }
  if (positions.length < 18 || stats.segmentCount === 0) return null;

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aEdge', new BufferAttribute(new Float32Array(edges), 1));
  geometry.computeBoundingSphere();

  const material = new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(OUTLINE_COLOR) },
      uOpacity: { value: 0 },
    },
    vertexShader: outlineVertexShader,
    fragmentShader: outlineFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
  });

  const mesh = new Mesh(geometry, material);
  mesh.name = 'anchor-outline-mesh';
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;

  const root = new Group();
  root.name = 'anchor-region';
  root.userData.regionId = region.id;
  root.add(mesh);
  return { root, material, ringCount: stats.ringCount, segmentCount: stats.segmentCount };
}

export function disposeRegionOutline(outline: RegionOutline | null): void {
  if (!outline) return;
  outline.root.removeFromParent();
  for (const child of [...outline.root.children]) {
    const mesh = child as Mesh<BufferGeometry, ShaderMaterial>;
    mesh.geometry?.dispose();
    outline.root.remove(child);
  }
  outline.root.clear();
  outline.material.dispose();
}