import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Uses the CLI's portable Chrome/Chromium/Edge lookup and CDP pipe transport.
// Run after a build; all fixtures, exports, and cache files live outside the repo.
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const exec = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'mpo-cli-regression-'));
const checks = [];
try {
  const source = join(directory, 'source');
  const output = join(directory, 'output');
  await mkdir(source);
  const file = join(source, 'a.mmd');
  const image = join(source, 'logo.svg');
  const diagram = 'flowchart LR\n  A@{ img: "logo.svg", label: "Logo", w: 80, h: 40 }\n  A --> B[Done]\n';
  const logo = (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="${color}"/></svg>`;
  await writeFile(file, diagram);
  await writeFile(image, logo('red'));
  const args = [file, '--output', output, '--format', 'svg', '--incremental', '--json'];
  let result = await run(args);
  assert.equal(result.exported.length, 1);
  const exportedFile = result.exported[0].output;
  const before = (await stat(exportedFile)).mtimeMs;
  result = await run(args);
  assert.equal(result.exported.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal((await stat(exportedFile)).mtimeMs, before);
  checks.push('persistent cache skip without rewriting');

  await writeFile(image, logo('blue'));
  assert.equal((await run(args)).exported.length, 1);
  checks.push('local image invalidation');
  await writeFile(exportedFile, 'damaged');
  assert.equal((await run(args)).exported.length, 1);
  assert.match(await readFile(exportedFile, 'utf8'), /<svg/u);
  checks.push('damaged output repaired');
  for (const extra of [['--metadata'], ['--name-template', '{name}-{time}.{format}']]) {
    assert.equal((await run([...args, ...extra])).exported.length, 1);
    assert.equal((await run([...args, ...extra])).exported.length, 1);
  }
  checks.push('metadata and clock-based names never falsely skipped');

  await assert.rejects(run([file, '--output', join(output, '.mermaid-preview-cache.json'), '--incremental', '--json']), /would overwrite/u);
  await writeFile(join(source, 'a.mermaid'), 'flowchart LR; X-->Y');
  await assert.rejects(run([source, '--output', join(directory, 'collision'), '--format', 'svg', '--incremental']), /same export destination/u);
  await rm(join(source, 'a.mermaid'));
  checks.push('cache and duplicate export collisions rejected');

  const profile = join(directory, 'profile.json');
  await writeFile(profile, JSON.stringify({ format: 'svg', theme: 'default' }));
  const watch = startWatch([source, '--output', join(directory, 'watched'), '--profile', profile]);
  const cycleWithExport = (event) => event.event === 'cycle' && event.exported.length > 0;
  try {
    await watch.waitFor(cycleWithExport);
    let from = watch.events.length;
    await writeFile(image, logo('green'));
    await watch.waitFor(cycleWithExport, from);
    checks.push('watch image updates');
    from = watch.events.length;
    await writeFile(profile, JSON.stringify({ format: 'svg', theme: 'forest' }));
    const forest = await watch.waitFor(cycleWithExport, from);
    assert.match(forest.exported[0].output, /forest/u);
    checks.push('watch profile reload');

    from = watch.events.length;
    const newFile = join(source, 'added.mmd');
    await writeFile(newFile, 'flowchart LR; C-->D');
    const added = await watch.waitFor(cycleWithExport, from);
    assert.ok(added.exported.some((entry) => entry.output.includes('added-')));
    from = watch.events.length;
    await rm(newFile);
    const removed = await watch.waitFor((event) => event.event === 'cycle' && event.removed.length > 0, from);
    assert.ok(removed.removed.includes(newFile));
    assert.ok(await stat(added.exported.find((entry) => entry.output.includes('added-')).output));
    checks.push('watch source addition/deletion keeps existing exports');

    from = watch.events.length;
    await writeFile(file, 'this is not Mermaid');
    await watch.waitFor((event) => event.event === 'cycle' && event.errors.length > 0, from);
    from = watch.events.length;
    await writeFile(file, `${diagram}  B --> C[Recovery]\n`);
    await watch.waitFor(cycleWithExport, from);
    checks.push('watch recovers after syntax errors');
  } finally {
    await watch.stop('SIGINT');
  }
  if (process.platform !== 'win32') {
    assert.equal(watch.events.at(-1).event, 'stopped');
    const empty = join(directory, 'empty');
    await mkdir(empty);
    const idleWatch = startWatch([empty]);
    try {
      await idleWatch.waitFor((event) => event.event === 'cycle');
    } finally {
      await idleWatch.stop('SIGTERM');
    }
    assert.equal(idleWatch.events.at(-1).event, 'stopped');
    checks.push('SIGINT/SIGTERM graceful shutdown and stopped JSONL');
  }
  console.log(`CLI incremental regression passed: ${checks.join('; ')}.`);
} finally {
  await rm(directory, { force: true, recursive: true });
}

async function run(args) {
  return JSON.parse((await exec(process.execPath, [cli, ...args], { timeout: 30_000 })).stdout);
}

function startWatch(args) {
  const child = spawn(process.execPath, [cli, ...args, '--watch', '--json']);
  let pending = '';
  let stderr = '';
  const events = [];
  child.stdout.on('data', (data) => {
    pending += data;
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const line of lines) if (line) events.push(JSON.parse(line));
  });
  child.stderr.on('data', (data) => { stderr += data; });
  return {
    events,
    async waitFor(predicate, from = 0) {
      const deadline = Date.now() + 25_000;
      while (Date.now() < deadline) {
        const found = events.slice(from).find(predicate);
        if (found) return found;
        if (child.exitCode !== null) throw new Error(`Watch exited ${child.exitCode}: ${stderr}`);
        await delay(50);
      }
      throw new Error(`Watch timed out: ${JSON.stringify(events)} ${stderr}`);
    },
    async stop(signal) {
      if (child.exitCode !== null) {
        assert.equal(child.exitCode, 0, stderr);
        return;
      }
      const exited = new Promise((resolve, reject) => {
        child.once('exit', (code) => {
          // Node forcibly terminates child processes on Windows rather than
          // delivering POSIX signals. Console Ctrl+C handling is tested on Unix.
          if (code === 0 || process.platform === 'win32') resolve();
          else reject(new Error(`Watch exit ${code}: ${stderr}`));
        });
      });
      child.kill(signal);
      try {
        await Promise.race([
          exited,
          delay(10_000, undefined, { ref: false }).then(() => { throw new Error('Watch did not shut down.'); }),
        ]);
      } finally {
        if (child.exitCode === null) child.kill('SIGKILL');
      }
    },
  };
}
