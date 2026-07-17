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
});
