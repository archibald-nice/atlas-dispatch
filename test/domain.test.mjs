import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot } from '../src/domain.ts';

const capturedAt = '2026-11-17T12:00:00.000Z';
function snapshot() {
  return {
    schemaVersion: 1, generatedAt: capturedAt,
    sources: [{ id: 'source', name: 'Public source', url: 'https://example.org/feed', policyUrl: 'https://example.org/policy', rights: 'Fixture', status: 'ok', fetchedAt: capturedAt, count: 1, error: null }],
    events: [{ id: 'event', title: 'Fixture event', titleOriginal: 'Fixture event', summary: 'Fixture description', theme: 'earth', kind: 'Observation', publishedAt: capturedAt, occurredAt: capturedAt, locations: [{ lat: 35, lon: 120, label: 'Source coordinates', relation: 'event', precision: 'point', evidence: 'Fixture' }], sources: [{ name: 'Public source', url: 'https://example.org/event', publishedAt: capturedAt }], facts: [], sourceId: 'source', summaryMode: 'metadata' }],
  };
}

test('rejects unsafe or credential-bearing article links before importing', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,unsafe', 'http://example.org/event', 'https://user:private@example.org/event']) {
    const next = snapshot();
    next.events[0].sources[0].url = url;
    assert.throws(() => validateSnapshot(next), /HTTPS/);
  }
});

test('rejects prototype names as themes and numeric dates that parse ambiguously', () => {
  for (const theme of ['__proto__', 'constructor', 'toString']) {
    const next = snapshot(); next.events[0].theme = theme;
    assert.throws(() => validateSnapshot(next), /事件字段/);
  }
  const next = snapshot(); next.events[0].publishedAt = 0;
  assert.throws(() => validateSnapshot(next), /事件字段/);
});

test('rejects invalid geographic relationships and duplicate or dangling identities', () => {
  const badLocation = snapshot(); badLocation.events[0].locations[0].lat = 91;
  assert.throws(() => validateSnapshot(badLocation), /坐标越界/);
  const duplicate = snapshot(); duplicate.events.push(structuredClone(duplicate.events[0]));
  assert.throws(() => validateSnapshot(duplicate), /ID 重复/);
  const dangling = snapshot(); dangling.events[0].sourceId = 'missing';
  assert.throws(() => validateSnapshot(dangling), /不存在的信源/);
  const duplicateSource = snapshot(); duplicateSource.sources.push(structuredClone(duplicateSource.sources[0]));
  assert.throws(() => validateSnapshot(duplicateSource), /信源 ID 不能重复/);
});

test('rejects inconsistent source counts and invalid attempt timestamps', () => {
  const wrongCount = snapshot(); wrongCount.sources[0].count = 2;
  assert.throws(() => validateSnapshot(wrongCount), /数量与事件不一致/);
  const badAttempt = snapshot(); badAttempt.sources[0].attemptedAt = 'not a date';
  assert.throws(() => validateSnapshot(badAttempt), /尝试时间无效/);
});
