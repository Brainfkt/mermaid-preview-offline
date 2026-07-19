import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isMermaidPath, summarizeLineDiff } from '../src/visualDiff';

void test('visual diff source statistics distinguish added, changed, and removed lines', () => {
  assert.deepEqual(
    summarizeLineDiff('flowchart LR\n  A --> B\n  B --> C\n', 'flowchart LR\n  A --> D\n  D --> C\n  C --> E\n'),
    { added: 1, changed: 2, removed: 0, unchanged: 1 },
  );
  assert.deepEqual(summarizeLineDiff('a\nb\nc', 'a\nc'), {
    added: 0,
    changed: 0,
    removed: 1,
    unchanged: 2,
  });
});

void test('Mermaid diff inputs recognize both supported file extensions', () => {
  assert.equal(isMermaidPath('/docs/diagram.mmd'), true);
  assert.equal(isMermaidPath('/docs/diagram.MERMAID'), true);
  assert.equal(isMermaidPath('/docs/diagram.md'), false);
});
