import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeMermaidError } from '../src/mermaidError';

void test('Mermaid parser locations include line, column, and source excerpt', () => {
  const error = Object.assign(new Error('Unexpected token'), {
    hash: { loc: { first_column: 4, first_line: 3 } },
  });
  const details = describeMermaidError(error, 'flowchart LR\n  A --> B\n  B -x C\n  C --> D');

  assert.equal(details.line, 3);
  assert.equal(details.column, 5);
  assert.match(details.excerpt ?? '', /> 3 \| {3}B -x C/u);
  assert.match(details.excerpt ?? '', /\^/u);
});

void test('Mermaid textual parse errors recover the line number', () => {
  const details = describeMermaidError(
    new Error('Parse error on line 2:\nExpecting an arrow'),
    'flowchart LR\nA broken B',
  );
  assert.equal(details.line, 2);
  assert.equal(details.column, undefined);
  assert.match(details.excerpt ?? '', /> 2 \| A broken B/u);
});
