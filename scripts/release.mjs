import { spawnSync, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSnapshot } from '../src/domain.ts';
import { compareSnapshots, formatReleaseReport } from './release-report.mjs';
import { publicSnapshot } from './public-content.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const releases = path.join(root, 'releases');
const versions = path.join(releases, 'versions');
const exportsDir = path.join(releases, 'exports');
const stateFile = path.join(releases, 'current.json');
const workingSnapshot = path.join(root, 'src/data/snapshot.json');
const notices = path.join(root, 'THIRD_PARTY_NOTICES.txt');
const validId = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}$/;
const validHash = /^[a-f0-9]{64}$/;
const trackedInputs = ['src', 'assets', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json', 'THIRD_PARTY_NOTICES.txt', ':(exclude)src/data/snapshot.json'];
const usage = `用法：npm run release -- <命令>
  status                             查看当前版、上一个启用版与最近版本
  prepare                            复用当前版快照（首次用工作快照），不联网
  prepare --refresh | --source ID    采集全部信源或只更新一个
  prepare --working-snapshot         显式使用 src/data/snapshot.json，不联网
  report <版本号>                     查看逐源差异
  activate <版本号> [--accept-warnings "原因"]
  rollback                           切回上一个启用版，不构建、不采集
  export                             从当前版生成免费对外审阅候选，不发布`;

const json = value => `${JSON.stringify(value, null, 2)}\n`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const at = (dir, file) => path.join(dir, file);
const relative = file => path.relative(root, file);
const now = () => new Date().toISOString();
const newId = () => `${now().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function readState() {
  let state;
  try {
    state = await readJson(stateFile);
  } catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion: 1, current: null, previous: null };
    throw error;
  }
  const entryOk = entry => entry === null || (typeof entry === 'object' && validId.test(entry.id)
    && Number.isFinite(Date.parse(entry.activatedAt)) && (entry.warningReason === null || typeof entry.warningReason === 'string'));
  if (state?.schemaVersion !== 1 || !state.current || !entryOk(state.current) || !entryOk(state.previous)
    || state.current.id === state.previous?.id) {
    throw new Error('releases/current.json 无效；先保留文件并检查，不覆盖当前指针。');
  }
  return state;
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function cleanRevision() {
  let revision;
  try { revision = git('rev-parse', '--verify', 'HEAD'); } catch {
    throw new Error('管理版需要 Git 首个提交；请先建立代码基线。');
  }
  const changed = git('status', '--porcelain=v1', '--untracked-files=all', '--', ...trackedInputs);
  if (changed) throw new Error(`先提交构建相关修改，才能准确记录源码版本：\n${changed}`);
  return revision;
}

function assertSameRevision(revision) {
  if (cleanRevision() !== revision) throw new Error('构建期间 Git 版本变化，请重新生成候选。');
}

function runScript(file, args) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', file), ...args], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${file} 未完成；当前启用版不变。`);
}

async function loadVersion(id) {
  if (typeof id !== 'string' || !validId.test(id)) throw new Error('版本号无效；使用 release status 查看。');
  const dir = at(versions, id);
  const manifest = await readJson(at(dir, 'manifest.json'));
  if (manifest?.schemaVersion !== 1 || manifest.id !== id || manifest.scope !== 'local'
    || !/^[a-f0-9]{40,64}$/.test(manifest.gitCommit) || typeof manifest.snapshotGeneratedAt !== 'string'
    || (manifest.comparedTo !== null && !validId.test(manifest.comparedTo))) {
    throw new Error(`${id} 的版本清单无效。`);
  }
  const files = ['snapshot.json', 'index.html', 'report.json', 'THIRD_PARTY_NOTICES.txt'];
  const [snapshotText, , reportText] = await Promise.all(files.map(async file => {
    const bytes = await readFile(at(dir, file));
    const digest = manifest.sha256?.[file];
    if (!validHash.test(digest) || hash(bytes) !== digest) throw new Error(`${id}/${file} 校验失败；不要使用这份产物。`);
    return bytes;
  }));
  const snapshot = validateSnapshot(JSON.parse(snapshotText));
  const report = JSON.parse(reportText);
  if (snapshot.generatedAt !== manifest.snapshotGeneratedAt || !Array.isArray(report.sources) || !Array.isArray(report.warnings)) {
    throw new Error(`${id} 的快照或质量报告与清单不符。`);
  }
  return { dir, manifest, snapshot, report };
}

async function makePackage(parent, prefix, id, produce) {
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(at(parent, prefix));
  const destination = at(parent, id);
  try {
    await produce(staging);
    await rename(staging, destination);
  } catch (error) {
    // The only directory removed is the private temp directory made by this invocation.
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  return destination;
}

async function confirmStateChange(change) {
  await mkdir(releases, { recursive: true });
  const lock = at(releases, '.state-lock');
  try { await mkdir(lock); } catch (error) {
    if (error.code === 'EEXIST') throw new Error('版本指针被另一个操作锁定；先确认没有启用或回退正在运行。');
    throw error;
  }
  const temporary = at(releases, `.current-${randomUUID()}.tmp`);
  try {
    const state = await change(await readState());
    if (!state) return;
    await writeFile(temporary, json(state), { flag: 'wx' });
    await rename(temporary, stateFile);
  } finally {
    try { await rm(temporary, { force: true }); } finally { await rmdir(lock); }
  }
}

async function checksums(dir, ...files) {
  return Object.fromEntries(await Promise.all(files.map(async file => [file, hash(await readFile(at(dir, file)))])));
}

async function prepare(options) {
  const revision = cleanRevision();
  const state = await readState();
  const base = state.current ? await loadVersion(state.current.id) : null;
  const id = newId();
  const destination = await makePackage(versions, '.prepare-', id, async dir => {
    const snapshotFile = at(dir, 'snapshot.json');
    const input = base && !options.working ? at(base.dir, 'snapshot.json') : workingSnapshot;
    if (options.refresh) {
      runScript('refresh.mjs', ['--input', input, '--output', snapshotFile, ...(options.source ? ['--source', options.source] : [])]);
    } else {
      await copyFile(input, snapshotFile);
    }
    const snapshot = validateSnapshot(await readJson(snapshotFile));
    const report = compareSnapshots(base?.snapshot ?? null, snapshot);
    await writeFile(at(dir, 'report.json'), json(report));
    console.log(formatReleaseReport(report));
    runScript('build.mjs', ['--snapshot', snapshotFile, '--output', at(dir, 'index.html')]);
    await copyFile(notices, at(dir, 'THIRD_PARTY_NOTICES.txt'));
    const sha256 = await checksums(dir, 'snapshot.json', 'index.html', 'report.json', 'THIRD_PARTY_NOTICES.txt');
    assertSameRevision(revision);
    await writeFile(at(dir, 'manifest.json'), json({
      schemaVersion: 1, id, scope: 'local', createdAt: now(), gitCommit: revision, nodeVersion: process.version,
      snapshotGeneratedAt: snapshot.generatedAt, comparedTo: state.current?.id ?? null, sha256,
    }));
  });
  console.log(`候选 ${id}（尚未启用）\n预览：${relative(at(destination, 'index.html'))}\n查看报告：npm run release -- report ${id}\n确认后：npm run release -- activate ${id}`);
}

async function status() {
  const state = await readState();
  const list = entry => entry ? `${entry.id}${entry.warningReason ? `（异常批准：${entry.warningReason}）` : ''}` : '无';
  console.log(`当前版：${list(state.current)}\n上个启用版：${list(state.previous)}`);
  if (state.current) {
    const { dir, manifest } = await loadVersion(state.current.id);
    console.log(`打开：${relative(at(dir, 'index.html'))}\n代码：${manifest.gitCommit}\n快照：${manifest.snapshotGeneratedAt} / ${manifest.sha256['snapshot.json']}`);
  }
  const entries = await readdir(versions).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const recent = entries.filter(id => validId.test(id)).sort().reverse().slice(0, 5);
  if (recent.length) console.log(`最近生成的版本（最多 5 版）：\n${recent.join('\n')}`);
}

async function activate(id, reason) {
  await confirmStateChange(async state => {
    const { dir, manifest, report } = await loadVersion(id);
    if (state.current?.id === id) {
      console.log(`已经是当前版：${relative(at(dir, 'index.html'))}`);
      return null;
    }
    if ((state.current?.id ?? null) !== manifest.comparedTo) throw new Error('候选比较基准已过期；请以当前启用版为基准重新生成。');
    if (report.warnings.length && !reason) {
      console.log(formatReleaseReport(report));
      throw new Error('存在逐源异常；核对后请用 --accept-warnings "原因" 显式确认。');
    }
    return { schemaVersion: 1, current: { id, activatedAt: now(), warningReason: report.warnings.length ? reason : null }, previous: state.current };
  });
  console.log(`当前版：${relative(at(at(versions, id), 'index.html'))}`);
}

async function rollback() {
  let target;
  await confirmStateChange(async state => {
    if (!state.previous) throw new Error('没有上一次启用的版本可以回退。');
    target = await loadVersion(state.previous.id);
    return { schemaVersion: 1, current: state.previous, previous: state.current };
  });
  console.log(`已回退，当前打开：${relative(at(target.dir, 'index.html'))}`);
}

async function exportForReview() {
  const { current } = await readState();
  if (!current) throw new Error('先启用一个本地版本，再导出对外审阅候选。');
  const { manifest, snapshot } = await loadVersion(current.id);
  const revision = cleanRevision();
  if (revision !== manifest.gitCommit) throw new Error('当前代码不是此版本的构建版本；请先启用用当前代码生成的候选。');
  const projection = publicSnapshot(snapshot);
  validateSnapshot(projection.snapshot);
  if (!projection.snapshot.events.length) throw new Error('按对外规则过滤后没有可供审阅的记录，不生成候选。');
  const id = newId();
  const destination = await makePackage(exportsDir, '.export-', id, async dir => {
    const contents = json(projection.snapshot);
    const snapshotFile = at(dir, '.build-snapshot.json');
    await writeFile(snapshotFile, contents);
    runScript('build.mjs', ['--snapshot', snapshotFile, '--output', at(dir, 'index.html')]);
    await rm(snapshotFile);
    await copyFile(notices, at(dir, 'THIRD_PARTY_NOTICES.txt'));
    const sha256 = await checksums(dir, 'index.html', 'THIRD_PARTY_NOTICES.txt');
    assertSameRevision(revision);
    await writeFile(at(dir, 'manifest.json'), json({
      schemaVersion: 1, id, scope: 'public-free-review-only', from: current.id, createdAt: now(), gitCommit: revision,
      nodeVersion: process.version, snapshotGeneratedAt: projection.snapshot.generatedAt, snapshotSha256: hash(contents), sources: projection.sources, sha256,
    }));
  });
  console.log(`免费对外审阅候选（未授权、未上传、不可直接当付费包）：${relative(destination)}`);
}

async function main([command = 'status', ...args]) {
  if (command === 'status' && !args.length) return status();
  if (command === 'prepare') {
    if (!args.length) return prepare({ refresh: false });
    if (args.length === 1 && args[0] === '--working-snapshot') return prepare({ working: true });
    if (args.length === 1 && args[0] === '--refresh') return prepare({ refresh: true });
    if (args.length === 2 && args[0] === '--source' && /^[\w-]+$/.test(args[1]) && !args[1].startsWith('-')) return prepare({ refresh: true, source: args[1] });
  }
  if (command === 'report' && args.length === 1) {
    const { manifest, report } = await loadVersion(args[0]);
    console.log(`版本 ${manifest.id} · 对比 ${manifest.comparedTo ?? '无已启用基线'}\n${formatReleaseReport(report)}`);
    return;
  }
  if (command === 'activate' && args.length === 1) return activate(args[0], null);
  if (command === 'activate' && args.length === 3 && args[1] === '--accept-warnings' && args[2].trim()) return activate(args[0], args[2].trim());
  if (command === 'rollback' && !args.length) return rollback();
  if (command === 'export' && !args.length) return exportForReview();
  if (command === '--help' && !args.length) return console.log(usage);
  throw new Error(usage);
}

main(process.argv.slice(2)).catch(error => {
  console.error(`[release] ${error.message}`);
  process.exitCode = 1;
});
