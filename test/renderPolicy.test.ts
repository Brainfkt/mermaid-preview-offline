import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { PreviewConfiguration } from '../src/protocol';
import {
  effectiveRefreshDelay,
  formatByteLength,
  MAX_RENDER_SOURCE_BYTES,
  renderBlockReason,
} from '../src/renderPolicy';

  const configuration: PreviewConfiguration = {
    diagramDensity: 'comfortable',
    diagramFontFamily: 'vscode',
    diagramSurface: { customColor: '#ffffff', pattern: 'dots', preset: 'editor' },
  diagramTheme: 'adaptive',
  largeFileThresholdBytes: 512 * 1024,
  minimapEnabled: true,
  navigation: { controlsVisibility: 'always', mouseNavigation: 'always' },
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

void test('an absolute source budget prevents unbounded renderer work', () => {
  assert.equal(renderBlockReason(MAX_RENDER_SOURCE_BYTES), undefined);
  assert.match(renderBlockReason(MAX_RENDER_SOURCE_BYTES + 1) ?? '', /rendering is paused/u);
});
