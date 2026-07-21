import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ABOVE_ORIENTATION,
  BESIDE_ORIENTATION,
  editorLayoutFor,
  editorLayoutMatches,
  nextPreviewMode,
  readSourceRatio,
  shouldApplyEditorLayout,
  shouldCloseRemainingSplitTab,
} from '../src/editorLayout';

void test('preview layouts cycle while source-only rejoins the preview cycle', () => {
  assert.equal(nextPreviewMode('preview'), 'beside');
  assert.equal(nextPreviewMode('beside'), 'above');
  assert.equal(nextPreviewMode('above'), 'preview');
  assert.equal(nextPreviewMode('source'), 'preview');
});

void test('preview and source-only layouts collapse to one native editor group', () => {
  assert.deepEqual(editorLayoutFor('preview', 0.65), { groups: [{}] });
  assert.deepEqual(editorLayoutFor('source', 0.65), { groups: [{}] });
});

void test('beside and above use two native groups with a constrained source ratio', () => {
  assert.deepEqual(editorLayoutFor('beside', 0.65), {
    orientation: BESIDE_ORIENTATION,
    groups: [{ size: 0.65 }, { size: 0.35 }],
  });
  assert.deepEqual(editorLayoutFor('above', 0.95), {
    orientation: ABOVE_ORIENTATION,
    groups: [{ size: 0.8 }, { size: 0.2 }],
  });
});

void test('native layout sizes restore the per-file source ratio safely', () => {
  assert.equal(
    readSourceRatio(
      { orientation: BESIDE_ORIENTATION, groups: [{ size: 300 }, { size: 700 }] },
      'beside',
    ),
    0.3,
  );
  assert.equal(
    readSourceRatio(
      { orientation: ABOVE_ORIENTATION, groups: [{ size: 95 }, { size: 5 }] },
      'above',
    ),
    0.8,
  );
  assert.equal(
    readSourceRatio(
      { orientation: ABOVE_ORIENTATION, groups: [{ size: 1 }, { size: 1 }] },
      'beside',
    ),
    undefined,
  );
  assert.equal(
    readSourceRatio(
      {
        orientation: BESIDE_ORIENTATION,
        groups: [{ groups: [{}, {}], size: 0.5 }, { size: 0.5 }],
      },
      'beside',
    ),
    undefined,
  );
});

void test('layout matching detects stable modes without reapplying editor groups', () => {
  assert.equal(editorLayoutMatches({ groups: [{ size: 1 }] }, 'preview'), true);
  assert.equal(editorLayoutMatches({ groups: [{ size: 1 }] }, 'source'), true);
  assert.equal(editorLayoutMatches({ groups: [{ groups: 'invalid' }] }, 'preview'), false);
  assert.equal(
    editorLayoutMatches(
      {
        orientation: BESIDE_ORIENTATION,
        groups: [{ size: 0.4 }, { size: 0.6 }],
      },
      'beside',
    ),
    true,
  );
  assert.equal(
    editorLayoutMatches(
      {
        orientation: ABOVE_ORIENTATION,
        groups: [{ size: 0.4 }, { size: 0.6 }],
      },
      'beside',
    ),
    false,
  );
  assert.equal(
    editorLayoutMatches(
      {
        orientation: BESIDE_ORIENTATION,
        groups: [{ groups: [{}, {}] }, {}],
      },
      'beside',
    ),
    false,
  );
});

void test('matching split layouts stay stable while switching Mermaid source tabs', () => {
  const beside = {
    orientation: BESIDE_ORIENTATION,
    groups: [{ size: 0.4 }, { size: 0.6 }],
  };
  assert.equal(shouldApplyEditorLayout(beside, 'beside'), false);
  assert.equal(shouldApplyEditorLayout(beside, 'beside', true), true);
  assert.equal(shouldApplyEditorLayout(beside, 'above'), true);
});

void test('the last source and preview tabs close as one split pair', () => {
  assert.equal(shouldCloseRemainingSplitTab(['source'], ['preview']), true);
  assert.equal(shouldCloseRemainingSplitTab(['preview'], ['source']), true);
  assert.equal(shouldCloseRemainingSplitTab(['source'], ['source']), false);
  assert.equal(shouldCloseRemainingSplitTab(['preview'], ['preview']), false);
  assert.equal(shouldCloseRemainingSplitTab(['source'], ['preview', 'other']), false);
  assert.equal(shouldCloseRemainingSplitTab(['other'], ['preview']), false);
});
