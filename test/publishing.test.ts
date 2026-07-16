import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

interface PublishingManifest {
  bugs: { url: string };
  homepage: string;
  publisher: string;
  repository: { type: string; url: string };
  scripts: Record<string, string>;
}

const root = resolve(__dirname, '../..');
const manifest = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
) as PublishingManifest;

void test('le manifeste pointe vers le dépôt autonome', () => {
  assert.equal(manifest.repository.type, 'git');
  assert.match(manifest.repository.url, /mermaid-preview-offline\.git$/u);
  assert.doesNotMatch(manifest.repository.url, /STOKAGE/iu);
  assert.match(manifest.homepage, /mermaid-preview-offline/iu);
  assert.match(manifest.bugs.url, /mermaid-preview-offline\/issues$/u);
});

void test('le publisher et les commandes de publication sont configurés', () => {
  assert.match(manifest.publisher, /^[a-zA-Z0-9][a-zA-Z0-9-]{2,49}$/u);
  assert.match(manifest.scripts['package:vsix'] ?? '', /scripts\/package-vsix\.mjs/u);
  assert.match(manifest.scripts['publish:marketplace'] ?? '', /vsce publish/u);
});

void test('les workflows CI, release et Marketplace sont présents', () => {
  for (const workflow of ['ci.yml', 'release.yml', 'publish-marketplace.yml']) {
    assert.equal(existsSync(resolve(root, '.github', 'workflows', workflow)), true);
  }
});
