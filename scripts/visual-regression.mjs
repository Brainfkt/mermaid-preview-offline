import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const updateBaseline = process.argv.includes('--update');
const compiledRoot = join(root, '.test-dist', 'src');
const outputDirectory = join(root, '.test-dist', 'visual');
const baselinePath = join(root, 'test', 'visual', 'renderer-baseline.json');
const { createWebviewHtml } = await import(
  pathToFileURL(join(compiledRoot, 'webviewHtml.js')).href
);
const { imageMimeType, inlineLocalImages } = await import(
  pathToFileURL(join(compiledRoot, 'localImages.js')).href
);

const examples = await Promise.all(
  readdirSync(join(root, 'examples'))
    .filter((fileName) => fileName.endsWith('.mmd'))
    .sort()
    .map(async (fileName) => {
      const documentPath = join(root, 'examples', fileName);
      const source = readFileSync(documentPath, 'utf8');
      return {
        fileName,
        source: await inlineLocalImages(source, (reference) => {
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
        }),
      };
    }),
);

mkdirSync(outputDirectory, { recursive: true });
const nonce = 'visual-regression';
const webviewScript = pathToFileURL(join(root, 'dist', 'webview.js')).href;
const stylesheet = pathToFileURL(join(root, 'media', 'preview.css')).href;
let html = createWebviewHtml({
  cspSource: 'file:',
  nonce,
  scriptUri: webviewScript,
  styleUri: stylesheet,
  title: 'Mermaid visual regression',
});

const stub = `<script nonce="${nonce}">
  let persistedState;
  const postedMessages = [];
  globalThis.acquireVsCodeApi = () => ({
    getState: () => persistedState,
    setState: (state) => { persistedState = state; },
    postMessage: (message) => { postedMessages.push(message); },
  });
</script>`;
const runner = `<script nonce="${nonce}">
  const examples = ${safeJson(examples)};
  const schemes = [
    { name: 'light', className: 'vscode-light', background: '#ffffff', foreground: '#1f2328' },
    { name: 'dark', className: 'vscode-dark', background: '#1e1e2e', foreground: '#d7d7e0' },
    { name: 'high-contrast', className: 'vscode-high-contrast', background: '#000000', foreground: '#ffffff' },
  ];
  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const waitFor = async (predicate, label) => {
    const deadline = performance.now() + 20000;
    while (performance.now() < deadline) {
      if (predicate()) return;
      await delay(20);
    }
    throw new Error('Timed out while rendering ' + label);
  };
  const hash = (value) => {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16).padStart(8, '0');
  };
  const signature = (svg) => {
    let structure = '';
    let palette = '';
    for (const element of svg.querySelectorAll('*')) {
      const classes = [...element.classList]
        .filter((name) => !/^mermaid-preview-/u.test(name))
        .sort()
        .join('.');
      structure += '<' + element.tagName.toLowerCase() + (classes ? '.' + classes : '') + '>';
      for (const attribute of ['fill', 'stroke', 'color', 'class']) {
        const value = element.getAttribute(attribute);
        if (value) palette += attribute + '=' + value.replace(/mermaid-preview-\\d+/gu, 'mermaid-preview');
      }
    }
    const viewBox = svg.viewBox.baseVal;
    const textContent = [...svg.querySelectorAll('text, foreignObject')]
      .map((element) => element.textContent.replace(/\\s+/gu, ' ').trim())
      .filter(Boolean)
      .join('|');
    return {
      elementCount: svg.querySelectorAll('*').length,
      paletteHash: hash(palette),
      ratio: Number((viewBox.width / Math.max(viewBox.height, 1)).toFixed(4)),
      structureHash: hash(structure),
      textHash: hash(textContent),
    };
  };

  (async () => {
    const entries = [];
    const interfaceThemes = [];
    let version = 0;
    for (const scheme of schemes) {
      document.body.className = scheme.className;
      document.body.style.setProperty('--vscode-editor-background', scheme.background);
      document.body.style.setProperty('--vscode-editor-foreground', scheme.foreground);
      document.body.style.setProperty('--vscode-foreground', scheme.foreground);
      document.body.style.setProperty('--vscode-descriptionForeground', scheme.foreground + 'bb');
      document.body.style.setProperty('--vscode-panel-border', scheme.foreground + '55');
      document.body.style.setProperty('--vscode-button-background', '#7c3aed');
      document.body.style.setProperty('--vscode-button-foreground', '#ffffff');
      document.body.style.setProperty('--vscode-symbolIcon-keywordForeground', '#d783ff');
      document.body.style.setProperty('--vscode-focusBorder', '#9d72ff');
      document.body.style.setProperty('--vscode-contrastBorder', '#ffffff');
      window.postMessage({
        type: 'configuration',
        configuration: {
          diagramTheme: 'adaptive',
          largeFileThresholdBytes: 524288,
          refreshDelay: 0,
          refreshMode: 'automatic',
        },
      }, '*');
      await delay(50);
      const toolbarStyle = getComputedStyle(document.querySelector('.toolbar'));
      interfaceThemes.push({
        name: scheme.name,
        backdropFilter: toolbarStyle.backdropFilter,
        backgroundColor: toolbarStyle.backgroundColor,
        borderColor: toolbarStyle.borderColor,
        boxShadow: toolbarStyle.boxShadow,
      });

      for (const example of examples) {
        version += 1;
        window.postMessage({
          type: 'document',
          source: example.source,
          fileName: example.fileName,
          version,
          byteLength: example.source.length,
          isLargeFile: false,
        }, '*');
        await waitFor(
          () => document.querySelector('#diagram')?.dataset.version === String(version) ||
            !document.querySelector('#error-state')?.hidden,
          scheme.name + '/' + example.fileName,
        );
        if (!document.querySelector('#error-state').hidden) {
          throw new Error(scheme.name + '/' + example.fileName + ': ' + document.querySelector('#error-message').textContent);
        }
        const svg = document.querySelector('#diagram svg');
        if (!svg) throw new Error('Missing SVG for ' + example.fileName);
        entries.push({ fileName: example.fileName, scheme: scheme.name, ...signature(svg) });
      }
    }

    const sourceButton = document.querySelector('#open-source');
    sourceButton.click();
    if (!sourceButton.classList.contains('button--active') ||
        postedMessages.at(-1)?.type !== 'openSource') {
      throw new Error('The Source control did not request the text editor.');
    }

    const themeSelect = document.querySelector('#diagram-theme');
    const svgBeforeTheme = document.querySelector('#diagram svg');
    themeSelect.value = 'forest';
    themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(
      () => postedMessages.some((message) =>
        message.type === 'setDiagramTheme' && message.theme === 'forest'),
      'theme selection',
    );
    await waitFor(
      () => document.querySelector('#diagram svg') !== svgBeforeTheme,
      'theme rerender',
    );

    const svgBeforeRefresh = document.querySelector('#diagram svg');
    document.querySelector('#refresh').click();
    await waitFor(
      () => document.querySelector('#diagram svg') !== svgBeforeRefresh,
      'manual refresh',
    );

    const output = document.createElement('script');
    output.id = 'visual-results';
    output.type = 'application/json';
    output.textContent = JSON.stringify({ entries, interfaceThemes });
    document.body.append(output);
    document.body.dataset.visualComplete = 'true';
  })().catch((error) => {
    const output = document.createElement('script');
    output.id = 'visual-results';
    output.type = 'application/json';
    output.textContent = JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    document.body.append(output);
    document.body.dataset.visualComplete = 'error';
  });
</script>`;

html = html.replace(`<script nonce="${nonce}" src="${webviewScript}"></script>`, `${stub}<script nonce="${nonce}" src="${webviewScript}"></script>${runner}`);
const harnessPath = join(outputDirectory, 'harness.html');
writeFileSync(harnessPath, html);

const chrome = findChrome();
const result = spawnSync(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--allow-file-access-from-files',
    '--virtual-time-budget=120000',
    '--dump-dom',
    pathToFileURL(harnessPath).href,
  ],
  { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
);
if (result.status !== 0) {
  throw new Error(result.stderr || `Chrome exited with status ${result.status}`);
}

const match = /<script id="visual-results" type="application\/json">([\s\S]*?)<\/script>/u.exec(
  result.stdout,
);
if (!match?.[1]) {
  throw new Error('The visual regression harness did not produce results.');
}
const actual = JSON.parse(match[1]);
if (actual.error) {
  throw new Error(actual.error);
}
if (actual.entries.length !== examples.length * 3) {
  throw new Error(`Expected ${examples.length * 3} renders, received ${actual.entries.length}.`);
}

if (updateBaseline) {
  mkdirSync(dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, `${JSON.stringify(actual, null, 2)}\n`);
  console.log(`Updated ${baselinePath}`);
} else {
  const expected = JSON.parse(readFileSync(baselinePath, 'utf8'));
  compareResults(expected, actual);
  console.log(`Visual regression passed: ${actual.entries.length} renders across 3 themes.`);
}

function compareResults(expected, actual) {
  const unstableAttributeExamples = new Set(['08-gantt.mmd', '13-gitgraph.mmd']);
  const expectedByKey = new Map(
    expected.entries.map((entry) => [`${entry.scheme}/${entry.fileName}`, entry]),
  );
  const failures = [];
  for (const entry of actual.entries) {
    const key = `${entry.scheme}/${entry.fileName}`;
    const baseline = expectedByKey.get(key);
    if (!baseline) {
      failures.push(`${key}: missing baseline`);
      continue;
    }
    const exactProperties = unstableAttributeExamples.has(entry.fileName)
      ? ['elementCount', 'textHash']
      : ['elementCount', 'paletteHash', 'structureHash', 'textHash'];
    for (const property of exactProperties) {
      if (entry[property] !== baseline[property]) {
        failures.push(`${key}: ${property} changed (${baseline[property]} → ${entry[property]})`);
      }
    }
    const ratioDelta = Math.abs(entry.ratio - baseline.ratio) / Math.max(baseline.ratio, 0.001);
    if (ratioDelta > 0.18) {
      failures.push(`${key}: aspect ratio changed by ${Math.round(ratioDelta * 100)}%`);
    }
  }
  if (JSON.stringify(expected.interfaceThemes) !== JSON.stringify(actual.interfaceThemes)) {
    failures.push('VS Code light/dark/high-contrast surface styles changed');
  }
  if (failures.length) {
    throw new Error(`Visual regressions detected:\n- ${failures.join('\n- ')}\nRun npm run test:visual:update after reviewing intentional changes.`);
  }
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error('Chrome or Chromium is required for visual regression tests. Set CHROME_PATH to its executable.');
  }
  return match;
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
