import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PreviewNavigationState,
  calculateFittedZoom,
  calculateZoomScrollDelta,
  canPanWithPointer,
} from '../src/previewNavigation';

const initialState = {
  autoFit: false,
  scrollLeft: 40,
  scrollTop: 20,
  splitRatio: 0.5,
  zoom: 1.25,
};

void test('preview navigation owns zoom, fit, scroll, and persisted state', () => {
  const navigation = new PreviewNavigationState(initialState);
  navigation.setNaturalSize(1_600, 900);
  assert.equal(navigation.fit(800, 600), calculateFittedZoom(800, 600, 1_600, 900));
  assert.equal(navigation.autoFit, true);
  assert.equal(navigation.savedScrollLeft, 0);
  assert.equal(navigation.savedScrollTop, 0);

  navigation.setZoom(2);
  navigation.recordScroll(320, 140);
  assert.deepEqual(navigation.snapshot(0.4), {
    autoFit: false,
    scrollLeft: 320,
    scrollTop: 140,
    splitRatio: 0.4,
    zoom: 2,
  });
});

void test('preview navigation clamps unsafe values and keeps pointer-centered zoom math pure', () => {
  const navigation = new PreviewNavigationState({ ...initialState, zoom: 99 });
  assert.equal(navigation.zoom, 4);
  assert.deepEqual(
    calculateZoomScrollDelta(2, 50, 30, 10, 20, 80, 70),
    { left: 30, top: 10 },
  );
  assert.equal(canPanWithPointer('always', false), true);
  assert.equal(canPanWithPointer('alt', false), false);
  assert.equal(canPanWithPointer('alt', true), true);
  assert.equal(canPanWithPointer('never', true), false);
});
