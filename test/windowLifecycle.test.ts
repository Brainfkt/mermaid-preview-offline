import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const source = (fileName: string): string =>
  readFileSync(resolve(__dirname, '../../src', fileName), 'utf8');

void test('hidden file previews release their renderer and restore lightweight webview state', () => {
  const extension = source('extension.ts');
  const provider = source('mermaidPreviewProvider.ts');
  const webview = source('webview.ts');

  assert.match(extension, /retainContextWhenHidden:\s*false/u);
  assert.match(webview, /vscode\.getState\(\)/u);
  assert.match(webview, /vscode\.setState\(state\)/u);
  assert.match(
    provider,
    /if \(!event\.webviewPanel\.visible\) \{\s*this\.readyPanels\.delete\(webviewPanel\)/u,
  );
  assert.match(provider, /panelForInteraction\(documentUri, true\)/u);
  assert.match(provider, /panelForInteraction\(documentUri, false\)/u);
  assert.match(provider, /pauseBatchSessions\(webview\)/u);
  assert.match(provider, /resumeBatchSessions\(webview\)/u);
  assert.match(provider, /cancelBatchSessions\(/u);
});

void test('detached previews keep an independent internal layout', () => {
  const controller = source('editorLayoutController.ts');
  const provider = source('mermaidPreviewProvider.ts');
  const webview = source('webview.ts');

  assert.match(controller, /detachedPanelModes/u);
  assert.match(controller, /modeForPanel/u);
  assert.match(controller, /DETACHED_COPY_TIMEOUT_MS/u);
  assert.match(provider, /detached: this\.layoutController\.isDetachedPanel\(webviewPanel\)/u);
  assert.match(controller, /modeEmitter\.fire\(\{ mode, panel: preferredPanel, uri \}\)/u);
  assert.match(webview, /detachedSuffix/u);
  assert.doesNotMatch(webview, /editorLayoutButton\.disabled = detachedPreview/u);
});

void test('managed previews share their selected layout across Mermaid files', () => {
  const controller = source('editorLayoutController.ts');

  assert.match(controller, /MODE_STATE_KEY = 'mermaidPreviewOffline\.editorMode'/u);
  assert.match(controller, /pendingSharedMode/u);
  assert.match(controller, /workspaceState\.get<unknown>\(MODE_STATE_KEY\)/u);
  assert.match(controller, /modeEmitter\.fire\(\{ mode \}\)/u);
  assert.doesNotMatch(controller, /modeKey\(/u);
});

void test('internal source edits are versioned, serialized, and conflict-safe', () => {
  const provider = source('mermaidPreviewProvider.ts');
  const protocol = source('protocol.ts');
  const webview = source('webview.ts');

  assert.match(protocol, /type: 'replaceDocument'/u);
  assert.match(protocol, /type: 'sourceEditResult'/u);
  assert.match(provider, /message\.version !== document\.version/u);
  assert.match(provider, /vscode\.workspace\.applyEdit\(edit\)/u);
  assert.match(provider, /sourceEditQueue\.then\(replace, replace\)/u);
  assert.match(webview, /sourceEditInFlight/u);
  assert.match(webview, /conflictingDocument/u);
  assert.match(webview, /sourceReloadButton\.hidden = false/u);
  assert.match(webview, /vscode\.postMessage\(\{\s*type: 'replaceDocument'/u);
  assert.match(webview, /vscode\.postMessage\(\{ type: 'saveDocument' \}\)/u);
});

void test('Source only opens the full VS Code text editor instead of the internal textarea', () => {
  const controller = source('editorLayoutController.ts');
  const webview = source('webview.ts');
  const openSourceOnly = webview.match(
    /function openSourceOnly\(\): void \{[\s\S]*?\n\}/u,
  )?.[0];

  assert.ok(openSourceOnly);
  assert.match(controller, /if \(mode === 'source'\)/u);
  assert.match(controller, /vscode\.workspace\.openTextDocument\(uri\)/u);
  assert.match(controller, /vscode\.window\.showTextDocument\(document/u);
  assert.match(openSourceOnly, /flushSourceEdit\(\)/u);
  assert.match(openSourceOnly, /postMessage\(\{ type: 'openNativeSource' \}\)/u);
  assert.doesNotMatch(openSourceOnly, /editorMode = 'source'/u);
});

void test('documentation preview readiness is bounded and pop-out moves only its editor', () => {
  const documentation = source('documentationFeatures.ts');

  assert.match(documentation, /DOCUMENTATION_READY_TIMEOUT_MS/u);
  assert.match(documentation, /settlePanelReady/u);
  assert.match(documentation, /workbench\.action\.moveEditorToNewWindow/u);
  assert.doesNotMatch(documentation, /workbench\.action\.moveEditorGroupToNewWindow/u);
});
