import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  allowedRemoteImageUrl,
  DEFAULT_RESOURCE_LIMITS,
  HARD_RESOURCE_LIMITS,
  normalizeRemoteBases,
  normalizeResourceLimits,
} from '../src/resourcePolicy';

void test('remote image bases are HTTPS-only, normalized, and path-bounded', () => {
  const bases = normalizeRemoteBases([
    'https://static.example.com/diagrams',
    'https://static.example.com/diagrams/',
    'http://static.example.com/diagrams/',
    'https://user:secret@static.example.com/diagrams/',
    'https://static.example.com/diagrams/?token=secret',
  ]);
  assert.deepEqual(bases, ['https://static.example.com/diagrams/']);
  assert.equal(
    allowedRemoteImageUrl(
      'https://static.example.com/diagrams/logo.png?revision=2#ignored',
      bases,
    )?.toString(),
    'https://static.example.com/diagrams/logo.png?revision=2',
  );
  assert.equal(
    allowedRemoteImageUrl('https://static.example.com/diagrams-other/logo.png', bases),
    undefined,
  );
  assert.equal(
    allowedRemoteImageUrl('https://other.example.com/diagrams/logo.png', bases),
    undefined,
  );
  assert.equal(
    allowedRemoteImageUrl('https://static.example.com/diagrams/%2f..%2fprivate.png', bases),
    undefined,
  );
});

void test('custom resource limits remain bounded by internal ceilings', () => {
  const limits = normalizeResourceLimits({
    maxImageBytes: Number.MAX_SAFE_INTEGER,
    maxImages: Number.MAX_SAFE_INTEGER,
    maxRasterPixels: Number.MAX_SAFE_INTEGER,
    maxSourceBytes: Number.MAX_SAFE_INTEGER,
    maxTotalBytes: 2 * 1024 * 1024,
    useCustom: true,
  });
  assert.equal(limits.maxSourceBytes, HARD_RESOURCE_LIMITS.maxSourceBytes);
  assert.equal(limits.maxImages, HARD_RESOURCE_LIMITS.maxImages);
  assert.equal(limits.maxRasterPixels, HARD_RESOURCE_LIMITS.maxRasterPixels);
  assert.equal(limits.maxTotalBytes, 2 * 1024 * 1024);
  assert.equal(limits.maxImageBytes, limits.maxTotalBytes);
});

void test('standard resource limits ignore dormant custom values', () => {
  assert.deepEqual(
    normalizeResourceLimits({ maxImages: 200, useCustom: false }),
    DEFAULT_RESOURCE_LIMITS,
  );
});
