import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(__dirname, '..', '..');
const examplesDirectory = resolve(root, 'examples');

const expectedExamples = [
  ['01-flowchart.mmd', 'flowchart'],
  ['02-flowchart-elk.mmd', 'flowchart-elk'],
  ['03-sequence.mmd', 'sequenceDiagram'],
  ['04-class.mmd', 'classDiagram'],
  ['05-state.mmd', 'stateDiagram-v2'],
  ['06-entity-relationship.mmd', 'erDiagram'],
  ['07-user-journey.mmd', 'journey'],
  ['08-gantt.mmd', 'gantt'],
  ['09-pie.mmd', 'pie'],
  ['10-donut.mmd', 'pie'],
  ['11-quadrant.mmd', 'quadrantChart'],
  ['12-requirement.mmd', 'requirementDiagram'],
  ['13-gitgraph.mmd', 'gitGraph'],
  ['14-c4-context.mmd', 'C4Context'],
  ['15-c4-container.mmd', 'C4Container'],
  ['16-c4-component.mmd', 'C4Component'],
  ['17-c4-dynamic.mmd', 'C4Dynamic'],
  ['18-c4-deployment.mmd', 'C4Deployment'],
  ['19-mindmap.mmd', 'mindmap'],
  ['20-timeline.mmd', 'timeline'],
  ['21-sankey.mmd', 'sankey-beta'],
  ['22-xy-chart.mmd', 'xychart-beta'],
  ['23-block.mmd', 'block-beta'],
  ['24-packet.mmd', 'packet-beta'],
  ['25-kanban.mmd', 'kanban'],
  ['26-architecture.mmd', 'architecture-beta'],
  ['27-radar.mmd', 'radar-beta'],
  ['28-treemap.mmd', 'treemap-beta'],
  ['29-swimlanes.mmd', 'swimlane-beta'],
  ['30-event-modeling.mmd', 'eventmodeling'],
  ['31-venn.mmd', 'venn-beta'],
  ['32-ishikawa.mmd', 'ishikawa-beta'],
  ['33-wardley.mmd', 'wardley-beta'],
  ['34-cynefin.mmd', 'cynefin-beta'],
  ['35-tree-view.mmd', 'treeView-beta'],
  ['36-railroad.mmd', 'railroad-beta'],
  ['37-railroad-ebnf.mmd', 'railroad-ebnf-beta'],
  ['38-railroad-abnf.mmd', 'railroad-abnf-beta'],
  ['39-railroad-peg.mmd', 'railroad-peg-beta'],
  ['40-info.mmd', 'info'],
  ['41-zenuml.mmd', 'zenuml'],
  ['42-icon-packs.mmd', 'flowchart'],
  ['43-local-image.mmd', 'flowchart'],
] as const;

void test('the English gallery covers every supported Mermaid example', () => {
  const actualFiles = readdirSync(examplesDirectory)
    .filter((fileName) => fileName.endsWith('.mmd'))
    .sort();
  const expectedFiles = expectedExamples.map(([fileName]) => fileName);
  const catalogue = readFileSync(resolve(examplesDirectory, 'README.md'), 'utf8');

  assert.deepEqual(actualFiles, expectedFiles);
  assert.equal(actualFiles.length, 43);

  for (const [fileName, keyword] of expectedExamples) {
    const source = readFileSync(resolve(examplesDirectory, fileName), 'utf8');
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

    assert.match(
      source,
      new RegExp(`(?:^|\\n)\\s*${escapedKeyword}(?:\\s|$)`, 'u'),
      `${fileName} must keep its documented Mermaid diagram type`,
    );
    assert.doesNotMatch(
      source,
      /https?:\/\/|file:\/\/|javascript:/iu,
      `${fileName} must remain fully offline`,
    );
    assert.doesNotMatch(
      source,
      /[àâçéèêëîïôùûüÿœæ]/iu,
      `${fileName} still contains a likely French label`,
    );
    assert.match(
      source,
      /(?:^|\n)\s*title(?:\s*:|\s+\S)/u,
      `${fileName} should keep an explicit gallery title`,
    );
    assert.match(catalogue, new RegExp(`\\(${fileName.replaceAll('.', '\\.')}\\)`, 'u'));

    const significantLines = source
      .split(/\r?\n/u)
      .filter((line) => line.trim() && !line.trim().startsWith('%%'));
    assert.ok(
      fileName === '40-info.mmd' || significantLines.length >= 5,
      `${fileName} should remain a substantive gallery example`,
    );
  }
});

void test('the visual harness waits for the webview readiness handshake', () => {
  const harness = readFileSync(resolve(root, 'scripts', 'visual-regression.mjs'), 'utf8');

  assert.match(harness, /const webviewReady = new Promise/u);
  assert.match(harness, /message\.type === 'ready'.*resolveWebviewReady\(\)/u);
  assert.match(harness, /\(async \(\) => \{\s+await webviewReady;/u);
});

void test('visual harnesses use real time and deterministic bundled font metrics', () => {
  const browserHarness = readFileSync(
    resolve(root, 'scripts', 'browser-harness.mjs'),
    'utf8',
  );
  const previewHarness = readFileSync(
    resolve(root, 'scripts', 'visual-regression.mjs'),
    'utf8',
  );
  const projectHarness = readFileSync(
    resolve(root, 'scripts', 'project-visual-regression.mjs'),
    'utf8',
  );

  assert.match(browserHarness, /--remote-debugging-pipe/u);
  assert.match(browserHarness, /readHarnessResult/u);
  assert.match(previewHarness, /diagramFontFamily: 'noto-sans'/u);
  assert.match(previewHarness, /\['19-mindmap\.mmd', 0\.25\]/u);
  assert.doesNotMatch(previewHarness, /--virtual-time-budget|--dump-dom/u);
  assert.doesNotMatch(projectHarness, /--virtual-time-budget|--dump-dom/u);
});
