export type Board = 'all' | 'finance' | 'tech';
export type Layout = 'globe' | 'themes';
export type ThemeId = 'earth' | 'economy' | 'ai' | 'space';

export interface GeoReference {
  lat: number;
  lon: number;
  label: string;
  relation: 'event' | 'publisher' | 'subject';
  precision: 'point' | 'city' | 'country';
  evidence: string;
}

export interface ArticleSource {
  name: string;
  url: string;
  publishedAt: string;
}

export interface NewsEvent {
  id: string;
  title: string;
  titleOriginal: string;
  summary: string;
  theme: ThemeId;
  kind: string;
  publishedAt: string;
  occurredAt: string | null;
  locations: GeoReference[];
  sources: ArticleSource[];
  facts: string[];
  sourceId: string;
  summaryMode: 'editorial' | 'source' | 'metadata';
  tags?: string[];
}

export interface SourceStatus {
  id: string;
  name: string;
  url: string;
  policyUrl: string;
  rights: string;
  status: 'ok' | 'error';
  fetchedAt: string;
  attemptedAt?: string;
  count: number;
  error: string | null;
}

export interface Snapshot {
  schemaVersion: 1;
  generatedAt: string;
  sources: SourceStatus[];
  events: NewsEvent[];
}

export interface SceneState {
  events: readonly NewsEvent[];
  layout: Layout;
  selectedId: string | null;
  reducedMotion: boolean;
  quality: 'full' | 'light';
  railOpen: boolean;
}

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  overlay: HTMLDivElement;
  onPick: (id: string, groupIds: string[]) => void;
  onReady: () => void;
  onError: (message: string) => void;
}

export const themes: Record<ThemeId, { color: string }> = {
  earth: { color: '#efb477' },
  economy: { color: '#a4cabb' },
  ai: { color: '#b5b2ec' },
  space: { color: '#8cb8db' },
};

export function matchesBoard(event: NewsEvent, board: Board): boolean {
  return board === 'all' || (board === 'finance' ? event.theme === 'economy' : event.theme === 'ai' || event.theme === 'space');
}

export function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 32);
}

export function safeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

export function validateSnapshot(input: unknown): Snapshot {
  if (!input || typeof input !== 'object') throw new Error('不是有效的数据快照。');
  const s = input as Partial<Snapshot>;
  if (s.schemaVersion !== 1 || typeof s.generatedAt !== 'string' || !Number.isFinite(Date.parse(s.generatedAt)) || !Array.isArray(s.events) || !Array.isArray(s.sources)) throw new Error('快照版本、采集时间或事件结构不正确。');
  if (s.events.length > 1500 || s.sources.length > 30) throw new Error('快照超出本地版本的容量范围。');
  const ids = new Set<string>();
  for (const e of s.events) {
    if (!e || typeof e.id !== 'string' || !e.id || ids.has(e.id) || typeof e.title !== 'string' || typeof e.titleOriginal !== 'string' || typeof e.summary !== 'string' || typeof e.theme !== 'string' || !Object.hasOwn(themes, e.theme) || typeof e.kind !== 'string' || typeof e.sourceId !== 'string' || typeof e.publishedAt !== 'string' || !Number.isFinite(Date.parse(e.publishedAt)) || !(e.occurredAt === null || (typeof e.occurredAt === 'string' && Number.isFinite(Date.parse(e.occurredAt)))) || !['editorial','source','metadata'].includes(e.summaryMode) || !Array.isArray(e.locations) || !Array.isArray(e.sources) || e.sources.length === 0 || !Array.isArray(e.facts) || !e.facts.every((f: unknown) => typeof f === 'string')) throw new Error('事件字段不完整、时间无效或 ID 重复。');
    if (e.tags !== undefined && (!Array.isArray(e.tags) || e.tags.length > 12 || !e.tags.every((tag: unknown) => typeof tag === 'string' && tag.trim().length > 0 && tag.length <= 40))) throw new Error('事件标签格式无效。');
    ids.add(e.id);
    for (const g of e.locations) {
      if (!g || !Number.isFinite(g.lat) || Math.abs(g.lat) > 90 || !Number.isFinite(g.lon) || Math.abs(g.lon) > 180 || typeof g.label !== 'string' || typeof g.evidence !== 'string' || !['event','publisher','subject'].includes(g.relation) || !['point','city','country'].includes(g.precision)) throw new Error('事件地理关系不完整或坐标越界。');
    }
    for (const a of e.sources) if (!a || typeof a.name !== 'string' || !safeExternalUrl(a.url) || typeof a.publishedAt !== 'string' || !Number.isFinite(Date.parse(a.publishedAt))) throw new Error('来源链接必须为 HTTPS，且包含有效发布时间。');
  }
  for (const source of s.sources) {
    if (!source || typeof source.id !== 'string' || typeof source.name !== 'string' || !safeExternalUrl(source.url) || !safeExternalUrl(source.policyUrl) || typeof source.rights !== 'string' || !['ok','error'].includes(source.status) || typeof source.fetchedAt !== 'string' || !Number.isFinite(Date.parse(source.fetchedAt)) || !Number.isInteger(source.count) || source.count < 0 || !(source.error === null || typeof source.error === 'string')) throw new Error('信源状态记录不完整。');
    if (source.attemptedAt !== undefined && (typeof source.attemptedAt !== 'string' || !Number.isFinite(Date.parse(source.attemptedAt)))) throw new Error('信源尝试时间无效。');
  }
  const sourceIds = new Set(s.sources.map(source => source.id));
  if (sourceIds.size !== s.sources.length) throw new Error('信源 ID 不能重复。');
  if (s.events.some(event => !sourceIds.has(event.sourceId))) throw new Error('事件引用了不存在的信源。');
  const sourceCounts = new Map<string, number>();
  for (const event of s.events) sourceCounts.set(event.sourceId, (sourceCounts.get(event.sourceId) ?? 0) + 1);
  for (const source of s.sources) if (source.count !== (sourceCounts.get(source.id) ?? 0)) throw new Error('信源记录数量与事件不一致。');
  return s as Snapshot;
}
