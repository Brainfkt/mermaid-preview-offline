import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  documentationImageReference,
  documentationKind,
  extractMermaidBlocks,
  mermaidBlockAtLine,
  replaceMermaidBlocks,
} from '../src/documentationBlocks';

void test('extracts Mermaid fences from Markdown without treating other code as diagrams', () => {
  const source = [
    '# Architecture',
    '',
    '```ts',
    'const ignored = true;',
    '```',
    '',
    '```mermaid title="Flow"',
    'flowchart LR',
    '  A --> B',
    '```',
    '',
    '~~~{.mermaid #secondary}',
    'sequenceDiagram',
    '  A->>B: Hello',
    '~~~~',
    '',
  ].join('\n');
  const blocks = extractMermaidBlocks(source, 'markdown');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.source, 'flowchart LR\n  A --> B\n');
  assert.deepEqual(
    blocks.map((block) => [block.startLine, block.endLine]),
    [[6, 9], [11, 14]],
  );
  assert.equal(mermaidBlockAtLine(blocks, 8)?.id, blocks[0]?.id);
  assert.equal(mermaidBlockAtLine(blocks, 10), undefined);
});

void test('does not extract Mermaid examples nested inside a wider Markdown fence', () => {
  const source = [
    '````markdown',
    '```mermaid',
    'flowchart LR',
    '  Example --> Only',
    '```',
    '````',
    '',
    '```mermaid',
    'flowchart LR',
    '  Real --> Diagram',
    '```',
  ].join('\n');
  const blocks = extractMermaidBlocks(source, 'markdown');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.source, 'flowchart LR\n  Real --> Diagram\n');
});

void test('MDX supports Mermaid fences and unterminated blocks', () => {
  const source = '<Callout />\r\n\r\n```{mermaid}\r\ngraph TD\r\n  A-->B';
  const blocks = extractMermaidBlocks(source, 'mdx');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.source, 'graph TD\r\n  A-->B');
  assert.equal(blocks[0]?.endOffset, source.length);
  assert.equal(documentationKind('plaintext', '/docs/page.mdx'), 'mdx');
});

void test('extracts Mermaid listing and source blocks from AsciiDoc', () => {
  const source = [
    '= System',
    '',
    '[mermaid,format=svg]',
    '....',
    'flowchart LR',
    '  Browser --> API',
    '....',
    '',
    '[source,plantuml]',
    '----',
    'ignored',
    '----',
    '',
    '[source, mermaid]',
    '----',
    'sequenceDiagram',
    '  API-->>Browser: OK',
    '----',
  ].join('\n');
  const blocks = extractMermaidBlocks(source, 'asciidoc');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.source, 'flowchart LR\n  Browser --> API\n');
  assert.equal(blocks[1]?.source, 'sequenceDiagram\n  API-->>Browser: OK\n');
  assert.equal(documentationKind('plaintext', '/docs/system.adoc'), 'asciidoc');
});

void test('does not extract Mermaid examples nested inside another AsciiDoc block', () => {
  const source = [
    '[source,asciidoc]',
    '----',
    '[mermaid]',
    '....',
    'flowchart LR',
    '  Example --> Only',
    '....',
    '----',
    '',
    '[mermaid]',
    '....',
    'flowchart LR',
    '  Real --> Diagram',
    '....',
  ].join('\n');
  const blocks = extractMermaidBlocks(source, 'asciidoc');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.source, 'flowchart LR\n  Real --> Diagram\n');
});

void test('extracts Mermaid blocks nested inside compound AsciiDoc containers', () => {
  const source = [
    '.Architecture example',
    '====',
    '[mermaid]',
    '....',
    'flowchart LR',
    '  Nested --> Diagram',
    '....',
    '====',
  ].join('\n');
  const blocks = extractMermaidBlocks(source, 'asciidoc');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.source, 'flowchart LR\n  Nested --> Diagram\n');
});

void test('replaces complete source blocks with format-specific local image references', () => {
  const markdown = 'Intro\n\n  ```mermaid\n  graph TD\n  A-->B\n  ```\n\nOutro\n';
  const markdownBlocks = extractMermaidBlocks(markdown, 'markdown');
  const replacedMarkdown = replaceMermaidBlocks(markdown, markdownBlocks, (block) =>
    `${block.indent}${documentationImageReference('markdown', 'guide assets/diagram 1.svg', 'Diagram 1')}`,
  );
  assert.equal(
    replacedMarkdown,
    'Intro\n\n  ![Diagram 1](guide%20assets/diagram%201.svg)\n\nOutro\n',
  );

  const asciidoc = '[mermaid]\n----\ngraph TD\nA-->B\n----\n';
  const asciidocBlocks = extractMermaidBlocks(asciidoc, 'asciidoc');
  assert.equal(
    replaceMermaidBlocks(asciidoc, asciidocBlocks, () =>
      documentationImageReference('asciidoc', 'guide.assets/diagram-1.svg', 'Diagram 1'),
    ),
    'image::guide.assets/diagram-1.svg[Diagram 1]\n',
  );

  assert.equal(
    documentationImageReference(
      'markdown',
      'guide (old)/diagram).svg',
      'Diagram ] one',
    ),
    '![Diagram \\] one](guide%20%28old%29/diagram%29.svg)',
  );
  assert.equal(
    documentationImageReference(
      'asciidoc',
      'guide[old]/diagram (1).svg',
      'Diagram ] one',
    ),
    'image::guide%5Bold%5D/diagram%20%281%29.svg[Diagram \\] one]',
  );
});

void test('replaces 2,000 blocks in a multi-megabyte document byte-for-byte', { timeout: 15_000 }, () => {
  const sourceChunks: string[] = [];
  const expectedChunks: string[] = [];
  const filler = `Background ${'x'.repeat(2_048)}\n`;
  const blockCount = 2_000;
  for (let index = 0; index < blockCount; index += 1) {
    const prose = `## Section ${index}\n${filler}`;
    const diagram = `\`\`\`mermaid\nflowchart LR\n  A${index} --> B${index}\n\`\`\`\n`;
    const replacement = `[rendered diagram ${index}]\n`;
    sourceChunks.push(prose, diagram);
    expectedChunks.push(prose, replacement);
  }

  const source = sourceChunks.join('');
  const expected = expectedChunks.join('');
  assert.ok(source.length > 4_000_000);
  const blocks = extractMermaidBlocks(source, 'markdown');
  assert.equal(blocks.length, blockCount);

  const callbackOrder: number[] = [];
  const startedAt = Date.now();
  const replaced = replaceMermaidBlocks(source, blocks, (block) => {
    callbackOrder.push(block.index);
    return `[rendered diagram ${block.index}]`;
  });
  const elapsedMilliseconds = Date.now() - startedAt;

  assert.equal(Buffer.compare(Buffer.from(replaced), Buffer.from(expected)), 0);
  assert.equal(callbackOrder[0], blockCount - 1);
  assert.equal(callbackOrder.at(-1), 0);
  assert.ok(
    elapsedMilliseconds < 10_000,
    `large document replacement took ${elapsedMilliseconds} ms`,
  );
});

void test('recognizes documentation languages by language id and extension', () => {
  assert.equal(documentationKind('markdown'), 'markdown');
  assert.equal(documentationKind('mdx'), 'mdx');
  assert.equal(documentationKind('asciidoc'), 'asciidoc');
  assert.equal(documentationKind('plaintext', '/docs/readme.markdown'), 'markdown');
  assert.equal(documentationKind('typescript', '/src/index.ts'), undefined);
});
