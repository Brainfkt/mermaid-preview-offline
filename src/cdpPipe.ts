import type { Buffer } from 'node:buffer';
import { StringDecoder } from 'node:string_decoder';
import type { Readable, Writable } from 'node:stream';

type CloseListener = (error?: Error) => void;
type MessageListener = (message: string) => void;

/**
 * Chromium's `--remote-debugging-pipe` transport uses UTF-8 JSON messages
 * separated by a NUL byte. Keeping the framing here avoids relying on the
 * global WebSocket implementation, which is not available in Node.js 20.
 */
export class CdpPipe {
  private readonly closeListeners = new Set<CloseListener>();
  private closed = false;
  private readonly decoder = new StringDecoder('utf8');
  private messageBuffer = '';
  private readonly messageListeners = new Set<MessageListener>();

  public constructor(
    private readonly browserOutput: Readable,
    private readonly browserInput: Writable,
  ) {
    browserOutput.on('data', (chunk: Buffer | string) => {
      this.receive(typeof chunk === 'string' ? chunk : this.decoder.write(chunk));
    });
    browserOutput.once('end', () => {
      this.receive(this.decoder.end());
      this.finish();
    });
    browserOutput.once('error', (error: Error) => this.finish(error));
    browserOutput.once('close', () => this.finish());
    browserInput.once('error', (error: Error) => this.finish(error));
  }

  public close(): void {
    if (this.closed) return;
    this.browserInput.end();
    this.finish();
  }

  public onClose(listener: CloseListener): void {
    this.closeListeners.add(listener);
  }

  public onMessage(listener: MessageListener): void {
    this.messageListeners.add(listener);
  }

  public send(message: string): void {
    if (this.closed) throw new Error('Browser connection closed.');
    this.browserInput.write(`${message}\0`, 'utf8');
  }

  private finish(error?: Error): void {
    if (this.closed) return;
    this.closed = true;
    for (const listener of this.closeListeners) listener(error);
    this.closeListeners.clear();
    this.messageListeners.clear();
  }

  private receive(chunk: string): void {
    this.messageBuffer += chunk;
    let separator = this.messageBuffer.indexOf('\0');
    while (separator >= 0) {
      const message = this.messageBuffer.slice(0, separator);
      this.messageBuffer = this.messageBuffer.slice(separator + 1);
      if (message) {
        for (const listener of this.messageListeners) listener(message);
      }
      separator = this.messageBuffer.indexOf('\0');
    }
  }
}
