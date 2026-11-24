import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  collectSource,
  applyEditorialOverrides,
  canonicalizeUrl,
} from './adapters.mjs';
import SOURCE_DEFINITIONS from './sources.json' with { type: 'json' };
import { validateSnapshot } from '../src/domain.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const overridesPath = path.join(root, 'src/data/editorial-overrides.json');

async function readJson(file, label) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    console.warn(`[refresh] 忽略无法读取的${label}：${error.message}`);
    return null;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function writeAtomic(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx', mode: 0o644 });
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function previousSource(snapshot, definition) {
  if (!snapshot || !Array.isArray(snapshot.sources) || !Array.isArray(snapshot.events)) return null;
  const status = snapshot.sources.find(source => source?.id === definition.id);
  if (!status) return null;
  const events = snapshot.events.filter(event => event?.sourceId === definition.id);
  return { status, events };
}

function trustedOldSnapshot(value) {
  if (!value) return null;
  try {
    return validateSnapshot(value);
  } catch (error) {
    console.warn(`[refresh] 旧快照未通过 schemaVersion 1 校验，将不保留旧数据：${errorMessage(error)}`);
    return null;
  }
}

function keepPrevious(definition, previous, attemptAt, failureMessage) {
  const oldFetchedAt = typeof previous?.status?.fetchedAt === 'string' && Number.isFinite(Date.parse(previous.status.fetchedAt))
    ? previous.status.fetchedAt
    : attemptAt;
  const retained = previous?.events?.length ?? 0;
  const error = retained
    ? `刷新失败（${attemptAt}）：${failureMessage}；保留 ${oldFetchedAt} 采集的 ${retained} 条旧数据。`
    : `刷新失败（${attemptAt}）：${failureMessage}；无旧数据可保留。`;
  return {
    status: {
      id: definition.id,
      name: definition.name,
      url: definition.url,
      policyUrl: definition.policyUrl,
      rights: definition.rights,
      status: 'error',
      fetchedAt: oldFetchedAt,
      attemptedAt: attemptAt,
      count: retained,
      error: error.slice(0, 600),
    },
    events: previous?.events ?? [],
  };
}

function mergedEvents(results) {
  const events = [];
  const seen = new Set();
  for (const result of results) {
    for (const event of result.events) {
      if (!event?.id || seen.has(event.id)) continue;
      seen.add(event.id);
      events.push(event);
    }
  }
  return events;
}

function normalizeOverrides(raw) {
  const entries = raw?.entries && typeof raw.entries === 'object' && !Array.isArray(raw.entries)
    ? raw.entries
    : raw;
  const normalized = {};
  for (const [key, value] of Object.entries(entries ?? {})) {
    const url = canonicalizeUrl(key);
    if (!url || !value || typeof value !== 'object') continue;
    normalized[url] = value;
  }
  return { entries: normalized };
}

async function main() {
  const args = process.argv.slice(2);
  const usage = '用法：npm run refresh [-- --source <信源 ID> --catalog <文件>]；查看信源：npm run sources:list';
  const options = new Map();
  if (args.length === 1 && args[0] === '--list') {
    console.log(SOURCE_DEFINITIONS.map(source => `${source.id}\t${source.name}\t${source.format}\t最多 ${source.maxEvents} 条`).join('\n'));
    return;
  }
  for (let i = 0; i < args.length; i += 2) {
    const [key, value] = [args[i], args[i + 1]];
    if (!['--source', '--input', '--output', '--catalog'].includes(key) || !value || value.startsWith('-') || options.has(key)) throw new Error(usage);
    options.set(key, value);
  }
  if (options.has('--input') !== options.has('--output')) throw new Error('--input 和 --output 必须同时使用。');
  const catalog = options.has('--catalog')
    ? JSON.parse(await readFile(path.resolve(options.get('--catalog')), 'utf8'))
    : SOURCE_DEFINITIONS;
  if (!Array.isArray(catalog)) throw new Error('信源清单文件必须是 JSON 数组。');
  const sourceId = options.get('--source');
  const selected = catalog.find(source => source.id === sourceId);
  if (sourceId && !selected) throw new Error(`未知信源 ID：${sourceId}。运行 npm run sources:list 查看可用 ID。`);
  const snapshotPath = path.join(root, 'src/data/snapshot.json');
  const inputPath = path.resolve(options.get('--input') ?? snapshotPath);
  const outputPath = path.resolve(options.get('--output') ?? snapshotPath);
  const definitions = selected ? [selected] : catalog;
  const attemptAt = new Date().toISOString();
  const [oldSnapshot, rawOverrides] = await Promise.all([
    readJson(inputPath, '旧快照'),
    readJson(overridesPath, '编辑覆盖文件'),
  ]);
  const usableOld = trustedOldSnapshot(oldSnapshot);
  if (selected && !usableOld) {
    throw new Error('单源更新需要有效的旧快照才能保留其他信源；请先运行 npm run refresh 生成全量快照。');
  }
  const overrides = normalizeOverrides(rawOverrides);

  console.log(`[refresh] ${attemptAt} 开始有限采集，共 ${definitions.length} 个信源${selected ? `（${selected.id}）` : ''}。`);
  const collected = await Promise.all(definitions.map(definition => collectSource(definition)));

  const results = [];
  let succeeded = 0;
  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index];
    const result = collected[index];
    if (result.status.status === 'ok') {
      succeeded += 1;
      const events = applyEditorialOverrides(result.events, overrides);
      results.push({ ...result, events });
      console.log(`[refresh] ${definition.id}: 成功 ${events.length} 条。`);
      continue;
    }
    const previous = previousSource(usableOld, definition);
    const kept = keepPrevious(definition, previous, attemptAt, result.status.error ?? '未知错误');
    results.push(kept);
    const retained = kept.events.length ? `，保留旧数据 ${kept.events.length} 条` : '';
    console.warn(`[refresh] ${definition.id}: 失败 ${result.status.error}${retained}`);
  }

  if (succeeded === 0) {
    const failure = selected ? `所选信源 ${selected.id} 采集失败` : '全部信源采集失败';
    console.error(`[refresh] ${failure}；不覆盖现有快照，退出码 1。`);
    process.exitCode = 1;
    return;
  }

  const events = mergedEvents(results);
  const sources = results.map(result => {
    const count = events.filter(event => event.sourceId === result.status.id).length;
    return { ...result.status, count };
  });

  if (selected) {
    const refreshed = sources[0];
    sources.length = 0;
    let replaced = false;
    for (const status of usableOld.sources) {
      if (status.id === selected.id) {
        sources.push(refreshed);
        replaced = true;
      } else {
        sources.push(status);
      }
    }
    if (!replaced) sources.push(refreshed);
    // Do not deduplicate across this boundary: an ID collision must fail
    // snapshot validation, not silently remove an untouched event.
    for (const event of usableOld.events) {
      if (event.sourceId !== selected.id) events.push(event);
    }
  }
  events.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));
  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources,
    events,
  };
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  try {
    validateSnapshot(JSON.parse(serialized));
  } catch (error) {
    console.error(`[refresh] 新快照未通过 schemaVersion 1 校验；不覆盖现有快照：${errorMessage(error)}`);
    process.exitCode = 1;
    return;
  }

  const editorialCount = events.filter(event => event.summaryMode === 'editorial').length;
  await writeAtomic(outputPath, serialized);
  console.log(`[refresh] 写入 ${path.relative(root, outputPath)}：${events.length} 条事件，${editorialCount} 条编辑摘要；本次 ${succeeded}/${definitions.length} 个信源成功。`);
}

main().catch(error => {
  console.error(`[refresh] 未完成：${errorMessage(error)}`);
  process.exitCode = 1;
});