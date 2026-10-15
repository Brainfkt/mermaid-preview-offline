import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runBrowserHarness } from './browser-harness.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compiledRoot = join(root, '.test-dist', 'src');
const { createGalleryWebviewHtml } = await import(pathToFileURL(join(compiledRoot, 'projectWebviewHtml.js')).href);
const { DIAGRAM_TEMPLATES } = await import(pathToFileURL(join(compiledRoot, 'diagramTemplates.js')).href);
const { createPersonalTemplate } = await import(pathToFileURL(join(compiledRoot, 'personalTemplates.js')).href);
const outputDirectory = mkdtempSync(join(tmpdir(), 'mermaid-personal-templates-'));
const scriptUri = pathToFileURL(join(root, 'dist', 'project-webview.js')).href;
const styleUri = pathToFileURL(join(root, 'media', 'project.css')).href;
const nonce = 'personal-templates-regression';
const source = 'flowchart LR\n A["{{literal}}"] --> B[Saved diagram]\n';
const data = {
  canSaveActive: true,
  density: 'comfortable',
  examples: [{ id: 'example', title: 'Example flow', category: 'Flow', fileName: 'example.mmd', source }],
  favorites: [],
  fontFamily: 'vscode',
  initialTab: 'templates',
  resetSelection: false,
  savedTemplates: [
    { ...createPersonalTemplate('Personal flow', source, 'personal.mmd'), origin: 'personal', key: 'personal:personal-flow' },
    { ...createPersonalTemplate('Project flow', source, 'project.mmd'), origin: 'project', projectName: 'Team', key: 'project:file:///team:project-flow' },
  ],
  surface: { customColor: '#ffffff', pattern: 'dots', preset: 'editor' },
  templates: DIAGRAM_TEMPLATES,
  theme: 'adaptive',
  type: 'galleryData',
};
const stub = `<script nonce="${nonce}">
  const galleryData = ${JSON.stringify(data).replaceAll('<', '\\u003c')};
  const posted = [];
  const errors = [];
  window.addEventListener('error', (event) => errors.push(event.message));
  window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
  const originalError = console.error;
  console.error = (...args) => { errors.push(args.join(' ')); originalError(...args); };
  document.body.className = 'vscode-dark';
  for (const [key, value] of Object.entries({
    '--vscode-editor-background': '#1e1e2e', '--vscode-editor-foreground': '#d7d7e0',
    '--vscode-foreground': '#d7d7e0', '--vscode-font-family': '-apple-system, sans-serif',
    '--vscode-font-size': '13px', '--vscode-input-background': '#272638',
    '--vscode-input-foreground': '#f2f0f7', '--vscode-descriptionForeground': '#aaa7ba',
    '--vscode-panel-border': '#555268', '--vscode-button-background': '#7c3aed',
    '--vscode-button-foreground': '#ffffff', '--vscode-focusBorder': '#a78bfa',
  })) document.documentElement.style.setProperty(key, value);
  globalThis.acquireVsCodeApi = () => ({
    getState: () => undefined, setState: () => undefined,
    postMessage(message) {
      posted.push(message);
      if (message.type === 'ready' || message.type === 'refreshTemplates') {
        setTimeout(() => window.postMessage(galleryData, '*'), 0);
      }
      if (message.type === 'setTemplateFavorite') {
        galleryData.favorites = message.favorite ? [message.key] : [];
        setTimeout(() => window.postMessage({ type: 'templateFavorites', favorites: galleryData.favorites }, '*'), 0);
      }
    },
  });
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitFor(predicate, label) {
    const deadline = performance.now() + 30000;
    while (performance.now() < deadline) { if (predicate()) return; await delay(25); }
    throw new Error('Timed out: ' + label);
  }
  function assert(value, message) { if (!value) throw new Error(message); }
  function finish(result) {
    const output = document.createElement('script'); output.id = 'personal-template-results';
    output.type = 'application/json'; output.textContent = JSON.stringify(result); document.body.append(output);
  }
  window.addEventListener('load', () => { (async () => {
    const query = (selector) => document.querySelector(selector);
    const filter = query('#template-library-filter');
    const selectLibrary = (name) => { filter.value = name; filter.dispatchEvent(new Event('change', { bubbles: true })); };
    const cards = () => [...document.querySelectorAll('.catalog-card')];
    await waitFor(() => cards().length === ${DIAGRAM_TEMPLATES.length + 2}, 'all templates');
    assert(document.title === 'Personal templates regression', 'Wrong page identity');
    selectLibrary('personal'); assert(cards().length === 1, 'Personal filter failed');
    cards()[0].click();
    await waitFor(() => query('#inspector-diagram svg'), 'personal preview');
    assert(query('#template-source').value.includes('{{literal}}'), 'Saved source interpreted as a placeholder');
    assert(query('#inspector-category').textContent.includes('Personal'), 'Personal origin missing');
    const edited = query('#template-source').value + ' B --> C[Unsaved edit]\\n';
    query('#template-source').value = edited;
    query('#template-source').dispatchEvent(new Event('input', { bubbles: true }));
    query('#favorite-template').click();
    await waitFor(() => query('#favorite-template').getAttribute('aria-pressed') === 'true', 'favorite persisted');
    assert(query('#template-source').value === edited, 'Favoriting discarded edits');
    selectLibrary('favorites'); assert(cards().length === 1, 'Favorites filter failed');
    query('#save-template').click();
    assert(posted.some((message) => message.type === 'saveTemplate' && message.source === edited), 'Save template omitted edited source');
    query('#save-active-template').click();
    assert(posted.some((message) => message.type === 'saveActiveTemplate'), 'Save current diagram action missing');
    query('#examples-tab').click();
    query('#template-source').value = edited;
    query('#refresh-templates').click();
    await delay(100);
    assert(query('#examples-tab').classList.contains('is-active'), 'Refresh changed the active tab');
    assert(query('#template-source').value === edited, 'Refresh discarded edits');
    query('#templates-tab').click(); selectLibrary('project');
    assert(cards().length === 1, 'Project filter failed'); cards()[0].click();
    assert(query('#inspector-category').textContent.includes('Project · Team'), 'Project origin missing');
    await waitFor(() => query('#inspector-diagram').dataset.renderSource === query('#template-source').value, 'project preview');
    assert(query('#inspector-error').hidden, 'Template render error');
    assert(document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, 'Horizontal viewport overflow');
    assert(errors.length === 0, 'Runtime/console errors: ' + errors.join('; '));
    finish({ filters: 3, favorites: true, sourcePreserved: true, saveActions: true, refreshPreserved: true, errors, title: document.title });
  })().catch((error) => finish({ error: error.message })); });
</script>`;
const html = createGalleryWebviewHtml({ cspSource: 'file:', nonce, scriptUri, styleUri, title: 'Personal templates regression' })
  .replace(`<script type="module" nonce="${nonce}" src="${scriptUri}"></script>`, `${stub}<script type="module" nonce="${nonce}" src="${scriptUri}"></script>`);
const harnessPath = join(outputDirectory, 'personal-templates.html');
writeFileSync(harnessPath, html);
const chrome = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((path) => existsSync(path));
if (!chrome) throw new Error('Chrome or Chromium is required for personal template regression.');
for (const [label, windowSize] of [['desktop', '1280,800'], ['mobile', '390,844']]) {
  const screenshotPath = join(outputDirectory, `personal-templates-${label}.png`);
  const result = await runBrowserHarness({ chrome, compiledRoot, harnessPath, label: `Personal templates ${label}`, resultElementId: 'personal-template-results', windowSize, screenshotPath });
  if (result.error) throw new Error(`Personal templates ${label}: ${result.error}`);
  console.log(`Personal template regression passed (${label}): ${JSON.stringify(result)}. Screenshot: ${screenshotPath}`);
}
