import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDocumentationWebviewHtml } from '../src/documentationWebviewHtml';

void test('documentation preview exposes its block list, empty state, and offline CSP', () => {
  const html = createDocumentationWebviewHtml({
    cspSource: 'vscode-webview://documentation-test',
    nonce: 'documentation-nonce',
    scriptUri: 'vscode-webview://documentation-test/dist/documentation-webview.js',
    styleUri: 'vscode-webview://documentation-test/media/documentation.css',
    title: 'Guide <unsafe>',
  });
  for (const marker of [
    'id="documentation-preview"',
    'id="documentation-title"',
    'id="documentation-summary"',
    'id="documentation-format"',
    'id="documentation-list"',
    'id="documentation-empty"',
  ]) assert.match(html, new RegExp(marker, 'u'));
  assert.match(html, /Guide &lt;unsafe&gt;/u);
  assert.match(html, /script-src 'nonce-documentation-nonce'/u);
  assert.match(html, /connect-src 'none'/u);
  assert.doesNotMatch(html, /https?:\/\//u);
});
