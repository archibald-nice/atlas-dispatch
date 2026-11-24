import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSnapshot } from '../src/domain.ts';
import { publicSnapshot } from './public-content.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const ossStageRoot = path.join(root, 'releases/oss-stage');

const OPEN_EXTRA_PUBLIC_SOURCES = new Set(['eonet', 'gdacs', 'rba']);

const COPY_DIRS = ['src', 'assets', 'scripts', 'presets', 'test', 'docs'];
const COPY_FILES = [
  '.gitignore',
  'LICENSE',
  'THIRD_PARTY_NOTICES.txt',
  'package-lock.json',
  'tsconfig.json',
];

const PUBLIC_README = `# Atlas Dispatch · Global Intelligence Globe

**A local-first 3D globe for your own feeds — evidence-based geo, zero tracking, single-file offline HTML.**

Atlas Dispatch turns open syndication feeds (RSS 2.0, Atom, GeoRSS, JSON Feed 1.1, Point GeoJSON, and OPML) into an interactive WebGL2 particle globe and thematic space with 242 real Natural Earth country outlines.

## Why Atlas Dispatch?

- **When uncertain, do not guess.** Events without verifiable coordinates stay in *Global / unlocated* instead of being pinned to random cities. Publisher headquarters (\`publisher\`), explicit mentions (\`subject\`), and actual event sites (\`event\`) are strictly separated.
- **Bring your own feeds (BYO-Feeds).** Click **+** in the top bar to connect live CORS-friendly feeds, import an **OPML** file (folder names become custom board tags), or run \`npm run companion\` locally to auto-discover site RSS feeds without browser CORS limits.
- **Single-file offline build.** \`npm run build\` compiles the UI, shaders, 242 country outlines, and your snapshot into a single self-contained \`dist/index.html\` (~1.9 MiB). Open it directly from disk with zero backend.
- **5-minute personal GitHub Pages deploy.** Click *Use this template*, replace \`scripts/sources.json\` (or pick a preset in \`presets/\`), and let \`.github/workflows/update-pages.yml\` refresh and publish automatically every 6 hours.

## Quick Start

Requires **Node.js 22.18+** and a **WebGL2** browser.

\`\`\`sh
npm ci --ignore-scripts
npm run build
# Open dist/index.html directly, or run the local companion for CORS-free feed discovery:
npm run companion
\`\`\`

## Supported Standards

- **RSS 2.0 / Atom 1.0 / RSS 1.0 (RDF)** + **GeoRSS** (\`<georss:point>\`, \`<geo:Point>\`)
- **JSON Feed 1.1** (with optional \`_geo\`)
- **GeoJSON** (\`FeatureCollection\` with \`Point\` geometries)
- **NASA EONET v3** & **GDACS GeoRSS**
- **OPML 2.0** import & export

## License & Boundaries

- First-party source code is licensed under **Apache-2.0** (see \`LICENSE\`).
- Bundled surface geometry is derived from **Natural Earth** (public domain); see \`THIRD_PARTY_NOTICES.txt\`.
- Feed contents remain subject to their respective publishers' terms; see \`docs/PUBLICATION.md\` before redistributing third-party content.
`;

async function copyTree(srcDir, dstDir, skipRel = new Set(), prefix = '') {
  await mkdir(dstDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (skipRel.has(rel)) continue;
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      await copyTree(srcPath, dstPath, skipRel, rel);
    } else if (entry.isFile()) {
      await copyFile(srcPath, dstPath);
    }
  }
}

async function listAllFiles(dir, prefix = '') {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await listAllFiles(path.join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out.sort();
}

function buildPublicDemoSnapshot(rawSnapshot, publicCatalog) {
  const reviewed = publicSnapshot(rawSnapshot).snapshot;
  const allowedIds = new Set(publicCatalog.map(s => s.id));
  const sources = reviewed.sources.filter(s => allowedIds.has(s.id));
  const events = reviewed.events.filter(e => allowedIds.has(e.sourceId));

  for (const src of rawSnapshot.sources) {
    if (!OPEN_EXTRA_PUBLIC_SOURCES.has(src.id) || !allowedIds.has(src.id)) continue;
    const srcEvents = rawSnapshot.events
      .filter(e => e.sourceId === src.id && e.summaryMode !== 'editorial')
      .map(e => ({
        ...e,
        id: createHash('sha256').update(e.id).digest('hex'),
      }));
    sources.push({
      id: src.id,
      name: src.name,
      url: src.url,
      policyUrl: src.policyUrl,
      rights: src.rights,
      status: src.status,
      fetchedAt: src.fetchedAt,
      count: srcEvents.length,
      error: src.status === 'error' ? 'Public demo omitted private error detail.' : null,
    });
    events.push(...srcEvents);
  }

  return validateSnapshot({
    schemaVersion: 1,
    generatedAt: rawSnapshot.generatedAt,
    sources,
    events: events.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id)),
  });
}

export async function exportOpenSourceTree(options = {}) {
  const outRoot = options.outRoot ?? ossStageRoot;
  await mkdir(outRoot, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
  const staging = await mkdtemp(path.join(outRoot, '.oss-'));
  const destination = path.join(outRoot, id);

  try {
    const skip = new Set(['src/data/editorial-overrides.json', 'src/data/snapshot.json', 'scripts/sources.json']);
    for (const dir of COPY_DIRS) {
      await copyTree(path.join(root, dir), path.join(staging, dir), skip, dir);
    }
    for (const file of COPY_FILES) {
      await copyFile(path.join(root, file), path.join(staging, file));
    }
    await mkdir(path.join(staging, '.github/workflows'), { recursive: true });
    await copyFile(
      path.join(root, '.github/workflows/update-pages.yml'),
      path.join(staging, '.github/workflows/update-pages.yml'),
    );

    const publicCatalog = JSON.parse(await readFile(path.join(root, 'presets/public-demo.sources.json'), 'utf8'));
    const rawSnapshot = validateSnapshot(JSON.parse(await readFile(path.join(root, 'src/data/snapshot.json'), 'utf8')));
    const cleanSnapshot = buildPublicDemoSnapshot(rawSnapshot, publicCatalog);
    const activeIds = new Set(cleanSnapshot.sources.map(s => s.id));
    const activeCatalog = publicCatalog.filter(entry => activeIds.has(entry.id));
    await writeFile(path.join(staging, 'scripts/sources.json'), `${JSON.stringify(activeCatalog, null, 2)}\n`);
    await writeFile(path.join(staging, 'src/data/editorial-overrides.json'), '{\n  "entries": {}\n}\n');
    await writeFile(path.join(staging, 'src/data/snapshot.json'), `${JSON.stringify(cleanSnapshot, null, 2)}\n`);

    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    const publicPkg = { ...pkg, private: false, license: 'Apache-2.0' };
    await writeFile(path.join(staging, 'package.json'), `${JSON.stringify(publicPkg, null, 2)}\n`);
    await writeFile(path.join(staging, 'README.md'), PUBLIC_README);

    const files = await listAllFiles(staging);
    const manifest = {
      schemaVersion: 1,
      id,
      license: 'Apache-2.0 (first-party code only)',
      createdAt: new Date().toISOString(),
      sourceCount: cleanSnapshot.sources.length,
      eventCount: cleanSnapshot.events.length,
      files,
    };
    await writeFile(path.join(staging, 'oss-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(staging, destination);
    return { destination, manifest };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

if (import.meta.main) {
  const { destination, manifest } = await exportOpenSourceTree();
  console.log(`Exported clean OSS stage (${manifest.files.length} files, ${manifest.sourceCount} public sources, ${manifest.eventCount} events): ${path.relative(root, destination)}`);
}
