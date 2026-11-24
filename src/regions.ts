import type { GeoReference, NewsEvent } from './domain.ts';
import type { Locale } from './i18n.ts';

export interface AnchorRegion {
  readonly id: string;
  readonly iso: string | null;
  readonly en: string;
  readonly zh: string;
  readonly aliases: readonly string[];
  readonly focus: readonly number[];
  // One exterior ring followed by its holes, for each antimeridian-split part.
  readonly polygons: readonly (readonly (readonly number[])[])[];
}

export function regionName(region: AnchorRegion, locale: Locale): string {
  return locale === 'zh-CN' ? region.zh : region.en;
}

const EDGE_EPSILON = 1e-9;
const SEAM_SAMPLE = 1e-7;

type RingPosition = 'inside' | 'outside' | 'edge';

function locateInRing(ring: readonly number[], x: number, y: number): RingPosition {
  let inside = false;
  for (let i = 2; i < ring.length; i += 2) {
    const ax = ring[i - 2];
    const ay = ring[i - 1];
    const bx = ring[i];
    const by = ring[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    if (y >= Math.min(ay, by) - EDGE_EPSILON && y <= Math.max(ay, by) + EDGE_EPSILON
      && x >= Math.min(ax, bx) - EDGE_EPSILON && x <= Math.max(ax, bx) + EDGE_EPSILON
      && Math.abs((x - ax) * dy - (y - ay) * dx) <= EDGE_EPSILON * Math.max(Math.abs(dx), Math.abs(dy))) return 'edge';
    if ((ay > y) !== (by > y) && x < ax + dx * (y - ay) / dy) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}

export function indexRegionLocations(events: readonly NewsEvent[], region: AnchorRegion): Map<string, GeoReference[]> {
  const parts = region.polygons.map(([exterior, ...holes]) => {
    let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
    for (let i = 0; i < exterior.length; i += 2) {
      west = Math.min(west, exterior[i]);
      east = Math.max(east, exterior[i]);
      south = Math.min(south, exterior[i + 1]);
      north = Math.max(north, exterior[i + 1]);
    }
    return { exterior, holes, west, east, south, north };
  });
  const inside = (lon: number, lat: number) => parts.some(({ exterior, holes, west, east, south, north }) =>
    lon > west && lon < east && lat > south && lat < north
    && locateInRing(exterior, lon, lat) === 'inside'
    && holes.every(hole => locateInRing(hole, lon, lat) === 'outside'));
  const matches = new Map<string, GeoReference[]>();
  for (const event of events) {
    let locations: GeoReference[] | undefined;
    for (const location of event.locations) {
      // A representative country-level pin is not evidence for a spatial join.
      if (location.precision === 'country' || !location.evidence.trim()) continue;
      const { lon, lat } = location;
      // Treat the file's cut as interior only if land continues on both sides.
      const contained = Math.abs(lon) === 180
        ? inside(180 - SEAM_SAMPLE, lat) && inside(-180 + SEAM_SAMPLE, lat)
        : inside(lon, lat);
      if (contained) (locations ??= []).push(location);
    }
    if (locations) matches.set(event.id, locations);
  }
  return matches;
}
