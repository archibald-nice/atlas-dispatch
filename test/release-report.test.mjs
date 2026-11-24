import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSnapshots, formatReleaseReport } from '../scripts/release-report.mjs';
import { validateSnapshot } from '../src/domain.ts';

const GENERATED_AT = '2026-11-24T10:00:00.000Z';
const OLD_FETCH = '2026-11-18T08:00:00.000Z';
const OLD_ATTEMPT = '2026-11-18T07:59:00.000Z';
const NEW_ATTEMPT = '2026-11-24T09:59:00.000Z';

function source(id, overrides = {}) {
  return {
    id,
    name: `测试信源 ${id}`,
    url: `https://example.com/${id}`,
    policyUrl: `https://example.com/${id}/policy`,
    rights: '仅用于隔离测试，不对外分发。',
    status: 'ok',
    fetchedAt: OLD_FETCH,
    attemptedAt: OLD_ATTEMPT,
    count: 0,
    error: null,
    ...overrides,
  };
}

function event(id, sourceId, overrides = {}) {
  return {
    id,
    title: `标题 ${id}`,
    titleOriginal: `Title ${id}`,
    summary: `摘要 ${id}`,
    theme: 'earth',
    kind: '测试',
    publishedAt: '2026-11-20T00:00:00.000Z',
    occurredAt: null,
    locations: [],
    sources: [{
      name: `来源 ${id}`,
      url: `https://example.com/articles/${id}`,
      publishedAt: '2026-11-20T00:00:00.000Z',
    }],
    facts: [`事实 ${id}`],
    sourceId,
    summaryMode: 'metadata',
    ...overrides,
  };
}

function snapshot(sources, events, generatedAt = GENERATED_AT) {
  const counts = new Map();
  for (const item of events) counts.set(item.sourceId, (counts.get(item.sourceId) ?? 0) + 1);
  return validateSnapshot({
    schemaVersion: 1,
    generatedAt,
    sources: sources.map(item => ({ ...item, count: counts.get(item.id) ?? 0 })),
    events,
  });
}

function eventIds(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
}

test('partial failure retains unchanged errored records and keeps the prior success time', () => {
  const events = eventIds('fed', 3).map(id => event(id, 'fed'));
  const previous = snapshot([source('fed')], events);
  const candidate = snapshot([
    source('fed', {
      status: 'error',
      fetchedAt: OLD_FETCH,
      attemptedAt: NEW_ATTEMPT,
      error: '网络超时',
    }),
  ], events);

  const report = compareSnapshots(previous, candidate);
  assert.deepEqual(Object.keys(report), ['sources', 'warnings']);
  assert.equal(report.sources.length, 1);

  const row = report.sources[0];
  assert.deepEqual(Object.keys(row), [
    'id', 'previousCount', 'count', 'added', 'removed', 'changed',
    'retained', 'unchanged', 'lastSuccessAt', 'attemptedAt', 'status',
  ]);
  assert.deepEqual(row, {
    id: 'fed',
    previousCount: 3,
    count: 3,
    added: 0,
    removed: 0,
    changed: 0,
    retained: 3,
    unchanged: 0,
    lastSuccessAt: OLD_FETCH,
    attemptedAt: NEW_ATTEMPT,
    status: 'error',
  });

  assert.equal(report.warnings.length, 1);
  assert.deepEqual(Object.keys(report.warnings[0]), ['sourceId', 'code', 'message']);
  assert.equal(report.warnings[0].sourceId, 'fed');
  assert.equal(report.warnings[0].code, 'failed');
  assert.match(report.warnings[0].message, /保留上次成功采集的 3 条记录/);
});

test('a first failure without retained data reports no forged success time', () => {
  const candidate = snapshot([
    source('broken', {
      status: 'error',
      fetchedAt: NEW_ATTEMPT,
      attemptedAt: NEW_ATTEMPT,
      error: '首次访问失败',
    }),
  ], []);

  const report = compareSnapshots(null, candidate);
  assert.deepEqual(report.sources[0], {
    id: 'broken',
    previousCount: 0,
    count: 0,
    added: 0,
    removed: 0,
    changed: 0,
    retained: 0,
    unchanged: 0,
    lastSuccessAt: null,
    attemptedAt: NEW_ATTEMPT,
    status: 'error',
  });
  assert.equal(report.warnings.length, 1);
  assert.equal(report.warnings[0].code, 'failed');
  assert.match(report.warnings[0].message, /没有可保留的旧记录/);
});

test('a candidate already carrying retained error data without a baseline is not reported as empty', () => {
  const keptEvents = eventIds('kept', 3).map(id => event(id, 'kept'));
  const candidate = snapshot([
    source('kept', {
      status: 'error',
      fetchedAt: OLD_FETCH,
      attemptedAt: NEW_ATTEMPT,
      error: '网络超时',
    }),
  ], keptEvents);

  const report = compareSnapshots(null, candidate);
  assert.deepEqual(report.sources[0], {
    id: 'kept',
    previousCount: 0,
    count: 3,
    added: 0,
    removed: 0,
    changed: 0,
    retained: 3,
    unchanged: 0,
    lastSuccessAt: OLD_FETCH,
    attemptedAt: NEW_ATTEMPT,
    status: 'error',
  });
  assert.equal(report.warnings.length, 1);
  assert.equal(report.warnings[0].code, 'failed');
  assert.match(report.warnings[0].message, /保留上次成功采集的 3 条记录/);
  assert.doesNotMatch(report.warnings[0].message, /没有可保留的旧记录/);
});

test('a catalog-removed source keeps its prior timestamps and warns once without a false drop', () => {
  const usgsEvents = eventIds('usgs', 4).map(id => event(id, 'usgs'));
  const nasaEvents = eventIds('nasa', 2).map(id => event(id, 'nasa'));
  const previous = snapshot([source('usgs'), source('nasa')], [...usgsEvents, ...nasaEvents]);
  const candidate = snapshot([source('nasa')], nasaEvents);

  const report = compareSnapshots(previous, candidate);
  assert.deepEqual(report.sources.map(row => row.id), ['usgs', 'nasa']);

  const removed = report.sources[0];
  assert.deepEqual(removed, {
    id: 'usgs',
    previousCount: 4,
    count: 0,
    added: 0,
    removed: 4,
    changed: 0,
    retained: 0,
    unchanged: 0,
    lastSuccessAt: OLD_FETCH,
    attemptedAt: OLD_ATTEMPT,
    status: 'removed',
  });
  assert.equal(report.sources[1].status, 'ok');
  assert.equal(report.sources[1].unchanged, 2);

  assert.equal(report.warnings.length, 1);
  assert.equal(report.warnings[0].sourceId, 'usgs');
  assert.equal(report.warnings[0].code, 'removed');
  assert.match(report.warnings[0].message, /上期 4 条记录不再提供/);
});

test('ordinary churn reports added and removed per source without a sharp-drop warning', () => {
  const previousEvents = eventIds('churn', 8).map(id => event(id, 'churn'));
  const candidateEvents = [
    ...previousEvents.slice(0, 5),
    event('churn-new', 'churn'),
  ];
  const previous = snapshot([source('churn')], previousEvents);
  const candidate = snapshot([source('churn')], candidateEvents);

  const report = compareSnapshots(previous, candidate);
  assert.deepEqual(report.sources[0], {
    id: 'churn',
    previousCount: 8,
    count: 6,
    added: 1,
    removed: 3,
    changed: 0,
    retained: 0,
    unchanged: 5,
    lastSuccessAt: OLD_FETCH,
    attemptedAt: OLD_ATTEMPT,
    status: 'ok',
  });
  assert.deepEqual(report.warnings, []);
});

test('a successful source dropping from 8 to 1 triggers a sharp-drop warning', () => {
  const previousEvents = eventIds('drop', 8).map(id => event(id, 'drop'));
  const previous = snapshot([source('drop')], previousEvents);
  const candidate = snapshot([source('drop')], [event('drop-new', 'drop')]);

  const report = compareSnapshots(previous, candidate);
  assert.equal(report.sources[0].previousCount, 8);
  assert.equal(report.sources[0].count, 1);
  assert.equal(report.sources[0].added, 1);
  assert.equal(report.sources[0].removed, 8);
  assert.equal(report.sources[0].status, 'ok');
  assert.equal(report.warnings.length, 1);
  assert.equal(report.warnings[0].code, 'sharp-drop');
  assert.match(report.warnings[0].message, /从 8 条降至 1 条/);
});

test('no baseline for a successful source means no sharp-drop anomaly and every record is added', () => {
  const candidateEvents = eventIds('fresh', 8).map(id => event(id, 'fresh'));
  const candidate = snapshot([source('fresh')], candidateEvents);

  const report = compareSnapshots(null, candidate);
  assert.deepEqual(report.sources[0], {
    id: 'fresh',
    previousCount: 0,
    count: 8,
    added: 8,
    removed: 0,
    changed: 0,
    retained: 0,
    unchanged: 0,
    lastSuccessAt: OLD_FETCH,
    attemptedAt: OLD_ATTEMPT,
    status: 'ok',
  });
  assert.deepEqual(report.warnings, []);
});

test('an editorial change with the same event id is changed, not unchanged', () => {
  const stable = event('stable-1', 'news');
  const previous = snapshot([source('news')], [
    event('edited-1', 'news', { summary: '旧编辑摘要', summaryMode: 'editorial' }),
    stable,
  ]);
  const candidate = snapshot([source('news')], [
    event('edited-1', 'news', { summary: '新编辑摘要', summaryMode: 'editorial' }),
    stable,
  ]);

  const report = compareSnapshots(previous, candidate);
  assert.equal(report.sources[0].previousCount, 2);
  assert.equal(report.sources[0].count, 2);
  assert.equal(report.sources[0].added, 0);
  assert.equal(report.sources[0].removed, 0);
  assert.equal(report.sources[0].changed, 1);
  assert.equal(report.sources[0].unchanged, 1);
  assert.equal(report.sources[0].retained, 0);
  assert.deepEqual(report.warnings, []);
});

test('previous source order is preserved and candidate-only sources are appended', () => {
  const zetaEvent = event('zeta-1', 'zeta');
  const previous = snapshot([source('zeta')], [zetaEvent]);
  const candidate = snapshot([
    source('alpha'),
    source('zeta'),
  ], [event('alpha-1', 'alpha'), zetaEvent]);

  const report = compareSnapshots(previous, candidate);
  assert.deepEqual(report.sources.map(row => row.id), ['zeta', 'alpha']);
  assert.deepEqual(report.sources[0], {
    id: 'zeta',
    previousCount: 1,
    count: 1,
    added: 0,
    removed: 0,
    changed: 0,
    retained: 0,
    unchanged: 1,
    lastSuccessAt: OLD_FETCH,
    attemptedAt: OLD_ATTEMPT,
    status: 'ok',
  });
  assert.equal(report.sources[1].previousCount, 0);
  assert.equal(report.sources[1].added, 1);
});

test('the plain-text report includes columns, timestamps, removals and warnings', () => {
  const fedEvents = eventIds('fed', 2).map(id => event(id, 'fed'));
  const usgsEvents = eventIds('usgs', 4).map(id => event(id, 'usgs'));
  const previous = snapshot([source('usgs'), source('fed')], [...usgsEvents, ...fedEvents]);
  const candidate = snapshot([
    source('fed', {
      status: 'error',
      fetchedAt: OLD_FETCH,
      attemptedAt: NEW_ATTEMPT,
      error: '网络超时',
    }),
  ], fedEvents);

  const report = compareSnapshots(previous, candidate);
  assert.deepEqual(report.sources.map(row => row.id), ['usgs', 'fed']);
  const text = formatReleaseReport(report);

  assert.match(text, /^环讯 Atlas 快照发布报告\n/);
  assert.match(text, /信源：2 个；上期记录：6 条；本期记录：2 条；警告：2 条。/);
  assert.match(text, /信源\s+状态\s+上次成功采集\s+最近尝试\s+上期\s+本期\s+新增\s+移除\s+变更\s+保留\s+未变/);
  assert.match(text, /usgs\s+已移除\s+2026-11-18T08:00:00\.000Z\s+2026-11-18T07:59:00\.000Z\s+4\s+0/);
  assert.match(text, /fed\s+失败\s+2026-11-18T08:00:00\.000Z\s+2026-11-24T09:59:00\.000Z\s+2\s+2\s+0\s+0\s+0\s+2\s+0/);
  assert.match(text, /移除的信源：usgs/);
  assert.match(text, /- \[removed\] 信源 usgs/);
  assert.match(text, /- \[failed\] 信源 fed .*保留上次成功采集的 2 条记录/);
  assert.ok(text.endsWith('\n'));
});
