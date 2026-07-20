import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';

import { CdpClient, withTimeout } from '../src/cdpClient';
import { CdpPipe } from '../src/cdpPipe';

void test('CDP pipe decodes fragmented UTF-8 and multiple NUL-delimited messages', () => {
  const browserOutput = new PassThrough();
  const browserInput = new PassThrough();
  const pipe = new CdpPipe(browserOutput, browserInput);
  const messages: string[] = [];
  pipe.onMessage((message) => messages.push(message));

  const payload = Buffer.from('{"value":"🧜"}\0{"id":2}\0', 'utf8');
  const emojiStart = payload.indexOf(Buffer.from('🧜', 'utf8'));
  browserOutput.write(payload.subarray(0, emojiStart + 2));
  browserOutput.write(payload.subarray(emojiStart + 2, payload.length - 3));
  browserOutput.write(payload.subarray(payload.length - 3));

  assert.deepEqual(messages, ['{"value":"🧜"}', '{"id":2}']);
  pipe.close();
});

void test('CDP pipe appends the protocol NUL delimiter to outgoing JSON', () => {
  const browserOutput = new PassThrough();
  const browserInput = new PassThrough();
  const pipe = new CdpPipe(browserOutput, browserInput);
  let bytes = '';
  browserInput.setEncoding('utf8');
  browserInput.on('data', (chunk: string) => {
    bytes += chunk;
  });

  pipe.send('{"id":1,"method":"Page.enable"}');

  assert.equal(bytes, '{"id":1,"method":"Page.enable"}\0');
  pipe.close();
});

void test('CDP pipe closes once and refuses writes after closure', () => {
  const browserOutput = new PassThrough();
  const browserInput = new PassThrough();
  const pipe = new CdpPipe(browserOutput, browserInput);
  let closeCount = 0;
  pipe.onClose(() => {
    closeCount += 1;
  });

  pipe.close();
  browserOutput.destroy();

  assert.equal(closeCount, 1);
  assert.throws(() => pipe.send('{}'), /Browser connection closed/u);
});

void test('CDP client rejects pending responses and event waiters when the pipe closes', async () => {
  const browserOutput = new PassThrough();
  const browserInput = new PassThrough();
  const client = new CdpClient(new CdpPipe(browserOutput, browserInput));
  const response = client.send('Page.navigate');
  const event = client.waitFor('Page.loadEventFired', 'session-1');

  client.close();

  await assert.rejects(response, /Browser connection closed/u);
  await assert.rejects(event, /Browser connection closed/u);
});

void test('CDP initialization timeout resolves promptly or rejects with its focused error', async () => {
  assert.equal(await withTimeout(Promise.resolve('ready'), 100, 'too late'), 'ready');
  await assert.rejects(
    withTimeout(new Promise<never>(() => undefined), 5, 'Chromium initialization timed out.'),
    /Chromium initialization timed out/u,
  );
});

void test('CLI uses Chromium pipes and is bundled for the VS Code Node 20 runtime', () => {
  const root = resolve(__dirname, '../..');
  const cli = readFileSync(resolve(root, 'src/cli.ts'), 'utf8');
  const build = readFileSync(resolve(root, 'esbuild.mjs'), 'utf8');

  assert.match(cli, /--remote-debugging-pipe/u);
  assert.doesNotMatch(cli, /\bWebSocket\b|--remote-debugging-port/u);
  assert.match(
    cli,
    /withTimeout\(\s*initializeBrowserRenderer\([\s\S]*?15_000/u,
  );
  assert.match(
    build,
    /entryPoints: \['src\/cli\.ts'\][\s\S]*?target: 'node20'/u,
  );
});
