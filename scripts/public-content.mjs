import { createHash } from 'node:crypto';
import GEMMA_LICENSE from '../assets/gemma-docs-license.json' with { type: 'json' };
import { validateSnapshot } from '../src/domain.ts';

/**
 * Public release projection.
 *
 * This module deliberately hard-codes the six reviewed source identities. A
 * changed feed URL or policy URL in the local catalog is therefore not enough
 * to make it public. Unknown sources, identity mismatches, and article links
 * outside the reviewed official hosts are dropped (fail closed).
 *
 * The projected snapshot contains only fields defined by the schema v1
 * `Snapshot`/`NewsEvent` types, rebuilt from reviewed fields. Source errors,
 * local editorial facts, extra JSON fields, and article queries are not copied.
 */

const SOURCE_ORDER = ['usgs', 'fed', 'ecb', 'arxiv', 'nasa', 'gemma'];

const DEFINITIONS = {
  usgs: {
    id: 'usgs',
    name: 'USGS 地震监测',
    shortName: 'USGS',
    sourceUrl: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson',
    policyUrl: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
    mode: 'earthquake-structured-metadata',
    theme: 'earth',
    kind: '地震',
    attribution: 'USGS 地震监测（美国政府公开数据）',
    rights: 'USGS 地震目录通常属美国政府公开数据，可复制与再分发并须署名 USGS；本公开候选只保留结构化地震元数据，不据震级推断伤亡、破坏或灾害严重程度。第三方内容除外。',
    article: url => url.hostname === 'earthquake.usgs.gov' && url.pathname.replace(/\/{2,}/g, '/').startsWith('/earthquakes/eventpage/'),
  },
  fed: {
    id: 'fed',
    name: '美联储理事会',
    shortName: '美联储理事会',
    label: '美联储理事会新闻稿',
    sourceUrl: 'https://www.federalreserve.gov/feeds/press_all.xml',
    policyUrl: 'https://www.federalreserve.gov/disclaimer.htm',
    mode: 'official-link-only',
    theme: 'economy',
    kind: '机构发布',
    attribution: 'Board of Governors of the Federal Reserve System（美联储理事会）',
    rights: '美联储理事会网站内容除特别标注外属公有领域，可复制与分发，但须注明理事会为来源；第三方材料、照片、图形及印章/徽标除外。本公开候选只链接官方新闻稿，不转载标题或摘要。',
    article: url => url.hostname === 'www.federalreserve.gov' && url.pathname.startsWith('/newsevents/pressreleases/'),
    publisherLocation: {
      label: '华盛顿特区（美联储理事会）',
      lat: 38.8921,
      lon: -77.0351,
      evidence: '美联储理事会位于华盛顿特区；该坐标只表示发布机构所在地，并非事件发生地，也不表示政策影响范围。',
    },
  },
  ecb: {
    id: 'ecb',
    name: '欧洲央行',
    shortName: '欧洲央行',
    label: '欧洲央行新闻稿',
    sourceUrl: 'https://www.ecb.europa.eu/rss/press.html',
    policyUrl: 'https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html',
    mode: 'official-link-only',
    theme: 'economy',
    kind: '机构发布',
    attribution: 'European Central Bank（欧洲央行）',
    rights: '欧洲央行允许在注明来源、保证信息准确并说明修改的前提下免费使用网站信息；含作者署名的文件如工作论文、不定期论文以不同出版物形式再版须事先书面授权。出售含其信息的文件须在付费前及每次访问时告知信息可免费获取。本公开候选只链接官方页面，不构成付费内容或全文再分发授权。',
    article: url => ['www.ecb.europa.eu', 'ecb.europa.eu'].includes(url.hostname) && url.pathname.replace(/\/{2,}/g, '/').startsWith('/press/'),
    publisherLocation: {
      label: '法兰克福（欧洲央行）',
      lat: 50.1109,
      lon: 8.6821,
      evidence: '欧洲央行总部位于德国法兰克福；该坐标只表示发布机构所在地，并非事件发生地，也不表示政策影响范围。',
    },
  },
  arxiv: {
    id: 'arxiv',
    name: 'arXiv 研究元数据',
    shortName: 'arXiv',
    sourceUrl: 'https://export.arxiv.org/api/query?search_query=cat%3Acs.AI+OR+cat%3Acs.LG+OR+cat%3Acs.CL&sortBy=submittedDate&sortOrder=descending&max_results=10',
    policyUrl: 'https://info.arxiv.org/help/api/tou.html',
    mode: 'arxiv-descriptive-metadata',
    theme: 'ai',
    kind: '研究预印本',
    attribution: 'arXiv（arXiv.org）',
    rights: 'arXiv 允许检索、存储、转换与分享描述性元数据（CC0 1.0）；论文内容版权仍属作者，不得存储或提供 PDF/源码，除非许可允许。本公开候选只保留题录并链接摘要页，不包含论文全文或摘要正文。',
    article: url => ['arxiv.org', 'www.arxiv.org'].includes(url.hostname) && url.pathname.startsWith('/abs/'),
  },
  nasa: {
    id: 'nasa',
    name: 'NASA 官方内容',
    shortName: 'NASA',
    label: 'NASA 新闻稿',
    sourceUrl: 'https://www.nasa.gov/news-release/feed/',
    policyUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
    mode: 'official-link-only',
    theme: 'space',
    kind: 'NASA 发布',
    attribution: 'NASA（美国国家航空航天局）',
    rights: 'NASA 内容通常不受美国版权保护，可在不暗示 NASA 背书的前提下作事实性使用并注明 NASA；第三方版权材料、徽标、可识别人物及商业/周边用途适用额外条件。本公开候选只链接官方页面，不使用图片、徽标或全文。',
    article: url => (
      (url.hostname === 'www.nasa.gov' && /^(?:\/news-release\/|\/centers-and-facilities\/|\/image-article\/|\/directorates\/|\/missions\/)/.test(url.pathname))
      || (url.hostname === 'science.nasa.gov' && /^(?:\/image-article\/|\/earth\/earth-observatory\/|\/photojournal\/|\/blogs\/science-news\/)/.test(url.pathname))
    ),
  },
  gemma: {
    id: 'gemma',
    name: 'Google Gemma 官方发布记录',
    shortName: 'Google Gemma',
    sourceUrl: 'https://raw.githubusercontent.com/google-gemma/docs/main/docs/models/releases.md',
    policyUrl: 'https://github.com/google-gemma/docs/blob/main/LICENSE',
    mode: 'gemma-apache-excerpt',
    theme: 'ai',
    kind: '官方模型发布',
    attribution: 'Google DeepMind / google-gemma/docs（Apache-2.0）',
    rights: 'google-gemma/docs 文档源码以 Apache-2.0 授权；本公开候选摘录官方发布条目并生成中文标题，已注明修改并随附许可证。文档许可不等于各模型权重许可，也不表示 Google 或 DeepMind 背书。',
    article: url => (
      (url.hostname === 'gemma.ai' && /^\/models\/releases\/?$/.test(url.pathname))
      || (url.hostname === 'github.com' && url.pathname === '/google-gemma/docs/blob/main/docs/models/releases.md')
    ),
  },
};

const MODES = Object.freeze(Object.fromEntries(SOURCE_ORDER.map(id => [id, DEFINITIONS[id].mode])));

function parsedHttps(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return url;
  } catch {
    return null;
  }
}

function sameUrl(value, expected) {
  const actualUrl = parsedHttps(value);
  const expectedUrl = parsedHttps(expected);
  return Boolean(actualUrl && expectedUrl && actualUrl.href === expectedUrl.href);
}

function safeText(value, limit) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function canonicalArticleUrl(url, sourceId) {
  const copy = new URL(url.href);
  copy.username = '';
  copy.password = '';
  copy.search = '';
  if (sourceId !== 'gemma' || !/^#[a-z]+-\d{1,2}-\d{4}$/i.test(copy.hash)) copy.hash = '';
  return copy.href;
}

function articleName(definition, url) {
  if (definition.id === 'gemma') {
    return url.hostname === 'gemma.ai' ? 'Google Gemma · 发布记录' : '官方文档源码 · Apache-2.0';
  }
  return definition.shortName;
}

function projectedArticleSources(definition, event) {
  const projected = [];
  for (const source of event.sources) {
    const url = parsedHttps(source.url);
    if (!url || !definition.article(url)) return null;
    projected.push({
      name: articleName(definition, url),
      url: canonicalArticleUrl(url, definition.id),
      publishedAt: event.publishedAt,
    });
  }
  return projected.length ? projected : null;
}

function usgsLocations(event) {
  return event.locations
    .filter(location => location.relation === 'event' && location.precision === 'point'
      && Number.isFinite(location.lat) && Number.isFinite(location.lon))
    .slice(0, 4)
    .map(location => ({
      lat: location.lat,
      lon: location.lon,
      label: safeText(location.label, 200) || 'USGS 震中',
      relation: 'event',
      precision: 'point',
      evidence: `USGS 发布的结构化事件坐标（纬度 ${location.lat.toFixed(4)}，经度 ${location.lon.toFixed(4)}）；仅表示震中位置，不表示灾害严重程度或影响范围。`,
    }));
}

function publisherLocation(definition) {
  const location = definition.publisherLocation;
  if (!location) return [];
  return [{
    lat: location.lat,
    lon: location.lon,
    label: location.label,
    relation: 'publisher',
    precision: 'city',
    evidence: location.evidence,
  }];
}

function projectedEvent(definition, event) {
  const sources = projectedArticleSources(definition, event);
  if (!sources) return null;

  const id = createHash('sha256').update(event.id).digest('hex');
  const date = event.publishedAt.slice(0, 10);

  if (definition.id === 'usgs') {
    const title = safeText(event.titleOriginal, 400) || 'USGS 地震记录';
    return {
      id,
      title,
      titleOriginal: title,
      summary: 'USGS 发布的地震事件结构化元数据；震级、地点与时间以官方事件页为准。',
      theme: definition.theme,
      kind: definition.kind,
      publishedAt: event.publishedAt,
      occurredAt: event.occurredAt,
      locations: usgsLocations(event),
      sources,
      facts: [
        'USGS 地震目录属美国政府公开数据；本公开候选只保留结构化事件元数据。',
        '未据震级推断伤亡、破坏或灾害严重程度。',
        '来源：USGS 地震监测；署名不代表 USGS 对本项目的背书。',
      ],
      sourceId: definition.id,
      summaryMode: 'metadata',
    };
  }

  if (definition.id === 'arxiv') {
    const title = safeText(event.titleOriginal, 400) || 'arXiv 预印本题录';
    return {
      id,
      title,
      titleOriginal: title,
      summary: 'arXiv API 描述性元数据；本公开候选只保留题录并链接官方摘要页，不包含论文全文、PDF 或摘要正文。',
      theme: definition.theme,
      kind: definition.kind,
      publishedAt: event.publishedAt,
      occurredAt: null,
      locations: [],
      sources,
      facts: [
        '来源：arXiv API 描述性元数据（CC0 1.0）；未包含论文全文、PDF 或源码。',
        '论文版权仍属作者；预印本未经同行评审。',
        'arXiv 仅为元数据来源，不表示对本项目的背书。',
      ],
      sourceId: definition.id,
      summaryMode: 'metadata',
    };
  }

  if (definition.id === 'gemma') {
    const excerpt = safeText(event.titleOriginal, 700);
    return {
      id,
      title: `Gemma 官方发布 · ${date}`,
      titleOriginal: excerpt,
      summary: excerpt,
      theme: definition.theme,
      kind: definition.kind,
      publishedAt: event.publishedAt,
      occurredAt: null,
      locations: [],
      sources,
      facts: [
        `Google Gemma 官方文档记载的发布信息：${date}；时刻与时区未提供，不补写。`,
        '来源：Google DeepMind / google-gemma/docs（Apache-2.0）。环讯摘录发布条目并生成中文标题；完整许可证与修改说明随公开候选提供。',
        '文档许可不等于模型权重许可；不代表 Google 或 DeepMind 背书。',
      ],
      sourceId: definition.id,
      summaryMode: 'source',
    };
  }

  const title = `${definition.label} · ${date}`;
  const facts = [
    `来源：${definition.name}；官方原文发布时间 ${event.publishedAt}。`,
    '公开候选未复制标题、摘要、正文或据原文推导的事件详情；请以官方原文为准。',
  ];
  if (definition.id === 'ecb') {
    facts.push('欧洲央行材料可能受付费/订阅或署名文章例外约束；本候选不构成付费内容或全文再分发授权。');
  } else if (definition.id === 'nasa') {
    facts.push('NASA 内容作事实性使用，不暗示 NASA 背书；不使用 NASA 徽标、图片或第三方版权材料。');
  } else {
    facts.push('美联储理事会材料除特别标注外属公有领域；须注明理事会为来源，第三方材料与徽标除外。');
  }

  return {
    id,
    title,
    titleOriginal: '',
    summary: '本公开候选只提供发布机构、发布日期与官方原文链接，不转载原标题、摘要或正文。',
    theme: definition.theme,
    kind: definition.kind,
    publishedAt: event.publishedAt,
    occurredAt: null,
    locations: publisherLocation(definition),
    sources,
    facts,
    sourceId: definition.id,
    summaryMode: 'metadata',
  };
}

function manifestEntry(definition, kept, omitted, reason = null) {
  const entry = {
    id: definition.id,
    name: definition.name,
    mode: definition.mode,
    sourceUrl: definition.sourceUrl,
    policyUrl: definition.policyUrl,
    status: reason ? 'excluded' : 'included',
    kept,
    omitted,
    attribution: definition.attribution,
    rights: definition.rights,
  };
  if (reason) entry.reason = reason;
  if (definition.id === 'gemma') {
    entry.license = {
      name: 'Apache-2.0',
      url: GEMMA_LICENSE.licenseUrl,
      sha256: GEMMA_LICENSE.licenseSha256,
      modifications: GEMMA_LICENSE.modifications,
      text: GEMMA_LICENSE.text,
    };
  }
  return entry;
}

/**
 * Project a validated schema v1 snapshot to the public candidate.
 *
 * @param {unknown} input
 * @returns {{ snapshot: import('../src/domain.ts').Snapshot, sources: Array<object> }}
 */
export function publicSnapshot(input) {
  const trusted = validateSnapshot(input);
  const sourceStatuses = new Map(trusted.sources.map(source => [source.id, source]));
  const outputSources = [];
  const outputEvents = [];
  const manifest = [];

  for (const id of SOURCE_ORDER) {
    const definition = DEFINITIONS[id];
    const status = sourceStatuses.get(id);
    if (!status) continue;

    const sourceEvents = trusted.events.filter(event => event.sourceId === id);
    if (!sameUrl(status.url, definition.sourceUrl) || !sameUrl(status.policyUrl, definition.policyUrl)) {
      manifest.push(manifestEntry(definition, 0, sourceEvents.length, 'source-identity-mismatch'));
      continue;
    }

    const keptEvents = [];
    for (const event of sourceEvents) {
      const projected = projectedEvent(definition, event);
      if (projected) keptEvents.push(projected);
    }

    outputSources.push({
      id: definition.id,
      name: definition.name,
      url: definition.sourceUrl,
      policyUrl: definition.policyUrl,
      rights: definition.rights,
      status: status.status,
      fetchedAt: status.fetchedAt,
      count: keptEvents.length,
      error: status.status === 'error' ? '本次公开候选未包含原始错误详情；只保留可验证的本地记录。' : null,
    });
    outputEvents.push(...keptEvents);
    manifest.push(manifestEntry(definition, keptEvents.length, sourceEvents.length - keptEvents.length));
  }

  const snapshot = validateSnapshot({
    schemaVersion: 1,
    generatedAt: trusted.generatedAt,
    sources: outputSources,
    events: outputEvents,
  });

  return { snapshot, sources: manifest };
}

export { MODES as PUBLIC_SOURCE_MODES };
