# Atlas Dispatch · Product Hunt & Show HN Launch Pack

## 1. Product Hunt Listing Copy

- **Name:** Atlas Dispatch
- **Tagline (58 chars):** `Local-first 3D globe for your own RSS, GeoRSS & OPML feeds`
- **Alternative Tagline (55 chars):** `Turn your RSS & GeoJSON feeds into an offline 3D globe`
- **Topics:** `Open Source`, `Developer Tools`, `News`, `Productivity`, `Data Visualization`
- **Short Description (247 chars):**
  > A local-first WebGL2 globe and thematic space for your own feeds. Connect RSS, Atom, GeoRSS, JSON Feed, Point GeoJSON, or import OPML. Evidence-based geo pinning (no AI guessing), 242 real country outlines, and single-file offline HTML export.

### Maker's First Comment (English)

> Hey Product Hunt! 👋
>
> Most "global news maps" either guess fake city coordinates from headlines with an LLM, mix unverified social posts with official releases, or lock your feeds behind a SaaS paywall.
>
> **Atlas Dispatch** takes the opposite approach:
>
> 1. **When uncertain, do not guess.** Events without verifiable coordinates stay in *Global / unlocated* instead of being pinned to random cities. Publisher headquarters (e.g., central banks), explicit facility mentions, and actual event sites (USGS, NASA EONET, GDACS) are strictly separated.
> 2. **Bring Your Own Feeds (BYO-Feeds).** Click `+` to connect RSS/Atom, GeoRSS, JSON Feed 1.1, or Point GeoJSON feeds, tag them into custom boards, or import your **OPML** subscription file.
> 3. **Local-first & single-file offline.** Zero runtime backend. Run `npm run build` and you get a single ~1.9 MiB `dist/index.html` containing the 3D scene, shaders, 242 Natural Earth country outlines, and your snapshot — double-click it offline anywhere.
> 4. **Own your instance in 5 minutes.** Fork the template repository, drop in your `sources.json`, and GitHub Actions refreshes and deploys your personal Atlas to GitHub Pages every 6 hours.
>
> Built with React 19, Three.js, esbuild, and 4 runtime dependencies. Apache-2.0 open source — would love your feedback on which open-standard sources or spatial views you'd like next!

---

## 2. Show HN Draft

- **Title:** `Show HN: Atlas Dispatch – Local-first 3D globe for RSS, GeoRSS, GeoJSON & OPML`
- **Body:**
  > I built Atlas Dispatch, an offline-capable WebGL2 3D globe for reading open feeds (RSS/Atom, GeoRSS, JSON Feed 1.1, Point GeoJSON, OPML) without guessing locations or running a hosted backend.
  >
  > Key design choices:
  > - **Epistemic geo discipline:** every plotted pin carries a `relation` (`event` | `publisher` | `subject`), `precision`, and explicit `evidence` string; country-level pins are rejected from polygon spatial joins; Natural Earth 1:50m boundaries handle holes and antimeridian cuts.
  > - **Two spatial views:** one continuous particle morph between the geographic globe and a 4-cluster thematic space.
  > - **Single-file distribution:** esbuild + custom ZigZag/varint geo packing compiles everything into one self-contained ~1.9 MiB HTML file.
  > - **Optional local companion (`npm run companion`):** pure Node server on `127.0.0.1` with SSRF filtering to auto-discover `<link rel="alternate">` feeds for sites without browser CORS headers.

---

## 3. Gallery & 30-Second Demo Video Storyboard

1. **Cover Video / GIF (30s):**
   - `0:00–0:06`: Drag the globe across North/South America & Europe showing real-time USGS/EONET/GDACS event dots.
   - `0:06–0:13`: Open **Anchor region**, select **Germany** / **Japan** — show the golden great-circle border outline lighting up, click *View dispatches*.
   - `0:13–0:20`: Click **Globe ↔ Themes** toggle to show the GPU particle morph into the 4 thematic clusters while keeping a selected article locked in the Reader.
   - `0:20–0:30`: Click `+` (**Add Source**) → paste an OPML or connect a live preset → show the custom `#tag` filter lighting up the list & globe.
2. **Gallery Image 1:** `verification/ph-hero-en.png` — English desktop hero with lit globe + anchored country outline.
3. **Gallery Image 2:** `verification/ph-source-studio.png` — Add Source / OPML Studio modal showing open standards & live feed preview.
4. **Gallery Image 3:** `verification/themes.png` — 4-cluster Thematic Space view.
5. **Gallery Image 4:** `verification/ph-narrow-en.png` — Mobile responsive layout & locked reader.

---

## 4. Pre-Launch Checklist

1. Run `npm run typecheck && npm test && npm run build`.
2. Run `npm run oss:export` to generate a clean, history-free open-source tree under `releases/oss-stage/<id>/`.
3. Inspect `oss-manifest.json` in that folder to confirm zero private files (`editorial-overrides`, private `releases/`, verification screenshots) are included.
4. Initialize a fresh public Git repository from that staged directory, enable GitHub **Template repository**, and enable **GitHub Pages** (`Source: GitHub Actions`).
5. Record the 30s MP4/GIF from the live deployed Pages URL and publish on Product Hunt & Show HN.
