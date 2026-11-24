import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

const USER_AGENT = 'GlobalNewsMap/0.1 (personal offline reader)';
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'igshid',
  'ref_src',
  'ref_url',
  'cmpid',
]);

const XML = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
  htmlEntities: true,
  allowBooleanAttributes: true,
  removeNSPrefix: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
});

const NASA_FACILITIES = [
  { pattern: /kennedy space center/i, label: '肯尼迪航天中心', lat: 28.5729, lon: -80.649 },
  { pattern: /johnson space center/i, label: '约翰逊航天中心', lat: 29.5502, lon: -95.097 },
  { pattern: /jet propulsion laboratory/i, label: '喷气推进实验室', lat: 34.2013, lon: -118.1715 },
  { pattern: /goddard space flight center/i, label: '戈达德航天中心', lat: 38.9917, lon: -76.8527 },
  { pattern: /marshall space flight center/i, label: '马歇尔航天中心', lat: 34.645, lon: -86.6748 },
  { pattern: /armstrong flight research center/i, label: '阿姆斯特朗飞行研究中心', lat: 34.9507, lon: -117.8864 },
  { pattern: /ames research center/i, label: '艾姆斯研究中心', lat: 37.4084, lon: -122.0644 },
  { pattern: /langley research center/i, label: '兰利研究中心', lat: 37.0866, lon: -76.3816 },
  { pattern: /stennis space center/i, label: '斯坦尼斯航天中心', lat: 30.3662, lon: -89.5991 },
  { pattern: /wallops flight facility/i, label: '沃洛普斯飞行设施', lat: 37.9402, lon: -75.4663 },
  { pattern: /plum brook station/i, label: '梅溪站', lat: 41.3905, lon: -82.683 },
];

const ESA_FACILITIES = [
  { pattern: /kourou|europe'?s spaceport|guiana space centre/i, label: '库鲁航天发射场', lat: 5.239, lon: -52.768 },
  { pattern: /\besoc\b|darmstadt/i, label: '欧洲空间操作中心（达姆施塔特）', lat: 49.871, lon: 8.622 },
  { pattern: /\bestec\b|noordwijk/i, label: '欧洲空间研究与技术中心（诺德韦克）', lat: 52.218, lon: 4.421 },
  { pattern: /\besrin\b|frascati/i, label: '欧洲空间地球观测中心（弗拉斯卡蒂）', lat: 41.827, lon: 12.673 },
  { pattern: /\besac\b|villafranca/i, label: '欧洲空间天文学中心（马德里）', lat: 40.444, lon: -3.953 },
];

export function cleanText(value) {
  if (value === null || value === undefined) return '';
  let text;
  if (typeof value === 'string') text = value;
  else if (typeof value === 'number') text = String(value);
  else if (typeof value === 'object' && '#text' in value) text = String(value['#text'] ?? '');
  else return '';
  text = decodeEntities(text)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?[a-z][a-z0-9:-]*(?:\s[^<>]*)?\/?>/gi, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function decodeEntities(text) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ndash: '–',
    mdash: '—',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
    hellip: '…',
    middot: '·',
    bull: '•',
    euro: '€',
    pound: '£',
    copy: '©',
    reg: '®',
    trade: '™',
  };
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function safeCodePoint(code) {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

export function clipText(value, limit) {
  const text = cleanText(value);
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit * 0.7 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function canonicalizeUrl(raw, baseUrl) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let parsed;
  try {
    parsed = new URL(raw.trim(), baseUrl);
  } catch {
    return null;
  }
  if (parsed.protocol === 'http:') parsed.protocol = 'https:';
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.href.length > 2048) return null;
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower) || lower.startsWith('utm_')) parsed.searchParams.delete(key);
  }
  parsed.searchParams.sort();
  return parsed.href;
}

export function parseDateValue(value) {
  const text = cleanText(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

export function stableEventId(sourceId, guid, url) {
  const basis = guid
    ? `guid:${sourceId}:${guid}`
    : `url:${sourceId}:${canonicalizeUrl(url) ?? url}`;
  return `${sourceId}-${createHash('sha256').update(basis).digest('hex').slice(0, 16)}`;
}

function asArray(value) {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && '#text' in value) return String(value['#text'] ?? '');
  return '';
}

function atomHref(entry) {
  const links = asArray(entry?.link);
  const objects = links.filter(link => link && typeof link === 'object' && link['@_href']);
  const alternate = objects.find(link => !link['@_rel'] || link['@_rel'] === 'alternate');
  const chosen = alternate ?? objects[0];
  if (chosen) return String(chosen['@_href']);
  const plain = links.find(link => typeof link === 'string');
  return plain ? plain : '';
}

function atomCategories(entry) {
  return asArray(entry?.category)
    .map(category => (typeof category === 'object' ? category['@_term'] ?? category['#text'] : category))
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim());
}

function atomAuthors(entry) {
  return asArray(entry?.author)
    .map(author => (author && typeof author === 'object' ? cleanText(author.name) : cleanText(author)))
    .filter(Boolean);
}

function rssGuid(item) {
  const guid = item?.guid;
  if (typeof guid === 'string' || typeof guid === 'number') return String(guid).trim();
  if (guid && typeof guid === 'object') return textValue(guid).trim();
  return '';
}

function rawEntries(document) {
  if (document?.feed && document.feed.entry) {
    return { mode: 'atom', entries: asArray(document.feed.entry) };
  }
  const channel = Array.isArray(document?.rss?.channel) ? document.rss.channel[0] : document?.rss?.channel;
  if (channel?.item) return { mode: 'rss', entries: asArray(channel.item) };
  if (document?.RDF?.item) return { mode: 'rss', entries: asArray(document.RDF.item) };
  return null;
}

/**
 * Parse an RSS 2.0, RSS 1.0/RDF, or Atom feed into normalized, de-duplicated items.
 * Items without a title, https link, or source-provided publication date are skipped.
 */
export function parseSyndication(xml, options = {}) {
  if (typeof xml !== 'string' || !xml.trim()) throw new Error('Feed 内容为空。');
  const document = XML.parse(xml);
  const shape = rawEntries(document);
  if (!shape) throw new Error('无法识别 RSS/Atom 条目结构。');
  const sourceId = options.sourceId ?? 'feed';
  const maxItems = options.maxItems ?? 40;
  const baseUrl = options.baseUrl;
  const items = [];
  const seen = new Set();

  for (const entry of shape.entries) {
    if (!entry || typeof entry !== 'object') continue;
    const atom = shape.mode === 'atom';
    const title = clipText(atom ? entry.title : entry.title, 400);
    if (!title) continue;

    const rawLink = atom ? atomHref(entry) : textValue(entry.link) || textValue(entry.guid);
    const url = canonicalizeUrl(rawLink, baseUrl);
    if (!url) continue;

    const dateRaw = atom
      ? entry.published
      : entry.pubDate ?? entry.date ?? entry.published;
    const publishedAt = parseDateValue(dateRaw);
    if (!publishedAt) continue;

    const descriptionRaw = atom ? entry.summary ?? entry.content : entry.description;
    const summary = clipText(descriptionRaw, 700);
    const guidText = atom ? cleanText(entry.id) : rssGuid(entry);
    const guid = guidText || url;
    const dedupeKeys = [`url:${url}`];
    if (guidText) dedupeKeys.unshift(`guid:${guidText}`);
    if (dedupeKeys.some(key => seen.has(key))) continue;
    for (const key of dedupeKeys) seen.add(key);

    const geo = parseGdacsCoordinates(entry);

    items.push({
      id: stableEventId(sourceId, guid, url),
      title,
      summary,
      url,
      publishedAt,
      guid,
      authors: atom ? atomAuthors(entry) : [],
      categories: atom ? atomCategories(entry) : [],
      geo,
    });
  }

  return items
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, maxItems);
}

function roundDepth(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function validCoordinates(lat, lon) {
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180;
}

/**
 * Selects up to `maxEvents` geo-located items while limiting crowding inside each 10°×10° cell.
 */
export function selectDiversePoints(items, maxEvents, rankComparator) {
  const sorted = [...items].sort(rankComparator);
  const selected = [];
  const cellCounts = new Map();
  const cellFor = item => `${Math.floor(item.lat / 10)}:${Math.floor(item.lon / 10)}`;

  for (const cap of [1, 2]) {
    for (const item of sorted) {
      if (selected.length >= maxEvents) break;
      if (selected.some(existing => existing.id === item.id)) continue;
      const cell = cellFor(item);
      const count = cellCounts.get(cell) ?? 0;
      if (count >= cap) continue;
      selected.push(item);
      cellCounts.set(cell, count + 1);
    }
  }
  for (const item of sorted) {
    if (selected.length >= maxEvents) break;
    if (!selected.some(existing => existing.id === item.id)) selected.push(item);
  }
  return selected.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export function selectDiverseQuakes(quakes, maxEvents) {
  return selectDiversePoints(quakes, maxEvents, (a, b) => {
    const magnitudeDelta = (b.magnitude ?? -Infinity) - (a.magnitude ?? -Infinity);
    return magnitudeDelta || Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
}

export function parseUsgsEvents(payload, options = {}) {
  let data = payload;
  if (typeof payload === 'string') {
    try {
      data = JSON.parse(payload);
    } catch {
      throw new Error('USGS 返回内容不是有效 JSON。');
    }
  }
  if (!data || !Array.isArray(data.features)) throw new Error('USGS GeoJSON 缺少 features 数组。');
  const maxEvents = options.maxEvents ?? 20;
  const quakes = [];

  for (const feature of data.features) {
    const properties = feature?.properties;
    const coordinates = feature?.geometry?.coordinates;
    if (!properties || !Array.isArray(coordinates) || coordinates.length < 2) continue;
    if (!Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) continue;
    const lon = coordinates[0];
    const lat = coordinates[1];
    if (!validCoordinates(lat, lon)) continue;
    const magnitudeValue = Number(properties.mag);
    const magnitude = Number.isFinite(magnitudeValue) ? magnitudeValue : null;
    if (magnitude !== null && magnitude < 4.5) continue;
    const publishedAt = parseDateValue(Number.isFinite(properties.time) ? new Date(properties.time).toISOString() : properties.time);
    if (!publishedAt) continue;
    const sourceRecordId = cleanText(properties.ids ?? feature.id ?? '');
    const usgsId = cleanText(feature.id) || sourceRecordId.split(',')[0];
    const title = clipText(properties.title, 400);
    if (!title || !usgsId) continue;
    const detailUrl = canonicalizeUrl(properties.url, 'https://earthquake.usgs.gov/');
    const url = detailUrl ?? `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(usgsId)}`;
    const place = cleanText(properties.place) || '位置未标明';
    const depth = coordinates.length > 2 && Number.isFinite(coordinates[2]) ? roundDepth(coordinates[2]) : null;
    quakes.push({
      id: `usgs-${usgsId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)}`,
      title,
      place,
      summary: `USGS 记录：${Number.isFinite(magnitude) ? `M ${magnitude} ` : ''}地震，${place}${depth === null ? '' : `，震源深度 ${depth} km`}。时间为 USGS 事件时间（UTC）。`,
      publishedAt,
      occurredAt: publishedAt,
      magnitude: Number.isFinite(magnitude) ? magnitude : null,
      lat,
      lon,
      depth,
      url,
      sourceRecordId,
    });
  }

  const deduped = [];
  const seen = new Set();
  for (const quake of quakes) {
    if (seen.has(quake.id)) continue;
    seen.add(quake.id);
    deduped.push(quake);
  }
  return selectDiverseQuakes(deduped, maxEvents);
}

export function usgsToEvents(quakes) {
  return quakes.map(quake => {
    const magnitudeText = quake.magnitude === null ? '' : `M ${quake.magnitude}`;
    const facts = [
      quake.magnitude === null ? 'USGS 记录了一次地震。' : `USGS 记录震级 ${magnitudeText}。`,
      `USGS 标注位置：${quake.place}${quake.depth === null ? '' : `；震源深度 ${quake.depth} km`}。`,
      `USGS 事件时间：${quake.publishedAt}。未据震级推断伤亡、破坏或灾害严重程度。`,
    ];
    return {
      id: quake.id,
      title: quake.title,
      titleOriginal: quake.title,
      summary: quake.summary,
      theme: 'earth',
      kind: '地震',
      publishedAt: quake.publishedAt,
      occurredAt: quake.occurredAt,
      locations: [
        {
          lat: quake.lat,
          lon: quake.lon,
          label: quake.place,
          relation: 'event',
          precision: 'point',
          evidence: `USGS 事件坐标（纬度 ${quake.lat.toFixed(4)}，经度 ${quake.lon.toFixed(4)}）；${quake.depth === null ? '深度未提供' : `震源深度 ${quake.depth} km`}。坐标表示震中位置，不用于判断灾害严重程度。`,
        },
      ],
      sources: [
        {
          name: 'USGS',
          url: quake.url,
          publishedAt: quake.publishedAt,
        },
      ],
      facts,
      sourceId: 'usgs',
      summaryMode: 'metadata',
    };
  });
}

function extractFacilityLocations(item, facilities, agency) {
  const text = `${item.title} ${item.summary}`;
  for (const facility of facilities) {
    if (!facility.pattern.test(text)) continue;
    return [
      {
        lat: facility.lat,
        lon: facility.lon,
        label: facility.label,
        relation: 'subject',
        precision: 'city',
        evidence: `${agency} 原文明确提及 ${facility.label}；坐标为其公开所在地，仅表示被提及的机构/设施位置，不表示事件影响范围或发生地。`,
      },
    ];
  }
  return [];
}

function publisherLocation(definition) {
  const location = definition.publisherLocation;
  if (!location) return [];
  return [
    {
      lat: location.lat,
      lon: location.lon,
      label: location.label,
      relation: 'publisher',
      precision: 'city',
      evidence: location.evidence,
    },
  ];
}

function feedFacts(item, definition) {
  const facts = [];
  if (item.summary) facts.push(`来源摘要：${clipText(item.summary, 300)}`);
  else facts.push(`来源标题：${item.title}`);
  facts.push(`来源：${definition.name}，原文发布时间 ${item.publishedAt}。`);
  return facts.slice(0, 3);
}

function arxivFacts(item) {
  const facts = [];
  if (item.authors.length) {
    const shown = item.authors.slice(0, 4).join(', ');
    const suffix = item.authors.length > 4 ? ` 等 ${item.authors.length} 位作者` : '';
    facts.push(`作者：${shown}${suffix}。`);
  }
  if (item.categories.length) facts.push(`arXiv 分类：${item.categories.slice(0, 3).join(', ')}。`);
  facts.push(`预印本首次提交时间：${item.publishedAt}；未经同行评审。`);
  return facts.slice(0, 3);
}

export function feedItemsToEvents(items, definition) {
  const tags = normalizeDefinitionTags(definition.tags);
  return items.slice(0, definition.maxEvents ?? 20).map(item => {
    const summary = normalizeFeedSummary(item, definition);
    const geoLocations = item.geo
      ? [
          {
            lat: item.geo.lat,
            lon: item.geo.lon,
            label: item.title,
            relation: 'event',
            precision: 'point',
            evidence: `GeoRSS 结构化坐标（纬度 ${item.geo.lat.toFixed(4)}，经度 ${item.geo.lon.toFixed(4)}）；来自订阅条目自带地理字段。`,
          },
        ]
      : [];
    const locations = definition.id === 'nasa'
      ? extractFacilityLocations({ ...item, summary }, NASA_FACILITIES, 'NASA')
      : definition.id === 'esa'
        ? [...publisherLocation(definition), ...extractFacilityLocations({ ...item, summary }, ESA_FACILITIES, 'ESA')]
        : [...geoLocations, ...publisherLocation(definition)];
    const event = {
      id: item.id,
      title: item.title,
      titleOriginal: item.title,
      summary,
      theme: definition.theme,
      kind: definition.kind,
      publishedAt: item.publishedAt,
      occurredAt: null,
      locations,
      sources: [
        {
          name: definition.shortName || definition.name,
          url: item.url,
          publishedAt: item.publishedAt,
        },
      ],
      facts: definition.id === 'arxiv' ? arxivFacts(item) : feedFacts({ ...item, summary }, definition),
      sourceId: definition.id,
      summaryMode: summary ? 'source' : 'metadata',
    };
    if (tags.length) event.tags = tags;
    return event;
  });
}

export function normalizeFeedSummary(item, definition) {
  let summary = cleanText(item.summary);
  if (definition.id === 'nasa') {
    summary = summary.replace(/^Description\s+/i, '');
    if (/^APOD\s+Science\s+APOD\b/i.test(summary) || /Today.s APOD Archive/i.test(summary.slice(0, 320))) {
      summary = '';
    }
  }
  if (summary === cleanText(item.title)) summary = '';
  return summary;
}

const RELEASE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseGemmaReleases(text, definition) {
  const events = [];
  const seen = new Set();
  let date = null;
  let anchor = '';
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      date = null;
      const heading = /^## ([A-Za-z]+) (\d{1,2}), (\d{4})\s*$/.exec(line);
      if (!heading) continue;
      const month = RELEASE_MONTHS.indexOf(heading[1]) + 1;
      if (!month) continue;
      const candidate = `${heading[3]}-${String(month).padStart(2, '0')}-${heading[2].padStart(2, '0')}`;
      const check = new Date(`${candidate}T00:00:00Z`);
      if (!Number.isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== candidate) continue;
      // A source calendar day is not an asserted midnight UTC release instant.
      date = candidate;
      anchor = line.slice(3).trim().toLowerCase().replaceAll(',', '').replaceAll(' ', '-');
      continue;
    }
    if (!date) continue;
    const release = /^- (?:Initial release|Release) of \[([^\]]+)\]\(([^)]+)\)(.*)$/.exec(line);
    if (!release || /Gemma Scope|\bMTP\b|interpretability suite|developer guide/i.test(release[1] + release[3])) continue;
    const modelUrl = canonicalizeUrl(release[2], 'https://gemma.ai/models/');
    if (!modelUrl) continue;
    const key = `${date}:${modelUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = clipText(release[1], 200);
    const original = clipText(line.slice(2).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\{[^}]*\}/g, ''), 700);
    events.push({
      id: stableEventId(definition.id, key, modelUrl),
      title: `${name} 发布`,
      titleOriginal: original,
      summary: original,
      theme: 'ai',
      kind: definition.kind,
      publishedAt: date,
      occurredAt: null,
      locations: [],
      sources: [
        { name: 'Google Gemma · 发布记录', url: `https://gemma.ai/models/releases/#${anchor}`, publishedAt: date },
        { name: '官方文档源码 · Apache-2.0', url: `https://github.com/google-gemma/docs/blob/main/docs/models/releases.md#${anchor}`, publishedAt: date },
      ],
      facts: [
        `Google Gemma 官方文档记载的发布日：${date}；时刻与时区未提供，不使用文档提交时间冒充发布时刻。`,
        '这是官方发布记录，不是研究预印本或模型上传记录；不代表对模型性能的独立验证。各模型的权重使用条件须另查模型卡。',
        '来源：Google DeepMind / google-gemma/docs（Apache-2.0）。环讯提取发布条目并生成中文标题，未复制模型、图片或完整文档。',
      ],
      sourceId: definition.id,
      summaryMode: 'source',
    });
  }
  return events.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, definition.maxEvents);
}

const EONET_CATEGORIES = {
  wildfires: '野火',
  severeStorms: '强风暴',
  volcanoes: '火山',
  floods: '洪涝',
  seaLakeIce: '海冰／湖冰',
  drought: '干旱',
  dustHaze: '沙尘／霾',
  landslides: '滑坡',
  snow: '暴雪',
  tempExtremes: '极端气温',
};

/**
 * Parses NASA EONET v3 open natural events with Point geometries (skipping earthquakes to avoid USGS overlap).
 */
export function parseEonetEvents(payload, options = {}) {
  let data = payload;
  if (typeof payload === 'string') {
    try {
      data = JSON.parse(payload);
    } catch {
      throw new Error('NASA EONET 返回内容不是有效 JSON。');
    }
  }
  if (!data || !Array.isArray(data.events)) throw new Error('NASA EONET 数据缺少 events 数组。');
  const maxEvents = options.maxEvents ?? 16;
  const parsed = [];
  const seen = new Set();

  for (const event of data.events) {
    const rawId = cleanText(event?.id);
    const title = clipText(event?.title, 400);
    if (!rawId || !title) continue;
    const id = `eonet-${rawId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48)}`;
    if (!id || seen.has(id)) continue;

    const category = Array.isArray(event.categories) ? event.categories[0] : null;
    const categoryId = cleanText(category?.id);
    if (categoryId === 'earthquakes') continue;
    const categoryLabel = EONET_CATEGORIES[categoryId] ?? (cleanText(category?.title) || '自然事件');

    const geometries = Array.isArray(event.geometry) ? event.geometry : [];
    let latestPoint = null;
    let latestTime = -Infinity;
    for (const geo of geometries) {
      if (geo?.type !== 'Point' || !Array.isArray(geo.coordinates) || geo.coordinates.length < 2) continue;
      const lon = Number(geo.coordinates[0]);
      const lat = Number(geo.coordinates[1]);
      if (!validCoordinates(lat, lon)) continue;
      const publishedAt = parseDateValue(geo.date);
      if (!publishedAt) continue;
      const time = Date.parse(publishedAt);
      if (time >= latestTime) {
        latestTime = time;
        const mag = Number(geo.magnitudeValue);
        const unit = cleanText(geo.magnitudeUnit);
        latestPoint = {
          lat,
          lon,
          publishedAt,
          magnitudeText: Number.isFinite(mag) ? `${mag}${unit ? ` ${unit}` : ''}` : null,
        };
      }
    }
    if (!latestPoint) continue;

    let url = null;
    for (const source of asArray(event.sources)) {
      url = canonicalizeUrl(source?.url);
      if (url) break;
    }
    if (!url) url = canonicalizeUrl(event.link);
    if (!url) continue;

    seen.add(id);
    parsed.push({
      id,
      title,
      description: clipText(event.description, 600),
      categoryId,
      categoryLabel,
      lat: latestPoint.lat,
      lon: latestPoint.lon,
      publishedAt: latestPoint.publishedAt,
      magnitudeText: latestPoint.magnitudeText,
      prescribed: /^Prescribed Fire/i.test(title),
      url,
    });
  }

  return selectDiversePoints(parsed, maxEvents, (a, b) => {
    if (a.prescribed !== b.prescribed) return a.prescribed ? 1 : -1;
    const aWildfire = a.categoryId === 'wildfires';
    const bWildfire = b.categoryId === 'wildfires';
    if (aWildfire !== bWildfire) return aWildfire ? 1 : -1;
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
}

export function eonetToEvents(items) {
  return items.map(item => {
    const facts = [
      `NASA EONET 类别：${item.categoryLabel}${item.magnitudeText ? `；最新观测度量 ${item.magnitudeText}` : ''}。`,
      `最新观测时间：${item.publishedAt}。`,
      '来源：NASA Earth Observatory Natural Event Tracker (EONET) 开放元数据；未推断伤亡、损失或灾害严重程度。',
    ];
    return {
      id: item.id,
      title: item.title,
      titleOriginal: item.title,
      summary: item.description,
      theme: 'earth',
      kind: '自然事件',
      publishedAt: item.publishedAt,
      occurredAt: item.publishedAt,
      locations: [
        {
          lat: item.lat,
          lon: item.lon,
          label: item.title,
          relation: 'event',
          precision: 'point',
          evidence: `NASA EONET 结构化事件坐标（纬度 ${item.lat.toFixed(4)}，经度 ${item.lon.toFixed(4)}）；类别：${item.categoryLabel}。坐标表示最新观测点，不用于判断灾害严重程度。`,
        },
      ],
      sources: [
        {
          name: 'NASA EONET',
          url: item.url,
          publishedAt: item.publishedAt,
        },
      ],
      facts,
      sourceId: 'eonet',
      summaryMode: item.description ? 'source' : 'metadata',
    };
  });
}

const GDACS_TYPES = {
  FL: '洪涝',
  TC: '热带气旋',
  WF: '野火',
  DR: '干旱',
  VO: '火山',
};

const GDACS_ALERTS = {
  red: { label: '红色警报', rank: 3 },
  orange: { label: '橙色警报', rank: 2 },
  green: { label: '绿色提示', rank: 1 },
};

function parseGdacsCoordinates(entry) {
  const pt = entry?.Point;
  if (pt && typeof pt === 'object') {
    const lat = Number(textValue(pt.lat));
    const lon = Number(textValue(pt.long ?? pt.lon));
    if (validCoordinates(lat, lon)) return { lat, lon };
  }
  const georss = cleanText(entry?.point);
  if (georss) {
    const parts = georss.split(/\s+/);
    if (parts.length >= 2) {
      const lat = Number(parts[0]);
      const lon = Number(parts[1]);
      if (validCoordinates(lat, lon)) return { lat, lon };
    }
  }
  return null;
}

/**
 * Parses GDACS GeoRSS alerts (skipping earthquakes to avoid duplicating USGS).
 */
export function parseGdacsEvents(xml, options = {}) {
  if (typeof xml !== 'string' || !xml.trim()) throw new Error('GDACS RSS 内容为空。');
  const document = XML.parse(xml);
  const channel = Array.isArray(document?.rss?.channel) ? document.rss.channel[0] : document?.rss?.channel;
  if (!channel?.item) throw new Error('无法识别 GDACS RSS 条目结构。');
  const maxEvents = options.maxEvents ?? 18;
  const parsed = [];
  const seen = new Set();

  for (const entry of asArray(channel.item)) {
    if (!entry || typeof entry !== 'object') continue;
    const typeCode = cleanText(entry.eventtype).toUpperCase();
    if (!typeCode || typeCode === 'EQ') continue;
    const typeLabel = GDACS_TYPES[typeCode] ?? typeCode;

    const coords = parseGdacsCoordinates(entry);
    if (!coords) continue;

    const title = clipText(entry.title, 400);
    const url = canonicalizeUrl(textValue(entry.link), 'https://www.gdacs.org/');
    if (!title || !url) continue;

    const publishedAt = parseDateValue(entry.pubDate ?? entry.fromdate);
    if (!publishedAt) continue;
    const occurredAt = parseDateValue(entry.fromdate) ?? publishedAt;

    const rawEventId = cleanText(entry.eventid).replace(/[^A-Za-z0-9_-]/g, '');
    const id = rawEventId
      ? `gdacs-${typeCode.toLowerCase()}-${rawEventId.slice(0, 32)}`
      : stableEventId('gdacs', cleanText(entry.guid) || url, url);
    if (seen.has(id)) continue;
    seen.add(id);

    const alertKey = cleanText(entry.alertlevel).toLowerCase();
    const alert = GDACS_ALERTS[alertKey] ?? { label: cleanText(entry.alertlevel) || '常规提示', rank: 0 };
    const countryRaw = cleanText(entry.country);
    const country = countryRaw && !/^\[?unknown\]?$/i.test(countryRaw) ? countryRaw : '';
    const eventName = cleanText(entry.eventname);
    const placeLabel = country || eventName || `GDACS ${typeCode}${rawEventId ? ` ${rawEventId}` : ''}`;

    let summary = clipText(entry.description, 700);
    if (summary === title) summary = '';

    parsed.push({
      id,
      title,
      summary,
      typeCode,
      typeLabel,
      alertLabel: alert.label,
      alertRank: alert.rank,
      country,
      placeLabel,
      lat: coords.lat,
      lon: coords.lon,
      publishedAt,
      occurredAt,
      url,
    });
  }

  return selectDiversePoints(parsed, maxEvents, (a, b) => {
    if (a.alertRank !== b.alertRank) return b.alertRank - a.alertRank;
    const aWildfire = a.typeCode === 'WF';
    const bWildfire = b.typeCode === 'WF';
    if (aWildfire !== bWildfire) return aWildfire ? 1 : -1;
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
}

export function gdacsToEvents(items) {
  return items.map(item => {
    const facts = [
      `GDACS 事件类型：${item.typeLabel}；警报级别：${item.alertLabel}${item.country ? `；涉及区域：${item.country}` : ''}。`,
      `报告发布时间：${item.publishedAt}。`,
      '来源：Global Disaster Alert and Coordination System (GDACS)；自动模型警报仅供参考，不替代当地官方应急通知。',
    ];
    return {
      id: item.id,
      title: item.title,
      titleOriginal: item.title,
      summary: item.summary,
      theme: 'earth',
      kind: '灾害警报',
      publishedAt: item.publishedAt,
      occurredAt: item.occurredAt,
      locations: [
        {
          lat: item.lat,
          lon: item.lon,
          label: item.placeLabel,
          relation: 'event',
          precision: 'point',
          evidence: `GDACS 全球灾害警报坐标（纬度 ${item.lat.toFixed(4)}，经度 ${item.lon.toFixed(4)}）；事件类型：${item.typeLabel}，警报级别：${item.alertLabel}。警报由自动模型生成，仅供参考，不替代当地官方通知。`,
        },
      ],
      sources: [
        {
          name: 'GDACS',
          url: item.url,
          publishedAt: item.publishedAt,
        },
      ],
      facts,
      sourceId: 'gdacs',
      summaryMode: item.summary ? 'source' : 'metadata',
    };
  });
}

function normalizeDefinitionTags(raw) {
  if (!Array.isArray(raw)) return [];
  const tags = [];
  for (const tag of raw) {
    if (typeof tag !== 'string') continue;
    const clean = cleanText(tag).slice(0, 32);
    if (clean && !tags.includes(clean)) tags.push(clean);
    if (tags.length >= 12) break;
  }
  return tags;
}

/**
 * Parses a JSON Feed 1.0/1.1 document into schema v1 NewsEvent records.
 */
export function parseJsonFeed(payload, options = {}) {
  let data = payload;
  if (typeof payload === 'string') {
    try {
      data = JSON.parse(payload);
    } catch {
      throw new Error('JSON Feed 内容不是有效 JSON。');
    }
  }
  if (!data || !Array.isArray(data.items)) throw new Error('JSON Feed 缺少 items 数组。');
  const sourceId = options.sourceId ?? 'json-feed';
  const maxItems = options.maxItems ?? 20;
  const baseUrl = options.baseUrl;
  const items = [];
  const seen = new Set();

  for (const entry of data.items) {
    if (!entry || typeof entry !== 'object') continue;
    const url = canonicalizeUrl(entry.url ?? entry.external_url, baseUrl);
    if (!url) continue;
    const title = clipText(entry.title || entry.content_text || entry.summary, 400);
    if (!title) continue;
    const publishedAt = parseDateValue(entry.date_published ?? entry.date_modified);
    if (!publishedAt) continue;
    const rawId = cleanText(entry.id);
    const id = stableEventId(sourceId, rawId || url, url);
    if (seen.has(id) || seen.has(url)) continue;
    seen.add(id);
    seen.add(url);

    let summary = clipText(entry.summary ?? entry.content_text ?? entry.content_html, 700);
    if (summary === title) summary = '';
    const geoLat = Number(entry._geo?.lat ?? entry._geo?.latitude);
    const geoLon = Number(entry._geo?.lon ?? entry._geo?.lng ?? entry._geo?.longitude);
    const geo = validCoordinates(geoLat, geoLon) ? { lat: geoLat, lon: geoLon } : null;
    items.push({ id, title, summary, url, publishedAt, geo });
  }
  return items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, maxItems);
}

/**
 * Parses generic GeoJSON Point FeatureCollections into schema v1 NewsEvent records.
 */
export function parseGenericGeojson(payload, definition) {
  let data = payload;
  if (typeof payload === 'string') {
    try {
      data = JSON.parse(payload);
    } catch {
      throw new Error('GeoJSON 返回内容不是有效 JSON。');
    }
  }
  if (!data || !Array.isArray(data.features)) throw new Error('GeoJSON 缺少 features 数组。');
  const maxEvents = definition.maxEvents ?? 20;
  const tags = normalizeDefinitionTags(definition.tags);
  const events = [];
  const seen = new Set();

  for (const feature of data.features) {
    const props = feature?.properties;
    const geo = feature?.geometry;
    if (!props || geo?.type !== 'Point' || !Array.isArray(geo.coordinates) || geo.coordinates.length < 2) continue;
    const lon = Number(geo.coordinates[0]);
    const lat = Number(geo.coordinates[1]);
    if (!validCoordinates(lat, lon)) continue;
    const title = clipText(props.title ?? props.name ?? props.headline, 400);
    const url = canonicalizeUrl(props.url ?? props.link, definition.url);
    const publishedAt = parseDateValue(
      Number.isFinite(props.time) ? new Date(props.time).toISOString() : props.publishedAt ?? props.date ?? props.updated ?? props.time,
    );
    if (!title || !url || !publishedAt) continue;
    const id = stableEventId(definition.id, cleanText(feature.id ?? props.id) || url, url);
    if (seen.has(id)) continue;
    seen.add(id);
    const summary = clipText(props.summary ?? props.description, 700);
    const place = cleanText(props.place ?? props.location) || title;
    const event = {
      id,
      title,
      titleOriginal: title,
      summary: summary === title ? '' : summary,
      theme: definition.theme,
      kind: definition.kind,
      publishedAt,
      occurredAt: publishedAt,
      locations: [
        {
          lat,
          lon,
          label: place,
          relation: 'event',
          precision: 'point',
          evidence: `GeoJSON 点位坐标（纬度 ${lat.toFixed(4)}，经度 ${lon.toFixed(4)}）；来自信源结构化地理字段。`,
        },
      ],
      sources: [{ name: definition.shortName || definition.name, url, publishedAt }],
      facts: [`GeoJSON 坐标：${place}。`, `来源：${definition.name}，时间 ${publishedAt}。`],
      sourceId: definition.id,
      summaryMode: summary && summary !== title ? 'source' : 'metadata',
    };
    if (tags.length) event.tags = tags;
    events.push(event);
  }
  return events.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, maxEvents);
}

/**
 * Discovers an RSS/Atom/JSON Feed <link rel="alternate"> URL from an HTML page.
 */
export function discoverFeedUrl(html, pageUrl) {
  if (typeof html !== 'string' || !html) return null;
  const links = [...html.matchAll(/<link\b([^>]+)>/gi)];
  for (const match of links) {
    const attrs = match[1];
    if (!/\brel\s*=\s*["']?[^"'>\s]*alternate\b/i.test(attrs)) continue;
    if (!/\btype\s*=\s*["']?application\/(?:rss\+xml|atom\+xml|feed\+json|json)/i.test(attrs)) continue;
    const hrefMatch = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(attrs);
    const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3];
    const resolved = canonicalizeUrl(href, pageUrl);
    if (resolved) return resolved;
  }
  return null;
}

export function parseSource(text, definition) {
  const tags = normalizeDefinitionTags(definition.tags);
  const attachTags = list => (tags.length ? list.map(event => (event.tags?.length ? event : { ...event, tags })) : list);
  if (definition.format === 'gemma-releases') return attachTags(parseGemmaReleases(text, definition));
  if (definition.format === 'eonet') {
    return attachTags(eonetToEvents(parseEonetEvents(text, { maxEvents: definition.maxEvents })));
  }
  if (definition.format === 'gdacs') {
    return attachTags(gdacsToEvents(parseGdacsEvents(text, { maxEvents: definition.maxEvents })));
  }
  if (definition.format === 'json-feed') {
    const items = parseJsonFeed(text, {
      sourceId: definition.id,
      baseUrl: definition.url,
      maxItems: definition.maxEvents ?? 20,
    });
    return feedItemsToEvents(items, definition);
  }
  if (definition.format === 'geojson') {
    return attachTags(
      definition.id === 'usgs'
        ? usgsToEvents(parseUsgsEvents(text, { maxEvents: definition.maxEvents }))
        : parseGenericGeojson(text, definition),
    );
  }
  const items = parseSyndication(text, {
    sourceId: definition.id,
    baseUrl: definition.url,
    maxItems: Math.max((definition.maxEvents ?? 20) + 4, 8),
  });
  return feedItemsToEvents(items, definition);
}

export async function fetchText(url, accept) {
  if (!url.startsWith('https://')) throw new Error('信源 URL 必须为 HTTPS。');
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      'user-agent': USER_AGENT,
      accept: accept ?? 'application/json, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  if (response.url && !response.url.startsWith('https://')) throw new Error('信源重定向到非 HTTPS 地址。');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) throw new Error('信源响应超过 4 MiB 上限。');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks.map(chunk => Buffer.from(chunk))));
}

export function formatError(error) {
  const base = error instanceof Error ? error.message : String(error);
  const cause = error?.cause?.code ?? error?.cause?.message;
  const suffix = cause && !base.includes(String(cause)) ? ` (${cause})` : '';
  return `${base}${suffix}`.slice(0, 400);
}

export async function collectSource(definition) {
  const attemptAt = new Date().toISOString();
  try {
    const text = await fetchText(definition.url, definition.accept);
    const events = parseSource(text, definition);
    if (!events.length) throw new Error('信源可访问，但未解析到含有效标题、链接和发布时间的条目。');
    return {
      events,
      status: {
        id: definition.id,
        name: definition.name,
        url: definition.url,
        policyUrl: definition.policyUrl,
        rights: definition.rights,
        status: 'ok',
        fetchedAt: new Date().toISOString(),
        attemptedAt: attemptAt,
        count: events.length,
        error: null,
      },
    };
  } catch (error) {
    return {
      events: [],
      status: {
        id: definition.id,
        name: definition.name,
        url: definition.url,
        policyUrl: definition.policyUrl,
        rights: definition.rights,
        status: 'error',
        fetchedAt: attemptAt,
        attemptedAt: attemptAt,
        count: 0,
        error: formatError(error),
      },
    };
  }
}

export function applyEditorialOverrides(events, overrides) {
  const entries = overrides?.entries;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return events;
  return events.map(event => {
    const url = event.sources?.[0]?.url;
    const override = entries[url] ?? entries[canonicalizeUrl(url)];
    if (!override || typeof override !== 'object') return event;
    const next = { ...event };
    if (typeof override.title === 'string' && override.title.trim()) {
      next.title = clipText(override.title, 400);
    }
    if (typeof override.summary === 'string' && override.summary.trim()) {
      next.summary = clipText(override.summary, 700);
      next.summaryMode = 'editorial';
    }
    if (Array.isArray(override.facts)) {
      const facts = override.facts.filter(fact => typeof fact === 'string' && fact.trim()).map(fact => clipText(fact, 500));
      if (facts.length >= 2 && facts.length <= 3) next.facts = facts;
    }
    return next;
  });
}