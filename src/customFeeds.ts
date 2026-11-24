import { normalizeTag, safeExternalUrl } from './domain.ts';
import type { GeoReference, NewsEvent, SourceStatus, ThemeId } from './domain.ts';

export type CustomFeedFormat = 'auto' | 'feed' | 'json-feed' | 'geojson' | 'eonet';

export interface CustomPublisherLocation {
  label: string;
  lat: number;
  lon: number;
}

export interface CustomSourceConfig {
  id: string;
  name: string;
  url: string;
  format: CustomFeedFormat;
  theme: ThemeId;
  tag: string;
  publisherLocation?: CustomPublisherLocation;
  maxEvents: number;
}

export interface CustomFeedState {
  configs: CustomSourceConfig[];
  sources: SourceStatus[];
  events: NewsEvent[];
}

export interface OpmlEntry {
  name: string;
  url: string;
  tag: string;
}

export type FetchCustomResult =
  | { ok: true; source: SourceStatus; events: NewsEvent[]; config: CustomSourceConfig; discoveredUrl?: string }
  | { ok: false; corsBlocked: boolean; message: string };

export const CUSTOM_STORAGE_KEY = 'atlas-custom-sources-v1';
const MAX_FETCH_BYTES = 4 * 1024 * 1024;
const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'dclid', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi', 'igshid', 'ref_src', 'ref_url', 'cmpid',
]);

function hashId(prefix: string, basis: string): string {
  let h = 2166136261;
  for (let i = 0; i < basis.length; i++) {
    h ^= basis.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${prefix}-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

export function canonicalizeFeedUrl(raw: string, baseUrl?: string): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let parsed: URL;
  try {
    parsed = baseUrl ? new URL(raw.trim(), baseUrl) : new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol === 'http:') parsed.protocol = 'https:';
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.href.length > 2048) return null;
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower) || lower.startsWith('utm_')) parsed.searchParams.delete(key);
  }
  parsed.searchParams.sort();
  return parsed.href;
}

function decodeXmlEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', middot: '·',
  };
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16) || 32))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10) || 32))
    .replace(/&([a-z][a-z0-9]+);/gi, (m, name) => named[name.toLowerCase()] ?? m);
}

function stripTags(raw: string): string {
  const withoutCdata = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const decoded = decodeXmlEntities(withoutCdata);
  return decoded
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?[a-z][a-z0-9:-]*(?:\s[^<>]*)?\/?>/gi, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(raw: string, limit: number): string {
  const text = stripTags(raw);
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit * 0.7 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function validDateIso(raw: string): string | null {
  const clean = stripTags(raw);
  if (!clean) return null;
  const ts = Date.parse(clean);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function readTagText(block: string, ...tagNames: string[]): string {
  for (const name of tagNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`<(?:[a-z0-9_-]+:)?${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-z0-9_-]+:)?${escaped}>`, 'i');
    const match = re.exec(block);
    if (match?.[1]) return match[1];
  }
  return '';
}

function readAttr(attrs: string, ...names: string[]): string {
  for (const name of names) {
    const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
    const match = re.exec(attrs);
    if (match) return decodeXmlEntities(match[1] ?? match[2] ?? '').trim();
  }
  return '';
}

function extractXmlGeo(block: string): { lat: number; lon: number } | null {
  const georss = readTagText(block, 'point');
  if (georss) {
    const parts = stripTags(georss).split(/\s+/);
    if (parts.length >= 2) {
      const lat = Number(parts[0]);
      const lon = Number(parts[1]);
      if (Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180) {
        return { lat, lon };
      }
    }
  }
  const latStr = readTagText(block, 'lat');
  const lonStr = readTagText(block, 'long', 'lon');
  if (latStr && lonStr) {
    const lat = Number(stripTags(latStr));
    const lon = Number(stripTags(lonStr));
    if (Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180) {
      return { lat, lon };
    }
  }
  return null;
}

function extractAtomLink(entry: string, baseUrl: string): string | null {
  const links = [...entry.matchAll(/<link\b([^>]*)\/?>/gi)];
  let fallback: string | null = null;
  for (const m of links) {
    const attrs = m[1];
    const href = canonicalizeFeedUrl(readAttr(attrs, 'href'), baseUrl);
    if (!href) continue;
    const rel = readAttr(attrs, 'rel');
    if (!rel || rel === 'alternate') return href;
    if (!fallback) fallback = href;
  }
  return fallback;
}

function publisherGeo(config: CustomSourceConfig): GeoReference[] {
  const loc = config.publisherLocation;
  if (!loc || !loc.label.trim() || !Number.isFinite(loc.lat) || Math.abs(loc.lat) > 90 || !Number.isFinite(loc.lon) || Math.abs(loc.lon) > 180) {
    return [];
  }
  return [{
    lat: loc.lat,
    lon: loc.lon,
    label: loc.label.trim(),
    relation: 'publisher',
    precision: 'city',
    evidence: `User-declared publisher location for ${config.name || config.url}; denotes the publisher only, not the event location.`,
  }];
}

function makeSourceStatus(config: CustomSourceConfig, name: string, count: number): SourceStatus {
  const now = new Date().toISOString();
  return {
    id: config.id,
    name,
    url: config.url,
    policyUrl: config.url,
    rights: `Custom user-added feed (${config.url}). Verify original publisher terms before public redistribution.`,
    status: 'ok',
    fetchedAt: now,
    attemptedAt: now,
    count,
    error: null,
  };
}

/**
 * Parses RSS 2.0 / Atom 1.0 / RSS 1.0 (RDF) / GeoRSS / JSON Feed 1.1 / Point GeoJSON / NASA EONET v3.
 * Works identically in browser and Node.js without external dependencies.
 */
export function parseBrowserFeed(
  text: string,
  config: CustomSourceConfig,
  contentType = '',
): { feedTitle: string; detectedFormat: CustomFeedFormat; sourceStatus: SourceStatus; events: NewsEvent[] } {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Feed response is empty.');
  const tag = normalizeTag(config.tag);
  const tags = tag ? [tag] : undefined;
  const maxEvents = Math.min(40, Math.max(1, config.maxEvents || 15));
  const looksJson = config.format === 'json-feed' || config.format === 'geojson' || config.format === 'eonet'
    || /json/i.test(contentType) || trimmed.startsWith('{');

  if (looksJson) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      if (config.format !== 'auto') throw new Error('Response is not valid JSON.');
      data = {};
    }
    if (Array.isArray(data.events)) {
      const feedTitle = config.name.trim() || (typeof data.title === 'string' && data.title.trim()) || new URL(config.url).hostname;
      const events: NewsEvent[] = [];
      for (const raw of data.events as Array<Record<string, unknown>>) {
        const title = clip(String(raw.title ?? ''), 400);
        if (!title) continue;
        const geos = Array.isArray(raw.geometry) ? (raw.geometry as Array<Record<string, unknown>>) : [];
        const pt = [...geos].reverse().find(g => g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2);
        if (!pt) continue;
        const coords = pt.coordinates as number[];
        const lon = Number(coords[0]);
        const lat = Number(coords[1]);
        const publishedAt = validDateIso(String(pt.date ?? ''));
        if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180 || !publishedAt) continue;
        const srcList = Array.isArray(raw.sources) ? (raw.sources as Array<Record<string, unknown>>) : [];
        const url = canonicalizeFeedUrl(String(srcList[0]?.url ?? raw.link ?? config.url)) ?? config.url;
        if (!safeExternalUrl(url)) continue;
        const summary = clip(String(raw.description ?? ''), 700);
        const event: NewsEvent = {
          id: hashId(config.id, `${raw.id ?? url}`),
          title,
          titleOriginal: title,
          summary,
          theme: config.theme,
          kind: 'Natural event',
          publishedAt,
          occurredAt: publishedAt,
          locations: [{
            lat, lon, label: title, relation: 'event', precision: 'point',
            evidence: `Structured event coordinates (${lat.toFixed(4)}, ${lon.toFixed(4)}) from EONET feed.`,
          }],
          sources: [{ name: feedTitle, url, publishedAt }],
          facts: [`Source: ${feedTitle}`, `Observed: ${publishedAt}`],
          sourceId: config.id,
          summaryMode: summary ? 'source' : 'metadata',
          ...(tags ? { tags } : {}),
        };
        events.push(event);
        if (events.length >= maxEvents) break;
      }
      if (!events.length) throw new Error('No valid Point events found in EONET JSON.');
      return { feedTitle, detectedFormat: 'eonet', sourceStatus: makeSourceStatus(config, feedTitle, events.length), events };
    }

    if (Array.isArray(data.features)) {
      const feedTitle = config.name.trim() || new URL(config.url).hostname;
      const events: NewsEvent[] = [];
      for (const feat of data.features as Array<Record<string, unknown>>) {
        const props = (feat.properties ?? {}) as Record<string, unknown>;
        const geo = (feat.geometry ?? {}) as Record<string, unknown>;
        if (geo.type !== 'Point' || !Array.isArray(geo.coordinates) || geo.coordinates.length < 2) continue;
        const lon = Number(geo.coordinates[0]);
        const lat = Number(geo.coordinates[1]);
        const title = clip(String(props.title ?? props.name ?? ''), 400);
        const rawTime = props.time;
        const publishedAt = validDateIso(typeof rawTime === 'number' ? new Date(rawTime).toISOString() : String(props.publishedAt ?? props.date ?? rawTime ?? ''));
        const url = canonicalizeFeedUrl(String(props.url ?? props.link ?? ''), config.url) ?? config.url;
        if (!title || !publishedAt || !safeExternalUrl(url) || !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) continue;
        const place = stripTags(String(props.place ?? '')) || title;
        const summary = clip(String(props.summary ?? props.description ?? ''), 700);
        events.push({
          id: hashId(config.id, `${feat.id ?? url}`),
          title,
          titleOriginal: title,
          summary: summary === title ? '' : summary,
          theme: config.theme,
          kind: 'GeoJSON point',
          publishedAt,
          occurredAt: publishedAt,
          locations: [{
            lat, lon, label: place, relation: 'event', precision: 'point',
            evidence: `GeoJSON coordinates (${lat.toFixed(4)}, ${lon.toFixed(4)}) supplied by the source.`,
          }],
          sources: [{ name: feedTitle, url, publishedAt }],
          facts: [`Place: ${place}`, `Source: ${feedTitle} (${publishedAt})`],
          sourceId: config.id,
          summaryMode: summary && summary !== title ? 'source' : 'metadata',
          ...(tags ? { tags } : {}),
        });
        if (events.length >= maxEvents) break;
      }
      if (!events.length) throw new Error('No valid Point features found in GeoJSON.');
      return { feedTitle, detectedFormat: 'geojson', sourceStatus: makeSourceStatus(config, feedTitle, events.length), events };
    }

    if (Array.isArray(data.items)) {
      const feedTitle = config.name.trim() || (typeof data.title === 'string' && stripTags(data.title)) || new URL(config.url).hostname;
      const pubLoc = publisherGeo(config);
      const events: NewsEvent[] = [];
      for (const item of data.items as Array<Record<string, unknown>>) {
        const url = canonicalizeFeedUrl(String(item.url ?? item.external_url ?? ''), config.url);
        const title = clip(String(item.title ?? item.content_text ?? item.summary ?? ''), 400);
        const publishedAt = validDateIso(String(item.date_published ?? item.date_modified ?? ''));
        if (!url || !title || !publishedAt || !safeExternalUrl(url)) continue;
        const summary = clip(String(item.summary ?? item.content_text ?? item.content_html ?? ''), 700);
        const rawGeo = item._geo as Record<string, unknown> | undefined;
        const lat = Number(rawGeo?.lat ?? rawGeo?.latitude);
        const lon = Number(rawGeo?.lon ?? rawGeo?.lng ?? rawGeo?.longitude);
        const locations: GeoReference[] = Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180
          ? [{ lat, lon, label: title, relation: 'event', precision: 'point', evidence: `JSON Feed _geo coordinates (${lat.toFixed(4)}, ${lon.toFixed(4)}).` }, ...pubLoc]
          : pubLoc;
        events.push({
          id: hashId(config.id, `${item.id ?? url}`),
          title,
          titleOriginal: title,
          summary: summary === title ? '' : summary,
          theme: config.theme,
          kind: 'JSON Feed',
          publishedAt,
          occurredAt: null,
          locations,
          sources: [{ name: feedTitle, url, publishedAt }],
          facts: [`Source: ${feedTitle}`, `Published: ${publishedAt}`],
          sourceId: config.id,
          summaryMode: summary && summary !== title ? 'source' : 'metadata',
          ...(tags ? { tags } : {}),
        });
        if (events.length >= maxEvents) break;
      }
      if (!events.length) throw new Error('No valid entries found in JSON Feed.');
      return { feedTitle, detectedFormat: 'json-feed', sourceStatus: makeSourceStatus(config, feedTitle, events.length), events };
    }
  }

  // XML path: Atom 1.0 (<entry>) or RSS 2.0 / 1.0 (<item>)
  const isAtom = /<feed\b/i.test(trimmed) && /<entry\b/i.test(trimmed);
  const blocks = [...trimmed.matchAll(isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi)].map(m => m[0]);
  if (!blocks.length) throw new Error('Could not recognize RSS, Atom, GeoJSON, or JSON Feed items.');
  const channelHeader = trimmed.slice(0, trimmed.search(isAtom ? /<entry\b/i : /<item\b/i));
  const rawFeedTitle = stripTags(readTagText(channelHeader, 'title'));
  const feedTitle = config.name.trim() || rawFeedTitle || new URL(config.url).hostname;
  const pubLoc = publisherGeo(config);
  const events: NewsEvent[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const title = clip(readTagText(block, 'title'), 400);
    const url = isAtom
      ? extractAtomLink(block, config.url)
      : canonicalizeFeedUrl(stripTags(readTagText(block, 'link', 'guid')), config.url);
    const publishedAt = validDateIso(readTagText(block, 'published', 'pubDate', 'date', 'updated'));
    if (!title || !url || !publishedAt || !safeExternalUrl(url)) continue;
    const guid = stripTags(readTagText(block, 'id', 'guid')) || url;
    const id = hashId(config.id, guid);
    if (seen.has(id) || seen.has(url)) continue;
    seen.add(id);
    seen.add(url);

    let summary = clip(readTagText(block, 'summary', 'description', 'content', 'encoded'), 700);
    if (summary === title) summary = '';
    const geo = extractXmlGeo(block);
    const locations: GeoReference[] = geo
      ? [{ lat: geo.lat, lon: geo.lon, label: title, relation: 'event', precision: 'point', evidence: `GeoRSS coordinates (${geo.lat.toFixed(4)}, ${geo.lon.toFixed(4)}) from feed item.` }, ...pubLoc]
      : pubLoc;
    events.push({
      id,
      title,
      titleOriginal: title,
      summary,
      theme: config.theme,
      kind: isAtom ? 'Atom feed' : 'RSS feed',
      publishedAt,
      occurredAt: null,
      locations,
      sources: [{ name: feedTitle, url, publishedAt }],
      facts: [summary ? `Summary: ${clip(summary, 280)}` : `Title: ${title}`, `Source: ${feedTitle} (${publishedAt})`],
      sourceId: config.id,
      summaryMode: summary ? 'source' : 'metadata',
      ...(tags ? { tags } : {}),
    });
    if (events.length >= maxEvents) break;
  }

  if (!events.length) throw new Error('Feed reachable, but no items contained title, HTTPS link, and valid date.');
  events.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return { feedTitle, detectedFormat: 'feed', sourceStatus: makeSourceStatus(config, feedTitle, events.length), events };
}

/**
 * Parses an OPML 1.0/2.0 subscription list, turning nested folder titles into board tags.
 */
export function parseOpml(xml: string): OpmlEntry[] {
  if (typeof xml !== 'string' || !/<opml\b/i.test(xml)) return [];
  const entries: OpmlEntry[] = [];
  const seen = new Set<string>();
  const folderStack: string[] = [];
  const tokenRe = /<(\/?)outline\b([^>]*?)(\/?)>/gi;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(xml)) !== null) {
    const [, closing, attrs, selfClosing] = match;
    if (closing) {
      folderStack.pop();
      continue;
    }
    const xmlUrl = canonicalizeFeedUrl(readAttr(attrs, 'xmlUrl', 'xmlurl'));
    const label = readAttr(attrs, 'title', 'text');
    if (xmlUrl && !seen.has(xmlUrl)) {
      seen.add(xmlUrl);
      const tag = normalizeTag(folderStack[folderStack.length - 1] ?? readAttr(attrs, 'category'));
      entries.push({ name: label || new URL(xmlUrl).hostname, url: xmlUrl, tag });
    }
    if (!selfClosing) {
      folderStack.push(xmlUrl ? folderStack[folderStack.length - 1] ?? '' : label);
    }
  }
  return entries;
}

export function exportOpml(sources: readonly SourceStatus[], customConfigs: readonly CustomSourceConfig[]): string {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const cfg of customConfigs) {
    if (seen.has(cfg.url)) continue;
    seen.add(cfg.url);
    lines.push(`      <outline type="rss" text="${esc(cfg.name || cfg.url)}" title="${esc(cfg.name || cfg.url)}" xmlUrl="${esc(cfg.url)}"${cfg.tag ? ` category="${esc(cfg.tag)}"` : ''} />`);
  }
  for (const src of sources) {
    if (seen.has(src.url)) continue;
    seen.add(src.url);
    lines.push(`      <outline type="rss" text="${esc(src.name)}" title="${esc(src.name)}" xmlUrl="${esc(src.url)}" />`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>Atlas Dispatch Feeds</title></head>\n  <body>\n    <outline text="Atlas Feeds" title="Atlas Feeds">\n${lines.join('\n')}\n    </outline>\n  </body>\n</opml>\n`;
}

export function configToCatalogEntry(config: CustomSourceConfig): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    id: config.id,
    name: config.name || config.url,
    shortName: config.name || new URL(config.url).hostname,
    url: config.url,
    policyUrl: config.url,
    rights: 'Custom user-configured source. Verify publisher usage conditions before public redistribution.',
    theme: config.theme,
    kind: config.tag || '自定义信源',
    maxEvents: config.maxEvents || 15,
    format: config.format === 'auto' ? 'feed' : config.format,
  };
  if (config.tag) entry.tags = [config.tag];
  if (config.publisherLocation) {
    entry.publisherLocation = {
      ...config.publisherLocation,
      evidence: `Publisher location declared by user for ${config.name || config.url}; denotes the publisher only.`,
    };
  }
  return entry;
}

export function exportSourcesCatalog(sources: readonly SourceStatus[], customConfigs: readonly CustomSourceConfig[]): string {
  const seen = new Set<string>();
  const catalog: Array<Record<string, unknown>> = [];
  for (const src of sources) {
    if (customConfigs.some(c => c.id === src.id)) continue;
    seen.add(src.id);
    catalog.push({
      id: src.id,
      name: src.name,
      shortName: src.name,
      url: src.url,
      policyUrl: src.policyUrl,
      rights: src.rights,
      theme: 'earth',
      kind: '官方来源',
      maxEvents: Math.max(6, src.count || 8),
      format: src.id === 'usgs' ? 'geojson' : src.id === 'eonet' ? 'eonet' : src.id === 'gdacs' ? 'gdacs' : src.id === 'gemma' ? 'gemma-releases' : 'feed',
    });
  }
  for (const cfg of customConfigs) {
    if (seen.has(cfg.id)) continue;
    seen.add(cfg.id);
    catalog.push(configToCatalogEntry(cfg));
  }
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

export async function tryFetchCustomFeed(config: CustomSourceConfig, companionAvailable: boolean): Promise<FetchCustomResult> {
  const cleanUrl = canonicalizeFeedUrl(config.url);
  if (!cleanUrl) return { ok: false, corsBlocked: false, message: 'URL must use HTTPS.' };
  const normalized: CustomSourceConfig = { ...config, url: cleanUrl };

  if (companionAvailable) {
    try {
      const res = await fetch('/api/atlas-companion/fetch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(normalized),
        signal: AbortSignal.timeout(25_000),
      });
      const data = await res.json() as { ok?: boolean; error?: string; source?: SourceStatus; events?: NewsEvent[]; discoveredUrl?: string };
      if (!res.ok || !data.ok || !data.source || !Array.isArray(data.events)) {
        return { ok: false, corsBlocked: false, message: data.error || `Companion HTTP ${res.status}` };
      }
      return {
        ok: true,
        source: data.source,
        events: data.events,
        config: { ...normalized, name: data.source.name, url: data.discoveredUrl || normalized.url },
        discoveredUrl: data.discoveredUrl,
      };
    } catch (error) {
      return { ok: false, corsBlocked: false, message: error instanceof Error ? error.message : 'Companion fetch failed.' };
    }
  }

  try {
    const res = await fetch(cleanUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
      headers: { accept: 'application/rss+xml, application/atom+xml, application/feed+json, application/json, application/xml, text/xml;q=0.8' },
    });
    if (!res.ok) return { ok: false, corsBlocked: false, message: `HTTP ${res.status}` };
    const text = await res.text();
    if (text.length > MAX_FETCH_BYTES) return { ok: false, corsBlocked: false, message: 'Feed exceeds 4 MiB limit.' };
    const parsed = parseBrowserFeed(text, normalized, res.headers.get('content-type') || '');
    return {
      ok: true,
      source: parsed.sourceStatus,
      events: parsed.events,
      config: { ...normalized, name: normalized.name || parsed.feedTitle, format: parsed.detectedFormat },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const corsBlocked = error instanceof TypeError || /cors|failed to fetch|networkerror/i.test(msg);
    return { ok: false, corsBlocked, message: msg };
  }
}

export function loadCustomState(): CustomFeedState {
  try {
    if (typeof window === 'undefined') return { configs: [], sources: [], events: [] };
    const raw = window.localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return { configs: [], sources: [], events: [] };
    const parsed = JSON.parse(raw) as Partial<CustomFeedState>;
    if (!Array.isArray(parsed.configs) || !Array.isArray(parsed.sources) || !Array.isArray(parsed.events)) {
      return { configs: [], sources: [], events: [] };
    }
    return { configs: parsed.configs, sources: parsed.sources, events: parsed.events };
  } catch {
    return { configs: [], sources: [], events: [] };
  }
}

export function saveCustomState(state: CustomFeedState): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota/storage errors in restricted contexts.
  }
}

export function clearCustomSource(state: CustomFeedState, id: string): CustomFeedState {
  return {
    configs: state.configs.filter(c => c.id !== id),
    sources: state.sources.filter(s => s.id !== id),
    events: state.events.filter(e => e.sourceId !== id),
  };
}
