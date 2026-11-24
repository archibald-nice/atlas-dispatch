import { isDeepStrictEqual } from 'node:util';
import { validateSnapshot } from '../src/domain.ts';

/**
 * Compare two schemaVersion 1 snapshots for a release report.
 *
 * Sources are examined in snapshot order: every previous-only source keeps its
 * previous position, then new candidate-only sources are appended in candidate
 * order. Event identity is the stable event `id` inside its own source; the
 * same id in different sources is never compared.
 *
 * `retained` is specific to an errored candidate source: it counts records that
 * are present in both snapshots and are deeply equal, i.e. the old copy the
 * refresh pipeline preserved after a failed fetch. Those records are not also
 * counted in `unchanged`. A changed record from an errored source is counted in
 * `changed`, not `retained`. Successful sources never report retained records.
 *
 * When an errored candidate source has records without a previous counterpart
 * (for example the first report has no activated baseline), those records are
 * counted as retained rather than added: a failed attempt cannot create new
 * records, and calling them added would falsely claim there was no old data.
 * Consequently an errored source reports no added records.
 *
 * `lastSuccessAt` is the last timestamp known to be a successful fetch, not the
 * latest attempt. On a first failure (errored source with no retained data) the
 * refresh pipeline writes the attempt time into `fetchedAt`; this comparison
 * returns null there instead of passing that value off as a success. A removed
 * source reports its previous successful timestamp when its previous record had
 * data, otherwise null.
 */
export function compareSnapshots(previous, candidate) {
  const next = validateSnapshot(candidate);
  const before = previous == null ? null : validateSnapshot(previous);

  const previousSources = before?.sources ?? [];
  const candidateSources = next.sources;
  const previousById = new Map(previousSources.map(source => [source.id, source]));
  const candidateById = new Map(candidateSources.map(source => [source.id, source]));
  const previousEvents = groupEventsBySource(before?.events ?? []);
  const candidateEvents = groupEventsBySource(next.events);

  const sourceIds = previousSources.map(source => source.id);
  const seen = new Set(sourceIds);
  for (const source of candidateSources) {
    if (seen.has(source.id)) continue;
    seen.add(source.id);
    sourceIds.push(source.id);
  }

  const sources = sourceIds.map(id => {
    const previousStatus = previousById.get(id);
    const candidateStatus = candidateById.get(id);
    const previousSourceEvents = previousEvents.get(id) ?? new Map();
    const candidateSourceEvents = candidateEvents.get(id) ?? new Map();
    const status = candidateStatus?.status ?? 'removed';

    let added = 0;
    let removed = 0;
    let changed = 0;
    let retained = 0;
    let unchanged = 0;

    for (const [eventId, event] of candidateSourceEvents) {
      if (!previousSourceEvents.has(eventId)) {
        if (status === 'error') retained += 1;
        else added += 1;
        continue;
      }
      if (!isDeepStrictEqual(previousSourceEvents.get(eventId), event)) {
        changed += 1;
        continue;
      }
      if (status === 'error') retained += 1;
      else unchanged += 1;
    }
    for (const eventId of previousSourceEvents.keys()) {
      if (!candidateSourceEvents.has(eventId)) removed += 1;
    }

    return {
      id,
      previousCount: previousSourceEvents.size,
      count: candidateSourceEvents.size,
      added,
      removed,
      changed,
      retained,
      unchanged,
      lastSuccessAt: lastSuccessAt(candidateStatus, previousStatus, retained, previousSourceEvents.size),
      attemptedAt: attemptAt(candidateStatus, previousStatus),
      status,
    };
  });

  const warnings = [];
  for (const row of sources) {
    if (row.status === 'error') {
      warnings.push({
        sourceId: row.id,
        code: 'failed',
        message: row.retained > 0
          ? `信源 ${row.id} 采集失败；保留上次成功采集的 ${row.retained} 条记录（上次成功：${row.lastSuccessAt ?? '未知'}）。`
          : `信源 ${row.id} 采集失败；没有可保留的旧记录。`,
      });
    }
    if (row.status === 'removed') {
      warnings.push({
        sourceId: row.id,
        code: 'removed',
        message: `信源 ${row.id} 已从当前快照中移除；上期 ${row.previousCount} 条记录不再提供。`,
      });
    }
    if (row.status === 'ok' && row.previousCount >= 4 && row.count * 2 <= row.previousCount) {
      warnings.push({
        sourceId: row.id,
        code: 'sharp-drop',
        message: `信源 ${row.id} 记录数从 ${row.previousCount} 条降至 ${row.count} 条，已降至上期的一半或更少，请核对采集与校验结果。`,
      });
    }
  }

  return { sources, warnings };
}

/**
 * Render a comparison report as Chinese plain text. The parent owns JSON
 * persistence; this function only formats the in-memory report.
 */
export function formatReleaseReport(report) {
  const rows = report.sources.map(row => ({
    source: row.id,
    status: statusLabel(row.status),
    lastSuccessAt: row.lastSuccessAt ?? '—',
    attemptedAt: row.attemptedAt ?? '—',
    previousCount: String(row.previousCount),
    count: String(row.count),
    added: String(row.added),
    removed: String(row.removed),
    changed: String(row.changed),
    retained: String(row.retained),
    unchanged: String(row.unchanged),
  }));
  const columns = [
    ['信源', 'source'],
    ['状态', 'status'],
    ['上次成功采集', 'lastSuccessAt'],
    ['最近尝试', 'attemptedAt'],
    ['上期', 'previousCount'],
    ['本期', 'count'],
    ['新增', 'added'],
    ['移除', 'removed'],
    ['变更', 'changed'],
    ['保留', 'retained'],
    ['未变', 'unchanged'],
  ];
  const widths = columns.map(([title, key]) => Math.max(
    displayWidth(title),
    ...rows.map(row => displayWidth(row[key])),
  ));
  const totalPrevious = report.sources.reduce((total, row) => total + row.previousCount, 0);
  const totalCurrent = report.sources.reduce((total, row) => total + row.count, 0);
  const removedSources = report.sources.filter(row => row.status === 'removed').map(row => row.id);

  const lines = [
    '环讯 Atlas 快照发布报告',
    '',
    `信源：${report.sources.length} 个；上期记录：${totalPrevious} 条；本期记录：${totalCurrent} 条；警告：${report.warnings.length} 条。`,
    '',
    columns.map(([title], index) => padDisplay(title, widths[index])).join('  '),
    ...rows.map(row => columns.map(([, key], index) => padDisplay(row[key], widths[index])).join('  ')),
  ];

  if (removedSources.length > 0) {
    lines.push('', `移除的信源：${removedSources.join('、')}`);
  }
  lines.push('', '警告：');
  if (report.warnings.length === 0) {
    lines.push('无。');
  } else {
    for (const warning of report.warnings) {
      lines.push(`- [${warning.code}] ${warning.message}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function groupEventsBySource(events) {
  const grouped = new Map();
  for (const event of events) {
    if (!grouped.has(event.sourceId)) grouped.set(event.sourceId, new Map());
    grouped.get(event.sourceId).set(event.id, event);
  }
  return grouped;
}

function validDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function lastSuccessAt(candidateStatus, previousStatus, retained, previousCount) {
  if (candidateStatus) {
    if (candidateStatus.status === 'ok') return validDate(candidateStatus.fetchedAt);
    // An errored source keeps its previous success time only when old records
    // were actually retained. Without retained data, fetchedAt is the current
    // attempt time written by the refresh pipeline and must not be reported as
    // a success.
    return retained > 0 ? validDate(candidateStatus.fetchedAt) : null;
  }
  if (!previousStatus) return null;
  if (previousStatus.status === 'ok') return validDate(previousStatus.fetchedAt);
  return previousCount > 0 ? validDate(previousStatus.fetchedAt) : null;
}

function attemptAt(candidateStatus, previousStatus) {
  return validDate((candidateStatus ?? previousStatus)?.attemptedAt);
}

function statusLabel(status) {
  if (status === 'ok') return '正常';
  if (status === 'error') return '失败';
  return '已移除';
}

function displayWidth(value) {
  let width = 0;
  for (const character of String(value)) {
    const codePoint = character.codePointAt(0);
    const wide = (codePoint >= 0x1100 && codePoint <= 0x115f)
      || (codePoint >= 0x2e80 && codePoint <= 0xa4cf)
      || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
      || (codePoint >= 0xf900 && codePoint <= 0xfaff)
      || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
      || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
      || (codePoint >= 0xff00 && codePoint <= 0xff60)
      || (codePoint >= 0xffe0 && codePoint <= 0xffe6);
    width += wide ? 2 : 1;
  }
  return width;
}

function padDisplay(value, width) {
  const text = String(value);
  return `${text}${' '.repeat(Math.max(0, width - displayWidth(text)))}`;
}
