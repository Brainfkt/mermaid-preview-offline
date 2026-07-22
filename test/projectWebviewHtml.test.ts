import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import {
  createGalleryWebviewHtml,
  createVisualDiffWebviewHtml,
} from '../src/projectWebviewHtml';

const options = {
  cspSource: 'vscode-webview://project-test',
  nonce: 'project-nonce',
  scriptUri: 'vscode-webview://project-test/dist/project-webview.js',
  styleUri: 'vscode-webview://project-test/media/project.css',
  title: 'Studio <unsafe>',
};

void test('Diagram Studio exposes templates, examples, customization, and file creation', () => {
  const html = createGalleryWebviewHtml(options);
  for (const marker of [
    'id="project-gallery"',
    'id="templates-tab"',
    'id="examples-tab"',
    'id="catalog-search"',
    'id="category-filter"',
    'id="inspector-diagram"',
    'id="template-fields"',
    'id="template-source"',
    'id="template-file-name"',
    'id="create-diagram"',
  ]) assert.match(html, new RegExp(marker, 'u'));
  assert.match(html, /Studio &lt;unsafe&gt;/u);
  assert.match(html, /connect-src 'none'/u);
  assert.doesNotMatch(html, /https?:\/\//u);
});

void test('visual diff exposes side-by-side and overlay before/after previews', () => {
  const html = createVisualDiffWebviewHtml(options);
  for (const marker of [
    'id="visual-diff"',
    'id="side-by-side-mode"',
    'id="overlay-mode"',
    'id="before-diagram"',
    'id="after-diagram"',
    'id="overlay-before"',
    'id="overlay-after"',
    'id="diff-added"',
    'id="diff-changed"',
    'id="diff-removed"',
  ]) assert.match(html, new RegExp(marker, 'u'));
  assert.match(html, /script-src vscode-webview:\/\/project-test 'nonce-project-nonce'/u);
  assert.match(html, /<script type="module" nonce="project-nonce"/u);
});

void test('an empty preview gives Diagram Studio its file name and directory defaults', () => {
  const source = (fileName: string): string => readFileSync(
    resolve(__dirname, `../../src/${fileName}`),
    'utf8',
  );
  assert.match(source('webview.ts'), /empty-open-gallery[\s\S]*openDiagramGallery/u);
  assert.match(
    source('mermaidPreviewProvider.ts'),
    /OPEN_GALLERY_FOR_FILE_COMMAND, document\.uri/u,
  );
  assert.match(
    source('extension.ts'),
    /showGallery\('templates', resource\)/u,
  );
  assert.match(
    source('projectFeatures.ts'),
    /suggestedFileName: this\.galleryTargetUri \? fileNameOf\(this\.galleryTargetUri\)/u,
  );
  assert.match(
    source('projectFeatures.ts'),
    /vscode\.Uri\.joinPath\(this\.galleryTargetUri, '\.\.'\)/u,
  );
  assert.match(
    source('projectWebview.ts'),
    /fileName\.value = suggestedFileName \?\? item\.value\.fileName/u,
  );
});
