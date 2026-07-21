import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const source = (fileName: string): string =>
  readFileSync(resolve(__dirname, '../../src', fileName), 'utf8');

void test('documentation updates preserve settled cards with unchanged sources', () => {
  const webview = source('documentationWebview.ts');

  assert.match(webview, /const documentationCards = new Map/u);
  assert.match(webview, /existing\.source === block\.source/u);
  assert.match(webview, /existing\?\.settled/u);
  assert.doesNotMatch(
    webview,
    /saveAndDisposeDiagramControllers\(\);\s*list\.replaceChildren\(\)/u,
  );
});

void test('project render jobs reject detached or obsolete targets', () => {
  const webview = source('projectWebview.ts');

  assert.match(webview, /catalogGeneration/u);
  assert.match(webview, /previewGeneration/u);
  assert.match(webview, /!target\.isConnected \|\| !isCurrent\(\)/u);
});

void test('minimap thumbnails are created only after visibility is established', () => {
  const webview = source('webview.ts');
  const visibility = webview.indexOf('const visible = configuration.minimapEnabled');
  const creation = webview.indexOf('createMinimapThumbnail(lastSvg)');

  assert.ok(visibility >= 0);
  assert.ok(creation > visibility);
  assert.doesNotMatch(webview, /refreshMinimapDiagram\(svg\)/u);
});

void test('static validation reuses its source and known declaration', () => {
  const features = source('languageFeatures.ts');

  assert.match(features, /staticMermaidIssue\(document, source\)/u);
  assert.match(features, /unclosedBlockCount\(source, declaration\?\.word\)/u);
  assert.doesNotMatch(
    features,
    /function staticMermaidIssue\([\s\S]*?const source = document\.getText\(\)/u,
  );
});
