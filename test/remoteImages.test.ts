import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';

import { inspectRasterImage, isPublicNetworkAddress } from '../src/remoteImages';

void test('private, local, mapped, and documentation network addresses are rejected', () => {
  for (const address of [
    '127.0.0.1',
    '10.1.2.3',
    '169.254.1.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.51.100.1',
    '203.0.113.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '2001:db8::1',
  ]) {
    assert.equal(isPublicNetworkAddress(address), false, address);
  }
  assert.equal(isPublicNetworkAddress('1.1.1.1'), true);
  assert.equal(isPublicNetworkAddress('2606:4700:4700::1111'), true);
});

void test('remote raster inspection uses file signatures and dimensions', () => {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  assert.deepEqual(inspectRasterImage(png), {
    height: 480,
    mimeType: 'image/png',
    width: 640,
  });

  const gif = Buffer.alloc(10);
  gif.write('GIF89a', 0, 'ascii');
  gif.writeUInt16LE(320, 6);
  gif.writeUInt16LE(200, 8);
  assert.deepEqual(inspectRasterImage(gif), {
    height: 200,
    mimeType: 'image/gif',
    width: 320,
  });

  assert.equal(inspectRasterImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), undefined);
});
