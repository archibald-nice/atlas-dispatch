import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { normalizeTag, themes } from './domain';
import type { SourceStatus, ThemeId } from './domain';
import {
  canonicalizeFeedUrl,
  configToCatalogEntry,
  exportOpml,
  exportSourcesCatalog,
  parseOpml,
  tryFetchCustomFeed,
} from './customFeeds';
import type { CustomFeedFormat, CustomFeedState, CustomSourceConfig, OpmlEntry } from './customFeeds';
import { messages, themeLabel } from './i18n';
import type { Locale } from './i18n';

interface StudioPreset {
  id: string;
  label: string;
  url: string;
  format: CustomFeedFormat;
  theme: ThemeId;
  tag: string;
}

const PRESETS: readonly StudioPreset[] = [
  {
    id: 'preset-eonet',
    label: 'NASA EONET (Events)',
    url: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=25',
    format: 'eonet',
    theme: 'earth',
    tag: 'natural-events',
  },
  {
    id: 'preset-usgs',
    label: 'USGS M4.5+ (GeoJSON)',
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson',
    format: 'geojson',
    theme: 'earth',
    tag: 'seismic',
  },
  {
    id: 'preset-agents-radar',
    label: 'Agents Radar (MIT RSS)',
    url: 'https://duanyytop.github.io/agents-radar/feed.xml',
    format: 'feed',
    theme: 'ai',
    tag: 'ai-agents',
  },
  {
    id: 'preset-pulsar',
    label: 'Pulsar AI Daily (MIT RSS)',
    url: 'https://sou350121.github.io/pulsar-web/rss/ai-daily.xml',
    format: 'feed',
    theme: 'ai',
    tag: 'vla-research',
  },
];

type StudioTab = 'add' | 'opml' | 'export';

function downloadTextFile(filename: string, contents: string, mime = 'application/json;charset=utf-8'): void {
  const blob = new Blob([contents], { type: mime });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function SourceStudio({
  locale,
  companionAvailable,
  allSources,
  customState,
  onSaveFeed,
  onSaveConfigOnly,
  onRemoveCustom,
  onClose,
}: {
  locale: Locale;
  companionAvailable: boolean;
  allSources: readonly SourceStatus[];
  customState: CustomFeedState;
  onSaveFeed: (config: CustomSourceConfig, source: SourceStatus, events: CustomFeedState['events']) => void;
  onSaveConfigOnly: (config: CustomSourceConfig) => void;
  onRemoveCustom: (id: string) => void;
  onClose: () => void;
}) {
  const t = messages[locale];
  const s = t.studio;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const opmlFileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<StudioTab>('add');
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<CustomFeedFormat>('auto');
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<ThemeId>('earth');
  const [tag, setTag] = useState('');
  const [declareGeo, setDeclareGeo] = useState(false);
  const [placeLabel, setPlaceLabel] = useState('');
  const [latText, setLatText] = useState('');
  const [lonText, setLonText] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [corsConfig, setCorsConfig] = useState<CustomSourceConfig | null>(null);
  const [copied, setCopied] = useState(false);

  const [opmlText, setOpmlText] = useState('');
  const [opmlEntries, setOpmlEntries] = useState<OpmlEntry[]>([]);
  const [opmlSelected, setOpmlSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const node = dialogRef.current;
    node?.showModal();
    return () => { if (node?.open) node.close(); };
  }, []);

  const buildConfig = (override?: Partial<CustomSourceConfig>): CustomSourceConfig | null => {
    const cleanUrl = canonicalizeFeedUrl(override?.url ?? url);
    if (!cleanUrl) {
      setStatusMsg({ kind: 'err', text: s.invalidUrl });
      return null;
    }
    let publisherLocation: CustomSourceConfig['publisherLocation'];
    if (declareGeo && !override) {
      const lat = Number(latText);
      const lon = Number(lonText);
      if (!placeLabel.trim() || !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) {
        setStatusMsg({ kind: 'err', text: s.invalidCoords });
        return null;
      }
      publisherLocation = { label: placeLabel.trim(), lat, lon };
    }
    const idBasis = cleanUrl.replace(/^https:\/\//, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 24);
    return {
      id: override?.id ?? `custom-${idBasis}-${Math.abs(cleanUrl.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)).toString(16).slice(0, 6)}`,
      name: (override?.name ?? name).trim(),
      url: cleanUrl,
      format: override?.format ?? format,
      theme: override?.theme ?? theme,
      tag: normalizeTag(override?.tag ?? tag),
      publisherLocation,
      maxEvents: 15,
    };
  };

  const connectConfig = async (cfg: CustomSourceConfig) => {
    setBusy(true);
    setStatusMsg(null);
    setCorsConfig(null);
    const result = await tryFetchCustomFeed(cfg, companionAvailable);
    setBusy(false);
    if (result.ok) {
      onSaveFeed(result.config, result.source, result.events);
      setStatusMsg({ kind: 'ok', text: s.addedOk(result.source.name, result.events.length) });
      setUrl('');
      setName('');
      return;
    }
    if (result.corsBlocked) {
      setCorsConfig(cfg);
      setStatusMsg({ kind: 'err', text: `${s.corsTitle} (${result.message})` });
    } else {
      setStatusMsg({ kind: 'err', text: result.message });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cfg = buildConfig();
    if (!cfg) return;
    await connectConfig(cfg);
  };

  const handlePreset = async (preset: StudioPreset) => {
    setUrl(preset.url);
    setFormat(preset.format);
    setTheme(preset.theme);
    setTag(preset.tag);
    setName(preset.label);
    const cfg = buildConfig({
      id: preset.id,
      name: preset.label,
      url: preset.url,
      format: preset.format,
      theme: preset.theme,
      tag: preset.tag,
    });
    if (cfg) await connectConfig(cfg);
  };

  const handleRefreshExisting = async (cfg: CustomSourceConfig) => {
    await connectConfig(cfg);
  };

  const handleCopySnippet = async (cfg: CustomSourceConfig) => {
    const snippet = JSON.stringify(configToCatalogEntry(cfg), null, 2);
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      downloadTextFile(`${cfg.id}.json`, `${snippet}\n`);
    }
  };

  const handleParseOpml = (raw = opmlText) => {
    const list = parseOpml(raw);
    setOpmlEntries(list);
    setOpmlSelected(new Set(list.map(item => item.url)));
    if (!list.length) setStatusMsg({ kind: 'err', text: s.opmlEmpty });
    else setStatusMsg(null);
  };

  const handleOpmlFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    setOpmlText(text);
    handleParseOpml(text);
  };

  const saveOpmlSelection = async (tryFetch: boolean) => {
    const chosen = opmlEntries.filter(item => opmlSelected.has(item.url));
    if (!chosen.length) return;
    setBusy(true);
    let liveCount = 0;
    for (const item of chosen) {
      const cfg = buildConfig({
        name: item.name,
        url: item.url,
        format: 'feed',
        theme,
        tag: item.tag || tag,
      });
      if (!cfg) continue;
      if (tryFetch) {
        const res = await tryFetchCustomFeed(cfg, companionAvailable);
        if (res.ok) {
          onSaveFeed(res.config, res.source, res.events);
          liveCount++;
          continue;
        }
      }
      onSaveConfigOnly(cfg);
    }
    setBusy(false);
    setStatusMsg({
      kind: 'ok',
      text: tryFetch && liveCount > 0 ? `${s.opmlSaved(chosen.length)} (${liveCount} live)` : s.opmlSaved(chosen.length),
    });
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal modal--studio"
      aria-label={s.title}
      onCancel={e => { e.preventDefault(); onClose(); }}
      onClick={e => { if (e.target === dialogRef.current) onClose(); }}
    >
      <div className="modal-inner">
        <header className="modal-heading">
          <div>
            <span className="eyebrow">{t.modal.eyebrow}</span>
            <h2>{s.title}</h2>
          </div>
          <button type="button" className="icon-button" aria-label={t.modal.close} data-tooltip={t.modal.close} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>

        <p className="modal-lede">{s.lede}</p>
        <div className={`studio-mode-banner${companionAvailable ? ' is-companion' : ''}`}>
          <i /><span>{companionAvailable ? s.companionOn : s.companionOff}</span>
        </div>

        <nav className="studio-tabs" role="tablist" aria-label={s.title}>
          {(['add', 'opml', 'export'] as const).map(id => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setStatusMsg(null); }}>
              {s.tabs[id]}
            </button>
          ))}
        </nav>

        {tab === 'add' && (
          <div className="studio-panel">
            <div className="studio-standards">
              <span>{s.standardsTitle}</span>
              <div>{s.standards.map(std => <code key={std}>{std}</code>)}</div>
            </div>

            <div className="studio-presets">
              <span>{s.presetsTitle}</span>
              <div>
                {PRESETS.map(p => (
                  <button key={p.id} type="button" disabled={busy} onClick={() => handlePreset(p)}>
                    + {p.label}
                  </button>
                ))}
              </div>
            </div>

            <form className="studio-form" onSubmit={handleSubmit}>
              <label>
                <span>{s.urlLabel}</span>
                <input type="url" required value={url} onChange={e => setUrl(e.target.value)} placeholder={s.urlPlaceholder} />
              </label>

              <div className="studio-row">
                <label>
                  <span>{s.formatLabel}</span>
                  <select value={format} onChange={e => setFormat(e.target.value as CustomFeedFormat)}>
                    {(['auto', 'feed', 'json-feed', 'geojson', 'eonet'] as const).map(f => (
                      <option key={f} value={f}>{s.formats[f]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{s.themeLabel}</span>
                  <select value={theme} onChange={e => setTheme(e.target.value as ThemeId)}>
                    {(Object.keys(themes) as ThemeId[]).map(id => (
                      <option key={id} value={id}>{themeLabel(id, locale)}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="studio-row">
                <label>
                  <span>{s.nameLabel}</span>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={s.namePlaceholder} />
                </label>
                <label>
                  <span>{s.tagLabel}</span>
                  <input type="text" value={tag} onChange={e => setTag(e.target.value)} placeholder={s.tagPlaceholder} maxLength={32} />
                </label>
              </div>

              <label className="studio-checkbox">
                <input type="checkbox" checked={declareGeo} onChange={e => setDeclareGeo(e.target.checked)} />
                <span>{s.geoToggle}</span>
              </label>

              {declareGeo && (
                <div className="studio-row studio-row--3">
                  <label>
                    <span>{s.placeLabel}</span>
                    <input type="text" value={placeLabel} onChange={e => setPlaceLabel(e.target.value)} placeholder={s.placePlaceholder} />
                  </label>
                  <label>
                    <span>{s.latLabel}</span>
                    <input type="number" step="any" min="-90" max="90" value={latText} onChange={e => setLatText(e.target.value)} placeholder="1.3521" />
                  </label>
                  <label>
                    <span>{s.lonLabel}</span>
                    <input type="number" step="any" min="-180" max="180" value={lonText} onChange={e => setLonText(e.target.value)} placeholder="103.8198" />
                  </label>
                </div>
              )}

              <div className="studio-actions">
                <button type="submit" className="primary-button" disabled={busy}>
                  {busy ? s.connecting : s.connect}
                </button>
              </div>
            </form>

            {statusMsg && <p className={`studio-status is-${statusMsg.kind}`} role="status">{statusMsg.text}</p>}

            {corsConfig && (
              <div className="studio-cors-card">
                <strong>{s.corsTitle}</strong>
                <p>{s.corsBody}</p>
                <p>{s.corsHint1}</p>
                <p>{s.corsHint2}</p>
                <div className="studio-actions">
                  <button type="button" className="subtle-button" onClick={() => {
                    onSaveConfigOnly(corsConfig);
                    setStatusMsg({ kind: 'ok', text: s.savedConfigOk(corsConfig.name || corsConfig.url) });
                    setCorsConfig(null);
                  }}>{s.saveConfigOnly}</button>
                  <button type="button" className="subtle-button" onClick={() => handleCopySnippet(corsConfig)}>
                    {copied ? s.copied : s.copySnippet}
                  </button>
                </div>
              </div>
            )}

            <section className="studio-custom-list">
              <h3>{s.customListTitle(customState.configs.length)}</h3>
              {customState.configs.length === 0 ? <p className="studio-empty">{s.customEmpty}</p> : (
                <ul>
                  {customState.configs.map(cfg => {
                    const liveSource = customState.sources.find(src => src.id === cfg.id);
                    return (
                      <li key={cfg.id}>
                        <div>
                          <strong>{cfg.name || cfg.url}</strong>
                          <small>{themeLabel(cfg.theme, locale)}{cfg.tag ? ` · #${cfg.tag}` : ''} · {liveSource ? t.sources.count(liveSource.count) : s.configOnlyBadge}</small>
                        </div>
                        <div className="studio-item-actions">
                          <button type="button" disabled={busy} onClick={() => handleRefreshExisting(cfg)}>{s.refreshOne}</button>
                          <button type="button" onClick={() => onRemoveCustom(cfg.id)}>{s.removeOne}</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}

        {tab === 'opml' && (
          <div className="studio-panel">
            <p className="studio-empty">{s.opmlHelp}</p>
            <div className="studio-actions">
              <button type="button" className="subtle-button" onClick={() => opmlFileRef.current?.click()}>{s.opmlFile}</button>
              <input ref={opmlFileRef} type="file" accept=".opml,.xml,text/xml,application/xml" hidden onChange={handleOpmlFile} />
            </div>
            <textarea
              className="studio-textarea"
              rows={6}
              value={opmlText}
              onChange={e => setOpmlText(e.target.value)}
              placeholder={s.opmlPlaceholder}
            />
            <div className="studio-actions">
              <button type="button" className="subtle-button" onClick={() => handleParseOpml()}>{s.opmlParse}</button>
            </div>
            {statusMsg && <p className={`studio-status is-${statusMsg.kind}`} role="status">{statusMsg.text}</p>}
            {opmlEntries.length > 0 && (
              <div className="studio-opml-preview">
                <strong>{s.opmlSummary(opmlEntries.length)}</strong>
                <ul>
                  {opmlEntries.map(item => (
                    <li key={item.url}>
                      <label>
                        <input
                          type="checkbox"
                          checked={opmlSelected.has(item.url)}
                          onChange={e => {
                            const next = new Set(opmlSelected);
                            if (e.target.checked) next.add(item.url); else next.delete(item.url);
                            setOpmlSelected(next);
                          }}
                        />
                        <span>{item.name}</span>
                        {item.tag && <code>#{item.tag}</code>}
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="studio-actions">
                  <button type="button" className="subtle-button" disabled={busy} onClick={() => saveOpmlSelection(false)}>{s.opmlApply}</button>
                  <button type="button" className="primary-button" disabled={busy} onClick={() => saveOpmlSelection(true)}>{s.opmlConnectAll}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'export' && (
          <div className="studio-panel">
            <h3>{s.exportTitle}</h3>
            <p className="studio-empty">{s.exportBody}</p>
            <div className="studio-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => downloadTextFile('sources.json', exportSourcesCatalog(allSources, customState.configs))}
              >
                {s.downloadSources}
              </button>
              <button
                type="button"
                className="subtle-button"
                onClick={() => downloadTextFile('atlas-feeds.opml', exportOpml(allSources, customState.configs), 'text/xml;charset=utf-8')}
              >
                {s.downloadOpml}
              </button>
            </div>
            <ol className="studio-steps">
              {s.selfHostSteps.map(step => <li key={step}>{step}</li>)}
            </ol>
          </div>
        )}
      </div>
    </dialog>
  );
}
