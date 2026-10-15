import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import type { ExportSettings } from './exportSettings';

export const CLI_CACHE_FILE_NAME = '.mermaid-preview-cache.json';
export const CLI_CACHE_MAX_ENTRIES = 4096;
const MAX_CACHE_BYTES = 4 * 1024 * 1024;

export interface CachedCliExport {
  fingerprint: string;
  height: number;
  output: string;
  outputHash: string;
  source: string;
  width: number;
}

/** Hash contents, not mtimes: copying or restoring an output must not hide damage. */
export function hashCliValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function hashCliFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export function canReuseCliExport(settings: ExportSettings): boolean {
  return !settings.includeMetadata && !/\{(?:date|time)\}/u.test(settings.fileNameTemplate);
}

export class CliExportCache {
  private readonly entries = new Map<string, CachedCliExport>();
  private dirty = false;

  private constructor(private readonly path: string) {}

  static async load(path: string): Promise<CliExportCache> {
    const cache = new CliExportCache(path);
    try {
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.size > MAX_CACHE_BYTES) return cache;
      const value: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.entries)) return cache;
      for (const entry of value.entries.slice(-CLI_CACHE_MAX_ENTRIES)) {
        if (isCachedExport(entry)) cache.entries.set(cache.key(entry.source, entry.output), entry);
      }
    } catch {
      // Missing, interrupted, or obsolete caches are ordinary cache misses.
    }
    return cache;
  }

  async lookup(source: string, output: string, fingerprint: string): Promise<CachedCliExport | undefined> {
    const entry = this.entries.get(this.key(source, output));
    if (!entry || entry.fingerprint !== fingerprint) return undefined;
    try {
      if (!(await lstat(output)).isFile() || await hashCliFile(output) !== entry.outputHash) {
        return undefined;
      }
      return entry;
    } catch {
      return undefined;
    }
  }

  remember(entry: CachedCliExport): void {
    const key = this.key(entry.source, entry.output);
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > CLI_CACHE_MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.dirty = true;
  }

  forgetSources(sources: ReadonlySet<string>): void {
    for (const [key, entry] of this.entries) {
      if (sources.has(entry.source)) {
        this.entries.delete(key);
        this.dirty = true;
      }
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    const entries = [...this.entries.values()];
    let serialized = JSON.stringify({ version: 1, entries });
    while (Buffer.byteLength(serialized) > MAX_CACHE_BYTES && entries.length > 0) {
      entries.splice(0, Math.max(1, Math.ceil(entries.length / 4)));
      serialized = JSON.stringify({ version: 1, entries });
    }
    await writeCliFileAtomically(this.path, serialized, true);
    this.dirty = false;
  }

  private key(source: string, output: string): string {
    return hashCliValue([source, output]);
  }
}

/** Same-directory rename keeps readers from observing partial exports/cache files. */
export async function writeCliFileAtomically(
  target: string,
  data: string | Uint8Array,
  privateFile = false,
): Promise<void> {
  let mode = privateFile ? 0o600 : 0o666;
  let preserveMode = false;
  try {
    const existing = await lstat(target);
    if (!existing.isFile()) throw new Error(`Refusing to replace a non-regular file: ${target}`);
    if (!privateFile) {
      mode = existing.mode & 0o777;
      preserveMode = true;
    }
  } catch (error: unknown) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, data, { flag: 'wx', mode });
    if (preserveMode) await chmod(temporary, mode);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Fail before exporting if a filename would destroy an input or another export. */
export async function assertCliOutputPaths(
  outputs: readonly string[],
  inputs: readonly string[],
  cachePath?: string,
): Promise<void> {
  const protectedPaths = new Set<string>();
  for (const input of [...inputs, ...cachePath ? [cachePath] : []]) {
    protectedPaths.add(await canonicalCliPath(input));
  }
  const seen = new Set<string>();
  for (const output of outputs) {
    const canonical = await canonicalCliPath(output);
    if (protectedPaths.has(canonical)) {
      throw new Error(`Export destination would overwrite an input or the incremental cache: ${output}`);
    }
    if (seen.has(canonical)) {
      throw new Error(`Multiple source files produce the same export destination: ${output}`);
    }
    seen.add(canonical);
  }
}

async function canonicalCliPath(path: string): Promise<string> {
  let candidate = resolve(path);
  const missing: string[] = [];
  for (;;) {
    try {
      const canonical = join(await realpath(candidate), ...missing.reverse());
      return process.platform === 'win32' || process.platform === 'darwin'
        ? canonical.toLowerCase()
        : canonical;
    } catch (error: unknown) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      const parent = dirname(candidate);
      if (parent === candidate) throw error;
      missing.push(basename(candidate));
      candidate = parent;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCachedExport(value: unknown): value is CachedCliExport {
  return isRecord(value) &&
    typeof value.fingerprint === 'string' && /^[a-f\d]{64}$/u.test(value.fingerprint) &&
    typeof value.outputHash === 'string' && /^[a-f\d]{64}$/u.test(value.outputHash) &&
    typeof value.output === 'string' && value.output.length <= 16_384 &&
    typeof value.source === 'string' && value.source.length <= 16_384 &&
    typeof value.height === 'number' && Number.isFinite(value.height) && value.height > 0 &&
    typeof value.width === 'number' && Number.isFinite(value.width) && value.width > 0;
}
