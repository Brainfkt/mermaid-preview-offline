import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_DIAGRAM_SURFACE,
  diagramSpacing,
  isDarkHexColor,
  normalizeDiagramSurface,
  resolveDiagramAppearance,
} from '../src/appearance';

void test('adaptive and sketch appearances follow an explicit canvas background', () => {
  const darkSurface = normalizeDiagramSurface({
    customColor: '#ffffff',
    pattern: 'grid',
    preset: 'midnight',
  });
  assert.equal(resolveDiagramAppearance('adaptive', 'light', darkSurface, 'compact').theme, 'dark');
  assert.deepEqual(resolveDiagramAppearance('sketch', 'light', darkSurface, 'comfortable'), {
    dark: true,
    density: 'comfortable',
    handDrawnSeed: 42,
    look: 'handDrawn',
    theme: 'dark',
  });
});

void test('modern themes and density spacing remain deterministic', () => {
  assert.equal(
    resolveDiagramAppearance('neo', 'dark', DEFAULT_DIAGRAM_SURFACE, 'spacious').look,
    'neo',
  );
  assert.ok(diagramSpacing('compact').flowchart.nodeSpacing <
    diagramSpacing('spacious').flowchart.nodeSpacing);
  assert.equal(isDarkHexColor('#0f172a'), true);
  assert.equal(isDarkHexColor('#faf9f6'), false);
});

void test('invalid canvas settings normalize to safe defaults', () => {
  assert.deepEqual(normalizeDiagramSurface({ customColor: 'red', pattern: 'noise', preset: 'url' }),
    DEFAULT_DIAGRAM_SURFACE);
});
