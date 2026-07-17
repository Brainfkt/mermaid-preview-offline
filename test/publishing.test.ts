import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

interface PublishingManifest {
  activationEvents: string[];
  bugs: { url: string };
  categories: string[];
  contributes: {
    commands: Array<{ title: string }>;
    customEditors: Array<{ displayName: string; viewType: string }>;
  };
  description: string;
  displayName: string;
  galleryBanner: { color: string; theme: string };
  homepage: string;
  icon: string;
  keywords: string[];
  pricing: string;
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

void test('Marketplace metadata is complete, searchable, and written in English', () => {
  assert.equal(manifest.displayName, 'Mermaid Preview — 100% Offline');
  assert.match(manifest.description, /Mermaid diagram preview/iu);
  assert.match(manifest.description, /offline/iu);
  assert.equal(manifest.pricing, 'Free');
  assert.deepEqual(manifest.categories, ['Visualization', 'Programming Languages']);
  assert.ok(manifest.keywords.length <= 30);
  assert.equal(new Set(manifest.keywords).size, manifest.keywords.length);
  for (const keyword of ['mermaid', 'diagram as code', 'flowchart', 'sequence diagram', 'offline']) {
    assert.ok(manifest.keywords.includes(keyword), `missing Marketplace keyword: ${keyword}`);
  }
  assert.equal(manifest.galleryBanner.color, '#ff3670');
  assert.equal(manifest.galleryBanner.theme, 'dark');

  const editor = manifest.contributes.customEditors[0];
  assert.ok(editor);
  assert.equal(manifest.activationEvents[0], `onCustomEditor:${editor.viewType}`);
  assert.equal(editor.displayName, 'Mermaid Preview (Offline)');
  assert.equal(manifest.contributes.commands[0]?.title, 'Mermaid Preview: Open Offline Preview');
});

void test('the Marketplace icon is a high-resolution PNG', () => {
  const icon = readFileSync(resolve(root, manifest.icon));
  assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(icon.readUInt32BE(16) >= 256);
  assert.ok(icon.readUInt32BE(20) >= 256);
});

void test('les workflows CI, release et Marketplace sont présents', () => {
  for (const workflow of ['ci.yml', 'release.yml', 'publish-marketplace.yml']) {
    assert.equal(existsSync(resolve(root, '.github', 'workflows', workflow)), true);
  }
});

void test('CI verifies supported platforms and all visual fixtures', () => {
  const workflow = readFileSync(resolve(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  for (const operatingSystem of ['ubuntu-latest', 'windows-latest', 'macos-latest']) {
    assert.match(workflow, new RegExp(operatingSystem, 'u'));
  }
  assert.match(workflow, /npm run test:visual/u);
  assert.match(workflow, /Render 43 examples in 3 themes/u);
});
