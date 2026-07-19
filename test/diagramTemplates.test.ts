import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DIAGRAM_TEMPLATES,
  defaultTemplateValues,
  inferDiagramCategory,
  renderDiagramTemplate,
  titleFromFileName,
} from '../src/diagramTemplates';

void test('the Diagram Studio ships distinct customizable templates', () => {
  assert.ok(DIAGRAM_TEMPLATES.length >= 8);
  assert.equal(new Set(DIAGRAM_TEMPLATES.map((template) => template.id)).size, DIAGRAM_TEMPLATES.length);
  for (const template of DIAGRAM_TEMPLATES) {
    assert.match(template.fileName, /\.mmd$/u);
    assert.ok(template.fields.length > 0);
    assert.doesNotMatch(renderDiagramTemplate(template), /\{\{[\w]+\}\}/u);
    assert.deepEqual(
      Object.keys(defaultTemplateValues(template)),
      template.fields.map((field) => field.id),
    );
  }
});

void test('template values are bounded and safe inside Mermaid labels and identifiers', () => {
  const template = DIAGRAM_TEMPLATES.find((entry) => entry.id === 'process-flow');
  assert.ok(template);
  const source = renderDiagramTemplate(template, {
    direction: 'invalid',
    finish: 'Done\nnow',
    process: 'Review "request"',
    start: '',
  });
  assert.match(source, /^flowchart LR/mu);
  assert.match(source, /Request received/u);
  assert.match(source, /Review &quot;request&quot;/u);
  assert.match(source, /Done now/u);
});

void test('example metadata is inferred from source and stable file names', () => {
  assert.equal(inferDiagramCategory('sequenceDiagram\n  A->>B: Hi'), 'UML');
  assert.equal(inferDiagramCategory('architecture-beta\n  service api(server)[API]'), 'Architecture');
  assert.equal(inferDiagramCategory('unknown-beta\n  example'), 'Other');
  assert.equal(titleFromFileName('03-service-sequence.mmd'), 'Service Sequence');
});
