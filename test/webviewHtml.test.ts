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
  assert.match(html, /script-src 'nonce-fixed-nonce'/u);
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
  assert.match(html, /id="diagram-theme"/u);
  assert.match(html, /value="forest"/u);
  assert.match(html, /class="toolbar glass-surface"/u);
  const controlOrder = [
    'id="open-source"',
    'id="zoom-out"',
    'id="fit"',
    'id="zoom-in"',
    'id="refresh"',
    'id="diagram-theme"',
    'id="copy-svg"',
    'id="save-svg"',
  ].map((marker) => html.indexOf(marker));
  assert.ok(controlOrder.every((position) => position >= 0));
  assert.deepEqual(controlOrder, [...controlOrder].sort((left, right) => left - right));
});

void test('source, refresh, and theme controls are icon-only and the footer is unframed', () => {
  const toolbar = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.doesNotMatch(toolbar, />\s*Source\s*</u);
  assert.doesNotMatch(toolbar, />\s*Refresh\s*</u);
  assert.doesNotMatch(toolbar, /theme-picker__label/u);
  assert.match(toolbar, /class="button__icon"/u);
  assert.match(html, /<footer class="statusbar">/u);
  assert.doesNotMatch(html, /<footer class="statusbar glass-surface">/u);
  assert.doesNotMatch(html, /offline-badge/u);
  assert.doesNotMatch(html, />\s*Local\s*</u);
  assert.doesNotMatch(html, /Rendering locally/u);
});

void test('advanced source layouts expose editable, resizable split controls', () => {
  assert.match(html, /id="source-editor"/u);
  assert.match(html, /id="view-mode"/u);
  assert.match(html, /value="preview"/u);
  assert.match(html, /value="source"/u);
  assert.match(html, /value="split"/u);
  assert.match(html, /id="split-orientation"/u);
  assert.match(html, /id="splitter"/u);
  assert.match(html, /role="separator"/u);
});
