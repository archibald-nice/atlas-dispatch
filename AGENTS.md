# Atlas Dispatch · Agent Collaboration Guide

This repository is the **single source of truth** for Atlas Dispatch (`环讯 Atlas`).

## 1. Architecture & Working Boundaries

- Keep the existing **React 19 + Three.js + esbuild** stack and single-file offline `dist/index.html` output (`~1.9 MiB`, zero backend, zero tracking).
- Do not introduce a server backend, extra runtime dependencies, or scene rewrites for localized UI issues.
- The user runs `npm run dev` on demand. Unless explicitly authorized, do not start/restart background servers, bind listening ports, schedule cron jobs, publish packages, or run `git push`.

## 2. Codebase Layer Map

| Responsibility | Primary Files |
| --- | --- |
| Observation boards, filters, reader, responsive UI | `src/App.tsx`, `src/styles.css`, `src/AtlasSelect.tsx`, `src/RegionAnchor.tsx`, `src/TooltipLayer.tsx`, `src/i18n.ts` |
| BYO-Feeds Studio, OPML, local companion | `src/SourceStudio.tsx`, `src/customFeeds.ts`, `scripts/companion.mjs` |
| 3D particle globe, camera, shaders, boundaries | `src/scene/AtlasScene.ts`, `src/scene/shaders.ts`, `src/scene/geometry.ts`, `src/scene/regionOutline.ts`, `src/geoCodec.ts` |
| Official adapters, snapshot refresh, single-file build | `scripts/adapters.mjs`, `scripts/refresh.mjs`, `scripts/build.mjs`, `src/domain.ts`, `presets/` |
| Tests & public showcase assets | `test/` (`node --test`), `docs/images/` (curated screenshots only) |

## 3. Non-Negotiable Product & Data Semantics

- **Globe first, reader second.** Preserve All / Finance / Tech boards, Geographic ↔ Thematic morph, click-to-read / place grouping / locked reading. Filtering, switching views, or dragging the globe must never dismiss an open article. Maintain full keyboard navigation and keep both English and Simplified Chinese (`zh-CN`) copy updated in `src/i18n.ts`.
- **When uncertain, do not guess.** Strictly separate `event`, `publisher`, and `subject` locations; records without geographic evidence stay in *Global / unlocated* (never invent coordinates). Distinguish official releases from research preprints and publication timestamps from fetch timestamps. Preserve date-only precision without fabricating times or timezones.
- **Verify rights before adding public feeds.** Public HTTP accessibility or RSS availability does not equal redistribution permission. Keep `scripts/sources.json` and `presets/public-demo.sources.json` strictly redistributable; personal-reading-only feeds belong in gitignored `local/` or in-browser BYO-Feeds. Never fabricate records on fetch failure; partial failures retain previous valid content and timestamps.

## 4. Verification & Public-Repo Commit Hygiene

- Run `npm run typecheck`, `npm test`, and `npm run build` after code changes; never claim unverified runs passed.
- For UI changes, verify `dist/index.html` offline in headless Chromium across desktop and narrow viewports.
- **Commit safety (critical):** Never commit files from `/local/`, `/drafts/`, `/scratch/`, `/verification/`, `*.local.*`, `*.draft.*`, credentials/secrets, or machine-specific local paths. Always inspect `git status` and `git diff --cached` before committing.
