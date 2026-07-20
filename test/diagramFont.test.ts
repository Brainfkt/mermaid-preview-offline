import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import {
  DEFAULT_DIAGRAM_FONT_FAMILY,
  DIAGRAM_FONT_FAMILIES,
  VSCODE_FONT_FALLBACK,
  isDiagramFontFamily,
  normalizeDiagramFontFamily,
  resolveDiagramFontStack,
} from '../src/diagramFont';

void test('diagram font presets have a stable VS Code default', () => {
  assert.deepEqual(DIAGRAM_FONT_FAMILIES, ['vscode', 'noto-sans', 'inter']);
  assert.equal(DEFAULT_DIAGRAM_FONT_FAMILY, 'vscode');
  for (const value of DIAGRAM_FONT_FAMILIES) {
    assert.equal(isDiagramFontFamily(value), true);
    assert.equal(normalizeDiagramFontFamily(value), value);
  }
  for (const value of [undefined, null, '', 'system', 'Noto Sans', 42]) {
    assert.equal(isDiagramFontFamily(value), false);
    assert.equal(normalizeDiagramFontFamily(value), 'vscode');
  }
});

void test('VS Code fonts are preserved while unsafe stacks use the system fallback', () => {
  const configured = '  "Aptos", "Segoe UI", sans-serif  ';
  assert.equal(resolveDiagramFontStack('vscode', configured), '"Aptos", "Segoe UI", sans-serif');
  assert.equal(resolveDiagramFontStack('vscode'), VSCODE_FONT_FALLBACK);
  assert.equal(resolveDiagramFontStack('vscode', 'Inter; color: red'), VSCODE_FONT_FALLBACK);
  assert.equal(resolveDiagramFontStack('vscode', 'A'.repeat(513)), VSCODE_FONT_FALLBACK);
  assert.equal(resolveDiagramFontStack('noto-sans', configured), '"Mermaid Offline Noto Sans", sans-serif');
  assert.equal(resolveDiagramFontStack('inter', configured), '"Mermaid Offline Inter", sans-serif');
});

void test('bundled Noto Sans and Inter assets are local, non-empty WOFF2 files', () => {
  const assets = [
    'inter-latin-400-normal.woff2',
    'inter-latin-ext-400-normal.woff2',
    'noto-sans-latin-400-normal.woff2',
    'noto-sans-latin-ext-400-normal.woff2',
  ];
  for (const asset of assets) {
    const path = resolve(__dirname, '../../src/font-assets', asset);
    const bytes = readFileSync(path);
    assert.deepEqual(bytes.subarray(0, 4), Buffer.from('wOF2'));
    assert.ok(statSync(path).size >= 10_000, `${asset} is unexpectedly small`);
  }
});

void test('font CSS uses only local imports and covers French accented text', () => {
  const source = readFileSync(resolve(__dirname, '../../src/diagramFontAssets.ts'), 'utf8');
  assert.doesNotMatch(source, /https?:\/\//u);
  assert.doesNotMatch(source, /KaTeX/iu);
  assert.match(source, /\.\/font-assets\/inter-latin-400-normal\.woff2/u);
  assert.match(source, /\.\/font-assets\/noto-sans-latin-400-normal\.woff2/u);
  assert.match(source, /U\+0000-00FF/u);
  assert.match(source, /U\+0152-0153/u);
  assert.match(source, /Échéance · coût · façade · cœur · Œuvre · Łódź/u);
});
