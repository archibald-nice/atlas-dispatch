import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const idPattern = /候选 (\S+)（尚未启用）/;

async function workspace(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ['src', 'assets', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json', 'THIRD_PARTY_NOTICES.txt', '.gitignore']) {
    await cp(path.join(project, name), path.join(root, name), { recursive: true });
  }
  await symlink(path.join(project, 'node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const file = (...parts) => path.join(root, ...parts);
  const read = (...parts) => readFile(file(...parts), 'utf8');
  const json = async (...parts) => JSON.parse(await read(...parts));
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'user.name=Atlas Test', '-c', 'user.email=atlas-fixture@example.test', '-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=.git/no-hooks', ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q');
  // This is a throwaway independent repository; no index in the real checkout is used.
  git('add', '.');
  git('commit', '-qm', 'release fixture');
  const invoke = (args, options = {}) => {
    const result = spawnSync(process.execPath, ['scripts/release.mjs', ...args], { cwd: root, encoding: 'utf8', timeout: 25_000, ...options });
    assert.ifError(result.error);
    return result;
  };
  const ok = (...args) => {
    const result = invoke(args);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return result.stdout;
  };
  const fail = (args, reason, options) => {
    const result = invoke(args, options);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, reason);
    return result;
  };
  return { file, read, json, git, invoke, ok, fail };
}

const version = (text) => {
  assert.match(text, idPattern);
  return text.match(idPattern)[1];
};
const state = w => w.read('releases', 'current.json');
const versionJson = (w, id, name) => w.json('releases', 'versions', id, name);

test('a broken build leaves the active package intact; activation and rollback use the verified package pair', async t => {
  const w = await workspace(t);
  await mkdir(w.file('dist'));
  await writeFile(w.file('dist/index.html'), 'ad hoc build');
  const first = version(w.ok('prepare'));
  await assert.rejects(state(w), { code: 'ENOENT' });
  w.ok('activate', first);
  const firstState = await state(w);
  const manifest = await versionJson(w, first, 'manifest.json');
  const html = await w.read('releases', 'versions', first, 'index.html');
  const snapshot = await w.read('releases', 'versions', first, 'snapshot.json');
  assert.equal(manifest.gitCommit, w.git('rev-parse', 'HEAD'));
  assert.equal(manifest.sha256['index.html'], digest(html));
  assert.equal(manifest.sha256['snapshot.json'], digest(snapshot));
  assert.equal(snapshot, await w.read('src/data/snapshot.json'));

  const entry = await w.read('src/main.tsx');
  await writeFile(w.file('src/main.tsx'), 'const = ;');
  w.fail(['prepare'], /先提交构建相关修改/);
  w.git('add', 'src/main.tsx');
  w.git('commit', '-qm', 'broken entry fixture');
  w.fail(['prepare'], /build\.mjs 未完成/);
  assert.equal(await state(w), firstState);
  assert.deepEqual(await readdir(w.file('releases', 'versions')), [first]);
  assert.equal(await w.read('releases', 'versions', first, 'index.html'), html);
  assert.equal(await w.read('dist/index.html'), 'ad hoc build');

  await writeFile(w.file('src/main.tsx'), entry);
  w.git('add', 'src/main.tsx');
  w.git('commit', '-qm', 'valid entry fixture');
  const changed = JSON.parse(snapshot);
  changed.events[0].title = 'Only this candidate — marker';
  changed.events[0].titleOriginal = 'Only this candidate — marker';
  await writeFile(w.file('src/data/snapshot.json'), JSON.stringify(changed));
  const unchanged = version(w.ok('prepare'));
  assert.equal((await versionJson(w, unchanged, 'manifest.json')).sha256['snapshot.json'], manifest.sha256['snapshot.json']);
  const second = version(w.ok('prepare', '--working-snapshot'));
  assert.match(await w.read('releases', 'versions', second, 'index.html'), /Only this candidate/);
  assert.doesNotMatch(html, /Only this candidate/);
  assert.equal(await state(w), firstState);
  w.ok('activate', second);
  const secondState = await state(w);
  assert.equal(JSON.parse(secondState).previous.id, first);
  w.fail(['activate', unchanged], /比较基准已过期/);
  await writeFile(w.file('releases', 'versions', first, 'index.html'), 'corrupt package');
  w.fail(['rollback'], /校验失败/);
  assert.equal(await state(w), secondState);
  await writeFile(w.file('releases', 'versions', first, 'index.html'), html);
  w.ok('rollback');
  assert.equal(JSON.parse(await state(w)).current.id, first);
  assert.match(w.ok('status'), new RegExp(manifest.sha256['snapshot.json']));
});

test('single-source churn requires an explanation; denied fetches and public exports cannot replace the current version', async t => {
  const w = await workspace(t);
  const first = version(w.ok('prepare'));
  w.ok('activate', first);
  const oldSnapshot = await w.read('src/data/snapshot.json');
  const firstState = await state(w);
  const preload = w.file('offline-fetch.mjs');
  await writeFile(preload, "globalThis.fetch = async () => new Response('denied', {status: 403});\n");
  const env = { ...process.env, NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` };
  w.fail(['prepare', '--refresh'], /refresh\.mjs 未完成/, { env });
  assert.equal(await state(w), firstState);
  assert.deepEqual(await readdir(w.file('releases', 'versions')), [first]);

  const rss = '<?xml version="1.0"?><rss version="2.0"><channel><title>NASA</title><item><guid>atlas-isolated-news-release</guid><title>PRIVATE_HEADLINE_FIXTURE</title><link>https://www.nasa.gov/news-release/isolated-atlas-public-review/</link><pubDate>Sun, 22 Nov 2026 12:00:00 GMT</pubDate><description>PRIVATE_EXCERPT_FIXTURE</description></item></channel></rss>';
  await writeFile(preload, `globalThis.fetch = async url => new URL(url).hostname === 'www.nasa.gov' ? new Response(${JSON.stringify(rss)}, {headers: {'content-type': 'application/rss+xml'}}) : new Response('denied', {status: 403});\n`);
  const result = w.invoke(['prepare', '--source', 'nasa'], { env });
  assert.equal(result.status, 0, result.stderr);
  const candidate = version(result.stdout);
  const report = await versionJson(w, candidate, 'report.json');
  const nasa = report.sources.find(source => source.id === 'nasa');
  assert.deepEqual([nasa.previousCount, nasa.count, nasa.added, nasa.removed], [6, 1, 1, 6]);
  assert.ok(report.warnings.some(warning => warning.sourceId === 'nasa'));
  const candidateData = await versionJson(w, candidate, 'snapshot.json');
  const otherSources = value => value.sources.filter(source => source.id !== 'nasa');
  assert.deepEqual(otherSources(candidateData), otherSources(JSON.parse(oldSnapshot)));
  assert.equal(await w.read('src/data/snapshot.json'), oldSnapshot);
  assert.match(await w.read('releases', 'versions', candidate, 'index.html'), /PRIVATE_EXCERPT_FIXTURE/);
  w.fail(['activate', candidate], /存在逐源异常/);
  assert.equal(await state(w), firstState);
  w.ok('activate', candidate, '--accept-warnings', '已核对 NASA 的隔离样本');
  const approved = await state(w);
  assert.equal(JSON.parse(approved).current.warningReason, '已核对 NASA 的隔离样本');
  assert.match(w.ok('export'), /未授权、未上传/);
  const [exported] = await readdir(w.file('releases', 'exports'));
  assert.deepEqual((await readdir(w.file('releases', 'exports', exported))).sort(), ['THIRD_PARTY_NOTICES.txt', 'index.html', 'manifest.json']);
  const exportedHtml = await w.read('releases', 'exports', exported, 'index.html');
  assert.doesNotMatch(exportedHtml, /PRIVATE_(?:HEADLINE|EXCERPT)_FIXTURE/);
  assert.match(exportedHtml, /isolated-atlas-public-review/);
  assert.equal((await w.json('releases', 'exports', exported, 'manifest.json')).sha256['index.html'], digest(exportedHtml));
  assert.equal(await state(w), approved);
});
