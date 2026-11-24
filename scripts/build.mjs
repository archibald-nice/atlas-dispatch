import { build } from 'esbuild';
import { readFile, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateSnapshot } from '../src/domain.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 4 || args[0] !== '--snapshot' || !args[1] || args[2] !== '--output' || !args[3])) {
  throw new Error('用法：node scripts/build.mjs [--snapshot <文件> --output <文件>]');
}
const defaultSnapshot = path.join(root, 'src/data/snapshot.json');
const boundariesAsset = path.join(root, 'assets/country-boundaries.json');
const landPointsAsset = path.join(root, 'assets/land-points.json');
const snapshot = await readFile(args[1] ?? defaultSnapshot, 'utf8');
validateSnapshot(JSON.parse(snapshot));
const destination = path.resolve(args[3] ?? path.join(root, 'dist/index.html'));

function encodeDeltaVarint(ints) {
  const bytes = [];
  for (let i = 0; i < ints.length; i++) {
    const n = ints[i] | 0;
    let u = ((n << 1) ^ (n >> 31)) >>> 0;
    while (u >= 0x80) {
      bytes.push((u & 0x7f) | 0x80);
      u >>>= 7;
    }
    bytes.push(u);
  }
  return Buffer.from(bytes).toString('base64');
}

function packRegionsAsset(raw) {
  const scale = 10000;
  const regions = raw.regions.map(region => {
    const ints = [];
    const shapes = region.polygons.map(polygon => polygon.map(ring => {
      let lx = 0;
      let ly = 0;
      for (let i = 0; i < ring.length; i += 2) {
        const x = Math.round(ring[i] * scale);
        const y = Math.round(ring[i + 1] * scale);
        ints.push(x - lx, y - ly);
        lx = x;
        ly = y;
      }
      return ring.length / 2;
    }));
    return {
      id: region.id,
      iso: region.iso,
      en: region.en,
      zh: region.zh,
      aliases: region.aliases,
      focus: region.focus,
      shapes,
      data: encodeDeltaVarint(ints),
    };
  });
  return { packed: 1, scale, regions };
}

function packLandPointsAsset(points) {
  const scale = 100000;
  const ints = new Array(points.length);
  let lx = 0;
  let ly = 0;
  for (let i = 0; i < points.length; i += 2) {
    const x = Math.round(points[i] * scale);
    const y = Math.round(points[i + 1] * scale);
    ints[i] = x - lx;
    ints[i + 1] = y - ly;
    lx = x;
    ly = y;
  }
  return { packed: 1, scale, count: points.length, data: encodeDeltaVarint(ints) };
}

const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/main.tsx'],
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  minify: true,
  write: false,
  legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'atlas-snapshot',
      setup(context) {
        context.onLoad({ filter: /snapshot\.json$/ }, file => file.path === defaultSnapshot
          ? { contents: snapshot, loader: 'json' }
          : undefined);
      },
    },
    {
      name: 'atlas-geo-pack',
      setup(context) {
        context.onLoad({ filter: /(?:country-boundaries|land-points)\.json$/ }, async file => {
          if (file.path === boundariesAsset) {
            const raw = JSON.parse(await readFile(file.path, 'utf8'));
            return { contents: JSON.stringify(packRegionsAsset(raw)), loader: 'json' };
          }
          if (file.path === landPointsAsset) {
            const raw = JSON.parse(await readFile(file.path, 'utf8'));
            return { contents: JSON.stringify(packLandPointsAsset(raw)), loader: 'json' };
          }
          return undefined;
        });
      },
    },
  ],
  outfile: 'app.js',
});
const script = result.outputFiles.find(file => file.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const css = await readFile(path.join(root, 'src/styles.css'), 'utf8');
const licenses = (await Promise.all(['react', 'react-dom', 'scheduler', 'three'].map(async name =>
  `${name}\n${await readFile(path.join(root, 'node_modules', name, 'LICENSE'), 'utf8')}`
))).join('\n\n').replaceAll('*/', '* /').replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b1518"><meta name="color-scheme" content="dark"><title>环讯 Atlas · 世界正在发生</title><style>${css}</style></head><body><div id="root"></div><script>/*! ${licenses} */\n${script}</script></body></html>`;
await mkdir(path.dirname(destination), { recursive: true });
const temporary = path.join(path.dirname(destination), `.index.${randomUUID()}.tmp`);
try {
  await writeFile(temporary, html, { flag: 'wx' });
  await rename(temporary, destination);
} catch (error) {
  await unlink(temporary).catch(() => {});
  throw error;
}
console.log(`Built ${path.relative(root, destination)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB). Open directly; no server required.`);
