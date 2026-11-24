# Atlas Dispatch · Global Intelligence Globe

**A local-first 3D globe for your own feeds — evidence-based geo, zero tracking, single-file offline HTML.**

Atlas Dispatch turns open syndication feeds (RSS 2.0, Atom, GeoRSS, JSON Feed 1.1, Point GeoJSON, and OPML) into an interactive WebGL2 particle globe and thematic space with 242 real Natural Earth country outlines.

## Why Atlas Dispatch?

- **When uncertain, do not guess.** Events without verifiable coordinates stay in *Global / unlocated* instead of being pinned to random cities. Publisher headquarters (`publisher`), explicit mentions (`subject`), and actual event sites (`event`) are strictly separated.
- **Bring your own feeds (BYO-Feeds).** Click **+** in the top bar to connect live CORS-friendly feeds, import an **OPML** file (folder names become custom board tags), or run `npm run companion` locally to auto-discover site RSS feeds without browser CORS limits.
- **Single-file offline build.** `npm run build` compiles the UI, shaders, 242 country outlines, and your snapshot into a single self-contained `dist/index.html` (~1.9 MiB). Open it directly from disk with zero backend.
- **5-minute personal GitHub Pages deploy.** Click *Use this template*, replace `scripts/sources.json` (or pick a preset in `presets/`), and let `.github/workflows/update-pages.yml` refresh and publish automatically every 6 hours.

## Quick Start

Requires **Node.js 22.18+** and a **WebGL2** browser.

```sh
npm ci --ignore-scripts
npm run build
# Open dist/index.html directly, or run the local companion for CORS-free feed discovery:
npm run companion
```

## Supported Standards

- **RSS 2.0 / Atom 1.0 / RSS 1.0 (RDF)** + **GeoRSS** (`<georss:point>`, `<geo:Point>`)
- **JSON Feed 1.1** (with optional `_geo`)
- **GeoJSON** (`FeatureCollection` with `Point` geometries)
- **NASA EONET v3** & **GDACS GeoRSS**
- **OPML 2.0** import & export

## License & Boundaries

- First-party source code is licensed under **Apache-2.0** (see `LICENSE`).
- Bundled surface geometry is derived from **Natural Earth** (public domain); see `THIRD_PARTY_NOTICES.txt`.
- Feed contents remain subject to their respective publishers' terms; see `docs/PUBLICATION.md` before redistributing third-party content.
