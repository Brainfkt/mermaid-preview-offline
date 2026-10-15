import { stat } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

import { hashCliValue } from './cliIncremental';

/** Portable polling deliberately avoids recursive fs.watch platform differences. */
export async function cliWatchSnapshot(paths: readonly string[], remoteRefresh = false): Promise<string> {
  const entries: unknown[] = [];
  for (const path of [...new Set(paths)].sort()) {
    try {
      const metadata = await stat(path, { bigint: true });
      entries.push([path, metadata.size.toString(), metadata.mtimeNs.toString(), metadata.ctimeNs.toString()]);
    } catch {
      entries.push([path, null]);
    }
  }
  return hashCliValue([entries, remoteRefresh ? Math.floor(Date.now() / 30_000) : null]);
}

export async function runCliWatch(options: {
  debounceMs?: number;
  intervalMs?: number;
  onError(error: unknown): void;
  run(): Promise<void>;
  signal: AbortSignal;
  snapshot(): Promise<string>;
}): Promise<void> {
  const intervalMs = options.intervalMs ?? 1_000;
  const debounceMs = options.debounceMs ?? 250;
  let previous: string | undefined;
  let initial = true;
  while (!options.signal.aborted) {
    try {
      const snapshot = await options.snapshot();
      if (snapshot !== previous) {
        let settled = snapshot;
        if (!initial) {
          while (!options.signal.aborted) {
            if (!await wait(debounceMs, options.signal)) break;
            const next = await options.snapshot();
            if (next === settled) break;
            settled = next;
          }
        }
        if (options.signal.aborted) break;
        // Compare against the snapshot before rendering so edits during a render
        // cause the next cycle instead of being silently acknowledged.
        previous = settled;
        initial = false;
        await options.run();
      }
    } catch (error: unknown) {
      if (!options.signal.aborted) options.onError(error);
    }
    if (!await wait(intervalMs, options.signal)) break;
  }
}

async function wait(milliseconds: number, signal: AbortSignal): Promise<boolean> {
  try {
    await delay(milliseconds, undefined, { signal });
    return true;
  } catch (error: unknown) {
    if (signal.aborted) return false;
    throw error;
  }
}
