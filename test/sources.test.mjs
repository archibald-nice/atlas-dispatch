import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeUrl,
  collectSource,
  normalizeFeedSummary,
  parseDateValue,
  parseSyndication,
  parseUsgsEvents,
  parseSource,
} from '../scripts/adapters.mjs';
import SOURCE_DEFINITIONS from '../scripts/sources.json' with { type: 'json' };

const rss = items => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Example</title>${items}</channel></rss>`;

function rssItem({ title, link, description, pubDate = 'Mon, 16 Nov 2026 10:00:00 GMT', guid }) {
  const descriptionXml = description === undefined ? '' : `<description><![CDATA[${description}]]></description>`;
  const guidXml = guid === undefined ? '' : `<guid>${String(guid).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</guid>`;
  return `<item><title><![CDATA[${title}]]></title><link>${link}</link>${descriptionXml}<pubDate>${pubDate}</pubDate>${guidXml}</item>`;
}

test('RSS: keeps source publication date and strips tracking parameters and HTML', () => {
  const xml = rss(rssItem({
    title: 'News &amp; analysis',
    link: 'http://example.com/story?utm_source=rss&b=2&a=1#section',
    description: '<p>First <strong>paragraph</strong>.</p>',
    pubDate: 'Mon, 16 Nov 2026 23:30:00 +0100',
    guid: 'story-1',
  }));
  const [item] = parseSyndication(xml, { sourceId: 'example', baseUrl: 'https://example.com/feed' });
  assert.equal(item.title, 'News & analysis');
  assert.equal(item.url, 'https://example.com/story?a=1&b=2');
  assert.equal(item.publishedAt, '2026-11-16T22:30:00.000Z');
  assert.match(item.summary, /^First\s+paragraph/);
  assert.doesNotMatch(item.summary, /[<>]/);
  const [again] = parseSyndication(xml, { sourceId: 'example', baseUrl: 'https://example.com/feed' });
  assert.equal(item.id, again.id);
});

test('official collector turns an HTTP feed into dated, attributable events', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(rss(rssItem({
    title: 'Policy release',
    link: 'https://www.federalreserve.gov/newsevents/pressreleases/probe.htm?utm_source=rss',
    description: 'Source description.',
    pubDate: 'Mon, 16 Nov 2026 10:00:00 GMT',
    guid: 'policy-probe',
  })), { headers: { 'content-type': 'application/rss+xml' } }));
  const result = await collectSource(SOURCE_DEFINITIONS.find(source => source.id === 'fed'));
  assert.equal(result.status.status, 'ok');
  assert.equal(result.status.count, 1);
  assert.equal(result.events[0].publishedAt, '2026-11-16T10:00:00.000Z');
  assert.equal(result.events[0].sources[0].url, 'https://www.federalreserve.gov/newsevents/pressreleases/probe.htm');
  assert.equal(result.events[0].locations[0].relation, 'publisher');
});

test('Atom: parses multiple entries, alternate link, authors and categories', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">
    <title>Research</title>
    <entry><id>tag:example.org,2026:2</id><title>Later paper</title><published>2026-11-16T11:00:00Z</published>
      <link rel="self" href="https://example.org/self/2"/><link rel="alternate" href="https://example.org/abs/2"/>
      <summary>Second abstract.</summary><author><name>Ada</name></author><author><name>Lin</name></author>
      <category term="cs.LG"/><category term="cs.AI"/></entry>
    <entry><id>tag:example.org,2026:1</id><title>Earlier paper</title><published>2026-11-16T10:00:00Z</published>
      <link href="https://example.org/abs/1"/><summary>First abstract.</summary></entry>
  </feed>`;
  const items = parseSyndication(xml, { sourceId: 'atom', baseUrl: 'https://example.org/feed' });
  assert.equal(items.length, 2);
  assert.deepEqual(items.map(item => item.title), ['Later paper', 'Earlier paper']);
  assert.equal(items[0].url, 'https://example.org/abs/2');
  assert.deepEqual(items[0].authors, ['Ada', 'Lin']);
  assert.deepEqual(items[0].categories, ['cs.LG', 'cs.AI']);
  assert.equal(items[1].summary, 'First abstract.');
});

test('RSS: de-duplicates the same GUID or canonical URL but not equal titles on different URLs', () => {
  const xml = rss([
    rssItem({
      title: 'Same event',
      link: 'https://example.com/story?id=7&utm_source=feed',
      guid: 'event-7',
      pubDate: 'Mon, 16 Nov 2026 10:00:00 GMT',
    }),
    rssItem({
      title: 'Same event, republished',
      link: 'https://example.com/story?utm_medium=social&id=7#top',
      guid: 'event-7-other-guid',
      pubDate: 'Mon, 16 Nov 2026 09:00:00 GMT',
    }),
    rssItem({
      title: 'Same event',
      link: 'https://example.com/other-story',
      guid: 'event-7b',
      pubDate: 'Mon, 16 Nov 2026 08:00:00 GMT',
    }),
  ].join(''));
  const items = parseSyndication(xml, { sourceId: 'example', baseUrl: 'https://example.com/feed' });
  assert.equal(items.length, 2);
  assert.deepEqual(items.map(item => item.url), ['https://example.com/story?id=7', 'https://example.com/other-story']);
  assert.deepEqual(items.map(item => item.title), ['Same event', 'Same event']);
});

test('RSS: missing or empty description produces no summary instead of invented text', () => {
  const xml = rss([
    rssItem({ title: 'No description', link: 'https://example.com/a', guid: 'a' }),
    rssItem({ title: 'Empty description', link: 'https://example.com/b', description: '', guid: 'b' }),
  ].join(''));
  const items = parseSyndication(xml, { sourceId: 'example' });
  assert.equal(items.length, 2);
  assert.ok(items.every(item => item.summary === ''));
});

test('RSS: rejects non-HTTPS and credentialed links, and skips items without a usable date', () => {
  const xml = rss([
    rssItem({ title: 'JavaScript', link: 'javascript:alert(1)', guid: 'x1' }),
    rssItem({ title: 'Data URL', link: 'data:text/html,hello', guid: 'x2' }),
    rssItem({ title: 'Credentials', link: 'https://user:pass@example.com/private', guid: 'x3' }),
    rssItem({ title: 'FTP', link: 'ftp://example.com/file', guid: 'x4' }),
    rssItem({ title: 'No date', link: 'https://example.com/no-date', pubDate: 'not a date', guid: 'x5' }),
    rssItem({ title: 'Valid', link: 'http://example.com/valid', guid: 'x6' }),
  ].join(''));
  const items = parseSyndication(xml, { sourceId: 'example' });
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://example.com/valid');
  assert.equal(items[0].publishedAt, '2026-11-16T10:00:00.000Z');
  assert.equal(parseDateValue('2026-11-16T10:00:00+02:00'), '2026-11-16T08:00:00.000Z');
  assert.equal(parseDateValue(''), null);
  assert.equal(canonicalizeUrl('javascript:alert(1)'), null);
});

test('NASA summaries: removes site chrome, Description prefix and duplicated titles', () => {
  const navigation = normalizeFeedSummary({
    title: 'APOD: 2026 November 17 – Milky Way versus Aurora',
    summary: "APOD Science APOD APOD: 2026 November 17 –… Today's APOD Archive Submissions Index Search Calendar RSS",
  }, { id: 'nasa' });
  assert.equal(navigation, '');
  const caption = normalizeFeedSummary({
    title: 'Collage',
    summary: 'Description This collage shows drill holes on Mars.',
  }, { id: 'nasa' });
  assert.equal(caption, 'This collage shows drill holes on Mars.');
  const duplicated = normalizeFeedSummary({ title: 'Same', summary: 'Same' }, { id: 'nasa' });
  assert.equal(duplicated, '');
});

test('USGS: keeps event time for publishedAt and occurredAt, applies M4.5 floor and coordinate validation', () => {
  const payload = {
    type: 'FeatureCollection',
    features: [
      {
        id: 'us-low',
        properties: { mag: 4.4, time: Date.parse('2026-11-16T10:00:00Z'), place: 'Below threshold', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us-low', title: 'M 4.4 - Below threshold' },
        geometry: { coordinates: [10, 20, 5] },
      },
      {
        id: 'us-ok',
        properties: { mag: 5.6, time: Date.parse('2026-11-16T11:00:00Z'), place: 'Example region', url: 'http://earthquake.usgs.gov/earthquakes/eventpage/us-ok', title: 'M 5.6 - Example region' },
        geometry: { coordinates: [100.5, -10.25, 30] },
      },
      {
        id: 'us-bad-coords',
        properties: { mag: 6.1, time: Date.parse('2026-11-16T12:00:00Z'), place: 'Bad', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us-bad-coords' },
        geometry: { coordinates: [500, 100, 10] },
      },
    ],
  };
  const events = parseSource(JSON.stringify(payload), SOURCE_DEFINITIONS.find(source => source.id === 'usgs'));
  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event.id, 'usgs-us-ok');
  assert.equal(event.publishedAt, '2026-11-16T11:00:00.000Z');
  assert.equal(event.occurredAt, event.publishedAt);
  assert.equal(event.locations[0].relation, 'event');
  assert.equal(event.locations[0].precision, 'point');
  assert.equal(event.locations[0].label, 'Example region');
  assert.match(event.facts[1], /USGS 标注位置：Example region；震源深度 30 km/);
  assert.match(event.locations[0].evidence, /USGS/);
  assert.equal(event.sources[0].url, 'https://earthquake.usgs.gov/earthquakes/eventpage/us-ok');
  assert.ok(event.facts.length >= 2 && event.facts.length <= 3);
  assert.ok(event.facts.every(fact => !/伤亡|破坏/.test(fact) || /未据震级推断/.test(fact)));
});

test('USGS selection: caps the feed and avoids one coordinate cell dominating', () => {
  const features = [];
  for (let index = 0; index < 12; index += 1) {
    features.push({
      id: `same-${index}`,
      properties: { mag: 6.5 - index * 0.05, time: Date.parse('2026-11-16T10:00:00Z') - index * 1000, place: 'Same cell', url: `https://earthquake.usgs.gov/earthquakes/eventpage/same-${index}`, title: `M 6.5 - Same cell ${index}` },
      geometry: { coordinates: [10.1, 20.1, 10] },
    });
  }
  for (let index = 0; index < 8; index += 1) {
    features.push({
      id: `spread-${index}`,
      properties: { mag: 5.1, time: Date.parse('2026-11-15T10:00:00Z') - index * 1000, place: 'Spread cell', url: `https://earthquake.usgs.gov/earthquakes/eventpage/spread-${index}`, title: `M 5.1 - Spread cell ${index}` },
      geometry: { coordinates: [-120 + index * 30, -40 + index * 10, 10] },
    });
  }
  const quakes = parseUsgsEvents({ features }, { maxEvents: 10 });
  assert.equal(quakes.length, 10);
  const sameCell = quakes.filter(quake => quake.place === 'Same cell');
  assert.equal(sameCell.length, 2);
  assert.ok(quakes.some(quake => quake.place === 'Spread cell'));
});

test('EONET: keeps Point geometries, skips Polygons and earthquakes, and prioritizes non-prescribed diverse hazards', () => {
  const payload = {
    events: [
      {
        id: 'EONET_EQ',
        title: 'Earthquake ignored',
        categories: [{ id: 'earthquakes', title: 'Earthquakes' }],
        sources: [{ id: 'USGS', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/test' }],
        geometry: [{ type: 'Point', coordinates: [140, 35], date: '2026-11-24T01:00:00Z' }],
      },
      {
        id: 'EONET_POLY',
        title: 'Polygon only ignored',
        categories: [{ id: 'wildfires', title: 'Wildfires' }],
        sources: [{ id: 'IRWIN', url: 'https://irwin.doi.gov/observer/incidents/poly' }],
        geometry: [{ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]], date: '2026-11-24T02:00:00Z' }],
      },
      {
        id: 'EONET_RX',
        title: 'Prescribed Fire Sample',
        categories: [{ id: 'wildfires', title: 'Wildfires' }],
        sources: [{ id: 'IRWIN', url: 'http://irwin.doi.gov/observer/incidents/rx?utm_source=x' }],
        geometry: [{ type: 'Point', coordinates: [-82.5, 36.1], date: '2026-11-24T05:00:00Z' }],
      },
      {
        id: 'EONET_CYC',
        title: 'Tropical Cyclone Akvan',
        description: 'Cyclone tracking',
        categories: [{ id: 'severeStorms', title: 'Severe Storms' }],
        sources: [{ id: 'JTWC', url: 'https://www.metoc.navy.mil/jtwc/akvan' }],
        geometry: [
          { type: 'Point', coordinates: [85.1, 16.5], date: '2026-11-23T12:00:00Z', magnitudeValue: 45, magnitudeUnit: 'kts' },
          { type: 'Point', coordinates: [84.7, 17.2], date: '2026-11-24T03:00:00Z', magnitudeValue: 55, magnitudeUnit: 'kts' },
        ],
      },
    ],
  };
  const events = parseSource(JSON.stringify(payload), { ...SOURCE_DEFINITIONS.find(source => source.id === 'eonet'), maxEvents: 1 });
  assert.equal(events.length, 1);
  const [cyclone] = events;
  assert.equal(cyclone.id, 'eonet-EONET_CYC');
  assert.equal(cyclone.theme, 'earth');
  assert.equal(cyclone.kind, '自然事件');
  assert.equal(cyclone.publishedAt, '2026-11-24T03:00:00.000Z');
  assert.equal(cyclone.locations[0].lat, 17.2);
  assert.equal(cyclone.locations[0].lon, 84.7);
  assert.equal(cyclone.locations[0].relation, 'event');
  assert.equal(cyclone.locations[0].precision, 'point');
  assert.equal(cyclone.sources[0].url, 'https://www.metoc.navy.mil/jtwc/akvan');
});

test('GDACS: skips EQ, parses geo:Point and georss:point, upgrades links to HTTPS, and ranks alerts', () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
    <rss version="2.0" xmlns:gdacs="http://www.gdacs.org" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#" xmlns:georss="http://www.georss.org/georss">
      <channel><title>GDACS</title>
        <item>
          <title>Earthquake skipped</title>
          <link>http://www.gdacs.org/report.aspx?eventtype=EQ&amp;eventid=1</link>
          <pubDate>Tue, 24 Nov 2026 10:00:00 GMT</pubDate>
          <gdacs:eventtype>EQ</gdacs:eventtype><gdacs:eventid>1</gdacs:eventid><gdacs:alertlevel>Red</gdacs:alertlevel>
          <geo:Point><geo:lat>10</geo:lat><geo:long>20</geo:long></geo:Point>
        </item>
        <item>
          <title>Wildfire green</title>
          <link>http://www.gdacs.org/report.aspx?eventtype=WF&amp;eventid=2</link>
          <pubDate>Tue, 24 Nov 2026 11:00:00 GMT</pubDate>
          <gdacs:eventtype>WF</gdacs:eventtype><gdacs:eventid>2</gdacs:eventid><gdacs:alertlevel>Green</gdacs:alertlevel>
          <gdacs:country>Brazil</gdacs:country>
          <georss:point>-12.5 -45.2</georss:point>
        </item>
        <item>
          <title>Orange flood alert in Vietnam</title>
          <description>Flooding reported along central coast.</description>
          <link>http://www.gdacs.org/report.aspx?eventtype=FL&amp;eventid=3</link>
          <pubDate>Tue, 24 Nov 2026 09:00:00 GMT</pubDate>
          <gdacs:fromdate>Mon, 23 Nov 2026 06:00:00 GMT</gdacs:fromdate>
          <gdacs:eventtype>FL</gdacs:eventtype><gdacs:eventid>3</gdacs:eventid><gdacs:alertlevel>Orange</gdacs:alertlevel>
          <gdacs:country>Vietnam</gdacs:country>
          <geo:Point><geo:lat>16.05</geo:lat><geo:long>108.2</geo:long></geo:Point>
        </item>
      </channel>
    </rss>`;
  const events = parseSource(xml, { ...SOURCE_DEFINITIONS.find(source => source.id === 'gdacs'), maxEvents: 1 });
  assert.equal(events.length, 1);
  const [flood] = events;
  assert.equal(flood.id, 'gdacs-fl-3');
  assert.equal(flood.kind, '灾害警报');
  assert.equal(flood.locations[0].label, 'Vietnam');
  assert.equal(flood.locations[0].lat, 16.05);
  assert.equal(flood.locations[0].lon, 108.2);
  assert.equal(flood.sources[0].url, 'https://www.gdacs.org/report.aspx?eventid=3&eventtype=FL');
  assert.equal(flood.occurredAt, '2026-11-23T06:00:00.000Z');
});

test('ESA: includes Paris HQ publisher location and explicit facility subject location when mentioned', () => {
  const esaDef = {
    id: 'esa',
    name: '欧洲航天局',
    shortName: '欧洲航天局',
    url: 'https://www.esa.int/rssfeed/TopNews',
    theme: 'space',
    kind: 'ESA 发布',
    maxEvents: 6,
    format: 'feed',
    publisherLocation: {
      label: '巴黎（欧洲航天局总部）',
      lat: 48.8482,
      lon: 2.3046,
      evidence: '欧洲航天局总部位于法国巴黎；该坐标表示发布机构所在地，并非事件发生地或任务地点。',
    },
  };
  const xml = rss(rssItem({
    title: 'Vega-C prepares for launch from Kourou',
    link: 'https://www.esa.int/Enabling_Support/Space_Transportation/Vega-C_test',
    description: 'Teams at Europe’s Spaceport in French Guiana completed readiness checks.',
    guid: 'esa-kourou-1',
  }));
  const events = parseSource(xml, esaDef);
  assert.equal(events.length, 1);
  assert.equal(events[0].locations.length, 2);
  assert.equal(events[0].locations[0].relation, 'publisher');
  assert.equal(events[0].locations[0].label, '巴黎（欧洲航天局总部）');
  assert.equal(events[0].locations[1].relation, 'subject');
  assert.equal(events[0].locations[1].label, '库鲁航天发射场');
});