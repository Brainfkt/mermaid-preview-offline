import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

interface ExtensionManifest {
  contributes: {
    customEditors: Array<{
      priority: string;
      selector: Array<{ filenamePattern: string }>;
      viewType: string;
    }>;
  };
  dependencies: Record<string, string>;
}

const manifestPath = resolve(__dirname, '../../package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ExtensionManifest;

void test('le clic sur les deux extensions Mermaid utilise l’aperçu par défaut', () => {
  const editor = manifest.contributes.customEditors[0];
  assert.ok(editor);
  assert.equal(editor.priority, 'default');
  assert.equal(editor.viewType, 'brainfkt.mermaidPreviewOffline');
  assert.deepEqual(
    editor.selector.map((entry) => entry.filenamePattern),
    ['*.mmd', '*.mermaid'],
  );
});

void test('Mermaid est une dépendance locale épinglée', () => {
  assert.equal(manifest.dependencies.mermaid, '11.16.0');
  assert.equal(manifest.dependencies['@mermaid-js/mermaid-zenuml'], '0.2.3');
  assert.match(manifest.dependencies['@iconify-json/logos'] ?? '', /^1\./u);
  assert.match(manifest.dependencies['@iconify-json/material-icon-theme'] ?? '', /^1\./u);
});
