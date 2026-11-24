import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverFeedUrl, parseJsonFeed, parseSource } from '../scripts/adapters.mjs';
import { assertSafePublicUrl, isBlockedIp, resolveAndParseFeed } from '../scripts/companion.mjs';

test('companion SSRF guard blocks loopback, private, link-local, and non-public DNS targets', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.1.1', '192.168.1.10', '169.254.169.254', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1']) {
    assert.equal(isBlockedIp(ip), true, `Expected ${ip} to be blocked`);
  }
  assert.equal(isBlockedIp('93.184.216.34'), false);
  await assert.rejects(() => assertSafePublicUrl('http://127.0.0.1/feed'), /HTTPS|内网|本地/);
  await assert.rejects(() => assertSafePublicUrl('https://internal.example/feed', async () => [{ address: '10.2.3.4' }]), /非公网/);
  const okUrl = await assertSafePublicUrl('https://example.org/feed.xml', async () => [{ address: '93.184.216.34' }]);
  assert.equal(okUrl, 'https://example.org/feed.xml');
});

test('discoverFeedUrl, parseJsonFeed, GeoRSS, and companion HTML-to-RSS resolution work together', async () => {
  const html = '<!doctype html><html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head></html>';
  assert.equal(discoverFeedUrl(html, 'https://example.org/blog/'), 'https://example.org/feed.xml');

  const rssWithGeo = `<?xml version="1.0"?><rss version="2.0" xmlns:georss="http://www.georss.org/georss"><channel><title>GeoNews</title>
    <item><title>Port Alert</title><link>https://example.org/1</link><pubDate>Tue, 24 Nov 2026 10:00:00 GMT</pubDate><georss:point>51.92 4.47</georss:point></item>
  </channel></rss>`;
  const result = await resolveAndParseFeed(
    { url: 'https://example.org/blog/', theme: 'earth', tag: 'ports' },
    {
      lookup: async () => [{ address: '93.184.216.34' }],
      fetchText: async url => (url.endsWith('/blog/') ? html : rssWithGeo),
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.discoveredUrl, 'https://example.org/feed.xml');
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].locations[0].relation, 'event');
  assert.deepEqual(result.events[0].tags, ['ports']);

  const jf = parseJsonFeed({
    version: 'https://jsonfeed.org/version/1.1',
    items: [{ id: '1', url: 'https://example.org/a', title: 'JF Item', date_published: '2026-11-24T10:00:00Z' }],
  });
  assert.equal(jf.length, 1);
  const events = parseSource(JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    items: [{ id: '1', url: 'https://example.org/a', title: 'JF Item', date_published: '2026-11-24T10:00:00Z' }],
  }), { id: 'jf', name: 'JF', shortName: 'JF', url: 'https://example.org/feed.json', theme: 'ai', kind: 'JSON Feed', format: 'json-feed', tags: ['open-ai'] });
  assert.deepEqual(events[0].tags, ['open-ai']);
});
