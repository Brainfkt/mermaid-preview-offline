import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nextPreviewMode } from '../src/editorLayout';

void test('preview layouts cycle while source-only rejoins the preview cycle', () => {
  assert.equal(nextPreviewMode('preview'), 'beside');
  assert.equal(nextPreviewMode('beside'), 'above');
  assert.equal(nextPreviewMode('above'), 'preview');
  assert.equal(nextPreviewMode('source'), 'preview');
});
