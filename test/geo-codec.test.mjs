import test from 'node:test';
import assert from 'node:assert/strict';
import boundaries from '../assets/country-boundaries.json' with { type: 'json' };
import landPoints from '../assets/land-points.json' with { type: 'json' };
import sources from '../scripts/sources.json' with { type: 'json' };
import { decodeLandPoints, decodeRegions, encodeDeltaVarint } from '../src/geoCodec.ts';
import { containsCjk, placeEvidence, placeLabel, sourceRights } from '../src/i18n.ts';

function packRegionsForTest(raw) {
  const scale = 10000;
  return {
    packed: 1,
    scale,
    regions: raw.regions.map(region => {
      const ints = [];
      const shapes = region.polygons.map(polygon => polygon.map(ring => {
        let lx = 0;
        let ly = 0;
        for (let i = 0; i < ring.length; i += 2) {
          const x = Math.round(ring[i] * scale);
          const y = Math.round(ring[i + 1] * scale);
          ints.push(x - lx, y - ly);
          lx = x;
          ly = y;
        }
        return ring.length / 2;
      }));
      return {
        id: region.id,
        iso: region.iso,
        en: region.en,
        zh: region.zh,
        aliases: region.aliases,
        focus: region.focus,
        shapes,
        data: encodeDeltaVarint(ints),
      };
    }),
  };
}

function packLandPointsForTest(points) {
  const scale = 100000;
  const ints = new Array(points.length);
  let lx = 0;
  let ly = 0;
  for (let i = 0; i < points.length; i += 2) {
    const x = Math.round(points[i] * scale);
    const y = Math.round(points[i + 1] * scale);
    ints[i] = x - lx;
    ints[i + 1] = y - ly;
    lx = x;
    ly = y;
  }
  return { packed: 1, scale, count: points.length, data: encodeDeltaVarint(ints) };
}

test('country boundaries pack and decode losslessly for all 242 regions', () => {
  const packed = packRegionsForTest(boundaries);
  const decoded = decodeRegions(packed);
  assert.equal(decoded.length, boundaries.regions.length);
  for (let i = 0; i < boundaries.regions.length; i++) {
    assert.deepEqual(decoded[i], boundaries.regions[i]);
  }
  assert.deepEqual(decodeRegions(boundaries), boundaries.regions);
});

test('land points pack and decode losslessly for all surface points', () => {
  const packed = packLandPointsForTest(landPoints);
  const decoded = decodeLandPoints(packed);
  assert.deepEqual(decoded, landPoints);
  assert.deepEqual(decodeLandPoints(landPoints), landPoints);
});

test('built-in place labels, evidences, and source rights translate cleanly in English and pass through unknown text', () => {
  assert.equal(placeLabel('华盛顿特区（美联储理事会）', 'en'), 'Washington, D.C. (Federal Reserve Board)');
  assert.equal(placeLabel('法兰克福（欧洲央行）', 'en'), 'Frankfurt (European Central Bank)');
  assert.equal(placeLabel('约翰逊航天中心', 'en'), 'Johnson Space Center');
  assert.equal(placeLabel('Frankfurt (European Central Bank)', 'zh-CN'), '法兰克福（欧洲央行）');
  assert.equal(placeLabel('Custom Station Alpha', 'en'), 'Custom Station Alpha');

  const nasaEn = placeEvidence('NASA 原文明确提及 约翰逊航天中心；坐标为其公开所在地，仅表示被提及的机构/设施位置，不表示事件影响范围或发生地。', 'en');
  assert.match(nasaEn, /Johnson Space Center/);
  assert.equal(containsCjk(nasaEn), false);

  const usgsEn = placeEvidence('USGS 事件坐标（纬度 -6.0804，经度 131.4868）；震源深度 10.5 km。坐标表示震中位置，不用于判断灾害严重程度。', 'en');
  assert.match(usgsEn, /focal depth 10\.5 km/);
  assert.equal(containsCjk(usgsEn), false);

  for (const source of sources) {
    const enRights = sourceRights(source.rights, 'en');
    assert.equal(containsCjk(enRights), false, `Expected no CJK in English rights for ${source.id}`);
    assert.equal(sourceRights(source.rights, 'zh-CN'), source.rights);
  }
  assert.equal(sourceRights('Custom local feed terms.', 'en'), 'Custom local feed terms.');
});
