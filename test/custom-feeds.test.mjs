import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot } from '../src/domain.ts';
import {
  exportOpml,
  exportSourcesCatalog,
  parseBrowserFeed,
  parseOpml,
} from '../src/customFeeds.ts';

const baseConfig = {
  id: 'custom-test',
  name: '',
  url: 'https://example.org/feed.xml',
  format: 'auto',
  theme: 'earth',
  tag: 'climate',
  maxEvents: 10,
};

test('parseBrowserFeed handles RSS + GeoRSS, Atom, JSON Feed 1.1, GeoJSON, and EONET cleanly', () => {
  const rssGeo = `<?xml version="1.0"?><rss version="2.0" xmlns:georss="http://www.georss.org/georss"><channel><title>Geo Feed</title>
    <item><title>Storm Watch</title><link>http://example.org/storm?utm_source=x</link><pubDate>Tue, 24 Nov 2026 08:00:00 GMT</pubDate><description>&lt;p&gt;Coastal watch.&lt;/p&gt;</description><georss:point>14.5995 120.9842</georss:point></item>
  </channel></rss>`;
  const parsedRss = parseBrowserFeed(rssGeo, baseConfig);
  assert.equal(parsedRss.detectedFormat, 'feed');
  assert.equal(parsedRss.feedTitle, 'Geo Feed');
  assert.equal(parsedRss.events.length, 1);
  assert.equal(parsedRss.events[0].locations[0].lat, 14.5995);
  assert.equal(parsedRss.events[0].locations[0].lon, 120.9842);
  assert.deepEqual(parsedRss.events[0].tags, ['climate']);
  assert.equal(parsedRss.events[0].sources[0].url, 'https://example.org/storm');

  const jsonFeed = JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Agents Weekly',
    items: [
      {
        id: 'jf-1',
        url: 'https://example.org/agents/1',
        title: 'Agent Spec v2',
        content_text: 'Released spec.',
        date_published: '2026-11-24T09:00:00Z',
        _geo: { lat: 37.77, lon: -122.41 },
      },
    ],
  });
  const parsedJson = parseBrowserFeed(jsonFeed, { ...baseConfig, theme: 'ai', tag: 'ai-agents' }, 'application/feed+json');
  assert.equal(parsedJson.detectedFormat, 'json-feed');
  assert.equal(parsedJson.events[0].locations[0].lat, 37.77);

  const geojson = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        id: 'pt-1',
        properties: { title: 'Sensor Alpha', url: 'https://example.org/sensor/1', time: '2026-11-24T10:00:00Z', place: 'Reykjavik' },
        geometry: { type: 'Point', coordinates: [-21.94, 64.14] },
      },
    ],
  });
  const parsedGeo = parseBrowserFeed(geojson, baseConfig, 'application/geo+json');
  assert.equal(parsedGeo.detectedFormat, 'geojson');
  assert.equal(parsedGeo.events[0].locations[0].label, 'Reykjavik');

  const snap = validateSnapshot({
    schemaVersion: 1,
    generatedAt: '2026-11-24T12:00:00Z',
    sources: [parsedRss.sourceStatus],
    events: parsedRss.events,
  });
  assert.equal(snap.events.length, 1);
});

test('parseOpml extracts nested folder tags and exportOpml/exportSourcesCatalog round-trip cleanly', () => {
  const opml = `<?xml version="1.0"?><opml version="2.0"><body>
    <outline text="AI Agents" title="AI Agents">
      <outline type="rss" text="Agents Radar" xmlUrl="http://duanyytop.github.io/agents-radar/feed.xml" />
      <outline type="rss" text="Unsafe" xmlUrl="javascript:alert(1)" />
    </outline>
    <outline type="rss" text="Standalone" xmlUrl="https://example.org/rss.xml" category="macro" />
  </body></opml>`;
  const entries = parseOpml(opml);
  assert.deepEqual(entries, [
    { name: 'Agents Radar', url: 'https://duanyytop.github.io/agents-radar/feed.xml', tag: 'AI Agents' },
    { name: 'Standalone', url: 'https://example.org/rss.xml', tag: 'macro' },
  ]);

  const exportedOpml = exportOpml([], [{ ...baseConfig, name: 'Agents Radar', url: entries[0].url, tag: 'ai-agents' }]);
  assert.match(exportedOpml, /agents-radar\/feed\.xml/);
  const reparsed = parseOpml(exportedOpml);
  assert.equal(reparsed[0].url, 'https://duanyytop.github.io/agents-radar/feed.xml');

  const exportedJson = JSON.parse(exportSourcesCatalog([], [{ ...baseConfig, name: 'Agents Radar', url: entries[0].url, tag: 'ai-agents' }]));
  assert.equal(exportedJson.length, 1);
  assert.deepEqual(exportedJson[0].tags, ['ai-agents']);
});
