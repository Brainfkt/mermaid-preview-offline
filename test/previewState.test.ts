import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_PREVIEW_STATE, normalizePreviewState } from '../src/previewState';

void test('preview state restores per-file zoom and scroll only', () => {
  assert.deepEqual(
    normalizePreviewState({
      autoFit: false,
      diagramTheme: 'forest',
      scrollLeft: 315,
      scrollTop: 92,
      sourceVisible: true,
      toolbarVisible: false,
      zoom: 1.75,
    }),
    {
      autoFit: false,
      scrollLeft: 315,
      scrollTop: 92,
      zoom: 1.75,
    },
  );
});

void test('invalid preview state is normalized safely', () => {
  assert.deepEqual(normalizePreviewState(undefined), DEFAULT_PREVIEW_STATE);
  const normalized = normalizePreviewState({
    autoFit: 'yes',
    diagramTheme: 'remote',
    scrollLeft: -10,
    scrollTop: Number.NaN,
    sourceVisible: 1,
    zoom: 99,
  });
  assert.equal(normalized.zoom, 4);
  assert.equal(normalized.scrollLeft, 0);
  assert.equal(normalized.scrollTop, 0);
  assert.equal('diagramTheme' in normalized, false);
  assert.equal('sourceVisible' in normalized, false);
  assert.equal('toolbarVisible' in normalized, false);
});

void test('legacy internal split state is ignored', () => {
  const normalized = normalizePreviewState({
    autoFit: true,
    layoutMode: 'split',
    scrollLeft: 0,
    scrollTop: 0,
    splitOrientation: 'horizontal',
    splitRatio: 0.95,
    toolbarVisible: false,
    zoom: 1,
  });
  assert.equal('layoutMode' in normalized, false);
  assert.equal('splitOrientation' in normalized, false);
  assert.equal('splitRatio' in normalized, false);
  assert.equal('toolbarVisible' in normalized, false);
});
