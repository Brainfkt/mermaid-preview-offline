import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDocumentationWebviewHtml } from '../src/documentationWebviewHtml';

void test('documentation preview exposes compact diagram and presentation controls', () => {
  const html = createDocumentationWebviewHtml({
    cspSource: 'vscode-webview://documentation-test',
    nonce: 'documentation-nonce',
    scriptUri: 'vscode-webview://documentation-test/dist/documentation-webview.js',
    styleUri: 'vscode-webview://documentation-test/media/documentation.css',
    title: 'Guide <unsafe>',
  });
  for (const marker of [
    'id="documentation-preview"',
    'id="documentation-list"',
    'id="documentation-empty"',
    'id="documentation-present"',
    'id="presentation-theme"',
    'id="presentation-theme-menu"',
    'id="presentation-density-picker"',
    'id="presentation-pattern-picker"',
    'id="presentation-surface-picker"',
    'id="presentation-surface-custom-color"',
    'id="presentation-previous"',
    'id="presentation-next"',
    'id="presentation-exit"',
  ]) assert.match(html, new RegExp(marker, 'u'));
  assert.doesNotMatch(html, /documentation-header/u);
  assert.doesNotMatch(html, /documentation-popout/u);
  assert.doesNotMatch(html, />Markdown</u);
  assert.equal((html.match(/class="theme-card /gu) ?? []).length, 11);
  assert.match(html, /Shared by previews in this workspace/u);
  assert.match(html, /class="surface-swatch__custom-preview" aria-hidden="true"/u);
  assert.match(html, />Esc</u);
  assert.match(html, /Guide &lt;unsafe&gt;/u);
  assert.match(
    html,
    /script-src vscode-webview:\/\/documentation-test 'nonce-documentation-nonce'/u,
  );
  assert.match(html, /<script type="module" nonce="documentation-nonce"/u);
  assert.match(html, /connect-src 'none'/u);
  assert.doesNotMatch(html, /https?:\/\//u);
});
