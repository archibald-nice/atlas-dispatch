import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSource, parseSource } from '../scripts/adapters.mjs';
import SOURCE_DEFINITIONS from '../scripts/sources.json' with { type: 'json' };

const definition = SOURCE_DEFINITIONS.find(source => source.id === 'gemma');

// Short Apache-2.0 excerpts from google-gemma/docs, docs/models/releases.md.
// Atlas fixture modifications: shortened history and repeated/invalid sections for isolated regressions.
const releases = `This page documents releases for the Gemma family of models.
## October 6, 2026
- Release of [EmbeddingGemma 2](embeddinggemma/model-card-v2.md).
## June 3, 2026
- Release of [Gemma 4 12B Unified](gemma-4/index.md).
## April 16, 2026
- Release of [Gemma 4 - MTP](../get-started/capabilities/mtp.md) for E2B, E4B, 31B, and 26B A4B.
## March 31, 2026
- Release of [Gemma 4](gemma-4/index.md) in E2B, E4B, 31B and 26B A4B sizes.
## December 19, 2025
- Release of [Gemma Scope 2](gemma-scope/index.md), an interpretability suite for Gemma 3 models.
## October 16, 2024
- Release of the Personal AI code assistant developer guide.
`;

test('official model release records retain source calendar dates without invented times or locations', () => {
  const events = parseSource(releases, definition);
  assert.deepEqual(events.map(event => event.title), ['EmbeddingGemma 2 发布', 'Gemma 4 12B Unified 发布', 'Gemma 4 发布']);
  assert.deepEqual(events.map(event => event.publishedAt), ['2026-10-06', '2026-06-03', '2026-03-31']);
  for (const event of events) {
    assert.equal(event.kind, '官方模型发布');
    assert.equal(event.occurredAt, null);
    assert.deepEqual(event.locations, []);
    assert.equal(event.summaryMode, 'source');
    assert.match(event.facts.join(' '), /时刻与时区未提供/);
    assert.match(event.sources[1].url, /^https:\/\/github.com\/google-gemma\/docs\/blob\/main\/docs\/models\/releases.md#/);
    assert.equal(event.sources[0].publishedAt, event.publishedAt);
  }
  assert.equal(events[0].sources[0].url, 'https://gemma.ai/models/releases/#october-6-2026');
});

test('release identity survives wording corrections and does not merge different release days', () => {
  const original = parseSource(releases, definition);
  const corrected = parseSource(releases.replace('in E2B, E4B, 31B and 26B A4B sizes.', 'in E2B and E4B sizes.'), definition);
  assert.equal(original[2].id, corrected[2].id);
  assert.notEqual(original[1].id, original[2].id);
  const duplicate = parseSource(releases + '\n## October 6, 2026\n- Release of [EmbeddingGemma 2](embeddinggemma/model-card-v2.md).', definition);
  assert.deepEqual(duplicate, original);
});

test('malformed date sections and unsafe links cannot borrow a previous valid release date', () => {
  const events = parseSource(`## October 6, 2026
- Release of [EmbeddingGemma 2](embeddinggemma/model-card-v2.md).
## February 31, 2026
- Release of [Gemma 4](gemma-4/index.md).
## Unconfirmed
- Release of [Gemma 3](gemma-3/index.md).
## June 3, 2026
- Release of [Gemma 4](javascript:unsafe).
`, definition);
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'EmbeddingGemma 2 发布');
});

test('unrecognized release source format is a collection failure, not empty fresh data', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Changed document without any dated release entries'));
  const result = await collectSource(definition);
  assert.equal(result.status.status, 'error');
  assert.deepEqual(result.events, []);
  assert.match(result.status.error, /未解析到/);
});
