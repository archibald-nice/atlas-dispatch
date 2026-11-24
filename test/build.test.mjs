import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const project = fileURLToPath(new URL('../', import.meta.url));

test('invalid content cannot replace the last usable offline build', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['scripts', 'src/data', 'dist']) await mkdir(path.join(root, dir), { recursive: true });
  for (const file of ['scripts/build.mjs', 'src/domain.ts', 'src/data/snapshot.json']) await cp(path.join(project, file), path.join(root, file));
  await symlink(path.join(project, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  const destination = path.join(root, 'dist/index.html');
  const validBuild = '<!doctype html><title>Existing usable build</title>';
  await writeFile(destination, validBuild);
  const snapshotPath = path.join(root, 'src/data/snapshot.json');
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  snapshot.events[0].sources[0].url = 'javascript:unsafe()';
  await writeFile(snapshotPath, JSON.stringify(snapshot));
  const result = await new Promise(resolve => {
    execFile(process.execPath, [path.join(root, 'scripts/build.mjs')], { timeout: 15_000 }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }));
  });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /HTTPS/);
  assert.equal(await readFile(destination, 'utf8'), validBuild);
});
