import http from 'node:http';
import dns from 'node:dns/promises';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeUrl, discoverFeedUrl, fetchText, parseSource } from './adapters.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const HOST = '127.0.0.1';
const PORT = Number(process.env.ATLAS_COMPANION_PORT || 5174);
const MAX_JSON_BODY = 64 * 1024;

/**
 * Returns true if an IPv4 or IPv6 address belongs to loopback, private, link-local, or reserved ranges.
 */
export function isBlockedIp(rawIp) {
  if (typeof rawIp !== 'string') return true;
  let ip = rawIp.trim().toLowerCase();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
    return false;
  }
  if (version === 6) {
    const bare = ip.split('%')[0];
    if (bare === '::' || bare === '::1') return true;
    if (bare.startsWith('fc') || bare.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(bare)) return true;
    if (bare.startsWith('ff')) return true;
    return false;
  }
  return true;
}

/**
 * Validates that a target URL is HTTPS on default port and resolves exclusively to public IPs.
 */
export async function assertSafePublicUrl(rawUrl, lookupFn = dns.lookup) {
  const canonical = canonicalizeUrl(rawUrl);
  if (!canonical) throw new Error('仅支持有效的 HTTPS 地址。');
  const url = new URL(canonical);
  if (url.port && url.port !== '443') throw new Error('仅允许标准 HTTPS (443) 端口。');
  if (net.isIP(url.hostname)) {
    if (isBlockedIp(url.hostname)) throw new Error('禁止访问本地或内网 IP 地址。');
    return url.href;
  }
  const records = await lookupFn(url.hostname, { all: true });
  const list = Array.isArray(records) ? records : [records];
  if (!list.length || list.some(r => isBlockedIp(r?.address))) {
    throw new Error('目标域名解析到非公网 IP，已拦截。');
  }
  return url.href;
}

/**
 * Fetches a feed (or HTML page with <link rel="alternate"> RSS/Atom/JSON Feed) and parses it via adapters.
 */
export async function resolveAndParseFeed(payload, deps = {}) {
  const fetchFn = deps.fetchText ?? fetchText;
  const lookupFn = deps.lookup ?? dns.lookup;
  const safeUrl = await assertSafePublicUrl(payload?.url, lookupFn);
  const format = ['feed', 'json-feed', 'geojson', 'eonet', 'gdacs'].includes(payload?.format)
    ? payload.format
    : 'auto';

  let targetUrl = safeUrl;
  let raw = await fetchFn(targetUrl);
  let discoveredUrl = null;
  if (/^\s*<(?:!doctype|html)\b/i.test(raw)) {
    const found = discoverFeedUrl(raw, targetUrl);
    if (!found) throw new Error('该网页未声明可识别的 RSS / Atom / JSON Feed 订阅链接。');
    discoveredUrl = await assertSafePublicUrl(found, lookupFn);
    targetUrl = discoveredUrl;
    raw = await fetchFn(targetUrl);
  }

  let resolvedFormat = format;
  if (resolvedFormat === 'auto') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      const json = JSON.parse(trimmed);
      if (Array.isArray(json.events)) resolvedFormat = 'eonet';
      else if (Array.isArray(json.features)) resolvedFormat = 'geojson';
      else if (Array.isArray(json.items)) resolvedFormat = 'json-feed';
      else throw new Error('无法识别的 JSON 订阅结构。');
    } else if (/<gdacs:/i.test(trimmed)) {
      resolvedFormat = 'gdacs';
    } else {
      resolvedFormat = 'feed';
    }
  }

  const host = new URL(targetUrl).hostname;
  const name = (typeof payload?.name === 'string' && payload.name.trim()) || host;
  const theme = ['earth', 'economy', 'ai', 'space'].includes(payload?.theme) ? payload.theme : 'earth';
  const tags = typeof payload?.tag === 'string' && payload.tag.trim() ? [payload.tag.trim().slice(0, 32)] : [];
  const pub = payload?.publisherLocation;
  const publisherLocation = pub && typeof pub.label === 'string' && pub.label.trim()
    && Number.isFinite(Number(pub.lat)) && Math.abs(Number(pub.lat)) <= 90
    && Number.isFinite(Number(pub.lon)) && Math.abs(Number(pub.lon)) <= 180
    ? {
        label: pub.label.trim(),
        lat: Number(pub.lat),
        lon: Number(pub.lon),
        evidence: `用户为 ${name} 声明的发布机构所在地；不表示事件发生地。`,
      }
    : undefined;

  const definition = {
    id: typeof payload?.id === 'string' && payload.id.trim() ? payload.id.trim().slice(0, 48) : `custom-${host}`,
    name,
    shortName: name,
    url: targetUrl,
    policyUrl: targetUrl,
    rights: `本地伴侣接入信源 (${targetUrl})。对外分发前请另行核实来源使用条款。`,
    theme,
    kind: tags[0] || '自定义信源',
    maxEvents: Math.min(40, Math.max(1, Number(payload?.maxEvents) || 15)),
    format: resolvedFormat,
    ...(tags.length ? { tags } : {}),
    ...(publisherLocation ? { publisherLocation } : {}),
  };

  const events = parseSource(raw, definition);
  const now = new Date().toISOString();
  const source = {
    id: definition.id,
    name: definition.name,
    url: definition.url,
    policyUrl: definition.policyUrl,
    rights: definition.rights,
    status: 'ok',
    fetchedAt: now,
    attemptedAt: now,
    count: events.length,
    error: null,
  };
  return { ok: true, discoveredUrl, format: resolvedFormat, feedTitle: name, source, events };
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

if (import.meta.main) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
      if (req.method === 'GET' && url.pathname === '/api/atlas-companion/health') {
        return sendJson(res, 200, { ok: true, mode: 'companion', version: 1 });
      }
      if (req.method === 'POST' && url.pathname === '/api/atlas-companion/fetch') {
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_JSON_BODY) return sendJson(res, 413, { ok: false, error: '请求体过大。' });
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const result = await resolveAndParseFeed(body);
        return sendJson(res, 200, result);
      }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      sendJson(res, 404, { ok: false, error: 'Not found' });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
  server.listen(PORT, HOST, () => {
    console.log(`Atlas Companion listening at http://${HOST}:${PORT}/ (local-only, Ctrl+C to stop)`);
  });
}
