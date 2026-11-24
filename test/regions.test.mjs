import test from 'node:test';
import assert from 'node:assert/strict';
import boundaries from '../assets/country-boundaries.json' with { type: 'json' };
import { indexRegionLocations } from '../src/regions.ts';

const region = id => boundaries.regions.find(entry => entry.id === id);
const point = (lon, lat, overrides = {}) => ({ lon, lat, label: 'Fixture', relation: 'event', precision: 'point', evidence: 'Documented location', ...overrides });
const record = (id, ...locations) => ({ id, locations });

test('regions include separate islands and both sides of the antimeridian without spanning the ocean', () => {
  const events = [
    record('main-island', point(178.43, -18.10)),
    record('west-of-cut', point(179.9999, -16.517)),
    record('east-of-cut', point(-179.9999, -16.517)),
    record('at-cut', point(180, -16.517)),
    record('opposite-meridian', point(0, -16.517)),
  ];
  assert.deepEqual([...indexRegionLocations(events, region('FJI')).keys()], ['main-island', 'west-of-cut', 'east-of-cut', 'at-cut']);
});

test('holes, coastal water, and ambiguous boundary points do not match', () => {
  const maseru = record('maseru', point(28.2336, -29.61));
  const joburg = record('johannesburg', point(28.0473, -26.2041));
  assert.deepEqual([...indexRegionLocations([maseru, joburg], region('ZAF')).keys()], ['johannesburg']);
  assert.ok(indexRegionLocations([maseru], region('LSO')).has('maseru'));
  const offshore = record('offshore', point(131.4868, -6.0804, { label: '148 km WSW of Tual, Indonesia' }));
  assert.equal(indexRegionLocations([offshore], region('IDN')).size, 0);
  const square = { polygons: [[[0, 0, 2, 0, 2, 2, 0, 2, 0, 0]]] };
  assert.deepEqual([...indexRegionLocations([record('interior', point(1, 1)), record('edge', point(2, 1))], square).keys()], ['interior']);
});

test('a record retains only evidenced locations inside the region and keeps their original relationships', () => {
  const frankfurt = point(8.6821, 50.1109, { label: 'Frankfurt', relation: 'publisher' });
  const berlin = point(13.405, 52.52, { label: 'Berlin', relation: 'subject' });
  const paris = point(2.35, 48.86, { label: 'Paris' });
  const representative = point(13.405, 52.52, { precision: 'country' });
  const unevidenced = point(13.405, 52.52, { evidence: '  ' });
  const events = [record('policy', paris, frankfurt, berlin), record('rough-pin', representative), record('missing-evidence', unevidenced), record('unlocated')];
  assert.deepEqual([...indexRegionLocations(events, region('DEU'))], [['policy', [frankfurt, berlin]]]);
  assert.deepEqual(events[0].locations, [paris, frankfurt, berlin]);
});
