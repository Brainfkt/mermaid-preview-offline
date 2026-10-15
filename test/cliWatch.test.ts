import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { cliWatchSnapshot, runCliWatch } from '../src/cliWatch';

void test('watch snapshots detect source/image creation, edits and deletion without depending on path order', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'mpo-watch-'));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const source = join(directory, 'diagram.mmd');
  const image = join(directory, 'logo.svg');
  await writeFile(source, 'A-->B');
  const original = await cliWatchSnapshot([source, image]);
  assert.equal(await cliWatchSnapshot([image, source, source]), original);
  await writeFile(image, '<svg/>');
  const created = await cliWatchSnapshot([source, image]);
  assert.notEqual(created, original);
  await writeFile(source, 'A-->C');
  const changed = await cliWatchSnapshot([source, image]);
  assert.notEqual(changed, created);
  await rm(image);
  assert.notEqual(await cliWatchSnapshot([source, image]), changed);
});

void test('watch serializes cycles, notices edits made during rendering, and stops cleanly', async () => {
  const controller = new AbortController();
  let revision = 'initial';
  const rendered: string[] = [];
  let active = 0;
  let maximumActive = 0;
  await runCliWatch({
    signal: controller.signal,
    intervalMs: 1,
    debounceMs: 1,
    snapshot: () => Promise.resolve(revision),
    onError: (error) => { throw error; },
    run: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      rendered.push(revision);
      if (rendered.length === 1) {
        await delay(2);
        revision = 'edited while rendering';
      } else controller.abort();
      active -= 1;
    },
  });
  assert.deepEqual(rendered, ['initial', 'edited while rendering']);
  assert.equal(maximumActive, 1);
});

void test('watch debounces a burst and does not re-render unchanged snapshots', async () => {
  const controller = new AbortController();
  const snapshots = ['initial', 'initial', 'first edit', 'second edit', 'final edit', 'final edit'];
  let reads = 0;
  let runs = 0;
  await runCliWatch({
    signal: controller.signal,
    intervalMs: 1,
    debounceMs: 1,
    snapshot: () => Promise.resolve(snapshots[Math.min(reads++, snapshots.length - 1)]!),
    onError: (error) => { throw error; },
    run: () => {
      runs += 1;
      if (runs === 2) controller.abort();
      return Promise.resolve();
    },
  });
  assert.equal(runs, 2);
  assert.equal(reads, snapshots.length);
});

void test('watch recovers from an errored cycle after a subsequent input change', async () => {
  const controller = new AbortController();
  let revision = 'broken';
  const errors: unknown[] = [];
  let runs = 0;
  await runCliWatch({
    signal: controller.signal,
    intervalMs: 1,
    debounceMs: 1,
    snapshot: () => Promise.resolve(revision),
    onError: (error) => {
      errors.push(error);
      revision = 'fixed';
    },
    run: () => {
      runs += 1;
      if (runs === 1) return Promise.reject(new Error('syntax error'));
      controller.abort();
      return Promise.resolve();
    },
  });
  assert.equal(errors.length, 1);
  assert.equal(runs, 2);
});

void test('an idle watch aborts its pending long poll promptly', async () => {
  const controller = new AbortController();
  const start = Date.now();
  await runCliWatch({
    signal: controller.signal,
    intervalMs: 60_000,
    snapshot: () => Promise.resolve('unchanged'),
    onError: (error) => { throw error; },
    run: () => {
      setTimeout(() => controller.abort(), 5);
      return Promise.resolve();
    },
  });
  assert.ok(Date.now() - start < 1_000);
});
