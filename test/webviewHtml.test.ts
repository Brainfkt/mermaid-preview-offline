import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createWebviewHtml } from '../src/webviewHtml';

const html = createWebviewHtml({
  cspSource: 'vscode-webview://test-source',
  nonce: 'fixed-nonce',
  scriptUri: 'vscode-webview://test-source/dist/webview.js',
  styleUri: 'vscode-webview://test-source/media/preview.css',
  title: 'Preview <unsafe>',
});

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
    'id="pan-mode"',
    'id="zoom-out"',
    'id="fit"',
    'id="zoom-in"',
    'id="refresh"',
    'id="theme-picker"',
    'id="copy-svg"',
    'id="export-open"',
  ].map((marker) => html.indexOf(marker));
  assert.ok(controlOrder.every((position) => position >= 0));
  assert.deepEqual(controlOrder, [...controlOrder].sort((left, right) => left - right));
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

void test('navigation controls use native editor layouts and expose v0.4 reading tools', () => {
  assert.match(html, /id="editor-layout"/u);
  assert.doesNotMatch(html, /id="source-editor"/u);
  assert.doesNotMatch(html, /<textarea/u);
  assert.match(html, /id="fullscreen"/u);
  assert.doesNotMatch(html, /id="hide-toolbar"/u);
  assert.doesNotMatch(html, /id="show-toolbar"/u);
  assert.match(html, /id="minimap"/u);
  assert.match(html, /id="minimap-window"/u);
  assert.match(html, /id="diagram-navigation-controls"/u);
  assert.match(html, /id="pan-mode"[^>]+aria-pressed="false"/u);
  assert.match(html, /id="file-size"/u);
  assert.match(html, /id="diagram-size"/u);
});
