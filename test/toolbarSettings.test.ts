import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  TOOLBAR_CONTROLS,
  normalizeToolbarControls,
  normalizeToolbarLabelMode,
} from '../src/toolbarSettings';

void test('normalizes toolbar label modes with icons as the safe default', () => {
  assert.equal(normalizeToolbarLabelMode('responsive'), 'responsive');
  assert.equal(normalizeToolbarLabelMode('icons'), 'icons');
  assert.equal(normalizeToolbarLabelMode('always'), 'always');
  assert.equal(normalizeToolbarLabelMode('invalid'), 'icons');
});

void test('normalizes toolbar controls in canonical order without duplicates', () => {
  assert.deepEqual(normalizeToolbarControls(undefined), [...TOOLBAR_CONTROLS]);
  assert.deepEqual(
    normalizeToolbarControls(['export', 'layout', 'export', 'unknown', 4]),
    ['layout', 'export'],
  );
  assert.deepEqual(normalizeToolbarControls([]), []);
});
