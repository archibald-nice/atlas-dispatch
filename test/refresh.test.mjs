import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import SOURCE_DEFINITIONS from '../scripts/sources.json' with { type: 'json' };
import { validateSnapshot } from '../src/domain.ts';

const project = fileURLToPath(new URL('../', import.meta.url));
const fedFixtureUrl = 'https://www.federalreserve.gov/newsevents/pressreleases/test.htm';
const nasaFeedUrl = SOURCE_DEFINITIONS.find(source => source.id === 'nasa').url;
const nasaFixtureUrl = 'https://www.nasa.gov/news-release/isolated-fixture/';
const malformedFixtureUrl = 'https://invalid.example/feed';
const malformedArticleUrl = 'https://invalid.example/article';

function rssFixture(guid, title, link) {
  return `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>Isolated fixture</title><item><guid>${guid}</guid><title>${title}</title><link>${link}</link><pubDate>Mon, 16 Nov 2026 10:00:00 GMT</pubDate><description>Isolated parser fixture, never published.</description></item></channel></rss>`;
}

function editJson(file, change) {
  return readFile(file, 'utf8').then(text => {
    const value = JSON.parse(text);
    change(value);
    return writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  });
}

async function runIsolatedRefresh(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-refresh-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scripts'));
  await mkdir(path.join(root, 'src/data'), { recursive: true });
  for (const file of ['scripts/refresh.mjs', 'scripts/adapters.mjs', 'scripts/sources.json', 'src/domain.ts', 'src/data/snapshot.json', 'src/data/editorial-overrides.json']) {
    await cp(path.join(project, file), path.join(root, file));
  }
  await symlink(path.join(project, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  const snapshotPath = path.join(root, 'src/data/snapshot.json');
  const overridesPath = path.join(root, 'src/data/editorial-overrides.json');
  const catalogPath = path.join(root, 'scripts/sources.json');
  if (options.mutate) await options.mutate({ root, snapshotPath, overridesPath, catalogPath });
  const before = await readFile(snapshotPath, 'utf8');
  const requestsPath = path.join(root, 'requests.jsonl');
  await writeFile(requestsPath, '');
  const preloadPath = path.join(root, 'offline-fetch.mjs');
  await writeFile(preloadPath, `
import { appendFileSync } from 'node:fs';
const fixtures = ${JSON.stringify(options.responses ?? {})};
globalThis.fetch = async url => {
  appendFileSync(${JSON.stringify(requestsPath)}, JSON.stringify(url) + '\\n');
  const body = fixtures[new URL(url).hostname];
  if (body) return new Response(body, { headers: { 'content-type': 'application/rss+xml' } });
  return new Response('Denied in isolated test', { status: 403 });
};
`);
  const result = await new Promise(resolve => {
    execFile(process.execPath, ['--import', preloadPath, path.join(root, 'scripts/refresh.mjs'), ...(options.args ?? [])], { timeout: 15_000 }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });
  const after = await readFile(snapshotPath, 'utf8');
  const requests = (await readFile(requestsPath, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
  return { before, after, requests, ...result };
}

test('listing the catalog and rejecting invalid source selections do not fetch or write', async t => {
  const listed = await runIsolatedRefresh(t, {
    args: ['--list'],
    mutate: ({ catalogPath }) => editJson(catalogPath, catalog => {
      const nasa = catalog.find(source => source.id === 'nasa');
      nasa.name = 'NASA catalog fixture';
      nasa.maxEvents = 3;
    }),
  });
  assert.equal(listed.code, 0, listed.stderr);
  assert.match(listed.stdout, /^nasa\tNASA catalog fixture\tfeed\t最多 3 条$/m);
  assert.deepEqual(listed.requests, []);
  assert.equal(listed.after, listed.before);
  for (const [args, diagnostic] of [
    [['--source', 'unknown'], /未知信源 ID/],
    [['--source'], /用法/],
  ]) {
    const rejected = await runIsolatedRefresh(t, { args });
    assert.equal(rejected.code, 1, rejected.stderr);
    assert.match(rejected.stderr, diagnostic);
    assert.deepEqual(rejected.requests, []);
    assert.equal(rejected.after, rejected.before);
  }
});

test('refreshing only NASA replaces its records and preserves all other source statuses and events', async t => {
  const result = await runIsolatedRefresh(t, {
    args: ['--source', 'nasa'],
    responses: { 'www.nasa.gov': rssFixture('isolated-nasa-release', 'NASA fixture', nasaFixtureUrl) },
    mutate: ({ snapshotPath }) => editJson(snapshotPath, snapshot => {
      const fed = snapshot.sources.find(source => source.id === 'fed');
      fed.status = 'error';
      fed.attemptedAt = '2026-11-18T00:00:00Z';
      fed.error = 'Retained after denied request in isolated fixture';
    }),
  });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.requests, [nasaFeedUrl]);
  const before = validateSnapshot(JSON.parse(result.before));
  const after = validateSnapshot(JSON.parse(result.after));
  assert.deepEqual(after.sources.filter(source => source.id !== 'nasa'), before.sources.filter(source => source.id !== 'nasa'));
  assert.deepEqual(after.events.filter(event => event.sourceId !== 'nasa'), before.events.filter(event => event.sourceId !== 'nasa'));
  assert.deepEqual(after.events.filter(event => event.sourceId === 'nasa').map(event => event.sources[0].url), [nasaFixtureUrl]);
  const nasa = after.sources.find(source => source.id === 'nasa');
  assert.equal(nasa.status, 'ok');
  assert.equal(nasa.count, 1);
  assert.notEqual(nasa.fetchedAt, before.sources.find(source => source.id === 'nasa').fetchedAt);
});

test('a denied single-source update leaves the whole snapshot byte-for-byte intact', async t => {
  const result = await runIsolatedRefresh(t, { args: ['--source', 'nasa'] });
  assert.equal(result.code, 1, result.stderr);
  assert.deepEqual(result.requests, [nasaFeedUrl]);
  assert.match(result.stderr, /所选信源 nasa 采集失败/);
  assert.equal(result.after, result.before);
});

test('single-source refresh refuses to fetch if it cannot safely preserve the previous snapshot', async t => {
  const result = await runIsolatedRefresh(t, {
    args: ['--source', 'nasa'],
    mutate: ({ snapshotPath }) => editJson(snapshotPath, snapshot => { snapshot.schemaVersion = 99; }),
  });
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /单源更新需要有效的旧快照/);
  assert.deepEqual(result.requests, []);
  assert.equal(result.after, result.before);
});

test('all denied sources leave the existing snapshot byte-for-byte intact without retries', async t => {
  const result = await runIsolatedRefresh(t);
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.after, result.before);
  assert.equal(result.requests.length, SOURCE_DEFINITIONS.length);
  assert.equal(new Set(result.requests).size, SOURCE_DEFINITIONS.length);
});

test('partial refresh retains failed-source events and original collection timestamps', async t => {
  const result = await runIsolatedRefresh(t, { responses: { 'www.federalreserve.gov': rssFixture('isolated-policy-release', 'Test policy release', fedFixtureUrl) } });
  assert.equal(result.code, 0, result.stderr);
  const before = validateSnapshot(JSON.parse(result.before));
  const after = validateSnapshot(JSON.parse(result.after));
  assert.equal(result.requests.length, SOURCE_DEFINITIONS.length);
  assert.equal(after.sources.length, SOURCE_DEFINITIONS.length);
  const fed = after.sources.find(source => source.id === 'fed');
  assert.equal(fed.status, 'ok');
  assert.equal(fed.count, 1);
  assert.equal(after.events.filter(event => event.sourceId === 'fed')[0].sources[0].url, fedFixtureUrl);
  for (const source of before.sources.filter(source => source.id !== 'fed')) {
    const retained = after.sources.find(item => item.id === source.id);
    assert.equal(retained.status, 'error');
    assert.equal(retained.fetchedAt, source.fetchedAt);
    assert.equal(typeof retained.attemptedAt, 'string');
    assert.ok(Number.isFinite(Date.parse(retained.attemptedAt)));
    assert.match(retained.error, /403/);
    assert.deepEqual(after.events.filter(event => event.sourceId === source.id), before.events.filter(event => event.sourceId === source.id));
  }
});

test('changed editorial overrides never rewrite retained failed-source events', async t => {
  const result = await runIsolatedRefresh(t, {
    responses: { 'www.federalreserve.gov': rssFixture('isolated-policy-release', 'Test policy release', fedFixtureUrl) },
    mutate: async ({ snapshotPath, overridesPath }) => {
      const oldSnapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
      const oldEvent = oldSnapshot.events.find(event => event.sourceId !== 'fed');
      assert.ok(oldEvent);
      await editJson(overridesPath, overrides => {
        overrides.entries[oldEvent.sources[0].url] = {
          title: 'Mutated old title',
          summary: 'Mutated old summary.',
          facts: ['Mutated old fact one.', 'Mutated old fact two.'],
        };
        overrides.entries[fedFixtureUrl] = {
          title: 'Edited new title',
          summary: 'Edited new summary.',
          facts: ['Edited new fact one.', 'Edited new fact two.'],
        };
      });
    },
  });
  assert.equal(result.code, 0, result.stderr);
  const before = validateSnapshot(JSON.parse(result.before));
  const after = validateSnapshot(JSON.parse(result.after));
  const oldEvent = before.events.find(event => event.sourceId !== 'fed');
  assert.deepEqual(after.events.find(event => event.id === oldEvent.id), oldEvent);
  const fedEvent = after.events.find(event => event.sourceId === 'fed');
  assert.equal(fedEvent.sources[0].url, fedFixtureUrl);
  assert.equal(fedEvent.title, 'Edited new title');
  assert.equal(fedEvent.summary, 'Edited new summary.');
  assert.equal(fedEvent.summaryMode, 'editorial');
  assert.deepEqual(fedEvent.facts, ['Edited new fact one.', 'Edited new fact two.']);
});

test('new data that fails snapshot validation never overwrites a valid snapshot', async t => {
  const result = await runIsolatedRefresh(t, {
    responses: { 'invalid.example': rssFixture('malformed-fixture-item', 'Malformed fixture item', malformedArticleUrl) },
    mutate: ({ catalogPath }) => editJson(catalogPath, catalog => {
      catalog.unshift({
        id: 'malformed-fixture',
        name: 'Malformed fixture',
        shortName: 'Malformed fixture',
        url: malformedFixtureUrl,
        policyUrl: 'https://invalid.example/policy',
        rights: 'Isolated malformed fixture; never published.',
        theme: 'earth',
        kind: 'fixture',
        maxEvents: 1,
        format: 'feed',
        publisherLocation: {
          label: 'Out-of-range fixture location',
          lat: 999,
          lon: 0,
          evidence: 'Isolated fixture coordinate deliberately outside the valid range.',
        },
      });
    }),
  });
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.after, result.before);
  assert.equal(result.requests.length, SOURCE_DEFINITIONS.length + 1);
  assert.match(result.stderr, /新快照未通过 schemaVersion 1 校验/);
});

test('invalid old snapshots are not retained as trusted data', async t => {
  const result = await runIsolatedRefresh(t, {
    responses: { 'www.federalreserve.gov': rssFixture('isolated-policy-release', 'Test policy release', fedFixtureUrl) },
    mutate: ({ snapshotPath }) => editJson(snapshotPath, snapshot => {
      snapshot.events[0].sources[0].url = 'http://insecure.example/article';
    }),
  });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stderr, /旧快照未通过 schemaVersion 1 校验/);
  const after = validateSnapshot(JSON.parse(result.after));
  assert.equal(after.events.length, 1);
  assert.equal(after.events[0].sourceId, 'fed');
  for (const source of after.sources.filter(item => item.id !== 'fed')) {
    assert.equal(source.status, 'error');
    assert.equal(source.count, 0);
    assert.equal(after.events.filter(event => event.sourceId === source.id).length, 0);
  }
});
