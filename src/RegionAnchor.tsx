import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import countryBoundaries from '../assets/country-boundaries.json';
import { decodeRegions } from './geoCodec';
import { messages } from './i18n';
import type { Locale } from './i18n';
import { regionName } from './regions';
import type { AnchorRegion } from './regions';

export const ANCHOR_REGIONS = decodeRegions(countryBoundaries);

const collators: Record<Locale, Intl.Collator> = {
  'zh-CN': new Intl.Collator('zh-CN', { sensitivity: 'base' }),
  en: new Intl.Collator('en', { sensitivity: 'base' }),
};

const sortedRegions: Record<Locale, readonly AnchorRegion[]> = {
  'zh-CN': [...ANCHOR_REGIONS].sort((a, b) => collators['zh-CN'].compare(a.zh, b.zh)),
  en: [...ANCHOR_REGIONS].sort((a, b) => collators.en.compare(a.en, b.en)),
};

// These are offline display aliases for ISO codes (e.g. 中国 / China from CN).
// They are not an IP lookup, browser geolocation, timezone inference, or network request.
const displayNames: Record<Locale, readonly Intl.DisplayNames[]> = {
  'zh-CN': [
    new Intl.DisplayNames(['zh-CN'], { type: 'region', fallback: 'none' }),
    new Intl.DisplayNames(['zh-CN'], { type: 'region', style: 'short', fallback: 'none' }),
  ],
  en: [
    new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }),
    new Intl.DisplayNames(['en'], { type: 'region', style: 'short', fallback: 'none' }),
  ],
};

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

function searchText(region: AnchorRegion): string {
  const parts = [region.id, region.en, region.zh, region.iso ?? '', ...region.aliases];
  if (region.iso) {
    for (const locale of ['zh-CN', 'en'] as const) {
      for (const names of displayNames[locale]) {
        try {
          const name = names.of(region.iso);
          if (name) parts.push(name);
        } catch {
          // An unknown ISO code simply has no localized display alias.
        }
      }
    }
  }
  return normalizeSearch(parts.join(' '));
}

const searchIndex = new Map(ANCHOR_REGIONS.map(region => [region.id, searchText(region)]));

export function RegionAnchor({ locale, selected, scope, onSelect, onBrowse, onExit }: {
  locale: Locale;
  selected: AnchorRegion | null;
  scope: AnchorRegion | null;
  onSelect: (region: AnchorRegion | null) => void;
  onBrowse: (region: AnchorRegion) => void;
  onExit: () => void;
}) {
  const t = messages[locale];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const browseButton = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = useId();
  const currentName = selected ? regionName(selected, locale) : '';

  const matches = useMemo(() => {
    const needle = normalizeSearch(query.trim());
    return needle
      ? sortedRegions[locale].filter(region => searchIndex.get(region.id)?.includes(needle))
      : sortedRegions[locale];
  }, [locale, query]);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (restoreFocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (event: PointerEvent) => {
      if (root.current && event.target instanceof Node && root.current.contains(event.target)) return;
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);

  useLayoutEffect(() => {
    browseButton.current?.focus({ preventScroll: true });
  }, [selected]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };

  const focusFirstOption = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowDown') return;
    const first = root.current?.querySelector<HTMLButtonElement>('.region-anchor-list button[data-region-id]');
    if (!first) return;
    event.preventDefault();
    first.focus();
  };

  const moveOption = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-region-id]')];
    if (options.length === 0) return;
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : event.key === 'ArrowDown'
          ? (index + 1) % options.length
          : (index - 1 + options.length) % options.length;
    event.preventDefault();
    options[next].focus();
  };

  return <div ref={root} className="region-anchor" onKeyDown={handleKeyDown}>
    <button
      ref={trigger}
      type="button"
      className="region-anchor-trigger"
      aria-label={selected ? t.regionAnchor.currentAria(currentName) : t.regionAnchor.triggerAria}
      aria-expanded={open}
      aria-controls={panelId}
      aria-haspopup="dialog"
      data-tooltip={selected ? t.regionAnchor.currentTip(currentName) : t.regionAnchor.triggerTip}
      onClick={() => {
        if (open) {
          close(true);
        } else {
          setQuery('');
          setOpen(true);
        }
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s6.5-5.4 6.5-11.5a6.5 6.5 0 0 0-13 0C5.5 15.6 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.4" /></svg>
      <span className="region-anchor-label">{selected ? currentName : t.regionAnchor.trigger}</span>
    </button>
    {open && <div className="region-anchor-panel" id={panelId} role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <div className="region-anchor-heading">
        <h3 className="region-anchor-title" id={titleId}>{t.regionAnchor.title}</h3>
        <button
          type="button"
          className="region-anchor-clear"
          aria-label={t.regionAnchor.clearAria}
          aria-disabled={!selected}
          data-tooltip={t.regionAnchor.clearTip}
          onClick={() => {
            if (!selected) return;
            onSelect(null);
            close(true);
          }}
        >{t.regionAnchor.clear}</button>
      </div>
      {(selected || scope) && <div className="region-anchor-actions">
        {selected && <button ref={browseButton} type="button" className="region-anchor-browse" onClick={() => { onBrowse(selected); close(true); }}>{t.regionBrowse.view(currentName)}</button>}
        {scope && <button type="button" onClick={() => { onExit(); close(true); }}>{t.regionBrowse.exitNamed(regionName(scope, locale))}</button>}
      </div>}
      <input
        ref={search}
        type="search"
        value={query}
        aria-label={t.regionAnchor.searchAria}
        placeholder={t.regionAnchor.searchPlaceholder}
        autoComplete="off"
        spellCheck={false}
        onChange={event => setQuery(event.target.value)}
        onKeyDown={focusFirstOption}
      />
      <div className="region-anchor-list" role="group" aria-label={t.regionAnchor.listAria} onKeyDown={moveOption}>
        {matches.map(region => {
          const active = selected?.id === region.id;
          return <button
            type="button"
            key={region.id}
            data-region-id={region.id}
            data-active={active ? 'true' : 'false'}
            aria-pressed={active}
            onClick={() => {
              onSelect(region);
              if (active) browseButton.current?.focus({ preventScroll: true });
            }}
          >
            <span>{regionName(region, locale)}</span>
            {region.iso && <small>{region.iso}</small>}
          </button>;
        })}
        {matches.length === 0 && <p className="region-anchor-empty" role="status">{t.regionAnchor.empty}<br />{t.regionAnchor.emptyHint}</p>}
      </div>
      <p className="region-anchor-note">{t.regionAnchor.note(ANCHOR_REGIONS.length)}</p>
    </div>}
  </div>;
}