import { mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const outputDirectory = new URL('../artifacts/', import.meta.url);
mkdirSync(outputDirectory, { recursive: true });

const executable = process.platform === 'win32' ? 'vsce.cmd' : 'vsce';
const binary = join(fileURLToPath(new URL('../node_modules/.bin/', import.meta.url)), executable);
const output = fileURLToPath(
  new URL(`./${manifest.name}-${manifest.version}.vsix`, outputDirectory),
);

const result = spawnSync(
  binary,
  ['package', '--no-dependencies', '--out', output],
  { stdio: 'inherit' },
);

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
