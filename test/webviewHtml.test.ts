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

void test('the preview exposes refresh, retry, themes, and no redundant local badge', () => {
  assert.match(html, /id="refresh"/u);
  assert.match(html, /id="error-retry"/u);
  assert.match(html, /id="diagram-theme"/u);
  assert.match(html, /value="forest"/u);
  assert.match(html, /class="toolbar glass-surface"/u);
  assert.doesNotMatch(html, /offline-badge/u);
  assert.doesNotMatch(html, />\s*Local\s*</u);
  assert.doesNotMatch(html, /Rendering locally/u);
});
