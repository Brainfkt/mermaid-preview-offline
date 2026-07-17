import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { PreviewConfiguration } from '../src/protocol';
import { effectiveRefreshDelay, formatByteLength } from '../src/renderPolicy';

const configuration: PreviewConfiguration = {
  diagramTheme: 'adaptive',
  largeFileThresholdBytes: 512 * 1024,
  refreshDelay: 140,
  refreshMode: 'automatic',
};

void test('large documents receive an adaptive render debounce', () => {
  assert.equal(effectiveRefreshDelay(10_000, configuration), 140);
  assert.equal(effectiveRefreshDelay(700_000, configuration), 400);
  assert.equal(effectiveRefreshDelay(700_000, { ...configuration, refreshDelay: 650 }), 650);
});

void test('document sizes have readable labels', () => {
  assert.equal(formatByteLength(12), '12 B');
  assert.equal(formatByteLength(2048), '2 KB');
  assert.equal(formatByteLength(1_572_864), '1.5 MB');
});
