import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  examples,
  initialTab: 'templates',
  templates: DIAGRAM_TEMPLATES,
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
  summary: summarizeLineDiff(beforeSource, afterSource),
  title: 'Visual diff · approval-flow.mmd',
  type: 'visualDiffData',
};
const diffStub = stubFor(diffData, `
  await waitFor(() => document.querySelector('#before-diagram svg'), 'before preview');
  await waitFor(() => document.querySelector('#after-diagram svg'), 'after preview');
  await waitFor(() => document.querySelector('#overlay-before svg'), 'before overlay layer');
  await waitFor(() => document.querySelector('#overlay-after svg'), 'after overlay layer');
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
const galleryResult = runHarness(chrome, galleryPath, 'Diagram Studio');
const diffResult = runHarness(chrome, diffPath, 'visual diff');
if (galleryResult.cards !== examples.length || galleryResult.createMessage?.type !== 'createDiagram') {
  throw new Error('Diagram Studio did not complete the gallery and creation workflow.');
}
if (diffResult.beforeLabel !== 'HEAD' || diffResult.afterLabel !== 'Working tree') {
  throw new Error('Visual diff did not preserve revision labels.');
}
console.log(`Project visual regression passed: ${DIAGRAM_TEMPLATES.length} templates, ${examples.length} examples, and Git diff interactions.`);

function injectHarness(html, stub) {
  const projectModule = `<script type="module" nonce="${nonce}" src="${script}"></script>`;
  return html.replace(
    projectModule,
    `${stub}${projectModule}`,
  );
}

function stubFor(data, assertions) {
  return `<script nonce="${nonce}">
    const postedMessages = [];
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

function runHarness(chrome, path, label) {
  const result = spawnSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--allow-file-access-from-files',
    '--window-size=1280,800',
    '--virtual-time-budget=120000',
    '--dump-dom',
    pathToFileURL(path).href,
  ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || `${label} Chrome run failed.`);
  const match = /<script id="project-visual-results" type="application\/json">([\s\S]*?)<\/script>/u.exec(result.stdout);
  if (!match?.[1]) throw new Error(`${label} harness did not produce results.`);
  const actual = JSON.parse(match[1]);
  if (actual.error) throw new Error(`${label}: ${actual.error}`);
  return actual;
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
