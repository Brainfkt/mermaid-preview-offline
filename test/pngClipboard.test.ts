import assert from 'node:assert/strict';
import { test } from 'node:test';

import { writePngToClipboard } from '../src/pngClipboard';

void test('PNG clipboard access starts before asynchronous rendering completes', async () => {
  const calls: string[] = [];
  let resolvePng: ((blob: Blob) => void) | undefined;
  let receivedBlob: string | Blob | PromiseLike<string | Blob> | undefined;
  const clipboardItem = {} as ClipboardItem;

  const writeResult = writePngToClipboard(
    (items) => {
      calls.push('write');
      assert.deepEqual(items, [clipboardItem]);
      return Promise.resolve();
    },
    (data) => {
      calls.push('item');
      receivedBlob = data['image/png'];
      return clipboardItem;
    },
    () => {
      calls.push('render');
      return new Promise<Blob>((resolvePromise) => {
        resolvePng = resolvePromise;
      });
    },
  );

  assert.deepEqual(calls, ['render', 'item', 'write']);
  assert.ok(receivedBlob);
  resolvePng?.(new Blob(['png'], { type: 'image/png' }));
  const resolvedBlob = await receivedBlob;
  assert.ok(resolvedBlob instanceof Blob);
  assert.equal(resolvedBlob.type, 'image/png');
  await writeResult;
});
