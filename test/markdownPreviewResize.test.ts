import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  calculateDiagramFit,
  markdownResizeMemoryKey,
  nativeWheelDelta,
  normalizeResizeMemory,
  parseDiagramTransform,
} from '../src/markdownPreviewResize';
import {
  createMarkdownItExtension,
  MARKDOWN_PREVIEW_CONFIGURATION_ID,
  markdownPreviewConfigurationMarkup,
} from '../src/markdownPreviewConfiguration';

void test('native Markdown fit keeps the resized viewport and centers the diagram inside it', () => {
  const fit = calculateDiagramFit(800, 320, 1200, 600);
  assert.equal(fit.scale, 0.5066666666666667);
  assert.equal(fit.translateX, 96);
  assert.equal(fit.translateY, 8);
});

void test('native Markdown fit follows the renderer scale limits', () => {
  assert.equal(calculateDiagramFit(120, 100, 1200, 800).scale, 0.5);
  assert.equal(calculateDiagramFit(1200, 800, 20, 10).scale, 10);
});

void test('native Mermaid transforms and wheel deltas are decoded without private APIs', () => {
  assert.deepEqual(
    parseDiagramTransform('translate(-12.5px, 48px) scale(1.25)'),
    { scale: 1.25, translateX: -12.5, translateY: 48 },
  );
  assert.equal(nativeWheelDelta(1.25, 0.5), 300);
  assert.equal(parseDiagramTransform('matrix(1, 0, 0, 1, 0, 0)'), undefined);
});

void test('Markdown resize memory is isolated by document and stable Mermaid id', () => {
  assert.equal(
    markdownResizeMemoryKey('file:///workspace/guide.md', 'mermaid-abc'),
    'file:///workspace/guide.md\nmermaid-abc',
  );
  assert.notEqual(
    markdownResizeMemoryKey('file:///workspace/guide.md', 'mermaid-abc'),
    markdownResizeMemoryKey('file:///workspace/other.md', 'mermaid-abc'),
  );
});

void test('invalid and excessive Markdown resize memory entries are discarded', () => {
  const memory: Record<string, unknown> = {
    invalid: { height: 20, updatedAt: 1 },
  };
  for (let index = 0; index < 260; index += 1) {
    memory[`diagram-${index}`] = { height: 200 + index, updatedAt: index };
  }
  const normalized = normalizeResizeMemory(memory);
  assert.equal(Object.keys(normalized).length, 256);
  assert.equal(normalized.invalid, undefined);
  assert.equal(normalized['diagram-0'], undefined);
  assert.deepEqual(normalized['diagram-259'], { height: 459, updatedAt: 259 });
});

void test('the Markdown-It bridge exposes the current persistence setting on every render', () => {
  let rememberResizedHeight = true;
  const renderer = {
    render: () => '<main>Rendered Markdown</main>',
  };
  const extension = createMarkdownItExtension(() => rememberResizedHeight);
  extension.extendMarkdownIt({ renderer });
  assert.match(renderer.render(), /&quot;rememberResizedHeight&quot;:true/u);
  rememberResizedHeight = false;
  assert.match(renderer.render(), /&quot;rememberResizedHeight&quot;:false/u);
  assert.match(renderer.render(), /<main>Rendered Markdown<\/main>/u);
});

void test('Markdown preview configuration markup is inert and attribute escaped', () => {
  const markup = markdownPreviewConfigurationMarkup(true);
  assert.match(markup, new RegExp(`id="${MARKDOWN_PREVIEW_CONFIGURATION_ID}"`, 'u'));
  assert.match(markup, /aria-hidden="true"/u);
  assert.doesNotMatch(markup, /<script/iu);
});
