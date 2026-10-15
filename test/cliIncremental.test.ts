import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  CLI_CACHE_MAX_ENTRIES,
  CliExportCache,
  assertCliOutputPaths,
  canReuseCliExport,
  hashCliFile,
  hashCliValue,
  writeCliFileAtomically,
} from '../src/cliIncremental';
import { DEFAULT_EXPORT_SETTINGS } from '../src/exportSettings';

void test('incremental cache survives restart and rejects changed, damaged, missing, or linked outputs', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'mpo-incremental-'));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const cachePath = join(directory, 'cache.json');
  const output = join(directory, 'diagram.svg');
  const source = join(directory, 'diagram.mmd');
  await writeFile(output, '<svg>diagram</svg>');
  const fingerprint = hashCliValue(['graph TD; A-->B', 'image bytes', 'font', 'settings', 'engine']);
  const cache = await CliExportCache.load(cachePath);
  cache.remember({ fingerprint, source, output, outputHash: await hashCliFile(output), width: 20, height: 10 });
  await cache.save();
  const restored = await CliExportCache.load(cachePath);
  assert.equal((await restored.lookup(source, output, fingerprint))?.width, 20);
  assert.equal(await restored.lookup(source, output, hashCliValue('changed setting/image/engine')), undefined);
  await writeFile(output, '<svg>damaged</svg>');
  assert.equal(await restored.lookup(source, output, fingerprint), undefined);
  await rm(output);
  assert.equal(await restored.lookup(source, output, fingerprint), undefined);
  const alternate = join(directory, 'alternate.svg');
  await writeFile(alternate, '<svg>diagram</svg>');
  await symlink(alternate, output);
  assert.equal(await restored.lookup(source, output, fingerprint), undefined);
});

void test('time-dependent exports cannot be skipped even when a content fingerprint matches', () => {
  assert.equal(canReuseCliExport(DEFAULT_EXPORT_SETTINGS), true);
  assert.equal(canReuseCliExport({ ...DEFAULT_EXPORT_SETTINGS, includeMetadata: true }), false);
  for (const token of ['date', 'time']) {
    assert.equal(canReuseCliExport({ ...DEFAULT_EXPORT_SETTINGS, fileNameTemplate: `{name}-{${token}}.svg` }), false);
  }
});

void test('cache recovery, eviction and removed-source pruning preserve unrelated exports', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'mpo-cache-'));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const cachePath = join(directory, 'cache.json');
  const output = join(directory, 'diagram.svg');
  await writeFile(cachePath, '{interrupted');
  await writeFile(output, 'diagram');
  const cache = await CliExportCache.load(cachePath);
  const fingerprint = hashCliValue('same');
  const outputHash = await hashCliFile(output);
  for (let index = 0; index <= CLI_CACHE_MAX_ENTRIES; index += 1) {
    cache.remember({ fingerprint, output, outputHash, source: `source-${index}`, width: 1, height: 1 });
  }
  assert.equal(await cache.lookup('source-0', output, fingerprint), undefined);
  assert.ok(await cache.lookup('source-1', output, fingerprint));
  cache.forgetSources(new Set(['source-1']));
  await cache.save();
  const restored = await CliExportCache.load(cachePath);
  assert.equal(await restored.lookup('source-1', output, fingerprint), undefined);
  assert.ok(await restored.lookup('source-2', output, fingerprint));
  assert.equal(await readFile(output, 'utf8'), 'diagram');
  assert.ok((await stat(cachePath)).size <= 4 * 1024 * 1024);
});

void test('atomic writes preserve export permissions and refuse symbolic links without leaving temporary files', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'mpo-atomic-'));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const output = join(directory, 'diagram.svg');
  await writeFile(output, 'old');
  await chmod(output, 0o640);
  await writeCliFileAtomically(output, 'new');
  assert.equal(await readFile(output, 'utf8'), 'new');
  if (process.platform !== 'win32') assert.equal((await stat(output)).mode & 0o777, 0o640);
  const linked = join(directory, 'linked.svg');
  await symlink(output, linked);
  await assert.rejects(writeCliFileAtomically(linked, 'bad'), /non-regular/u);
  assert.equal(await readFile(output, 'utf8'), 'new');
  assert.deepEqual((await readdir(directory)).sort(), ['diagram.svg', 'linked.svg']);
});

void test('destination preflight rejects collisions with sources, images, profiles, cache and other exports', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'mpo-targets-'));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const inputs = ['diagram.mmd', 'logo.svg', 'profile.json'].map((name) => join(directory, name));
  for (const input of inputs) await writeFile(input, 'keep');
  const cache = join(directory, '.mermaid-preview-cache.json');
  for (const target of [...inputs, cache]) {
    await assert.rejects(assertCliOutputPaths([target], inputs, cache), /overwrite/u);
  }
  const output = join(directory, 'out', 'diagram.svg');
  await assert.rejects(assertCliOutputPaths([output, output], inputs, cache), /same export/u);
  const alias = join(directory, 'image-alias.svg');
  await symlink(inputs[1]!, alias);
  await assert.rejects(assertCliOutputPaths([alias], inputs, cache), /overwrite/u);
  await assertCliOutputPaths([output], inputs, cache);
  for (const input of inputs) assert.equal(await readFile(input, 'utf8'), 'keep');
});
