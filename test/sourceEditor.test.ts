import assert from 'node:assert/strict';
import { test } from 'node:test';
import { highlightedSource, indentSource, newlineSource, sourceCompletions, sourceTokens, SOURCE_HIGHLIGHT_LIMIT } from '../src/sourceEditor';

void test('source highlighting distinguishes syntax from labels and escapes HTML', () => {
  const source = 'flowchart LR\n  start["<img onerror=alert(1)>"] --> endNode\n  %% flowchart';
  const tokens = sourceTokens(source);
  assert.ok(tokens.some(({ text, kind }) => text === 'flowchart' && kind === 'keyword'));
  assert.ok(tokens.some(({ text, kind }) => text === '-->' && kind === 'operator'));
  assert.ok(tokens.some(({ text, kind }) => text.startsWith('%%') && kind === 'comment'));
  const html = highlightedSource(source, 2);
  assert.doesNotMatch(html, /<img/u);
  assert.match(html, /&lt;img/u);
  assert.equal(html.match(/source-editor__code-line--error/gu)?.length, 1);
  assert.equal(highlightedSource('a\n').split('\n').length, 2);
});

void test('completion replaces the complete word and proposes keywords and existing identifiers', () => {
  assert.equal(sourceCompletions('flow', 4).items[0]?.label, 'flowchart');
  const source = 'flowchart LR\n  customer["Customer label"] --> order\n  cusZZ';
  const result = sourceCompletions(source, source.length - 2);
  assert.equal(result.items[0]?.label, 'customer');
  assert.equal(result.start, source.lastIndexOf('cusZZ'));
  assert.equal(result.end, source.length);
  assert.equal(sourceCompletions('flowchart LR\n  %% fl', 20).items.length, 0);
  assert.equal(sourceCompletions('flowchart LR\n A["fl', 19).items.length, 0);
  assert.equal(sourceCompletions('flowchart LR\n A[fl', 18).items.length, 0);
  assert.equal(sourceCompletions('flowchart LR\n ', 14).items.length, 0);
  assert.ok(sourceCompletions('flowchart LR\n ', 14, true).items.length > 0);
  assert.equal(sourceCompletions(' '.repeat(SOURCE_HIGHLIGHT_LIMIT) + 'fl', SOURCE_HIGHLIGHT_LIMIT + 2).items.length, 0);
});

void test('block indentation preserves the selected lines and excludes the next line', () => {
  const source = 'flowchart LR\nA --> B\nB --> C\nD';
  const start = source.indexOf('A');
  const end = source.indexOf('D');
  const edit = indentSource(source, start, end);
  assert.equal(source.slice(0, edit.start) + edit.text + source.slice(edit.end), 'flowchart LR\n  A --> B\n  B --> C\nD');
  assert.equal(edit.selectionStart, start + 2);
  assert.equal(edit.selectionEnd, end + 4);
  const restored = indentSource('  A\n  B\nC', 2, 8, true);
  assert.equal(restored.text, 'A\nB');
  assert.equal(restored.selectionStart, 0);
  assert.equal(restored.selectionEnd, 4);
});

void test('outdent handles tabs, blank lines, partial indentation and caret at column zero', () => {
  const edit = indentSource('\tA\n B\nC', 0, 7, true);
  assert.equal(edit.text, 'A\nB\nC');
  assert.equal(edit.selectionStart, 0);
  assert.equal(edit.selectionEnd, 5);
  assert.equal(indentSource('  A', 0, 0, true).selectionStart, 0);
  assert.equal(indentSource('\nA', 0, 0).start, 0);
  assert.equal(newlineSource('\nA', 0, 0).text, '\n');
});

void test('Enter preserves indentation and increases it only for supported structural blocks', () => {
  for (const [source, expected] of [
    ['flowchart LR', '\n  '],
    ['flowchart LR\n  subgraph Group', '\n    '],
    ['sequenceDiagram\n  alt Success', '\n    '],
    ['sequenceDiagram\n  else Failure', '\n    '],
    ['classDiagram\n  class Animal {', '\n    '],
    ['stateDiagram-v2\n  state Running {', '\n    '],
    ['flowchart LR\n  A{Question}', '\n  '],
    ['flowchart LR\n  classDef success fill:green', '\n  '],
    ['mindmap\n  root\n    alt example', '\n    '],
  ]) {
    assert.ok(source !== undefined && expected !== undefined);
    assert.equal(newlineSource(source, source.length, source.length).text, expected, source);
  }
});
