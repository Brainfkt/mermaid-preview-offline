import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { createWebviewHtml } from '../src/webviewHtml';

const html = createWebviewHtml({
  cspSource: 'vscode-webview://test-source',
  nonce: 'fixed-nonce',
  scriptUri: 'vscode-webview://test-source/dist/webview.js',
  styleUri: 'vscode-webview://test-source/media/preview.css',
  title: 'Preview <unsafe>',
});
const previewCss = readFileSync(resolve(__dirname, '../../media/preview.css'), 'utf8');

void test('la webview interdit les connexions et les contenus exécutables distants', () => {
  assert.match(html, /default-src 'none'/u);
  assert.match(html, /connect-src 'none'/u);
  assert.match(html, /object-src 'none'/u);
  assert.match(html, /frame-src 'none'/u);
  assert.match(html, /script-src vscode-webview:\/\/test-source 'nonce-fixed-nonce'/u);
  assert.match(html, /<script type="module" nonce="fixed-nonce"/u);
  assert.match(html, /img-src vscode-webview:\/\/test-source data: blob:/u);
  assert.doesNotMatch(html, /https?:\/\//u);
});

void test('la webview ne charge que ses ressources locales et échappe le titre', () => {
  assert.match(html, /vscode-webview:\/\/test-source\/dist\/webview\.js/u);
  assert.match(html, /vscode-webview:\/\/test-source\/media\/preview\.css/u);
  assert.match(html, /Preview &lt;unsafe&gt;/u);
  assert.doesNotMatch(html, /<title>Preview <unsafe><\/title>/u);
});

void test('the compact toolbar exposes controls in the requested order', () => {
  assert.match(html, /id="refresh"/u);
  assert.match(html, /id="error-retry"/u);
  assert.match(html, /id="theme-picker"/u);
  assert.match(html, /data-theme="forest"/u);
  assert.match(html, /class="toolbar glass-surface"/u);
  const controlOrder = [
    'id="editor-layout"',
    'id="zoom-out"',
    'id="fit"',
    'id="zoom-in"',
    'id="refresh"',
    'id="theme-picker"',
    'id="copy-svg"',
    'id="save-svg"',
    'id="export-open"',
  ].map((marker) => html.indexOf(marker));
  assert.ok(controlOrder.every((position) => position >= 0));
  assert.deepEqual(controlOrder, [...controlOrder].sort((left, right) => left - right));
});

void test('the preview exposes direct original SVG copy and save actions', () => {
  assert.match(html, /id="copy-svg"[^>]*aria-label="Copy original SVG"[\s\S]*?<span class="button__label">Copy SVG<\/span>/u);
  assert.match(html, /id="save-svg"[^>]*aria-label="Save original SVG"[\s\S]*?<span class="button__label">Save SVG<\/span>/u);
  const webview = readFileSync(resolve(__dirname, '../../src/webview.ts'), 'utf8');
  assert.match(webview, /bindButton\('save-svg'/u);
  assert.match(webview, /postMessage\(\{ type: 'saveSvg', svg: lastSvg \}\)/u);
  const provider = readFileSync(
    resolve(__dirname, '../../src/mermaidPreviewProvider.ts'),
    'utf8',
  );
  assert.match(provider, /case 'saveSvg'/u);
  assert.match(provider, /this\.saveSvg\(document\.uri, message\.svg\)/u);
});

void test('toolbar labels collapse progressively while icon actions remain accessible', () => {
  for (const marker of [
    'button--collapse-first',
    'button--collapse-second',
    'button--collapse-third',
  ]) {
    assert.match(html, new RegExp(marker, 'u'));
  }
  for (const accessibleName of [
    'aria-label="Fit diagram"',
    'aria-label="Copy original SVG"',
    'aria-label="Save original SVG"',
    'aria-label="Export diagram"',
  ]) {
    assert.match(html, new RegExp(accessibleName, 'u'));
  }
  assert.match(previewCss, /@media \(max-width: 1120px\)[\s\S]*?\.button--collapse-first \.button__label\s*\{\s*display: none;/u);
  assert.match(previewCss, /@media \(max-width: 860px\)[\s\S]*?\.button--collapse-second \.button__label\s*\{\s*display: none;/u);
  assert.match(previewCss, /@media \(max-width: 560px\)[\s\S]*?\.button--collapse-third \.button__label\s*\{\s*display: none;/u);
  assert.match(previewCss, /@media \(max-width: 430px\)[\s\S]*?\.toolbar \.divider\s*\{\s*display: none;/u);
});

void test('v0.5 professional export exposes preview, profiles, formats, and batch actions', () => {
  for (const marker of [
    'id="export-dialog"',
    'id="export-preview-image"',
    'id="export-profile"',
    'id="export-format"',
    'value="png"',
    'value="webp"',
    'value="pdf"',
    'id="export-scale"',
    'id="export-dpi"',
    'id="export-margin"',
    'id="export-background"',
    'id="export-name-template"',
    'id="export-copy-svg-original"',
    'id="export-copy-svg-optimized"',
    'id="export-copy-png"',
    'id="export-folder"',
  ]) {
    assert.match(html, new RegExp(marker, 'u'));
  }
});

void test('layout, refresh, and theme controls stay compact and the footer is unframed', () => {
  const toolbar = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.doesNotMatch(toolbar, />\s*Refresh\s*</u);
  assert.doesNotMatch(toolbar, /theme-picker__label/u);
  assert.match(toolbar, /class="button__icon"/u);
  assert.match(html, /<footer class="statusbar">/u);
  assert.doesNotMatch(html, /<footer class="statusbar glass-surface">/u);
  assert.doesNotMatch(html, /offline-badge/u);
  assert.doesNotMatch(html, />\s*Local\s*</u);
  assert.doesNotMatch(html, /Rendering locally/u);
});

void test('navigation controls use one internal editor surface and expose focused reading tools', () => {
  assert.match(html, /id="editor-layout"/u);
  assert.match(html, /id="source-editor"/u);
  assert.match(html, /id="source-line-numbers"/u);
  assert.match(html, /id="split-handle"/u);
  assert.match(html, /id="open-native-source"/u);
  assert.match(html, /<textarea[\s\S]*aria-label="Mermaid source editor"/u);
  assert.doesNotMatch(html, /id="fullscreen"/u);
  assert.doesNotMatch(html, /id="pan-mode"/u);
  assert.match(html, /id="open-new-window"/u);
  assert.doesNotMatch(html, /id="hide-toolbar"/u);
  assert.doesNotMatch(html, /id="show-toolbar"/u);
  assert.match(html, /id="minimap"/u);
  assert.match(html, /id="minimap-window"/u);
  assert.match(html, /id="diagram-navigation-controls"/u);
  assert.match(html, /id="file-size"/u);
  assert.match(html, /id="diagram-size"/u);
});

void test('the empty diagram state is concise and links to source or Diagram Studio', () => {
  const start = html.indexOf('id="empty-state"');
  const end = html.indexOf('</section>', start);
  const emptyState = html.slice(start, end);
  assert.match(emptyState, /This Mermaid diagram is empty\./u);
  assert.match(emptyState, /id="empty-open-source"/u);
  assert.match(emptyState, /id="empty-open-gallery"/u);
  assert.match(emptyState, /Browse templates &amp; examples/u);
  assert.doesNotMatch(emptyState, /state-card__mark/u);
  assert.doesNotMatch(emptyState, />M</u);
});
