import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Pinned source. The hash is checked for local inputs too, so stdout can only
// contain geometry derived from this exact Natural Earth revision.
const SOURCE = {
  name: 'Natural Earth 1:50m Admin 0 Countries',
  url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/f1890d9f152c896d250a77557a5751a93d494776/geojson/ne_50m_admin_0_countries.geojson',
  repository: 'https://github.com/nvkelso/natural-earth-vector',
  commit: 'f1890d9f152c896d250a77557a5751a93d494776',
  sha256: '3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb',
  license: 'Public domain',
  licenseUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
  boundaryPolicy: 'Admin 0 boundaries follow de facto control and include disputed areas; this asset is not a sovereignty judgment.',
  boundaryPolicyUrl: 'https://www.naturalearthdata.com/about/disputed-boundaries-policy/',
};
const EXPECTED_FEATURE_COUNT = 242;
const OUTPUT_DECIMALS = 4;
const OUTPUT_SCALE = 10 ** OUTPUT_DECIMALS;
const DOWNLOAD_TIMEOUT_MS = 45_000;
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const REQUIRED_REGION_IDS = ['MCO', 'SGP', 'VAT'];

function roundCoordinate(value) {
  const rounded = Math.round(value * OUTPUT_SCALE) / OUTPUT_SCALE;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function requiredText(properties, key, label) {
  const value = properties[key];
  if (typeof value !== 'string') throw new Error(`${label}: ${key} is not a string.`);
  const text = value.trim();
  if (!text || text === '-99') throw new Error(`${label}: ${key} is empty.`);
  return text;
}

function optionalText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text !== '-99' ? text : null;
}

function actualIsoCode(properties) {
  for (const key of ['ISO_A2', 'ISO_A2_EH']) {
    const value = properties[key];
    if (typeof value === 'string' && /^[A-Z]{2}$/.test(value)) return value;
  }
  return null;
}

function focusCoordinate(properties, key, min, max, label) {
  const value = properties[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label}: ${key} is not a finite number.`);
  }
  if (value < min || value > max) {
    throw new Error(`${label}: ${key} ${value} is outside [${min}, ${max}].`);
  }
  return roundCoordinate(value);
}

function extractGeometry(geometry, label) {
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
    throw new Error(`${label}: expected Polygon or MultiPolygon geometry.`);
  }
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || polygons.length === 0) {
    throw new Error(`${label}: geometry has no polygons.`);
  }

  const parts = [];
  let ringCount = 0;
  let pointCount = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      throw new Error(`${label}: geometry contains an empty polygon.`);
    }
    const rings = [];
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) {
        throw new Error(`${label}: every ring needs at least four positions.`);
      }
      const flat = [];
      const distinct = new Set();
      for (const position of ring) {
        if (!Array.isArray(position) || position.length < 2) {
          throw new Error(`${label}: invalid coordinate position.`);
        }
        const [lon, lat] = position;
        if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) {
          throw new Error(`${label}: non-finite coordinate.`);
        }
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
          throw new Error(`${label}: coordinate [${lon}, ${lat}] is outside lon/lat bounds.`);
        }
        const x = roundCoordinate(lon);
        const y = roundCoordinate(lat);
        if (flat.length && Math.abs(x - flat[flat.length - 2]) > 180) {
          throw new Error(`${label}: split rings at the antimeridian before packing.`);
        }
        flat.push(x, y);
        distinct.add(`${x},${y}`);
      }
      if (flat[0] !== flat[flat.length - 2] || flat[1] !== flat[flat.length - 1]) {
        throw new Error(`${label}: ring is not closed after rounding.`);
      }
      if (distinct.size < 3) {
        throw new Error(`${label}: ring degenerates to fewer than three distinct points at ${OUTPUT_DECIMALS} decimals.`);
      }
      rings.push(flat);
      ringCount++;
      pointCount += ring.length;
    }
    parts.push(rings);
  }
  return { polygons: parts, ringCount, pointCount };
}

function buildRegions(features) {
  const seen = new Set();
  const regions = [];
  let polygonCount = 0;
  let ringCount = 0;
  let pointCount = 0;

  for (const feature of features) {
    const properties = feature?.properties;
    if (!properties || typeof properties !== 'object') {
      throw new Error('Source feature is missing properties.');
    }
    const id = requiredText(properties, 'ADM0_A3', 'feature');
    if (!/^[A-Z0-9]{3}$/.test(id)) throw new Error(`${id}: ADM0_A3 is not a three-character code.`);
    if (seen.has(id)) throw new Error(`${id}: duplicate ADM0_A3.`);
    seen.add(id);

    const en = requiredText(properties, 'NAME_EN', id);
    const zh = requiredText(properties, 'NAME_ZH', id);
    const aliases = [];
    for (const candidate of [optionalText(properties.NAME), optionalText(properties.NAME_ZHT)]) {
      if (candidate && candidate !== en && candidate !== zh && !aliases.includes(candidate)) {
        aliases.push(candidate);
      }
    }

    const geometry = extractGeometry(feature.geometry, id);
    const region = {
      id,
      iso: actualIsoCode(properties),
      en,
      zh,
      aliases,
      focus: [
        focusCoordinate(properties, 'LABEL_X', -180, 180, id),
        focusCoordinate(properties, 'LABEL_Y', -90, 90, id),
      ],
      polygons: geometry.polygons,
    };
    regions.push(region);
    polygonCount += geometry.polygons.length;
    ringCount += geometry.ringCount;
    pointCount += geometry.pointCount;
  }

  if (regions.length !== EXPECTED_FEATURE_COUNT) {
    throw new Error(`Expected ${EXPECTED_FEATURE_COUNT} source features, found ${regions.length}.`);
  }
  for (const id of REQUIRED_REGION_IDS) {
    if (!seen.has(id)) throw new Error(`Required region ${id} is missing from the source.`);
  }

  regions.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { regions, polygonCount, ringCount, pointCount };
}

function serialize(asset) {
  // Keep provenance readable while emitting each region on one line.
  const source = JSON.stringify(asset.source, null, 2).replace(/\n/g, '\n  ');
  const regions = asset.regions.map(region => `    ${JSON.stringify(region)}`).join(',\n');
  return `{\n  "source": ${source},\n  "regions": [\n${regions}\n  ]\n}\n`;
}

async function downloadSource() {
  const response = await fetch(SOURCE.url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    headers: { 'user-agent': 'GlobalNewsMap/0.1 (static country boundaries build)' },
  });
  if (!response.ok) {
    throw new Error(`Source download failed with HTTP ${response.status}.`);
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Source download is larger than ${MAX_DOWNLOAD_BYTES} bytes.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Source download is larger than ${MAX_DOWNLOAD_BYTES} bytes.`);
  }
  return bytes;
}

async function loadSource() {
  if (process.argv.length > 3) {
    throw new Error('usage: node scripts/build-country-boundaries.mjs [source.geojson]');
  }
  const inputPath = process.argv[2];
  const bytes = inputPath ? await readFile(inputPath) : await downloadSource();
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== SOURCE.sha256) {
    throw new Error(`Source SHA-256 mismatch: expected ${SOURCE.sha256}, received ${actualHash}.`);
  }
  return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
}

async function main() {
  const geojson = await loadSource();
  if (geojson?.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('Source is not a GeoJSON FeatureCollection.');
  }

  const { regions, polygonCount, ringCount, pointCount } = buildRegions(geojson.features);
  const asset = {
    source: {
      name: SOURCE.name,
      url: SOURCE.url,
      repository: SOURCE.repository,
      commit: SOURCE.commit,
      sha256: SOURCE.sha256,
      license: SOURCE.license,
      licenseUrl: SOURCE.licenseUrl,
      boundaryPolicy: SOURCE.boundaryPolicy,
      boundaryPolicyUrl: SOURCE.boundaryPolicyUrl,
      featureCount: geojson.features.length,
      regionCount: regions.length,
      method: `ADM0_A3 ids; ISO_A2 with ISO_A2_EH fallback; NAME_EN/NAME_ZH names; NAME/NAME_ZHT aliases when distinct; LABEL_X/LABEL_Y focus; preserve each antimeridian-split Polygon/MultiPolygon part and its holes as closed [lon,lat,...] rings, rounded to ${OUTPUT_DECIMALS} decimals.`,
      polygonCount,
      ringCount,
      pointCount,
    },
    regions,
  };

  const output = serialize(asset);
  const roundTrip = JSON.parse(output);
  if (roundTrip.regions.length !== regions.length) {
    throw new Error('Serialized output failed its region-count round trip.');
  }
  process.stdout.write(output);
  const bytes = Buffer.byteLength(output);
  const isoCount = regions.filter(region => region.iso !== null).length;
  console.error(`[country-boundaries] ${regions.length} regions (${isoCount} with ISO alpha-2), ${polygonCount} polygons, ${ringCount} rings, ${pointCount} points, ${bytes} bytes; source SHA-256 verified.`);
}

main().catch(error => {
  console.error(`[country-boundaries] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});