import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { compareFlowcharts } from '../src/semanticDiff';
import type { SupportedSemanticDiff } from '../src/semanticDiff';

function supported(before: string, after = before): SupportedSemanticDiff {
  const result = compareFlowcharts(before, after);
  assert.equal(result.status, 'supported', JSON.stringify(result));
  return result;
}

void test('semantic diff ignores declaration order, layout direction, spacing, and chain grouping', () => {
  const before = 'flowchart LR\n A[Start] --> B{Ready?} --> C([Done])\n';
  const after = 'graph TD; C([Done]); B{Ready?}; A["Start"]; B-->C; A --> B;';
  const result = supported(before, after);
  assert.deepEqual(result.summary, { added: 0, removed: 0, modified: 0, unchanged: 5 });
  assert.deepEqual(result.nodes.unchanged.map(({ id }) => id), ['A', 'B', 'C']);
  assert.deepEqual(result.edges.unchanged.map(({ from, to }) => [from, to]), [['A', 'B'], ['B', 'C']]);
});

void test('semantic diff reports an edited node label and added downstream node and link', () => {
  const result = supported('flowchart LR; A[Old]-->B', 'flowchart LR; A[New]-->B-->C');
  assert.deepEqual(result.nodes.modified, [{
    before: { id: 'A', label: 'Old', shape: 'rect', kind: 'node' },
    after: { id: 'A', label: 'New', shape: 'rect', kind: 'node' },
    fields: ['label'],
  }]);
  assert.deepEqual(result.nodes.added.map(({ id }) => id), ['C']);
  assert.deepEqual(result.edges.added.map(({ from, to }) => [from, to]), [['B', 'C']]);
  assert.deepEqual(result.summary, { added: 2, removed: 0, modified: 1, unchanged: 2 });
});

void test('semantic diff distinguishes node shapes from unchanged labels', () => {
  const result = supported('flowchart LR; A[Approve]', 'flowchart LR; A{Approve}');
  assert.deepEqual(result.nodes.modified[0]?.fields, ['shape']);
  assert.equal(result.nodes.modified[0]?.after.shape, 'diamond');
});

void test('semantic diff identifies removal and addition for renamed node IDs', () => {
  const result = supported('flowchart LR; A-->B[Store]', 'flowchart LR; A-->C[Store]');
  assert.deepEqual(result.nodes.removed.map(({ id }) => id), ['B']);
  assert.deepEqual(result.nodes.added.map(({ id }) => id), ['C']);
  assert.equal(result.edges.removed.length, 1);
  assert.equal(result.edges.added.length, 1);
  assert.equal(result.nodes.modified.length, 0);
});

void test('semantic diff compares edge labels and arrow kinds without depending on source order', () => {
  const result = supported(
    'flowchart LR; A -->|Yes| B; A -.-> C',
    'flowchart LR; A ==> C; A -->|No| B',
  );
  assert.deepEqual(result.edges.modified.map(({ fields }) => fields), [['label'], ['operator']]);
  assert.equal(result.edges.added.length, 0);
  assert.equal(result.edges.removed.length, 0);
});

void test('semantic diff treats equivalent edge label spellings and minimum lengths consistently', () => {
  const result = supported(
    'flowchart LR; A -- accepted --> B; B == strong ==> C; C -. maybe .-> D',
    'flowchart TB; C -..->|maybe| D; B ===>|strong| C; A --->|"accepted"| B',
  );
  assert.deepEqual(result.summary, { added: 0, removed: 0, modified: 0, unchanged: 7 });
});

void test('semantic diff keeps parallel links distinct by explicit edge ID', () => {
  const result = supported(
    'flowchart LR; A primary@-->|Yes| B; A fallback@-.->|Retry| B',
    'flowchart LR; A fallback@-.->|Later| B; A primary@-->|Yes| B',
  );
  assert.equal(result.edges.modified.length, 1);
  assert.equal(result.edges.modified[0]?.after.id, 'fallback');
  assert.equal(result.edges.modified[0]?.after.key, 'id:fallback');
  assert.deepEqual(result.edges.modified[0]?.fields, ['label']);
  assert.equal(result.edges.unchanged[0]?.id, 'primary');
});

void test('semantic diff preserves an explicit edge identity when its endpoint changes', () => {
  const result = supported(
    'flowchart LR; A; B; C; A transfer@-->B',
    'flowchart LR; A; B; C; A transfer@-->C',
  );
  assert.equal(result.edges.added.length, 0);
  assert.deepEqual(result.edges.modified[0]?.fields, ['to']);
  assert.equal(result.edges.modified[0]?.after.to, 'C');
});

void test('semantic edges expose exact Mermaid render IDs for implicit and explicit links', () => {
  const result = supported('flowchart LR; A-->B-->C; C return-path@-->A; B-->A');
  assert.deepEqual(result.edges.unchanged.map(({ from, to, renderId }) => [from, to, renderId]), [
    ['A', 'B', 'L_A_B_0'],
    ['B', 'A', 'L_B_A_0'],
    ['B', 'C', 'L_B_C_0'],
    ['C', 'A', 'return-path'],
  ]);
});

void test('implicit render ID counters include preceding explicit links with the same endpoints', () => {
  const source = 'flowchart LR; A first@-->B; C other@-->D; A second@-->B; A-->B; C-->D';
  const result = supported(source);
  assert.equal(result.edges.unchanged.find(({ from, id }) => from === 'A' && id === undefined)?.renderId, 'L_A_B_3');
  assert.equal(result.edges.unchanged.find(({ from, id }) => from === 'C' && id === undefined)?.renderId, 'L_C_D_2');
  assert.equal(result.edges.unchanged.find(({ id }) => id === 'first')?.renderId, 'first');
  assert.equal(result.edges.unchanged.find(({ id }) => id === 'second')?.renderId, 'second');
});

void test('source reordering may change render IDs without creating semantic changes', () => {
  const before = 'flowchart LR; A named@-->B; A-->|Main|B';
  const after = 'flowchart LR; A-->|Main|B; A named@-->B';
  const initial = supported(before);
  assert.equal(initial.edges.unchanged.find(({ id }) => id === undefined)?.renderId, 'L_A_B_2');
  const result = supported(before, after);
  assert.deepEqual(result.summary, { added: 0, removed: 0, modified: 0, unchanged: 4 });
  assert.equal(result.edges.unchanged.find(({ id }) => id === undefined)?.renderId, 'L_A_B_0');
  assert.equal(result.edges.unchanged.find(({ id }) => id === 'named')?.renderId, 'named');
});

void test('changed edges retain each side render ID but exclude it from their changed fields', () => {
  const result = supported(
    'flowchart LR; A named@-->B; A-->|Before|B',
    'flowchart LR; A-->|After|B; A named@-->B',
  );
  assert.equal(result.edges.modified.length, 1);
  const change = result.edges.modified[0];
  assert.equal(change?.before.renderId, 'L_A_B_2');
  assert.equal(change?.after.renderId, 'L_A_B_0');
  assert.deepEqual(change?.fields, ['label']);
});

void test('semantic diff refuses ambiguous generated render IDs from underscore endpoints', () => {
  const source = 'flowchart LR\nA_B-->C\nA-->B_C';
  const result = compareFlowcharts('flowchart LR; A_B-->C', source);
  assert.equal(result.status, 'unsupported');
  if (result.status !== 'unsupported') return;
  assert.equal(result.side, 'after');
  assert.match(result.reason, /render|collid|ambiguous/iu);
  assert.equal('edges' in result, false);
});

void test('semantic diff refuses explicit and generated render ID collisions in either order', () => {
  for (const source of [
    'flowchart LR; X L_A_B_0@-->Y; A-->B',
    'flowchart LR; A-->B; X L_A_B_0@-->Y',
  ]) {
    const result = compareFlowcharts(source, source);
    assert.equal(result.status, 'unsupported', source);
    if (result.status !== 'unsupported') continue;
    assert.match(result.reason, /render|collid|ambiguous/iu);
    assert.equal('summary' in result, false);
  }
});

void test('semantic diff includes subgraph labels and nested membership', () => {
  const before = 'flowchart LR\nsubgraph outer [Services]\nsubgraph inner [Workers]\nA-->B\nend\nend\nC';
  const after = 'flowchart LR\nsubgraph outer [Platform]\nsubgraph inner [Workers]\nA\nend\nB\nend\nA-->B\nC';
  const result = supported(before, after);
  assert.deepEqual(result.nodes.modified.map(({ after: node, fields }) => [node.id, fields]), [
    ['B', ['parent']], ['outer', ['label']],
  ]);
  const inner = result.nodes.unchanged.find(({ id }) => id === 'inner');
  assert.equal(inner?.kind, 'subgraph');
  assert.equal(inner?.parent, 'outer');
  assert.equal(result.edges.unchanged.length, 1);
});

void test('semantic diff handles references before declarations and links to named subgraphs', () => {
  const result = supported(
    'flowchart LR\nA --> group\nA[Entry]\nsubgraph group [Subsystem]\nB\nend',
    'graph TD\nsubgraph group [Subsystem]\nB\nend\nA[Entry] --> group',
  );
  assert.equal(result.summary.modified, 0);
  assert.equal(result.nodes.unchanged.find(({ id }) => id === 'group')?.kind, 'subgraph');
});

void test('semantic diff ignores styling and comments while retaining comment-looking label text', () => {
  const result = supported(
    'flowchart LR\n%% comment\nA[100%% ready]:::good -->|"Yes; continue"| B\nclassDef good fill:red;\nstyle B fill:blue;\nlinkStyle 0 stroke:green;',
    'flowchart LR; A[100%% ready]:::blue,active-->|Yes; continue| B; class A blue; %% new comment',
  );
  assert.deepEqual(result.summary, { added: 0, removed: 0, modified: 0, unchanged: 3 });
  assert.ok(result.limitations.some((limitation) => limitation.includes('styling')));
});

void test('semantic diff ignores frontmatter and initialization configuration explicitly', () => {
  const result = supported(
    '\uFEFF---\r\ntitle: Before\r\n---\r\n%%{init: {"theme": "dark"}}%%\r\nflowchart LR\r\nA-->B',
    '---\ntitle: After\n---\nflowchart LR\nA-->B',
  );
  assert.equal(result.summary.modified, 0);
  assert.ok(result.limitations.some((limitation) => limitation.includes('frontmatter')));
});

void test('semantic diff handles quoted delimiters and all supported classic shapes', () => {
  const source = [
    'flowchart LR', 'A["array[0]; {safe}"]', 'B((Circle))', 'C(((Double)))',
    'D([Stadium])', 'E[(Database)]', 'F[[Routine]]', 'G{{Hexagon}}',
    'H[/Lean/]', 'I[\\Other\\]', 'J[/Trap\\]', 'K[\\Inverse/]',
    'L>Flag]', 'M(Round)', 'N{Diamond}',
  ].join('\n');
  const result = supported(source);
  assert.equal(result.nodes.unchanged.length, 14);
  assert.deepEqual(result.nodes.unchanged.map(({ shape }) => shape), [
    'rect', 'circle', 'double-circle', 'stadium', 'cylinder', 'subroutine', 'hexagon',
    'parallelogram', 'parallelogram-alt', 'trapezoid', 'trapezoid-alt', 'asymmetric', 'rounded', 'diamond',
  ]);
  assert.equal(result.nodes.unchanged[0]?.label, 'array[0]; {safe}');
});

void test('semantic diff supports special IDs without object-key collisions or lossy normalization', () => {
  const result = supported(
    'flowchart LR; __proto__-->constructor; svc.one-->worker:1; café-->worker-one; 项目-->_id',
    'graph TB; 项目-->_id; café-->worker-one; svc.one-->worker:1; __proto__-->constructor',
  );
  assert.equal(result.nodes.unchanged.length, 8);
  assert.equal(result.edges.unchanged.length, 4);
  assert.equal(result.summary.modified, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

void test('semantic diff handles independent bidirectional, circular, cross, and invisible arrows', () => {
  const result = supported('flowchart LR; A<-->B; B<==>C; C<-.->D; D--oE; E--xF; F~~~G');
  assert.deepEqual(result.edges.unchanged.map(({ operator }) => operator), ['<-->', '<==>', '<-.->', '--o', '--x', '~~~']);
});

void test('semantic diff rejects unsupported syntax instead of presenting a partial clean result', () => {
  const unsupportedSources = [
    'sequenceDiagram\nA->>B: hello',
    'flowchart LR\nA & B --> C',
    'flowchart LR\nA@{ shape: rect, label: "A" } --> B',
    'flowchart LR\nA["`Markdown`"] --> B',
    'flowchart LR\nA --> B\nA -->|Second relation| B',
    'flowchart LR\nA same@-->B\nB same@-->C',
    'flowchart LR\nA[First]\nA[Second]',
    'flowchart LR\nsubgraph first\nA\nend\nsubgraph second\nA\nend',
    'flowchart LR\nsubgraph first\nA\nend\nsubgraph second\nB --> first\nend',
    'flowchart LR\nsubgraph first\nA --> second\nend\nsubgraph second\nB\nend',
    'flowchart LR\nA-->B\nclick A "https://example.com"',
    'flowchart LR\nsubgraph Human readable title\nA\nend',
    'flowchart LR\nA[Unclosed',
    'flowchart LR\nA-->|Unclosed B',
    'flowchart LR\nsubgraph group\nA',
    'flowchart LR\nend',
    'flowchart LR\nA[One] -->',
    'flowchart LR\nA --> B unexpected',
  ];
  for (const source of unsupportedSources) {
    const result = compareFlowcharts('flowchart LR\nA-->B', source);
    assert.equal(result.status, 'unsupported', source);
    if (result.status !== 'unsupported') continue;
    assert.equal(result.side, 'after');
    assert.ok(result.reason.length > 12);
    assert.equal('nodes' in result, false);
    assert.equal('summary' in result, false);
  }
});

void test('semantic diff reports the input side and original line for unsupported syntax', () => {
  const result = compareFlowcharts('---\ntitle: sample\n---\nflowchart LR\n%% note\nA & B --> C', 'flowchart LR; A');
  assert.equal(result.status, 'unsupported');
  if (result.status !== 'unsupported') return;
  assert.equal(result.side, 'before');
  assert.equal(result.line, 6);
});

void test('semantic diff parses the bundled checkout example and identifies its changed business label', () => {
  const source = readFileSync('examples/01-flowchart.mmd', 'utf8');
  const result = supported(source, source.replace('Cart valid?', 'Stock available?'));
  assert.equal(result.nodes.modified.length, 1);
  assert.equal(result.nodes.modified[0]?.after.id, 'validate');
  assert.deepEqual(result.nodes.modified[0]?.fields, ['label']);
  assert.equal(result.edges.modified.length, 0);
});

void test('semantic diff bounds source size and entity count', () => {
  const oversized = compareFlowcharts('flowchart LR\nA[' + 'a'.repeat(2_000_000) + ']', 'flowchart LR; A');
  assert.equal(oversized.status, 'unsupported');
  const manyNodes = 'flowchart LR\n' + Array.from({ length: 20_001 }, (_, index) => `node_${index}`).join('\n');
  const result = compareFlowcharts(manyNodes, 'flowchart LR; A');
  assert.equal(result.status, 'unsupported');
  if (result.status === 'unsupported') assert.match(result.reason, /20,000/u);
});
