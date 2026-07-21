import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  normalizeDiagramControlsVisibility,
  normalizeDiagramMouseNavigation,
  normalizeDocumentationMaxHeight,
} from '../src/navigationSettings';

void test('normalizes diagram navigation settings without weakening current defaults', () => {
  assert.equal(normalizeDiagramMouseNavigation('always'), 'always');
  assert.equal(normalizeDiagramMouseNavigation('alt'), 'alt');
  assert.equal(normalizeDiagramMouseNavigation('never'), 'never');
  assert.equal(normalizeDiagramMouseNavigation('invalid'), 'always');
  assert.equal(normalizeDiagramControlsVisibility('onHoverOrFocus'), 'onHoverOrFocus');
  assert.equal(normalizeDiagramControlsVisibility('never'), 'never');
  assert.equal(normalizeDiagramControlsVisibility(undefined), 'always');
});

void test('accepts safe documentation height values and rejects CSS injection', () => {
  assert.equal(normalizeDocumentationMaxHeight(''), '');
  assert.equal(normalizeDocumentationMaxHeight('400'), '400px');
  assert.equal(normalizeDocumentationMaxHeight(480), '480px');
  assert.equal(normalizeDocumentationMaxHeight('80VH'), '80vh');
  assert.equal(normalizeDocumentationMaxHeight('24rem'), '24rem');
  assert.equal(normalizeDocumentationMaxHeight('12px; color: red'), '');
  assert.equal(normalizeDocumentationMaxHeight('calc(100vh - 20px)'), '');
  assert.equal(normalizeDocumentationMaxHeight('10px'), '160px');
  assert.equal(normalizeDocumentationMaxHeight('999999px'), '10000px');
});
