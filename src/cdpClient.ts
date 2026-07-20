import type { ChildProcess } from 'node:child_process';
import { Readable, Writable } from 'node:stream';

import { CdpPipe } from './cdpPipe';

interface CdpResponse {
  error?: { message?: string };
  id?: number;
  method?: string;
  params?: unknown;
  result?: Record<string, unknown>;
  sessionId?: string;
}

export class CdpClient {
  private nextId = 1;
  private readonly pending = new Map<number, {
    reject(error: Error): void;
    resolve(value: Record<string, unknown>): void;
  }>();
  private readonly waiters: Array<{
    method: string;
    reject(error: Error): void;
    resolve(): void;
    sessionId?: string;
  }> = [];

  public constructor(private readonly pipe: CdpPipe) {
    pipe.onMessage((message) => this.receive(message));
    pipe.onClose((error) => {
      const connectionError = error ?? new Error('Browser connection closed.');
      for (const pending of this.pending.values()) pending.reject(connectionError);
      this.pending.clear();
      for (const waiter of this.waiters) waiter.reject(connectionError);
      this.waiters.length = 0;
    });
  }

  public static connect(browser: ChildProcess): CdpClient {
    const browserInput = browser.stdio[3];
    const browserOutput = browser.stdio[4];
    if (!(browserInput instanceof Writable) || !(browserOutput instanceof Readable)) {
      throw new Error('Could not initialize the Chromium debugging pipes.');
    }
    return new CdpClient(new CdpPipe(browserOutput, browserInput));
  }

  public close(): void {
    this.pipe.close();
  }

  public send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { reject, resolve: resolvePromise });
      try {
        this.pipe.send(JSON.stringify({ id, method, params, sessionId }));
      } catch (error: unknown) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  public waitFor(method: string, sessionId?: string): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      this.waiters.push({ method, reject, resolve: resolvePromise, sessionId });
    });
  }

  private receive(rawMessage: string): void {
    const message = JSON.parse(rawMessage) as CdpResponse;
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? 'Browser protocol error.'));
      else pending.resolve(message.result ?? {});
      return;
    }
    if (!message.method) return;
    const index = this.waiters.findIndex(
      (waiter) => waiter.method === message.method && waiter.sessionId === message.sessionId,
    );
    if (index >= 0) this.waiters.splice(index, 1)[0]?.resolve();
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMilliseconds: number,
  message: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMilliseconds);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
