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

void test('visual diff source statistics handle identical lines, edits, and duplicates exactly', () => {
  assert.deepEqual(summarizeLineDiff('a\nb\na\nc\n', 'a\nb\na\nc\n'), {
    added: 0,
    changed: 0,
    removed: 0,
    unchanged: 4,
  });
  assert.deepEqual(summarizeLineDiff('a\nb\nc', 'a\ninserted\nb\nc'), {
    added: 1,
    changed: 0,
    removed: 0,
    unchanged: 3,
  });
  assert.deepEqual(summarizeLineDiff('a\nremoved\nb\nc', 'a\nb\nc'), {
    added: 0,
    changed: 0,
    removed: 1,
    unchanged: 3,
  });
  assert.deepEqual(summarizeLineDiff('a\nold\nc', 'a\nnew\nc'), {
    added: 0,
    changed: 1,
    removed: 0,
    unchanged: 2,
  });
  assert.deepEqual(summarizeLineDiff('a\nb\na', 'a\na\nb'), {
    added: 0,
    changed: 1,
    removed: 0,
    unchanged: 2,
  });
});

void test('visual diff remains bounded for 20k-50k line inputs', { timeout: 20_000 }, () => {
  const large = Array.from({ length: 50_000 }, (_, index) => `line-${index}`);
  const withInsertions = [
    ...large.slice(0, 25_000),
    'inserted-one',
    'inserted-two',
    ...large.slice(25_000),
  ];
  const startedAt = Date.now();
  assert.deepEqual(summarizeLineDiff(large.join('\n'), withInsertions.join('\n')), {
    added: 2,
    changed: 0,
    removed: 0,
    unchanged: 50_000,
  });

  // Many repeated matches, but only one edit in each direction: the bounded
  // Myers path remains exact without materializing all matching pairs.
  const alternatingLeft = Array.from(
    { length: 20_000 },
    (_, index) => index % 2 === 0 ? 'alpha' : 'beta',
  );
  const alternatingRight = Array.from(
    { length: 20_000 },
    (_, index) => index % 2 === 0 ? 'beta' : 'alpha',
  );
  assert.deepEqual(summarizeLineDiff(alternatingLeft.join('\n'), alternatingRight.join('\n')), {
    added: 0,
    changed: 1,
    removed: 0,
    unchanged: 19_999,
  });

  // This repeated, reordered input exceeds both exact match-pair and bounded
  // Myers budgets, exercising the explicit deterministic fallback.
  const groupSize = 10_000;
  const repeatedLeft = [
    ...Array<string>(groupSize).fill('alpha'),
    ...Array<string>(groupSize).fill('beta'),
  ];
  const repeatedRight = [
    ...Array<string>(groupSize).fill('beta'),
    ...Array<string>(groupSize).fill('alpha'),
  ];
  assert.deepEqual(summarizeLineDiff(repeatedLeft.join('\n'), repeatedRight.join('\n')), {
    added: 0,
    changed: 10_000,
    removed: 0,
    unchanged: 10_000,
  });

  const elapsedMilliseconds = Date.now() - startedAt;
  assert.ok(
    elapsedMilliseconds < 10_000,
    `large visual diffs took ${elapsedMilliseconds} ms`,
  );
});

void test('Mermaid diff inputs recognize both supported file extensions', () => {
  assert.equal(isMermaidPath('/docs/diagram.mmd'), true);
  assert.equal(isMermaidPath('/docs/diagram.MERMAID'), true);
  assert.equal(isMermaidPath('/docs/diagram.md'), false);
});
