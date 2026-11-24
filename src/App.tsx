import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { AtlasScene } from './scene/AtlasScene';
import { matchesBoard, themes, validateSnapshot } from './domain';
import type { Board, GeoReference, Layout, NewsEvent, Snapshot, SourceStatus, ThemeId } from './domain';
import { clearCustomSource, loadCustomState, saveCustomState } from './customFeeds';
import type { CustomFeedState, CustomSourceConfig } from './customFeeds';
import { SourceStudio } from './SourceStudio';
import {
  containsCjk,
  eventTitle,
  formatEditionDay,
  formatLocaleDate,
  formatUtcStamp,
  getStoredLocale,
  isOfficialModelRelease,
  isResearchPreprint,
  kindLabel,
  messages,
  placeEvidence,
  placeLabel,
  providerLabel,
  sourceRights,
  storeLocale,
  themeLabel,
} from './i18n';
import { RegionAnchor } from './RegionAnchor';
import { indexRegionLocations, regionName } from './regions';
import type { AnchorRegion } from './regions';
import type { Locale } from './i18n';
import { TooltipLayer } from './TooltipLayer';
import gemmaLicense from '../assets/gemma-docs-license.json';

// Both entry points replace this expression at build time.
declare const process: { env: { NODE_ENV: string } };

const techTracks = ['releases', 'research', 'other'] as const;
type TechTrack = typeof techTracks[number];
type Period = 'day' | 'week' | 'all';
type EventGroup = { kind: 'place'; ids: string[] } | { kind: 'unlocated' };

function matchesScope(event: NewsEvent, board: Board, track: TechTrack): boolean {
  if (!matchesBoard(event, board)) return false;
  if (board !== 'tech') return true;
  const kind = isOfficialModelRelease(event.kind) ? 'releases' : isResearchPreprint(event.kind) ? 'research' : 'other';
  return kind === track;
}

type IconName = 'search' | 'close' | 'arrow' | 'fold' | 'globe' | 'clusters' | 'back' | 'layers' | 'motion' | 'info' | 'import' | 'reset' | 'check' | 'chevron' | 'plus';
const iconPaths: Record<IconName, ReactNode> = {
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  fold: <path d="M5 18h6a5 5 0 0 0 5-5V6m-4 4 4-4 4 4" />,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
  clusters: <><circle cx="7" cy="7" r="3" /><circle cx="17" cy="9" r="2.5" /><circle cx="11" cy="18" r="3" /><path d="m9 9 6-1m-7 2 2 5m5-4-3 4" /></>,
  back: <path d="M19 12H5m6-6-6 6 6 6" />,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
  motion: <><path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></>,
  import: <><path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  chevron: <path d="m7 9 5 5 5-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
};
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

function AtlasMark() {
  return <svg className="brand-mark" width="34" height="34" viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="1" /><ellipse cx="20" cy="20" rx="7" ry="14" stroke="currentColor" strokeWidth="1" transform="rotate(35 20 20)" /><path d="M6 22c9-8 18-8 28-4" stroke="currentColor" /><circle cx="29" cy="9" r="3" fill="var(--amber)" stroke="var(--background)" strokeWidth="2" /></svg>;
}

function Modal({ title, locale, onClose, children }: { title: string; locale: Locale; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const t = messages[locale];
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => { if (node?.open) node.close(); };
  }, []);
  return <dialog ref={dialog} className="modal" aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <div className="modal-inner"><header className="modal-heading"><div><span className="eyebrow">{t.modal.eyebrow}</span><h2>{title}</h2></div><button type="button" className="icon-button" aria-label={t.modal.close} data-tooltip={t.modal.close} onClick={onClose}><Icon name="close" /></button></header>{children}</div>
  </dialog>;
}

function EventRow({ event, active, retained, locale, places, onClick }: { event: NewsEvent; active: boolean; retained: boolean; locale: Locale; places?: readonly GeoReference[]; onClick: () => void }) {
  const t = messages[locale];
  const title = eventTitle(event, locale);
  return <button type="button" className={`event-row${active ? ' is-active' : ''}`} onClick={onClick} aria-pressed={active} data-tooltip={t.event.readTip(title)} style={{ '--event-color': themes[event.theme].color } as CSSProperties}>
    <span className="event-line"><span className="event-category"><i />{kindLabel(event.kind, locale)}</span><time dateTime={event.publishedAt}>{isOfficialModelRelease(event.kind) ? formatEditionDay(event.publishedAt, locale) : formatLocaleDate(event.publishedAt, locale)}</time></span>
    <span className="event-title">{title}</span>
    {places && <span className="event-region-places">{places.map((place, index) => <span key={index}>{t.reader.relations[place.relation]} · {placeLabel(place.label, locale)}</span>)}</span>}
    <span className="event-bottom"><span>{providerLabel(event.sources[0].name, locale)}{retained && <em className="retained-tag">{t.event.retained}</em>}</span><Icon name="arrow" size={15} /></span>
  </button>;
}

function Reader({ event, locked, filteredOut, retainedAt, locale, onClose }: { event: NewsEvent; locked: boolean; filteredOut: boolean; retainedAt?: string; locale: Locale; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const t = messages[locale];
  const primaryTitle = eventTitle(event, locale);
  const secondaryTitle = event.title !== event.titleOriginal ? (locale === 'en' ? event.title : event.titleOriginal) : null;
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 0; heading.current?.focus({ preventScroll: true }); }, [event.id]);
  return <aside className="reader" role="dialog" aria-modal="false" aria-labelledby="reader-title" style={{ '--event-color': themes[event.theme].color } as CSSProperties}>
    <header className="reader-toolbar"><span className="eyebrow"><span className="reader-lock">◇</span> {t.reader.locked}</span><button type="button" className="icon-button" aria-label={t.reader.close} data-tooltip={t.reader.closeTip} onClick={onClose}><Icon name="close" /></button></header>
    <div className="reader-scroll" ref={scroll}>
      <div className="reader-kind"><i />{themeLabel(event.theme, locale)}<span>/</span>{kindLabel(event.kind, locale)}</div>
      <h2 id="reader-title" ref={heading} tabIndex={-1}>{primaryTitle}</h2>
      {secondaryTitle && <p className="original-title" lang={locale === 'en' ? 'zh-CN' : undefined}>{locale === 'en' ? t.reader.editorialTitleLabel : t.reader.originalTitleLabel} · {secondaryTitle}</p>}
      <div className="reader-dates"><span>{/^\d{4}-\d{2}-\d{2}$/.test(event.publishedAt) ? <>{t.reader.publishedDay} <time dateTime={event.publishedAt}>{event.publishedAt}</time> · {t.reader.timeMissing}</> : <>{t.reader.published} <time dateTime={event.publishedAt}>{formatLocaleDate(event.publishedAt, locale, true)} UTC</time></>}</span>{event.occurredAt && <span>{t.reader.occurred} {formatLocaleDate(event.occurredAt, locale, true)} UTC</span>}</div>
      {(locked || filteredOut) && <p className="context-notice">{locked ? t.reader.lockedNotice : t.reader.filteredNotice}</p>}
      {retainedAt && !locked && <p className="context-notice">{t.reader.retainedNotice(formatUtcStamp(retainedAt, locale))}</p>}
      <div className="reader-divider" />
      <span className="section-kicker">{t.reader.summaryKicker}</span>
      <p className="reader-summary" lang={event.summaryMode === 'editorial' ? 'zh-CN' : undefined}>{event.summary || t.reader.summaryFallback}</p>
      <p className="summary-label">{t.reader.summaryLabels[event.summaryMode]}</p>
      {event.facts.length > 0 && <section className="reader-section"><h3>{t.reader.facts}</h3><ul className="fact-list">{event.facts.map((fact, i) => <li key={i} lang={locale === 'en' && containsCjk(fact) ? 'zh-CN' : undefined}>{fact}</li>)}</ul></section>}
      <section className="reader-section"><h3>{t.reader.relationHeading}</h3>{event.locations.length ? event.locations.map((geo, i) => {
        const label = placeLabel(geo.label, locale);
        const evidence = placeEvidence(geo.evidence, locale);
        return <div className="geo-card" key={`${geo.label}-${i}`}><div><strong>{label}</strong><span className={`relation-tag ${geo.relation === 'event' ? '' : 'association'}`}>{t.reader.relations[geo.relation]}</span></div><p lang={locale === 'en' && containsCjk(evidence) ? 'zh-CN' : undefined}>{evidence}</p><span className="geo-precision">{t.reader.precisions[geo.precision]} · {Math.abs(geo.lat).toFixed(2)}°{geo.lat >= 0 ? 'N' : 'S'} / {Math.abs(geo.lon).toFixed(2)}°{geo.lon >= 0 ? 'E' : 'W'}</span></div>;
      }) : <div className="geo-card"><strong>{t.reader.noLocationTitle}</strong><p>{t.reader.noLocationBody}</p></div>}</section>
      <section className="reader-section"><h3>{t.reader.sources} <span>{event.sources.length.toString().padStart(2, '0')}</span></h3>{event.sources.map(source => <a className="source-link" href={source.url} target="_blank" rel="noopener noreferrer" key={source.url}><span><strong>{providerLabel(source.name, locale)}</strong><small>{new URL(source.url).hostname}</small></span><Icon name="arrow" /></a>)}</section>
      <p className="reader-footnote">{t.reader.footnote}</p>
    </div>
  </aside>;
}

function SourceFilter({ variant, locale, options, total, selected, onToggle, onReset }: {
  variant: 'desktop' | 'rail';
  locale: Locale;
  options: { source: SourceStatus; count: number }[];
  total: number;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onReset: () => void;
}) {
  const t = messages[locale];
  const bodyId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const allSelected = selected.size === 0;
  const collapseOnEscape = (event: ReactKeyboardEvent<HTMLElement>) => {
    const button = trigger.current;
    if (event.key !== 'Escape' || !open || !button) return;
    if (button.getClientRects().length === 0 || getComputedStyle(button).visibility === 'hidden') return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    button.focus();
  };
  return <section className={`source-scope source-scope--${variant}`} aria-label={t.sourceScope.aria} onKeyDown={collapseOnEscape}>
    <header className="source-scope-heading">
      <h2>{t.sourceScope.title}</h2>
      <button ref={trigger} type="button" className="source-scope-trigger" aria-expanded={open} aria-controls={bodyId} data-tooltip={open ? t.sourceScope.collapseTip : t.sourceScope.expandTip} onClick={() => setOpen(value => !value)}>
        <span>{allSelected ? t.sourceScope.all : t.sourceScope.selected(selected.size)}</span><Icon name="chevron" size={14} />
      </button>
      <button type="button" className="source-scope-reset" aria-disabled={allSelected} aria-label={t.sourceScope.resetAria} data-tooltip={t.sourceScope.resetTip} onClick={onReset}><Icon name="reset" size={14} /><span>{t.sourceScope.reset}</span></button>
    </header>
    <div className="source-scope-body" id={bodyId} data-open={open ? 'true' : 'false'}>
      <button type="button" className="source-scope-all" data-active={allSelected ? 'true' : 'false'} data-source-id="all" aria-pressed={allSelected} aria-label={t.sourceScope.allAria(total)} data-tooltip={t.sourceScope.allTip} onClick={onReset}><span>{t.sourceScope.all}</span><b>{total}</b></button>
      <div className="source-scope-options" role="group" aria-label={t.sourceScope.optionsAria}>
        {options.map(({ source, count }) => {
          const label = providerLabel(source.name, locale);
          const active = selected.has(source.id);
          return <button type="button" key={source.id} aria-pressed={active} aria-label={t.sourceScope.sourceAria(label, count)} data-tooltip={t.sourceScope.sourceTip(label, active)} data-source-id={source.id} onClick={() => onToggle(source.id)}><Icon name="check" size={13} /><span>{label}</span><b>{count}</b></button>;
        })}
      </div>
    </div>
  </section>;
}

function railDefaultOpen() {
  return !matchMedia('(max-width: 760px)').matches;
}

export function App({ initialSnapshot }: { initialSnapshot: Snapshot }) {
  const [locale, setLocale] = useState<Locale>(getStoredLocale);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [board, setBoard] = useState<Board>('all');
  const [techTrack, setTechTrack] = useState<TechTrack>('releases');
  const [layout, setLayout] = useState<Layout>('globe');
  const [period, setPeriod] = useState<Period>('week');
  const [releasePeriod, setReleasePeriod] = useState<Period>('week');
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pinnedEvent, setPinnedEvent] = useState<NewsEvent | null>(null);
  const [eventGroup, setEventGroup] = useState<EventGroup | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [customState, setCustomState] = useState<CustomFeedState>(loadCustomState);
  const [companionAvailable, setCompanionAvailable] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [anchoredRegion, setAnchoredRegion] = useState<AnchorRegion | null>(null);
  const [areaScope, setAreaScope] = useState<AnchorRegion | null>(null);
  const [railOpen, setRailOpen] = useState(railDefaultOpen);
  const [quality, setQuality] = useState<'full' | 'light'>('full');
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const scene = useRef<AtlasScene | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const searchToggle = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const rangeSelect = useRef<HTMLSelectElement>(null);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const t = messages[locale];
  const isReleaseTrack = board === 'tech' && techTrack === 'releases';
  const activePeriod = isReleaseTrack ? releasePeriod : period;

  const openRail = useCallback(() => setRailOpen(true), []);

  const activeSnapshot = useMemo<Snapshot>(() => {
    if (!customState.sources.length && !customState.events.length) return snapshot;
    const baseSourceIds = new Set(snapshot.sources.map(s => s.id));
    const baseEventIds = new Set(snapshot.events.map(e => e.id));
    return {
      schemaVersion: 1,
      generatedAt: snapshot.generatedAt,
      sources: [...snapshot.sources, ...customState.sources.filter(s => !baseSourceIds.has(s.id))],
      events: [...snapshot.events, ...customState.events.filter(e => !baseEventIds.has(e.id))],
    };
  }, [snapshot, customState]);

  const eventMap = useMemo(() => new Map(activeSnapshot.events.map(event => [event.id, event])), [activeSnapshot]);
  const sourceMap = useMemo(() => new Map(activeSnapshot.sources.map(source => [source.id, source])), [activeSnapshot]);
  const selectedEvent = selectedId ? (pinnedEvent?.id === selectedId ? pinnedEvent : eventMap.get(selectedId)) ?? null : null;
  const selectedSource = selectedEvent ? sourceMap.get(selectedEvent.sourceId) : undefined;
  const selectedRef = useRef(selectedEvent);
  selectedRef.current = selectedEvent;
  const scopeEvents = useMemo(() => activeSnapshot.events.filter(event => matchesScope(event, board, techTrack)), [activeSnapshot.events, board, techTrack]);
  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of scopeEvents) {
      for (const tag of event.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [scopeEvents]);
  const areaPlaces = useMemo(() => areaScope ? indexRegionLocations(activeSnapshot.events, areaScope) : null, [areaScope, activeSnapshot.events]);
  const editionEnd = useMemo(() => Math.max(Date.parse(activeSnapshot.generatedAt), ...customState.events.map(e => Date.parse(e.publishedAt)).filter(Number.isFinite)), [activeSnapshot.generatedAt, customState.events]);
  const matchingEvents = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    return scopeEvents.filter(event => {
      if (areaPlaces && !areaPlaces.has(event.id)) return false;
      if (tagFilter && !(event.tags ?? []).includes(tagFilter)) return false;
      return Date.parse(event.publishedAt) <= editionEnd + 300_000 && (!text || [
        event.title,
        event.titleOriginal,
        event.summary,
        event.kind,
        ...(event.tags ?? []),
        kindLabel(event.kind, 'zh-CN'),
        kindLabel(event.kind, 'en'),
        themeLabel(event.theme, 'zh-CN'),
        themeLabel(event.theme, 'en'),
        ...event.locations.flatMap(g => [g.label, placeLabel(g.label, 'zh-CN'), placeLabel(g.label, 'en')]),
        ...event.sources.map(s => s.name),
        ...event.sources.map(s => providerLabel(s.name, 'zh-CN')),
        ...event.sources.map(s => providerLabel(s.name, 'en')),
      ].join(' ').toLocaleLowerCase().includes(text));
    });
  }, [scopeEvents, areaPlaces, editionEnd, query, tagFilter]);
  const candidates = useMemo(() => {
    const start = activePeriod === 'all' ? -Infinity : editionEnd - (activePeriod === 'day' ? 1 : 7) * 86_400_000;
    return matchingEvents.filter(event => Date.parse(event.publishedAt) >= start).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  }, [matchingEvents, editionEnd, activePeriod]);
  const filtered = useMemo(() => sourceFilter.size === 0 ? candidates : candidates.filter(event => sourceFilter.has(event.sourceId)), [candidates, sourceFilter]);
  const sceneEvents = useMemo(() => areaPlaces ? filtered.map(event => {
    const locations = areaPlaces.get(event.id)!;
    return locations.length === event.locations.length ? event : { ...event, locations };
  }) : filtered, [areaPlaces, filtered]);
  const sourceOptions = useMemo(() => {
    const boardSourceIds = new Set(scopeEvents.map(event => event.sourceId));
    const counts = new Map<string, number>();
    candidates.forEach(event => counts.set(event.sourceId, (counts.get(event.sourceId) ?? 0) + 1));
    return activeSnapshot.sources.filter(source => boardSourceIds.has(source.id)).map(source => ({ source, count: counts.get(source.id) ?? 0 }));
  }, [activeSnapshot.sources, scopeEvents, candidates]);
  const unlocatedEvents = useMemo(() => filtered.filter(event => event.locations.length === 0), [filtered]);
  const railEvents = useMemo(() => {
    if (eventGroup?.kind === 'unlocated') return unlocatedEvents;
    if (eventGroup?.kind === 'place') return filtered.filter(event => eventGroup.ids.includes(event.id));
    return filtered;
  }, [filtered, eventGroup, unlocatedEvents]);
  const areaGroups = useMemo(() => {
    if (!areaPlaces) return null;
    const local: NewsEvent[] = [], associated: NewsEvent[] = [];
    for (const event of railEvents) {
      (areaPlaces.get(event.id)?.some(place => place.relation === 'event') ? local : associated).push(event);
    }
    return { local, associated };
  }, [areaPlaces, railEvents]);
  const hasSourceHistory = activePeriod !== 'all' && sourceFilter.size > 0 && filtered.length === 0
    && matchingEvents.some(event => sourceFilter.has(event.sourceId));
  const releaseEmpty = isReleaseTrack && candidates.length === 0 && !query.trim();
  const hasReleaseHistory = isReleaseTrack && scopeEvents.length > 0;
  const themeCounts = useMemo(() => {
    const counts = { earth: 0, economy: 0, ai: 0, space: 0 };
    filtered.forEach(event => counts[event.theme]++);
    return counts;
  }, [filtered]);
  const sourceOk = activeSnapshot.sources.filter(source => source.status === 'ok').length;
  const areaName = areaScope ? regionName(areaScope, locale) : null;
  const railTitle = areaName ? t.regionBrowse.title(areaName) : eventGroup?.kind === 'unlocated' ? t.footer.global : eventGroup ? t.rail.regionTitle : board === 'tech' ? t.rail.techTitle : t.rail.worldTitle;
  const placeCount = new Set(sceneEvents.flatMap(event => event.locations.map(g => `${g.label}:${g.relation}`))).size;
  const snapshotDay = formatEditionDay(activeSnapshot.generatedAt, locale);
  const hero = t.chrome.hero[board];

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t.meta.title;
    storeLocale(locale);
  }, [locale, t]);

  useEffect(() => {
    if (!canvas.current || !overlay.current) return;
    try {
      scene.current = new AtlasScene({ canvas: canvas.current, overlay: overlay.current,
        onReady: () => setSceneReady(true), onError: message => setSceneError(message),
        onPick: (id, groupIds) => {
          if (groupIds.length > 1) { setEventGroup({ kind: 'place', ids: groupIds }); openRail(); }
          else { setSelectedId(id); setPinnedEvent(null); }
        },
      });
    } catch (error) { setSceneError(error instanceof Error ? error.message : messages[localeRef.current].scene.initError); }
    return () => { scene.current?.dispose(); scene.current = null; };
  }, []);

  useEffect(() => {
    scene.current?.setLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (typeof location === 'undefined' || !/^https?:$/i.test(location.protocol)) return;
    const controller = new AbortController();
    fetch('/api/atlas-companion/health', { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then((data: { ok?: boolean; mode?: string } | null) => {
        if (data?.ok && data?.mode === 'companion') setCompanionAvailable(true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => { scene.current?.update({ events: sceneEvents, layout, selectedId, reducedMotion, quality, railOpen }); }, [sceneEvents, layout, selectedId, reducedMotion, quality, railOpen]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => { if (searchOpen) searchInput.current?.focus(); }, [searchOpen]);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery('');
    searchToggle.current?.focus({ preventScroll: true });
  }, []);
  const escapeStateRef = useRef({ searchOpen, selectedId, eventGroup, areaScope, tagFilter, sourceFilterSize: sourceFilter.size, railOpen });
  escapeStateRef.current = { searchOpen, selectedId, eventGroup, areaScope, tagFilter, sourceFilterSize: sourceFilter.size, railOpen };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('dialog')) return;
      if (event.key === 'Escape') {
        const s = escapeStateRef.current;
        if (s.searchOpen) {
          closeSearch();
        } else if (s.selectedId !== null) {
          setSelectedId(null);
          setPinnedEvent(null);
        } else if (s.eventGroup !== null) {
          setEventGroup(null);
          if (!railDefaultOpen()) setRailOpen(false);
        } else if (s.areaScope !== null) {
          setAreaScope(null);
        } else if (s.tagFilter !== null) {
          setTagFilter(null);
        } else if (s.sourceFilterSize > 0) {
          setSourceFilter(new Set<string>());
        } else if (!railDefaultOpen() && s.railOpen) {
          setRailOpen(false);
        }
      } else if (!target.closest('input,select,textarea') && event.key === '/' && !event.metaKey && !event.ctrlKey) { event.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [closeSearch]);

  const selectEvent = useCallback((id: string) => {
    setSelectedId(id); setPinnedEvent(null);
    scene.current?.focusEvent(id);
  }, []);
  const toggleSource = (id: string) => {
    const next = new Set(sourceFilter);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSourceFilter(next);
    setEventGroup(null);
    if (next.size > 0 && !candidates.some(event => next.has(event.sourceId))) openRail();
  };
  const resetSources = useCallback(() => {
    if (sourceFilter.size === 0) return;
    setSourceFilter(new Set<string>());
    setEventGroup(null);
  }, [sourceFilter.size]);
  const reset = () => {
    setSelectedId(null); setPinnedEvent(null); setEventGroup(null); setRailOpen(railDefaultOpen());
    setAreaScope(null);
    setLayout('globe'); scene.current?.resetView();
  };
  const changeScope = (next: Board, track = techTrack) => {
    const applicable = new Set(activeSnapshot.events.filter(event => matchesScope(event, next, track)).map(event => event.sourceId));
    setBoard(next); setTechTrack(track); setEventGroup(null);
    setTagFilter(null);
    if (next === 'tech' && board !== 'tech') openRail();
    setSourceFilter(current => {
      if (current.size === 0) return current;
      const kept = [...current].filter(id => applicable.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  };
  const saveCustomFeed = (config: CustomSourceConfig, source: SourceStatus, events: NewsEvent[]) => {
    setPinnedEvent(current => current ?? selectedRef.current);
    setCustomState(current => {
      const cleaned = clearCustomSource(current, config.id);
      const next: CustomFeedState = {
        configs: [...cleaned.configs, config],
        sources: [...cleaned.sources, source],
        events: [...cleaned.events, ...events],
      };
      saveCustomState(next);
      return next;
    });
  };
  const saveCustomConfigOnly = (config: CustomSourceConfig) => {
    setCustomState(current => {
      const cleaned = clearCustomSource(current, config.id);
      const next: CustomFeedState = { ...cleaned, configs: [...cleaned.configs, config] };
      saveCustomState(next);
      return next;
    });
  };
  const removeCustomFeed = (id: string) => {
    setPinnedEvent(current => current ?? selectedRef.current);
    setCustomState(current => {
      const next = clearCustomSource(current, id);
      saveCustomState(next);
      return next;
    });
  };
  const changePeriod = (next: Period) => {
    if (isReleaseTrack) setReleasePeriod(next);
    else setPeriod(next);
    setEventGroup(null);
  };
  const changeAnchor = (region: AnchorRegion | null) => {
    setAnchoredRegion(region);
    scene.current?.setAnchorRegion(region, region !== null);
  };
  const browseArea = (region: AnchorRegion) => {
    setAreaScope(region);
    setEventGroup(null);
    openRail();
  };
  const exitArea = () => {
    setAreaScope(null);
    setEventGroup(null);
  };
  const renderRow = (event: NewsEvent) => <EventRow key={event.id} event={event} active={selectedId === event.id} retained={sourceMap.get(event.sourceId)?.status === 'error'} locale={locale} places={areaPlaces?.get(event.id)} onClick={() => selectEvent(event.id)} />;
  const nextLocale: Locale = locale === 'zh-CN' ? 'en' : 'zh-CN';
  const importSnapshot = process.env.NODE_ENV === 'development' ? async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSourcesOpen(false);
    if (file.size > 8_000_000) { setNotice(t.notice.tooLarge); return; }
    try {
      const next = validateSnapshot(JSON.parse(await file.text()));
      setPinnedEvent(selectedRef.current); setSnapshot(next); setEventGroup(null); setSourceFilter(new Set<string>());
      setNotice(t.notice.imported(next.events.length));
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      setNotice(locale === 'zh-CN' ? (detail || t.notice.importFailed) : `${t.notice.importFailed}${detail ? ` (${detail})` : ''}`);
    }
  } : undefined;

  return <div className={`app${selectedEvent ? ' has-reader' : ''}`} data-layout={layout} data-board={board}>
    <div className="scene-layer" aria-hidden="true"><canvas ref={canvas} /></div>
    <div ref={overlay} className="atlas-overlay" aria-label={t.chrome.mapLabel} />
    <div className="scene-vignette" aria-hidden="true" />
    <header className="topbar">
      <button type="button" className="brand" onClick={reset} aria-label={t.brand.homeLabel} data-tooltip={t.brand.homeTip}><AtlasMark /><span className="brand-name">{t.brand.primary}<span>{t.brand.secondary}</span></span></button>
      <div className="board-cluster">
        <RegionAnchor locale={locale} selected={anchoredRegion} scope={areaScope} onSelect={changeAnchor} onBrowse={browseArea} onExit={exitArea} />
        <nav className="board-nav" aria-label={t.chrome.boardNav}>{(['all', 'finance', 'tech'] as const).map(id => <button type="button" key={id} className={board === id ? 'active' : ''} aria-pressed={board === id} data-tooltip={t.chrome.boardTips[id]} onClick={() => changeScope(id)}>{t.chrome.boards[id]}</button>)}</nav>
      </div>
      <div className="topbar-tools"><span className="snapshot-badge"><i />{t.chrome.snapshotBadge}</span><button type="button" className="icon-button add-source-trigger" aria-label={t.chrome.addSource} data-tooltip={t.chrome.addSourceTip} onClick={() => setStudioOpen(true)}><Icon name="plus" /></button><button ref={searchToggle} type="button" className="icon-button" aria-label={t.chrome.search} aria-expanded={searchOpen} data-tooltip={t.chrome.searchTip} onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)}><Icon name="search" /></button><button type="button" className="icon-button" aria-label={t.chrome.sources} data-tooltip={t.chrome.sources} onClick={() => setSourcesOpen(true)}><Icon name="layers" /></button><button type="button" className="icon-button help-trigger" aria-label={t.chrome.help} data-tooltip={t.chrome.help} onClick={() => setHelpOpen(true)}><Icon name="info" /></button><button type="button" className="icon-button locale-button" aria-label={t.locale.switchLabel} data-tooltip={t.locale.switchLabel} onClick={() => setLocale(nextLocale)}><span lang={locale === 'zh-CN' ? 'en' : 'zh-CN'}>{t.locale.switchText}</span></button></div>
    </header>

    <div className="edition"><span>{t.chrome.edition}</span><time dateTime={activeSnapshot.generatedAt}>{snapshotDay.toUpperCase()} <i>/</i> UTC</time></div>
    <div className="view-caption"><span className="fine-line" /><span>{t.chrome.view[layout]}</span></div>

    <section className="hero-copy" aria-label={t.chrome.heroAria}>
      <div className="hero-eyebrow"><span className="tiny-cross">+</span>{hero.eyebrow}</div>
      <h1>{hero.lines[0]}<br />{hero.lines[1]}<span>{hero.tail}</span></h1>
      <p>{hero.body[0]}<br />{hero.body[1]}</p>
      <div className="scope-stats"><span><strong>{filtered.length.toString().padStart(2, '0')}</strong> {t.chrome.clues}</span><i /><span><strong>{placeCount.toString().padStart(2, '0')}</strong> {t.chrome.places}</span></div>
    </section>

    <SourceFilter variant="desktop" locale={locale} options={sourceOptions} total={candidates.length} selected={sourceFilter} onToggle={toggleSource} onReset={resetSources} />

    <div className={`rail-dock${selectedEvent ? ' behind-reader' : ''}`} data-open={railOpen} data-reduced-motion={reducedMotion} inert={!!selectedEvent}>
      <button type="button" className="rail-toggle" aria-label={railOpen ? t.rail.collapse : t.rail.expand} aria-expanded={railOpen} aria-controls="dispatch-rail" data-tooltip={railOpen ? t.rail.collapseTip : t.rail.expandTip} onClick={() => setRailOpen(value => !value)}>
        <Icon name="fold" size={20} />
        <Icon name="globe" size={21} />
        <span className="rail-toggle-count" aria-hidden="true">{railEvents.length}</span>
      </button>
      <aside id="dispatch-rail" className={`dispatch-rail${railOpen ? ' is-open' : ''}`} aria-label={t.rail.aria} inert={!railOpen}>
        <header className="rail-heading"><span className="eyebrow">{t.rail.eyebrow}</span><h2>{railTitle}<span>{railEvents.length.toString().padStart(2, '0')}</span></h2></header>
        <div className="rail-body">
          {board === 'tech' && <div className="tech-tracks" role="group" aria-label={t.rail.techTracksAria}>
            {techTracks.map(track => <button key={track} type="button" aria-pressed={techTrack === track} onClick={() => changeScope('tech', track)}>{t.rail.techTracks[track]}</button>)}
          </div>}
          <div className="rail-options"><select ref={rangeSelect} aria-label={t.rail.rangeAria} data-tooltip={t.rail.rangeTip} value={activePeriod} onChange={e => changePeriod(e.target.value as Period)}><option value="day">{t.rail.ranges.day}</option><option value="week">{t.rail.ranges.week}</option><option value="all">{isReleaseTrack ? t.rail.releaseHistory : t.rail.ranges.all}</option></select><SourceFilter variant="rail" locale={locale} options={sourceOptions} total={candidates.length} selected={sourceFilter} onToggle={toggleSource} onReset={resetSources} /><span>{t.rail.rangeNote}</span></div>
          {availableTags.length > 0 && <div className="tag-filter-bar" role="group" aria-label={t.tagFilter.aria}>
            <button type="button" aria-pressed={tagFilter === null} onClick={() => setTagFilter(null)}>{t.tagFilter.all}</button>
            {availableTags.map(([tagName, count]) => (
              <button key={tagName} type="button" aria-pressed={tagFilter === tagName} onClick={() => setTagFilter(current => (current === tagName ? null : tagName))}>
                {t.tagFilter.prefix}{tagName}<b>{count}</b>
              </button>
            ))}
          </div>}
          {areaScope && <button type="button" className="return-link area-exit" onClick={() => { exitArea(); rangeSelect.current?.focus({ preventScroll: true }); }}><Icon name="close" size={14} />{t.regionBrowse.exit}</button>}
          {eventGroup && <button type="button" className="return-link" data-tooltip={eventGroup.kind === 'place' && !areaScope ? t.rail.backTip : undefined} onClick={() => { setEventGroup(null); if (eventGroup.kind === 'place' && !areaScope) scene.current?.resetView(); }}><Icon name="back" size={14} />{areaScope ? t.regionBrowse.back : t.rail.back}</button>}
          <div className="dispatch-list" key={`${board === 'tech' ? techTrack : 'general'}:${areaScope?.id ?? ''}`}>
            {areaGroups ? <>
              {areaGroups.local.length > 0 && <section className="region-result-group"><h3>{t.regionBrowse.events}</h3>{areaGroups.local.map(renderRow)}</section>}
              {areaGroups.associated.length > 0 && <section className="region-result-group"><h3>{t.regionBrowse.associations}</h3>{areaGroups.associated.map(renderRow)}</section>}
            </> : railEvents.map(renderRow)}
            {hasSourceHistory ? <div className="empty-state release-empty">
              <h3>{t.rail.sourceEmptyPeriod}</h3>
              <p>{t.rail.sourceHistoryHint}</p>
              <button type="button" onClick={() => { changePeriod('all'); rangeSelect.current?.focus({ preventScroll: true }); }}>{t.rail.sourceHistoryAction}<Icon name="arrow" size={14} /></button>
            </div> : areaName && railEvents.length === 0 ? <div className="empty-state"><h3>{t.regionBrowse.empty(areaName)}</h3><p>{t.regionBrowse.emptyHint}</p></div>
            : !areaScope && releaseEmpty ? <div className="empty-state release-empty">
              <h3>{hasReleaseHistory && activePeriod !== 'all' ? t.rail.releaseEmptyPeriod : t.rail.releaseEmptyEdition}</h3>
              <p>{t.rail.releaseEmptyHint}</p>
              {hasReleaseHistory && activePeriod !== 'all' && <button type="button" onClick={() => { changePeriod('all'); rangeSelect.current?.focus({ preventScroll: true }); }}>{t.rail.releaseHistoryAction}<Icon name="arrow" size={14} /></button>}
            </div> : railEvents.length === 0 && <div className="empty-state"><Icon name="search" size={26} /><h3>{t.rail.emptyTitle}</h3><p>{t.rail.emptyBody[0]}<br />{t.rail.emptyBody[1]}</p><button type="button" data-tooltip={t.rail.emptyTip} onClick={() => { setQuery(''); setSourceFilter(new Set<string>()); changePeriod('all'); }}>{board === 'tech' ? t.rail.emptyTrackAction : t.rail.emptyAction}</button></div>}
          </div>
          <button type="button" className="rail-foot" data-tooltip={t.rail.footTip} onClick={() => setSourcesOpen(true)}><span>{t.rail.foot(sourceOk, activeSnapshot.sources.length)}</span><Icon name="arrow" size={15} /></button>
        </div>
      </aside>
    </div>

    {selectedEvent && <Reader event={selectedEvent} locked={pinnedEvent?.id === selectedEvent.id} filteredOut={!filtered.some(e => e.id === selectedEvent.id)} retainedAt={selectedSource?.status === 'error' ? selectedSource.fetchedAt : undefined} locale={locale} onClose={() => { setSelectedId(null); setPinnedEvent(null); }} />}

    <div className="bottom-interface">
      <div className="theme-legend" aria-label={t.chrome.mapLabel}>{(Object.keys(themes) as ThemeId[]).map(id => <span key={id} style={{ '--legend-color': themes[id].color } as CSSProperties}><i />{themeLabel(id, locale)}<b>{themeCounts[id]}</b></span>)}</div>
      <nav className="layout-toggle" aria-label={t.layout.aria}><button type="button" onClick={() => setLayout('globe')} className={layout === 'globe' ? 'active' : ''} aria-pressed={layout === 'globe'} data-tooltip={t.layout.globeTip}><Icon name="globe" size={16} />{t.layout.globe}</button><button type="button" onClick={() => setLayout('themes')} className={layout === 'themes' ? 'active' : ''} aria-pressed={layout === 'themes'} data-tooltip={t.layout.themesTip}><Icon name="clusters" size={16} />{t.layout.themes}</button></nav>
      <div className="scene-tools"><button type="button" className="subtle-button" onClick={() => setQuality(value => value === 'full' ? 'light' : 'full')} aria-pressed={quality === 'light'} data-tooltip={quality === 'full' ? t.scene.qualityTipFull : t.scene.qualityTipLight}>{quality === 'full' ? t.scene.qualityFull : t.scene.qualityLight}</button><button type="button" className="icon-button" aria-label={reducedMotion ? t.scene.enableMotion : t.scene.reduceMotion} aria-pressed={reducedMotion} data-tooltip={reducedMotion ? t.scene.enableMotionTip : t.scene.reduceMotionTip} onClick={() => setReducedMotion(value => !value)}><Icon name="motion" size={17} /></button><button type="button" className="icon-button" aria-label={t.scene.reset} data-tooltip={t.scene.resetTip} onClick={reset}><Icon name="back" size={17} /></button></div>
    </div>
    <footer className="footnote">
      <span>● {t.footer.eventPlace} <i>◇ {t.footer.subjectLink}</i>{layout === 'globe' && unlocatedEvents.length > 0
        ? <button type="button" className="unlocated-entry" aria-controls="dispatch-rail" data-tooltip={t.footer.unlocatedTip} onClick={() => { setEventGroup({ kind: 'unlocated' }); openRail(); }}>◌ {t.footer.global} {unlocatedEvents.length}</button>
        : <i>◌ {t.footer.global} {unlocatedEvents.length}</i>}</span>
      <span className="texture-note">{t.footer.texture}</span><button type="button" data-tooltip={t.footer.sourcesTip} onClick={() => setSourcesOpen(true)}>{t.footer.snapshot} {formatLocaleDate(activeSnapshot.generatedAt, locale, true)} UTC <span>↗</span></button>
    </footer>
    <div className="gesture-hint"><span>{t.gesture.drag}</span><i />{t.gesture.zoom}<i />{t.gesture.click}</div>
    {!sceneReady && !sceneError && <div className="scene-loading" role="status"><span className="loading-orbit" />{t.scene.loading}</div>}
    {sceneError && <div className="gpu-notice" role="alert"><strong>{t.scene.errorTitle}</strong><span>{sceneError} {t.scene.errorSuffix}</span></div>}

    {searchOpen && <section className="search-panel" role="search" aria-label={t.search.aria}><Icon name="search" /><input ref={searchInput} aria-label={t.search.inputAria} placeholder={t.search.placeholder} value={query} onChange={e => { setQuery(e.target.value); setEventGroup(null); openRail(); }} /><kbd>/</kbd><button type="button" className="icon-button" aria-label={t.search.close} data-tooltip={t.search.closeTip} onClick={closeSearch}><Icon name="close" /></button>{(query || eventGroup) && <button type="button" className="clear-filter" data-tooltip={t.search.clearTip} onClick={() => { setQuery(''); setEventGroup(null); }}>{t.search.clear}</button>}</section>}

    {sourcesOpen && <Modal title={t.sources.title} locale={locale} onClose={() => setSourcesOpen(false)}>
      <p className="modal-lede">{t.sources.lede}</p>
      <div className="data-edition"><span>{t.sources.generated}</span><strong>{formatUtcStamp(activeSnapshot.generatedAt, locale, true)} UTC</strong><span>{t.sources.recordSummary(activeSnapshot.events.length, sourceOk)}</span></div>
      <div className="studio-actions"><button type="button" className="subtle-button" onClick={() => { setSourcesOpen(false); setStudioOpen(true); }}>+ {t.chrome.addSource}</button></div>
      <div className="source-catalog">{activeSnapshot.sources.map(source => {
        const rights = sourceRights(source.rights, locale);
        return <section key={source.id}>
          <div className="catalog-top"><h3>{providerLabel(source.name, locale)}</h3><span className={source.status === 'ok' ? 'status-ok' : 'status-error'}>{source.status === 'ok' ? t.sources.count(source.count) : source.count ? t.sources.retained(source.count) : t.sources.failed}</span></div>
          <p lang={locale === 'en' && containsCjk(rights) ? 'zh-CN' : undefined}>{rights}</p>{source.error && <p className="source-error" lang={locale === 'en' && containsCjk(source.error) ? 'zh-CN' : undefined}>{source.error} · {t.sources.errorSuffix}</p>}
          <small>{source.count ? t.sources.lastFetch(formatUtcStamp(source.fetchedAt, locale)) : t.sources.noFetch}<br />{source.attemptedAt ? t.sources.attempted(formatUtcStamp(source.attemptedAt, locale)) : t.sources.noAttempt}</small>
          <div className="catalog-links"><a href={source.url} target="_blank" rel="noopener noreferrer">{t.sources.sourceLink}</a><a href={source.policyUrl} target="_blank" rel="noopener noreferrer">{t.sources.policyLink}</a></div>
        </section>;
      })}</div>
      <details className="content-license"><summary>{t.sources.gemmaSummary}</summary><p lang="zh-CN">{gemmaLicense.source} · {gemmaLicense.modifications}</p><a href={gemmaLicense.sourceUrl} target="_blank" rel="noopener noreferrer">{t.sources.gemmaSource}</a><pre lang="en">{gemmaLicense.text}</pre></details>
      {process.env.NODE_ENV === 'development' && <details className="snapshot-debug">
        <summary>{t.snapshotDebug.title}</summary>
        <p>{t.snapshotDebug.description}</p>
        <button type="button" className="primary-button" onClick={() => fileInput.current?.click()}><Icon name="import" size={16} />{t.snapshotDebug.action}</button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importSnapshot} aria-label={t.snapshotDebug.fileInput} />
      </details>}
      <p className="modal-legal">{t.sources.legal}</p>
    </Modal>}
    {studioOpen && <SourceStudio locale={locale} companionAvailable={companionAvailable} allSources={activeSnapshot.sources} customState={customState} onSaveFeed={saveCustomFeed} onSaveConfigOnly={saveCustomConfigOnly} onRemoveCustom={removeCustomFeed} onClose={() => setStudioOpen(false)} />}
    {helpOpen && <Modal title={t.help.title} locale={locale} onClose={() => setHelpOpen(false)}><div className="help-grid">{t.help.items.map(item => <section key={item.index}><span>{item.index}</span><h3>{item.title}</h3><p>{item.body}</p></section>)}</div><div className="keyboard-guide"><span><kbd>/</kbd> {t.help.keyboard.search}</span><span><kbd>Esc</kbd> {t.help.keyboard.escape}</span><span><kbd>Tab</kbd> {t.help.keyboard.tab}</span></div><p className="modal-legal">{t.help.legal}</p></Modal>}
    {process.env.NODE_ENV === 'development' && notice && <div className="toast" role="status"><span>{notice}</span><button type="button" className="icon-button" aria-label={t.notice.close} data-tooltip={t.notice.close} onClick={() => setNotice('')}><Icon name="close" size={15} /></button></div>}
    <TooltipLayer />
  </div>;
}