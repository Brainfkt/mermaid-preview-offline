import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runBrowserHarness } from './browser-harness.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compiledRoot = join(root, '.test-dist', 'src');
const outputDirectory = join(root, '.test-dist', 'visual');
const { DIAGRAM_TEMPLATES } = await import(
  pathToFileURL(join(compiledRoot, 'diagramTemplates.js')).href
);
const { createGalleryWebviewHtml, createVisualDiffWebviewHtml } = await import(
  pathToFileURL(join(compiledRoot, 'projectWebviewHtml.js')).href
);
const { summarizeLineDiff } = await import(
  pathToFileURL(join(compiledRoot, 'visualDiff.js')).href
);
const { imageMimeType, inlineLocalImages } = await import(
  pathToFileURL(join(compiledRoot, 'localImages.js')).href
);

const examples = await Promise.all(
  readdirSync(join(root, 'examples'))
    .filter((fileName) => /\.(?:mmd|mermaid)$/u.test(fileName))
    .sort()
    .map(async (fileName) => {
      const documentPath = join(root, 'examples', fileName);
      const rawSource = readFileSync(documentPath, 'utf8');
      const source = await inlineLocalImages(rawSource, (reference) => {
        const mimeType = imageMimeType(reference);
        if (!mimeType) return Promise.resolve(undefined);
        try {
          return Promise.resolve({
            bytes: readFileSync(resolve(dirname(documentPath), reference)),
            mimeType,
          });
        } catch {
          return Promise.resolve(undefined);
        }
      });
      return {
        category: categoryOf(source),
        fileName,
        id: fileName.replace(/\.(?:mmd|mermaid)$/u, ''),
        source,
        title: fileName.replace(/\.mmd$/u, '').replace(/^\d+-/u, '').replaceAll('-', ' '),
      };
    }),
);

mkdirSync(outputDirectory, { recursive: true });
const nonce = 'project-visual-regression';
const script = pathToFileURL(join(root, 'dist', 'project-webview.js')).href;
const stylesheet = pathToFileURL(join(root, 'media', 'project.css')).href;
const options = {
  cspSource: 'file:',
  nonce,
  scriptUri: script,
  styleUri: stylesheet,
  title: 'Project visual regression',
};

const galleryData = {
  density: 'comfortable',
  examples,
  fontFamily: 'vscode',
  initialTab: 'templates',
  surface: { customColor: '#ffffff', pattern: 'dots', preset: 'editor' },
  templates: DIAGRAM_TEMPLATES,
  theme: 'adaptive',
  type: 'galleryData',
};
const galleryStub = stubFor(galleryData, `
  await waitFor(() => document.querySelectorAll('.catalog-card').length === ${DIAGRAM_TEMPLATES.length}, 'template cards');
  await waitFor(() => document.querySelector('#inspector-diagram svg'), 'selected template preview');
  const templateCards = [...document.querySelectorAll('.catalog-card')];
  for (const card of templateCards) {
    card.click();
    await waitFor(
      () => document.querySelector('#inspector-diagram').dataset.renderSource === document.querySelector('#template-source').value,
      'template preview ' + card.textContent,
    );
    if (!document.querySelector('#inspector-error').hidden) {
      throw new Error('Template failed to render: ' + card.textContent);
    }
  }
  templateCards[0].click();
  await waitFor(
    () => document.querySelector('#inspector-diagram').dataset.renderSource === document.querySelector('#template-source').value,
    'restored first template',
  );
  const originalSource = document.querySelector('#template-source').value;
  const editableField = document.querySelector('#template-fields input');
  editableField.value = 'Custom starting point';
  editableField.dispatchEvent(new Event('input', { bubbles: true }));
  await waitFor(() => document.querySelector('#template-source').value !== originalSource, 'customized source');
  await waitFor(() => document.querySelector('#inspector-diagram svg'), 'customized preview');
  document.querySelector('#template-form').requestSubmit();
  await waitFor(() => postedMessages.some((message) => message.type === 'createDiagram'), 'create diagram action');
  document.querySelector('#examples-tab').click();
  await waitFor(() => document.querySelectorAll('.catalog-card').length === ${examples.length}, 'example cards');
  await waitFor(() => document.querySelector('#inspector-diagram svg'), 'example preview');
  const localImageCard = [...document.querySelectorAll('.catalog-card')].at(-1);
  localImageCard.click();
  await waitFor(
    () => document.querySelector('#inspector-diagram').dataset.renderSource === document.querySelector('#template-source').value,
    'local image example preview',
  );
  if (!document.querySelector('#inspector-error').hidden) throw new Error('The local image example failed to render.');
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) {
    throw new Error('Diagram Studio overflows horizontally at the desktop viewport.');
  }
  finish({
    cards: document.querySelectorAll('.catalog-card').length,
    createMessage: postedMessages.find((message) => message.type === 'createDiagram'),
    selectedTitle: document.querySelector('#inspector-title').textContent,
  });`);
let galleryHtml = createGalleryWebviewHtml(options);
galleryHtml = injectHarness(galleryHtml, galleryStub);
const galleryPath = join(outputDirectory, 'project-gallery-harness.html');
writeFileSync(galleryPath, galleryHtml);
writeFileSync(join(outputDirectory, 'project-gallery-harness-http.html'), httpVersion(galleryHtml));

const beforeSource = 'flowchart LR\n  A[Request] --> B[Review]\n  B --> C[Approved]\n';
const afterSource = 'flowchart LR\n  A[Request] --> B[Automated review]\n  B --> D{Valid?}\n  D -->|Yes| C[Approved]\n  D -->|No| E[Rejected]\n';
const diffData = {
  after: { label: 'Working tree', source: afterSource },
  before: { label: 'HEAD', source: beforeSource },
  fontFamily: 'vscode',
  density: 'comfortable',
  surface: { customColor: '#ffffff', pattern: 'dots', preset: 'editor' },
  summary: summarizeLineDiff(beforeSource, afterSource),
  title: 'Visual diff · approval-flow.mmd',
  theme: 'adaptive',
  type: 'visualDiffData',
};
const diffStub = stubFor(diffData, `
  await waitFor(() => document.querySelector('#before-diagram svg'), 'before preview');
  await waitFor(() => document.querySelector('#after-diagram svg'), 'after preview');
  await waitFor(() => document.querySelector('#overlay-before svg'), 'before overlay layer');
  await waitFor(() => document.querySelector('#overlay-after svg'), 'after overlay layer');
  await waitFor(() => document.querySelector('#semantic-diff[data-status="supported"]'), 'structural diff');
  const semanticChanges = [...document.querySelectorAll('.semantic-review__change')];
  if (semanticChanges.length !== 7) throw new Error('Expected 2 added nodes, 1 modified node, 3 added links and 1 removed link.');
  const modifiedNode = semanticChanges.find((button) => button.dataset.entity === 'node' && button.dataset.changeKind === 'modified');
  modifiedNode.click();
  if (modifiedNode.getAttribute('aria-pressed') !== 'true') throw new Error('Semantic selection was not retained.');
  if (!document.querySelector('#before-diagram .semantic-selected') || !document.querySelector('#after-diagram .semantic-selected')) {
    throw new Error('Selecting a modified node did not highlight both versions: ' + JSON.stringify([...document.querySelectorAll('#before-diagram .node, #after-diagram .node')].map((node) => ({id:node.id,dataId:node.getAttribute('data-id'), change:node.getAttribute('data-semantic-change')}))));
  }
  const addedEdge = semanticChanges.find((button) => button.dataset.entity === 'edge' && button.dataset.changeKind === 'added');
  addedEdge.click();
  if (!document.querySelector('#after-diagram .flowchart-link.semantic-selected')) throw new Error('Selecting an added edge did not locate its rendered path.');
  for (const [sourceSelector, overlaySelector, suffix] of [
    ['#before-diagram svg', '#overlay-before svg', 'before-1'],
    ['#after-diagram svg', '#overlay-after svg', 'after-1'],
  ]) {
    const sourceSvg = document.querySelector(sourceSelector);
    const overlaySvg = document.querySelector(overlaySelector);
    const sourceStyle = [...sourceSvg.querySelectorAll('style')].map((node) => node.textContent).join('\\n');
    const overlayStyle = [...overlaySvg.querySelectorAll('style')].map((node) => node.textContent).join('\\n');
    if (!sourceSvg.id || !sourceStyle.includes('#' + sourceSvg.id)) {
      throw new Error('The rendered diff fixture does not exercise an SVG ID selector.');
    }
    if (!overlayStyle.includes('#' + sourceSvg.id + '-' + suffix)) {
      throw new Error('The cloned overlay did not rewrite its SVG ID selector.');
    }
  }
  document.querySelector('#overlay-mode').click();
  await waitFor(() => !document.querySelector('#overlay-view').hidden, 'overlay mode');
  const opacity = document.querySelector('#overlay-opacity');
  opacity.value = '72';
  opacity.dispatchEvent(new Event('input', { bubbles: true }));
  if (document.querySelector('#overlay-opacity-value').textContent !== '72%') {
    throw new Error('Overlay opacity did not update.');
  }
  document.querySelector('#side-by-side-mode').click();
  if (document.querySelector('#diff-grid').hidden) throw new Error('Side-by-side mode did not restore.');
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) {
    throw new Error('Visual diff overflows horizontally at the desktop viewport.');
  }
  const groupedBefore = 'flowchart LR\\nsubgraph SG[Old group]\\nUser_Login[Old user] primary@--> API.v1[API]\\nend';
  const groupedAfter = 'flowchart LR\\nsubgraph SG[New group]\\nUser_Login[New user] primary@-->|Changed| API.v1[API]\\nend';
  window.postMessage({ ...initialData, before: {label:'HEAD', source:groupedBefore}, after: {label:'Working tree', source:groupedAfter} }, '*');
  await waitFor(() => document.querySelector('#after-diagram').dataset.renderSource === groupedAfter && document.querySelector('#after-diagram [data-semantic-change]'), 'grouped diff');
  const groupButton = [...document.querySelectorAll('.semantic-review__change')].find((button) => button.textContent.includes('Group SG'));
  groupButton.click();
  if (!document.querySelector('#before-diagram .cluster.semantic-selected') || !document.querySelector('#after-diagram .cluster.semantic-selected')) throw new Error('Subgraph identity was not matched in both SVGs.');
  document.querySelector('.semantic-review__change[data-entity="edge"]').click();
  if (!document.querySelector('#after-diagram .flowchart-link.semantic-selected')) throw new Error('Explicit edge ID was not matched.');
  window.postMessage({ ...initialData, before: {label:'HEAD', source:'sequenceDiagram\\nA->>B: hello'}, after: {label:'Working tree', source:'sequenceDiagram\\nA->>B: updated'} }, '*');
  await waitFor(() => document.querySelector('#semantic-diff').dataset.status === 'unsupported', 'unsupported diagram fallback');
  if (document.querySelector('.semantic-review__change') || document.querySelector('[data-semantic-change]')) {
    throw new Error('Unsupported diagrams retained stale structural changes.');
  }
  await waitFor(() => document.querySelector('#after-diagram').dataset.renderSource === 'sequenceDiagram\\nA->>B: updated', 'unsupported visual rendering retained');
  window.postMessage(initialData, '*');
  await waitFor(() => document.querySelector('#semantic-diff').dataset.status === 'supported' && document.querySelector('#after-diagram [data-semantic-change]'), 'restored structural diff');
  document.querySelector('.semantic-review__change[data-change-kind="modified"]').click();
  finish({
    afterLabel: document.querySelector('#after-label').textContent,
    beforeLabel: document.querySelector('#before-label').textContent,
    changed: document.querySelector('#diff-changed').textContent,
  });`);
let diffHtml = createVisualDiffWebviewHtml(options);
diffHtml = injectHarness(diffHtml, diffStub);
const diffPath = join(outputDirectory, 'visual-diff-harness.html');
writeFileSync(diffPath, diffHtml);
writeFileSync(join(outputDirectory, 'visual-diff-harness-http.html'), httpVersion(diffHtml));

const chrome = findChrome();
const galleryResult = await runBrowserHarness({
  chrome,
  compiledRoot,
  harnessPath: galleryPath,
  label: 'Diagram Studio',
  resultElementId: 'project-visual-results',
  windowSize: '1280,800',
});
const diffResult = await runBrowserHarness({
  chrome,
  compiledRoot,
  harnessPath: diffPath,
  label: 'Visual diff',
  resultElementId: 'project-visual-results',
  windowSize: '1280,800',
  screenshotPath: join(tmpdir(), 'mermaid-semantic-diff.png'),
});
const compactDiffResult = await runBrowserHarness({
  chrome,
  compiledRoot,
  harnessPath: diffPath,
  label: 'Compact visual diff',
  resultElementId: 'project-visual-results',
  windowSize: '390,844',
  screenshotPath: join(tmpdir(), 'mermaid-semantic-diff-compact.png'),
});
if (galleryResult.error) throw new Error(`Diagram Studio: ${galleryResult.error}`);
if (diffResult.error) throw new Error(`Visual diff: ${diffResult.error}`);
if (compactDiffResult.error) throw new Error(`Compact visual diff: ${compactDiffResult.error}`);
if (galleryResult.cards !== examples.length || galleryResult.createMessage?.type !== 'createDiagram') {
  throw new Error('Diagram Studio did not complete the gallery and creation workflow.');
}
if (diffResult.beforeLabel !== 'HEAD' || diffResult.afterLabel !== 'Working tree') {
  throw new Error('Visual diff did not preserve revision labels.');
}
console.log(`Project visual regression passed: ${DIAGRAM_TEMPLATES.length} templates, ${examples.length} examples, and Git diff interactions.`);

function injectHarness(html, stub) {
  const projectModule = `<script type="module" nonce="${nonce}" src="${script}"></script>`;
  if (!html.includes(projectModule)) {
    throw new Error('Could not locate the project module in the visual harness HTML.');
  }
  return html.replace(
    projectModule,
    `${stub}${projectModule}`,
  );
}

function stubFor(data, assertions) {
  return `<script nonce="${nonce}">
    const postedMessages = [];
    const initialData = ${safeJson(data)};
    const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const waitFor = async (predicate, label) => {
      const deadline = performance.now() + 30000;
      while (performance.now() < deadline) {
        if (predicate()) return;
        await delay(25);
      }
      throw new Error('Timed out while checking ' + label);
    };
    const finish = (result) => {
      const output = document.createElement('script');
      output.id = 'project-visual-results';
      output.type = 'application/json';
      output.textContent = JSON.stringify(result);
      document.body.append(output);
      document.body.dataset.projectVisualComplete = 'true';
    };
    document.body.className = 'vscode-dark';
    for (const [name, value] of Object.entries({
      '--vscode-editor-background': '#1e1e2e',
      '--vscode-editor-foreground': '#d7d7e0',
      '--vscode-foreground': '#d7d7e0',
      '--vscode-font-family': '-apple-system, BlinkMacSystemFont, sans-serif',
      '--vscode-font-size': '13px',
      '--vscode-editor-font-family': 'SFMono-Regular, Menlo, monospace',
      '--vscode-input-background': '#272638',
      '--vscode-input-foreground': '#f2f0f7',
      '--vscode-descriptionForeground': '#aaa7ba',
      '--vscode-panel-border': '#555268',
      '--vscode-button-background': '#7c3aed',
      '--vscode-button-hoverBackground': '#8b5cf6',
      '--vscode-button-foreground': '#ffffff',
      '--vscode-focusBorder': '#a78bfa',
      '--vscode-symbolIcon-keywordForeground': '#d783ff',
    })) document.documentElement.style.setProperty(name, value);
    globalThis.acquireVsCodeApi = () => ({
      getState: () => undefined,
      setState: () => undefined,
      postMessage: (message) => {
        postedMessages.push(message);
        if (message.type === 'ready') setTimeout(() => window.postMessage(${safeJson(data)}, '*'), 0);
      },
    });
    window.addEventListener('load', () => {
      (async () => { ${assertions} })().catch((error) => finish({ error: error instanceof Error ? error.message : String(error) }));
    });
  </script>`;
}

function httpVersion(html) {
  return html
    .replaceAll(script, '/dist/project-webview.js')
    .replaceAll(stylesheet, '/media/project.css')
    .replaceAll('img-src file:', "img-src 'self'")
    .replaceAll('style-src file:', "style-src 'self'")
    .replaceAll('script-src file:', "script-src 'self'");
}

function categoryOf(source) {
  const declaration = source.match(/^\s*([\w-]+)/u)?.[1]?.toLowerCase() ?? '';
  if (declaration.includes('sequence') || declaration.includes('class') || declaration.includes('state')) return 'UML';
  if (declaration.includes('architecture') || declaration.startsWith('c4')) return 'Architecture';
  if (declaration.includes('gantt') || declaration.includes('journey') || declaration.includes('timeline')) return 'Planning';
  if (declaration.includes('mindmap') || declaration.includes('treemap')) return 'Ideas';
  if (declaration.includes('flowchart') || declaration === 'graph') return 'Flow';
  return 'Other';
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) throw new Error('Chrome or Chromium is required for project visual regression tests.');
  return match;
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
