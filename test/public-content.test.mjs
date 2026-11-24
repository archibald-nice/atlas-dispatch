import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { publicSnapshot } from '../scripts/public-content.mjs';
import { validateSnapshot } from '../src/domain.ts';

const capturedAt = '2026-11-20T12:00:00.000Z';
const SOURCE_URLS = {
  usgs: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson',
  fed: 'https://www.federalreserve.gov/feeds/press_all.xml',
  ecb: 'https://www.ecb.europa.eu/rss/press.html',
  arxiv: 'https://export.arxiv.org/api/query?search_query=cat%3Acs.AI+OR+cat%3Acs.LG+OR+cat%3Acs.CL&sortBy=submittedDate&sortOrder=descending&max_results=10',
  nasa: 'https://www.nasa.gov/news-release/feed/',
  gemma: 'https://raw.githubusercontent.com/google-gemma/docs/main/docs/models/releases.md',
};
const POLICY_URLS = {
  usgs: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
  fed: 'https://www.federalreserve.gov/disclaimer.htm',
  ecb: 'https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html',
  arxiv: 'https://info.arxiv.org/help/api/tou.html',
  nasa: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
  gemma: 'https://github.com/google-gemma/docs/blob/main/LICENSE',
};
const ARTICLE_URLS = {
  usgs: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000test',
  fed: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261112a.htm?utm_source=private#top',
  ecb: 'https://www.ecb.europa.eu//press/pr/date/2026/html/ecb.pr261106~356f2fc73a.en.html',
  arxiv: 'https://arxiv.org/abs/2611.21608v1',
  nasa: 'https://science.nasa.gov/image-article/apod-2026-november-23/',
  gemma: 'https://gemma.ai/models/releases/#october-6-2026',
};

const NAMES = {
  usgs: 'USGS 地震监测',
  fed: '美联储理事会',
  ecb: '欧洲央行',
  arxiv: 'arXiv 研究元数据',
  nasa: 'NASA 官方内容',
  gemma: 'Google Gemma 官方发布记录',
};

function location(lat = 35, lon = 120, relation = 'event', precision = 'point') {
  return {
    lat,
    lon,
    label: 'SECRET location label',
    relation,
    precision,
    evidence: 'SECRET location evidence copied from a private draft.',
  };
}

function eventFor(id, overrides = {}) {
  const articles = id === 'gemma'
    ? [
        { name: 'SECRET gemma site', url: ARTICLE_URLS.gemma, publishedAt: capturedAt },
        { name: 'SECRET docs', url: 'https://github.com/google-gemma/docs/blob/main/docs/models/releases.md#october-6-2026', publishedAt: capturedAt },
      ]
    : [{ name: 'SECRET source', url: ARTICLE_URLS[id], publishedAt: capturedAt }];
  const titles = {
    usgs: ['SECRET USGS editorial title', 'M 6.1 - 10 km SSW of Test'],
    arxiv: ['SECRET arxiv headline', 'Descriptive arXiv title'],
    gemma: ['SECRET Gemma editorial title', 'Release of Gemma Test.'],
  };
  const [title, titleOriginal] = titles[id] ?? [`SECRET ${id} headline`, `SECRET ${id} headline`];
  const locations = id === 'usgs'
    ? [{ ...location(), label: '10 km SSW of Test' }]
    : [location()];
  return {
    id: `event-${id}`,
    title,
    titleOriginal,
    summary: id === 'gemma' ? 'Release of Gemma Test.' : `SECRET ${id} summary`,
    theme: 'earth',
    kind: 'fixture',
    publishedAt: capturedAt,
    occurredAt: capturedAt,
    locations,
    sources: articles,
    facts: [`SECRET ${id} fact`],
    sourceId: id,
    summaryMode: 'editorial',
    ...overrides,
  };
}

function sourceFor(id, overrides = {}) {
  return {
    id,
    name: NAMES[id] ?? 'Fixture source',
    url: SOURCE_URLS[id] ?? 'https://example.org/feed',
    policyUrl: POLICY_URLS[id] ?? 'https://example.org/policy',
    rights: `SECRET ${id} rights from local catalog`,
    status: 'ok',
    fetchedAt: capturedAt,
    count: 1,
    error: null,
    ...overrides,
  };
}

function snapshot(events) {
  const sourceIds = [...new Set(events.map(event => event.sourceId))];
  return {
    schemaVersion: 1,
    generatedAt: capturedAt,
    sources: sourceIds.map(id => sourceFor(id, { count: events.filter(event => event.sourceId === id).length })),
    events,
  };
}

function baseSnapshot() {
  return snapshot(Object.keys(SOURCE_URLS).map(id => eventFor(id)));
}

const EVENT_KEYS = [
  'facts', 'id', 'kind', 'locations', 'occurredAt', 'publishedAt', 'sourceId',
  'sources', 'summary', 'summaryMode', 'theme', 'title', 'titleOriginal',
];
const SOURCE_STATUS_KEYS = ['count', 'error', 'fetchedAt', 'id', 'name', 'policyUrl', 'rights', 'status', 'url'];

test('projects the six reviewed sources into a valid public candidate with no copied text', () => {
  const { snapshot: candidate, sources: manifest } = publicSnapshot(baseSnapshot());

  assert.doesNotThrow(() => validateSnapshot(candidate));
  assert.deepEqual(Object.keys(candidate).sort(), ['events', 'generatedAt', 'schemaVersion', 'sources']);
  assert.deepEqual(manifest.map(source => source.id), ['usgs', 'fed', 'ecb', 'arxiv', 'nasa', 'gemma']);
  assert.deepEqual(manifest.map(source => source.mode), [
    'earthquake-structured-metadata',
    'official-link-only',
    'official-link-only',
    'arxiv-descriptive-metadata',
    'official-link-only',
    'gemma-apache-excerpt',
  ]);
  assert.deepEqual(manifest.map(source => [source.status, source.kept, source.omitted]), [
    ['included', 1, 0],
    ['included', 1, 0],
    ['included', 1, 0],
    ['included', 1, 0],
    ['included', 1, 0],
    ['included', 1, 0],
  ]);
  assert.equal(candidate.sources.length, 6);
  assert.deepEqual(candidate.sources.map(source => source.count), [1, 1, 1, 1, 1, 1]);
  assert.ok(candidate.sources.every(source => source.error === null));
  assert.ok(candidate.sources.every(source => !source.rights.includes('SECRET')));

  const serialized = JSON.stringify({ candidate, manifest });
  assert.ok(!serialized.includes('SECRET'), 'private fixture text must not survive projection');
  assert.ok(!serialized.includes('utm_source=private'), 'article query parameters must be stripped');

  const eventBySource = new Map(candidate.events.map(event => [event.sourceId, event]));
  for (const event of candidate.events) assert.deepEqual(Object.keys(event).sort(), EVENT_KEYS);

  const usgs = eventBySource.get('usgs');
  assert.match(usgs.title, /^M /);
  assert.equal(usgs.summary, 'USGS 发布的地震事件结构化元数据；震级、地点与时间以官方事件页为准。');
  assert.equal(usgs.occurredAt, capturedAt);
  assert.equal(usgs.locations.length, 1);
  assert.match(usgs.locations[0].evidence, /仅表示震中位置/);
  assert.ok(!usgs.locations[0].evidence.includes('SECRET'));

  const fed = eventBySource.get('fed');
  assert.equal(fed.title, '美联储理事会新闻稿 · 2026-11-20');
  assert.equal(fed.titleOriginal, '');
  assert.match(fed.summary, /不转载原标题、摘要或正文/);
  assert.equal(fed.locations.length, 1);
  assert.equal(fed.locations[0].relation, 'publisher');
  assert.equal(fed.sources[0].url, 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261112a.htm');

  const ecb = eventBySource.get('ecb');
  assert.equal(ecb.title, '欧洲央行新闻稿 · 2026-11-20');
  assert.match(ecb.facts.join(' '), /付费\/订阅/);
  assert.equal(ecb.locations[0].label, '法兰克福（欧洲央行）');

  const arxiv = eventBySource.get('arxiv');
  assert.equal(arxiv.title, 'Descriptive arXiv title');
  assert.match(arxiv.summary, /不包含论文全文、PDF 或摘要正文/);
  assert.equal(arxiv.summaryMode, 'metadata');
  assert.ok(arxiv.sources.every(source => new URL(source.url).pathname.startsWith('/abs/')));

  const nasa = eventBySource.get('nasa');
  assert.equal(nasa.title, 'NASA 新闻稿 · 2026-11-20');
  assert.deepEqual(nasa.locations, []);
  assert.match(nasa.facts.join(' '), /不暗示 NASA 背书/);

  const gemma = eventBySource.get('gemma');
  assert.equal(gemma.titleOriginal, 'Release of Gemma Test.');
  assert.match(gemma.facts.join(' '), /Apache-2\.0/);
  assert.match(gemma.facts.join(' '), /修改/);
  assert.match(gemma.sources[0].url, /#october-6-2026$/);
  const gemmaManifest = manifest.find(source => source.id === 'gemma');
  const licenseAsset = JSON.parse(readFileSync(fileURLToPath(new URL('../assets/gemma-docs-license.json', import.meta.url)), 'utf8'));
  assert.equal(gemmaManifest.license.name, 'Apache-2.0');
  assert.equal(gemmaManifest.license.url, licenseAsset.licenseUrl);
  assert.equal(gemmaManifest.license.sha256, licenseAsset.licenseSha256);
  assert.equal(gemmaManifest.license.text, licenseAsset.text);
});

test('fails closed when a known source feed or policy identity changes', () => {
  const input = baseSnapshot();
  input.sources.find(source => source.id === 'fed').policyUrl = 'https://www.federalreserve.gov/changed-policy.htm';
  input.sources.find(source => source.id === 'arxiv').url = 'https://export.arxiv.org/api/query?changed=1';

  const { snapshot: candidate, sources: manifest } = publicSnapshot(input);

  assert.deepEqual(candidate.sources.map(source => source.id), ['usgs', 'ecb', 'nasa', 'gemma']);
  assert.deepEqual(candidate.events.map(event => event.sourceId).sort(), ['ecb', 'gemma', 'nasa', 'usgs']);

  const fed = manifest.find(source => source.id === 'fed');
  const arxiv = manifest.find(source => source.id === 'arxiv');
  assert.equal(fed.status, 'excluded');
  assert.equal(fed.reason, 'source-identity-mismatch');
  assert.deepEqual([fed.kept, fed.omitted], [0, 1]);
  assert.equal(fed.sourceUrl, SOURCE_URLS.fed);
  assert.equal(fed.policyUrl, POLICY_URLS.fed);
  assert.equal(arxiv.status, 'excluded');
  assert.equal(arxiv.reason, 'source-identity-mismatch');
  assert.deepEqual([arxiv.kept, arxiv.omitted], [0, 1]);
});

test('excludes unknown sources without echoing their identity', () => {
  const input = baseSnapshot();
  input.sources.push({
    id: 'unknown-source',
    name: 'SECRET unknown name',
    url: 'https://unknown.example/feed',
    policyUrl: 'https://unknown.example/policy',
    rights: 'SECRET unknown rights',
    status: 'ok',
    fetchedAt: capturedAt,
    count: 1,
    error: null,
  });
  input.events.push(eventFor('fed', {
    id: 'event-unknown-source',
    sourceId: 'unknown-source',
    sources: [{ name: 'SECRET unknown article', url: 'https://unknown.example/article', publishedAt: capturedAt }],
  }));
  assert.doesNotThrow(() => validateSnapshot(input));

  const { snapshot: candidate, sources: manifest } = publicSnapshot(input);

  assert.equal(candidate.events.length, 6);
  assert.ok(!candidate.sources.some(source => source.id === 'unknown-source'));
  assert.ok(!manifest.some(source => source.id === 'unknown-source'));
  assert.ok(!JSON.stringify({ candidate, manifest }).includes('SECRET unknown'));
  assert.ok(!JSON.stringify({ candidate, manifest }).includes('unknown.example'));
});

test('drops an entire record when any article link is not an explicitly permitted official URL', () => {
  const input = baseSnapshot();
  input.events.find(event => event.sourceId === 'fed').sources[0].url = 'https://evil.example/newsevents/pressreleases/fake.htm';
  input.events.find(event => event.sourceId === 'gemma').sources[1].url = 'https://github.com/another-org/docs/blob/main/LICENSE';
  input.events.find(event => event.sourceId === 'nasa').sources[0].url = 'https://www.nasa.gov.evil.example/news-release/fake';

  const { snapshot: candidate, sources: manifest } = publicSnapshot(input);

  assert.deepEqual(candidate.events.map(event => event.sourceId).sort(), ['arxiv', 'ecb', 'usgs']);
  assert.ok(!JSON.stringify(candidate).includes('evil.example'));
  assert.equal(candidate.sources.find(source => source.id === 'fed').count, 0);
  assert.equal(candidate.sources.find(source => source.id === 'nasa').count, 0);
  const fed = manifest.find(source => source.id === 'fed');
  const gemma = manifest.find(source => source.id === 'gemma');
  const nasa = manifest.find(source => source.id === 'nasa');
  assert.deepEqual([fed.kept, fed.omitted], [0, 1]);
  assert.deepEqual([gemma.kept, gemma.omitted], [0, 1]);
  assert.deepEqual([nasa.kept, nasa.omitted], [0, 1]);
});

test('rebuilds events with fixed fields and never copies hidden fields, facts, or raw errors', () => {
  const input = baseSnapshot();
  input.privatePath = '/Users/private/snapshot.json';
  const fedEvent = input.events.find(event => event.sourceId === 'fed');
  fedEvent.id = 'SECRET internal event id /Users/private/';
  fedEvent.privateNote = 'SECRET hidden event field';
  fedEvent.facts.push('SECRET appended fact');
  const fedStatus = input.sources.find(source => source.id === 'fed');
  fedStatus.status = 'error';
  fedStatus.error = 'SECRET raw payload: stack trace';
  fedStatus.attemptedAt = capturedAt;
  fedStatus.debug = { payload: 'SECRET source debug' };

  const { snapshot: candidate, sources: manifest } = publicSnapshot(input);
  assert.doesNotThrow(() => validateSnapshot(candidate));

  const serialized = JSON.stringify({ candidate, manifest });
  assert.ok(!serialized.includes('SECRET'));
  assert.ok(!serialized.includes('/Users/private'));

  const outputFed = candidate.sources.find(source => source.id === 'fed');
  assert.deepEqual(Object.keys(outputFed).sort(), SOURCE_STATUS_KEYS);
  assert.equal(outputFed.status, 'error');
  assert.match(outputFed.error, /未包含原始错误详情/);
  assert.ok(!('attemptedAt' in outputFed));
  assert.ok(!('debug' in outputFed));

  const outputEvent = candidate.events.find(event => event.sourceId === 'fed');
  assert.deepEqual(Object.keys(outputEvent).sort(), EVENT_KEYS);
  assert.ok(!('privateNote' in outputEvent));
  assert.ok(outputEvent.facts.every(fact => !fact.includes('SECRET')));
});

test('recalculates counts after partial omission and keeps manifest totals honest', () => {
  const input = baseSnapshot();
  const firstFed = input.events.find(event => event.sourceId === 'fed');
  input.events.push(structuredClone({
    ...firstFed,
    id: 'event-fed-rejected',
    sources: [{ name: 'SECRET rejected', url: 'https://evil.example/press', publishedAt: capturedAt }],
  }));
  input.sources.find(source => source.id === 'fed').count = 2;

  const { snapshot: candidate, sources: manifest } = publicSnapshot(input);

  assert.doesNotThrow(() => validateSnapshot(candidate));
  const outputFed = candidate.sources.find(source => source.id === 'fed');
  const fedManifest = manifest.find(source => source.id === 'fed');
  assert.deepEqual([outputFed.count, fedManifest.kept, fedManifest.omitted], [1, 1, 1]);
  assert.equal(candidate.events.filter(event => event.sourceId === 'fed').length, 1);
  assert.deepEqual(candidate.events.filter(event => event.sourceId === 'fed').map(event => event.sources[0].url), [
    'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261112a.htm',
  ]);
});
