import type { AnchorRegion } from './regions';

export interface PackedRegionRecord {
  readonly id: string;
  readonly iso: string | null;
  readonly en: string;
  readonly zh: string;
  readonly aliases: readonly string[];
  readonly focus: readonly number[];
  readonly shapes: readonly (readonly number[])[];
  readonly data: string;
}

export interface PackedRegionsAsset {
  readonly packed: 1;
  readonly scale: number;
  readonly regions: readonly PackedRegionRecord[];
}

export interface PackedLandPointsAsset {
  readonly packed: 1;
  readonly scale: number;
  readonly count: number;
  readonly data: string;
}

/**
 * Encodes signed 32-bit integers using ZigZag + unsigned LEB128 varints as Base64.
 */
export function encodeDeltaVarint(ints: readonly number[]): string {
  const bytes: number[] = [];
  for (let i = 0; i < ints.length; i++) {
    const n = ints[i] | 0;
    let u = ((n << 1) ^ (n >> 31)) >>> 0;
    while (u >= 0x80) {
      bytes.push((u & 0x7f) | 0x80);
      u >>>= 7;
    }
    bytes.push(u);
  }
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x8000) {
    parts.push(String.fromCharCode(...bytes.slice(i, i + 0x8000)));
  }
  return btoa(parts.join(''));
}

/**
 * Decodes `count` signed 32-bit integers from a ZigZag + varint Base64 payload.
 */
export function decodeDeltaVarint(base64: string, count: number): Int32Array {
  const raw = atob(base64);
  const out = new Int32Array(count);
  let pos = 0;
  for (let i = 0; i < count; i++) {
    let u = 0;
    let shift = 0;
    for (;;) {
      if (pos >= raw.length) throw new Error('Invalid packed geo payload.');
      const b = raw.charCodeAt(pos++);
      u |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    out[i] = (u >>> 1) ^ -(u & 1);
  }
  return out;
}

/**
 * Decodes either a packed boundary asset or a raw Natural Earth region asset.
 */
export function decodeRegions(input: unknown): readonly AnchorRegion[] {
  const asset = input as Partial<PackedRegionsAsset> & { regions?: readonly AnchorRegion[] };
  if (asset?.packed !== 1) return asset.regions ?? [];
  const scale = asset.scale ?? 10000;
  return (asset.regions ?? []).map(region => {
    let total = 0;
    for (const polygon of region.shapes) {
      for (const pairs of polygon) total += pairs * 2;
    }
    const deltas = decodeDeltaVarint(region.data, total);
    const polygons: number[][][] = [];
    let offset = 0;
    for (const polygon of region.shapes) {
      const rings: number[][] = [];
      for (const pairs of polygon) {
        const ring = new Array<number>(pairs * 2);
        let lx = 0;
        let ly = 0;
        for (let i = 0; i < pairs * 2; i += 2) {
          lx += deltas[offset++];
          ly += deltas[offset++];
          ring[i] = lx / scale;
          ring[i + 1] = ly / scale;
        }
        rings.push(ring);
      }
      polygons.push(rings);
    }
    return {
      id: region.id,
      iso: region.iso,
      en: region.en,
      zh: region.zh,
      aliases: region.aliases,
      focus: region.focus,
      polygons,
    };
  });
}

/**
 * Decodes either a packed land-points asset or a raw coordinate array.
 */
export function decodeLandPoints(input: unknown): readonly number[] {
  if (Array.isArray(input)) return input as readonly number[];
  const asset = input as PackedLandPointsAsset;
  if (asset?.packed !== 1) return [];
  const scale = asset.scale ?? 100000;
  const deltas = decodeDeltaVarint(asset.data, asset.count);
  const out = new Array<number>(asset.count);
  let lx = 0;
  let ly = 0;
  for (let i = 0; i < asset.count; i += 2) {
    lx += deltas[i];
    ly += deltas[i + 1];
    out[i] = lx / scale;
    out[i + 1] = ly / scale;
  }
  return out;
}
