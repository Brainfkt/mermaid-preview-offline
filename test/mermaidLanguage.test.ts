import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DIAGRAM_DECLARATIONS,
  formatMermaid,
  generateMissingIdentifiers,
  identifierAt,
  identifierOffsets,
  nearestDiagramDeclaration,
  unclosedBlockCount,
} from '../src/mermaidLanguage';

void test('all bundled diagnostic declarations are recognized', () => {
  for (const declaration of ['flowchart-elk', 'info']) {
    assert.equal(DIAGRAM_DECLARATIONS.has(declaration), true, declaration);
  }
});

void test('Mermaid formatting indents structural blocks and preserves final newlines', () => {
  assert.equal(
    formatMermaid('flowchart LR\nsubgraph Group\nA --> B\nend\n', '  '),
    'flowchart LR\n  subgraph Group\n    A --> B\n  end\n',
  );
  assert.equal(
    formatMermaid('mindmap\n  root((Topic))  \n    Child\n', '    '),
    'mindmap\n  root((Topic))\n    Child\n',
  );
  assert.equal(
    formatMermaid('classDiagram\nclass Animal {\n+name: string\n}\n', '  '),
    'classDiagram\n  class Animal {\n    +name: string\n  }\n',
  );
  assert.equal(
    formatMermaid('---\nconfig:\n  pie:\n    donutHole: 0.5  \n---\npie\n  "A" : 1\n', '  '),
    '---\nconfig:\n  pie:\n    donutHole: 0.5\n---\npie\n  "A" : 1\n',
  );
});

void test('missing identifiers are only generated for flowcharts', () => {
  assert.deepEqual(generateMissingIdentifiers('sequenceDiagram\n  [Alice] ->> Bob\n'), {
    count: 0,
    text: 'sequenceDiagram\n  [Alice] ->> Bob\n',
  });
});

void test('missing flowchart identifiers are generated from labels without touching existing IDs', () => {
  const generated = generateMissingIdentifiers('flowchart LR\n  [Start] --> [Finish]\n  ready[Ready]\n');
  assert.equal(generated.count, 2);
  assert.equal(
    generated.text,
    'flowchart LR\n  start[Start] --> finish[Finish]\n  ready[Ready]\n',
  );
});

void test('ELK flowcharts support the same missing-identifier refactor', () => {
  const generated = generateMissingIdentifiers('flowchart-elk TB\n  [Start] --> [Finish]\n');
  assert.equal(generated.count, 2);
  assert.equal(generated.text, 'flowchart-elk TB\n  start[Start] --> finish[Finish]\n');
});

void test('identifier discovery ignores labels, comments, and Mermaid keywords', () => {
  const source = 'flowchart LR\n  customer["Customer customer"] --> order\n  %% customer\n';
  const first = source.indexOf('customer');
  assert.deepEqual(identifierAt(source, first + 2), {
    end: first + 'customer'.length,
    name: 'customer',
    start: first,
  });
  assert.deepEqual(identifierOffsets(source, 'customer'), [first]);
  assert.equal(identifierAt(source, source.indexOf('flowchart') + 2), undefined);
});

void test('identifier discovery supports C4 declaration and relationship arguments', () => {
  const source = 'C4Context\n  Person(user, "User")\n  System(app, "App")\n  Rel(user, app, "Uses")\n';
  assert.equal(identifierOffsets(source, 'user').length, 2);
  assert.equal(identifierOffsets(source, 'app').length, 2);
});

void test('common declaration typos and missing block terminators are detected', () => {
  assert.equal(nearestDiagramDeclaration('sequnceDiagram'), 'sequenceDiagram');
  assert.equal(nearestDiagramDeclaration('unrelated'), undefined);
  assert.equal(unclosedBlockCount('sequenceDiagram\nalt Success\nA->>B: ok\n'), 1);
  assert.equal(unclosedBlockCount('sequenceDiagram\npar Work\nA->>B: one\n'), 1);
  assert.equal(unclosedBlockCount('flowchart LR\nsubgraph A\nend\n'), 0);
});

void test('block keywords in other diagram families do not require Mermaid end statements', () => {
  assert.equal(
    unclosedBlockCount('---\ntitle: Launch\n---\nmindmap\n  root((Launch))\n    Critical defects closed\n'),
    0,
  );
  assert.equal(
    unclosedBlockCount('ishikawa-beta\n  Releases\n    People\n      Critical knowledge held by one engineer\n'),
    0,
  );
  assert.equal(
    unclosedBlockCount('zenuml\n  Checkout.run() {\n    par {\n      Payment.authorize()\n    }\n  }\n'),
    0,
  );
});
