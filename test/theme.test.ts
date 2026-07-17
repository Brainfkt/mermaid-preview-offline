import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveDiagramTheme } from '../src/theme';

void test('adaptive diagrams follow every VS Code theme family', () => {
  assert.equal(resolveDiagramTheme('adaptive', 'light'), 'default');
  assert.equal(resolveDiagramTheme('adaptive', 'dark'), 'dark');
  assert.equal(resolveDiagramTheme('adaptive', 'highContrastDark'), 'dark');
  assert.equal(resolveDiagramTheme('adaptive', 'highContrastLight'), 'default');
});

void test('an explicit Mermaid theme overrides the VS Code theme', () => {
  assert.equal(resolveDiagramTheme('forest', 'dark'), 'forest');
  assert.equal(resolveDiagramTheme('neutral', 'highContrastDark'), 'neutral');
  assert.equal(resolveDiagramTheme('base', 'light'), 'base');
});
