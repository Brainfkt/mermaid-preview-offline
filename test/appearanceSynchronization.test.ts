import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const provider = readFileSync(
  resolve(__dirname, '../../src/mermaidPreviewProvider.ts'),
  'utf8',
);
const webview = readFileSync(resolve(__dirname, '../../src/webview.ts'), 'utf8');
const previewCss = readFileSync(resolve(__dirname, '../../media/preview.css'), 'utf8');

void test('appearance changes are serialized and broadcast to every ready preview', () => {
  assert.match(provider, /diagramDensity: message\.density/u);
  assert.match(provider, /diagramSurface: message\.surface/u);
  assert.match(provider, /diagramTheme: message\.theme/u);
  assert.match(provider, /this\.appearanceUpdateQueue\.then\(apply, apply\)/u);
  assert.match(provider, /\[\.\.\.this\.panels\.entries\(\)\]/u);
  assert.match(provider, /this\.readyPanels\.has\(panel\)/u);
  assert.match(
    provider,
    /configuration: readConfiguration\(vscode\.Uri\.parse\(key\), this\.sharedAppearance\)/u,
  );
});

void test('appearance survives closing and reopening every preview in the workspace', () => {
  assert.match(provider, /WORKSPACE_APPEARANCE_KEY/u);
  assert.match(provider, /context\.workspaceState\.get\(WORKSPACE_APPEARANCE_KEY\)/u);
  assert.match(
    provider,
    /this\.context\.workspaceState\.update\(WORKSPACE_APPEARANCE_KEY, this\.sharedAppearance\)/u,
  );
  assert.match(
    provider,
    /readConfiguration\(document\.uri, this\.sharedAppearance\)/u,
  );
  assert.match(provider, /Workspace state remains authoritative/u);
});

void test('the minimap follows the shared canvas background and pattern', () => {
  assert.match(webview, /for \(const surface of \[viewport, minimap\]\)/u);
  assert.match(previewCss, /\.viewport\.pattern-dots,\s*\.minimap\.pattern-dots/u);
  assert.match(previewCss, /\.viewport\.pattern-grid,\s*\.minimap\.pattern-grid/u);
  assert.match(previewCss, /\.minimap \{[\s\S]*background-color: var\(--diagram-canvas-background\)/u);
  assert.match(
    previewCss,
    /\.minimap__window \{[\s\S]*color-mix\(in srgb, var\(--diagram-canvas-background\) 62%/u,
  );
});
