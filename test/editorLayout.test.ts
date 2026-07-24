import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  editorModeAfterSplitClose,
  nextPreviewMode,
} from '../src/editorLayout';

void test('preview layouts cycle while source-only rejoins the preview cycle', () => {
  assert.equal(nextPreviewMode('preview'), 'beside');
  assert.equal(nextPreviewMode('beside'), 'above');
  assert.equal(nextPreviewMode('above'), 'preview');
  assert.equal(nextPreviewMode('source'), 'preview');
});

void test('closing one split half keeps the surviving editor in a single mode', () => {
  assert.equal(editorModeAfterSplitClose(['source'], ['preview']), 'preview');
  assert.equal(editorModeAfterSplitClose(['preview'], ['source']), 'source');
  assert.equal(editorModeAfterSplitClose(['source'], ['source']), undefined);
  assert.equal(editorModeAfterSplitClose(['preview'], ['preview']), undefined);
  assert.equal(editorModeAfterSplitClose(['source'], ['preview', 'other']), 'preview');
  assert.equal(editorModeAfterSplitClose(['preview'], ['source', 'other']), 'source');
  assert.equal(editorModeAfterSplitClose(['source'], ['preview', 'source']), undefined);
  assert.equal(editorModeAfterSplitClose(['source', 'preview'], []), undefined);
  assert.equal(editorModeAfterSplitClose(['other'], ['preview']), undefined);
});
