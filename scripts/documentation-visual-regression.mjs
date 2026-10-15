import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runBrowserHarness } from './browser-harness.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compiledRoot = join(root, '.test-dist', 'src');
const outputDirectory = join(root, '.test-dist', 'documentation-visual');
const screenshotDirectory = process.env.DOCUMENTATION_SCREENSHOT_DIRECTORY;
const { createDocumentationWebviewHtml } = await import(
  pathToFileURL(join(compiledRoot, 'documentationWebviewHtml.js')).href
);
const nonce = 'documentation-visual-regression';
const script = pathToFileURL(join(root, 'dist', 'documentation-webview.js')).href;
const stylesheet = pathToFileURL(join(root, 'media', 'documentation.css')).href;
const documentationCss = readFileSync(join(root, 'media', 'documentation.css'), 'utf8');
if (
  !/--preview-glass:\s*color-mix\(in srgb,\s*var\(--vscode-editor-background\)\s*76%,\s*transparent\)/u
    .test(documentationCss)
) {
  throw new Error('Documentation controls do not reuse the main preview glass opacity.');
}
const blocks = [
  {
    endLine: 4,
    id: 'documentation-block-one',
    index: 0,
    source: 'flowchart LR\n  Source[Document source] --> Preview[Live preview]\n  Preview --> Export[Export]',
    startLine: 0,
  },
  {
    endLine: 10,
    id: 'documentation-block-two',
    index: 1,
    source: 'sequenceDiagram\n  Editor->>Preview: Update source\n  Preview-->>Editor: Render locally',
    startLine: 6,
  },
];
const documentationData = {
  blocks,
  density: 'comfortable',
  fileName: 'documentation.md',
  fontFamily: 'vscode',
  kind: 'markdown',
  maxHeight: '',
  mode: 'all',
  navigation: { controlsVisibility: 'always', mouseNavigation: 'always' },
  resizable: true,
  surface: { customColor: '#ffffff', pattern: 'none', preset: 'white' },
  theme: 'adaptive',
  totalBlocks: blocks.length,
  type: 'documentationData',
};
const lazyBlocks = Array.from({ length: 24 }, (_, index) => ({
  endLine: index * 5 + 3,
  id: `lazy-block-${index}`,
  index,
  source: `flowchart LR\n  A[Diagram ${index + 1}] --> B[Local preview]`,
  startLine: index * 5,
}));

mkdirSync(outputDirectory, { recursive: true });
if (screenshotDirectory) mkdirSync(screenshotDirectory, { recursive: true });
const normalPath = createHarness(
  'documentation-normal.html',
  normalAssertions(),
  blocks.length,
);
const presentationPath = createHarness(
  'documentation-presentation.html',
  presentationAssertions(),
  1,
);
const lazyPath = createHarness(
  'documentation-lazy.html',
  lazyAssertions(),
  1,
  { ...documentationData, blocks: lazyBlocks, totalBlocks: lazyBlocks.length },
  lazyInstrumentation(),
);
const chrome = findChrome();
const normalResult = await runBrowserHarness({
  chrome,
  compiledRoot,
  harnessPath: normalPath,
  label: 'Documentation preview compact controls',
  resultElementId: 'documentation-visual-results',
  screenshotPath: screenshotDirectory
    ? join(screenshotDirectory, 'mermaid-documentation-normal.png')
    : undefined,
  windowSize: '1440,900',
});
const presentationResult = await runBrowserHarness({
  chrome,
  compiledRoot,
  harnessPath: presentationPath,
  label: 'Documentation presentation controls',
  resultElementId: 'documentation-visual-results',
  screenshotPath: screenshotDirectory
    ? join(screenshotDirectory, 'mermaid-documentation-presentation.png')
    : undefined,
  windowSize: '1440,900',
});
const lazyResult = await runBrowserHarness({
  chrome,
  compiledRoot,
  harnessPath: lazyPath,
  label: 'Documentation rendering on demand',
  resultElementId: 'documentation-visual-results',
  windowSize: '1440,900',
});
if (normalResult.error) {
  throw new Error(`Documentation preview: ${normalResult.error}`);
}
if (presentationResult.error) {
  throw new Error(`Documentation presentation: ${presentationResult.error}`);
}
if (lazyResult.error) {
  throw new Error(`Documentation rendering on demand: ${lazyResult.error}`);
}
if (
  normalResult.cardCount !== blocks.length ||
  normalResult.sourceMessage?.type !== 'revealSource'
) {
  throw new Error('Documentation preview did not preserve diagram order and source navigation.');
}
if (
  presentationResult.themeMessage?.theme !== 'dark' ||
  presentationResult.densityMessage?.density !== 'compact' ||
  presentationResult.surfaceMessage?.surface?.preset !== 'custom' ||
  presentationResult.surfaceMessage?.surface?.customColor !== '#4f46e5' ||
  presentationResult.surfaceMessage?.surface?.pattern !== 'grid' ||
  presentationResult.counter !== `1 / ${blocks.length}`
) {
  throw new Error('Documentation presentation did not complete appearance and navigation interactions.');
}
console.log(
  `Documentation visual regression passed: ${blocks.length} ordered diagrams, translucent controls, shared appearance, circular custom swatch, aligned presentation controls, pagination, and Esc exit.`,
);
console.log(
  `Documentation rendering on demand passed: ${lazyResult.initialRendered}/${lazyBlocks.length} initial diagrams, scroll and active slide rendering, unchanged SVG/zoom preservation, deferred edits, complete export, and observer cleanup.`,
);

function createHarness(
  fileName,
  assertions,
  requiredRenderedDiagrams,
  data = documentationData,
  instrumentation = '',
) {
  const html = createDocumentationWebviewHtml({
    cspSource: 'file:',
    nonce,
    scriptUri: script,
    styleUri: stylesheet,
    title: 'Documentation visual regression',
  });
  const module = `<script type="module" nonce="${nonce}" src="${script}"></script>`;
  if (!html.includes(module)) {
    throw new Error('Could not locate the documentation module in the visual harness HTML.');
  }
  const harness = html.replace(
    module,
    `${stub(assertions, requiredRenderedDiagrams, data, instrumentation)}${module}`,
  );
  const path = join(outputDirectory, fileName);
  writeFileSync(path, harness);
  return path;
}

function stub(assertions, requiredRenderedDiagrams, data, instrumentation) {
  return `<script nonce="${nonce}">
    const postedMessages = [];
    const runtimeProblems = [];
    const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const waitFor = async (predicate, label) => {
      const deadline = performance.now() + 60000;
      while (performance.now() < deadline) {
        if (predicate()) return;
        await delay(25);
      }
      throw new Error('Timed out while checking ' + label);
    };
    const finish = (result) => {
      const output = document.createElement('script');
      output.id = 'documentation-visual-results';
      output.type = 'application/json';
      output.textContent = JSON.stringify(result);
      document.body.append(output);
    };
    const recordProblem = (kind, values) => {
      runtimeProblems.push(kind + ': ' + values.map((value) =>
        value instanceof Error ? value.message : String(value)
      ).join(' '));
    };
    const consoleError = console.error.bind(console);
    const consoleWarn = console.warn.bind(console);
    console.error = (...values) => {
      recordProblem('error', values);
      consoleError(...values);
    };
    console.warn = (...values) => {
      recordProblem('warning', values);
      consoleWarn(...values);
    };
    window.addEventListener('error', (event) => recordProblem('exception', [event.error ?? event.message]));
    window.addEventListener('unhandledrejection', (event) => recordProblem('rejection', [event.reason]));
    const assertConsoleHealth = () => {
      if (runtimeProblems.length) {
        throw new Error('Runtime console is not clean: ' + runtimeProblems.join(' | '));
      }
    };
    let currentData = ${safeJson(data)};
    ${instrumentation}
    document.body.className = 'vscode-dark';
    for (const [name, value] of Object.entries({
      '--vscode-editor-background': '#202337',
      '--vscode-editor-foreground': '#d8d9e7',
      '--vscode-foreground': '#d8d9e7',
      '--vscode-font-family': '-apple-system, BlinkMacSystemFont, sans-serif',
      '--vscode-font-size': '13px',
      '--vscode-editor-font-family': 'SFMono-Regular, Menlo, monospace',
      '--vscode-descriptionForeground': '#aaaec4',
      '--vscode-panel-border': '#555a72',
      '--vscode-button-background': '#8b5cf6',
      '--vscode-button-foreground': '#ffffff',
      '--vscode-list-hoverBackground': '#34384f',
      '--vscode-focusBorder': '#b694ff',
      '--vscode-errorForeground': '#ff6b81',
    })) document.documentElement.style.setProperty(name, value);
    globalThis.acquireVsCodeApi = () => ({
      postMessage: (message) => {
        postedMessages.push(message);
        if (message.type === 'ready') {
          setTimeout(() => window.postMessage(currentData, '*'), 0);
        } else if (message.type === 'setDiagramTheme') {
          currentData = { ...currentData, theme: message.theme };
          setTimeout(() => window.postMessage(currentData, '*'), 0);
        } else if (message.type === 'setDiagramDensity') {
          currentData = { ...currentData, density: message.density };
          setTimeout(() => window.postMessage(currentData, '*'), 0);
        } else if (message.type === 'setDiagramSurface') {
          currentData = { ...currentData, surface: message.surface };
          setTimeout(() => window.postMessage(currentData, '*'), 0);
        }
      },
    });
    window.addEventListener('load', () => {
      (async () => {
        await waitFor(
          () => document.querySelectorAll('.documentation-diagram > svg').length >= ${requiredRenderedDiagrams},
          'rendered documentation diagrams',
        );
        ${assertions}
      })().catch((error) => {
        finish({ error: error instanceof Error ? error.message : String(error) });
      });
    });
  </script>`;
}

function normalAssertions() {
  return `
    if (document.querySelector('.documentation-header, .documentation-card__header, #documentation-popout')) {
      throw new Error('A removed documentation header or Pop out control is still rendered.');
    }
    if (document.body.innerText.includes('Markdown')) {
      throw new Error('The document format label is still visible.');
    }
    const cards = [...document.querySelectorAll('.documentation-card')];
    if (cards.map((card) => card.dataset.blockId).join(',') !== currentData.blocks.map((block) => block.id).join(',')) {
      throw new Error('Documentation diagrams are not displayed in source order.');
    }
    const firstControls = cards[0].querySelector('.documentation-navigation-controls');
    const actions = [...firstControls.querySelectorAll('button')].map((button) => button.dataset.action);
    if (actions.join(',') !== 'zoom-out,fit,zoom-in,source') {
      throw new Error('Diagram actions are not grouped in the requested order.');
    }
    const sourceAction = firstControls.querySelector('[data-action="source"]');
    if (
      sourceAction.textContent.trim() ||
      !sourceAction.querySelector('svg.documentation-source-icon path[d*="l-4 16"]')
    ) {
      throw new Error('The Source only </> SVG icon is missing.');
    }
    const cardBounds = cards[0].getBoundingClientRect();
    const controlBounds = firstControls.getBoundingClientRect();
    if (controlBounds.top - cardBounds.top < 10 || cardBounds.right - controlBounds.right < 10) {
      throw new Error('Diagram controls do not respect their top-right margin.');
    }
    const present = document.querySelector('#documentation-present');
    const presentBounds = present.getBoundingClientRect();
    if (
      getComputedStyle(present).position !== 'fixed' ||
      !present.querySelector('svg') ||
      getComputedStyle(firstControls).backgroundColor !== getComputedStyle(present).backgroundColor ||
      getComputedStyle(firstControls).backdropFilter === 'none' ||
      innerWidth - presentBounds.right < 16 ||
      innerHeight - presentBounds.bottom < 16
    ) {
      throw new Error('The icon-labelled Present action is not fixed at bottom right.');
    }
    firstControls.querySelector('[data-action="source"]').click();
    await waitFor(() => postedMessages.some((message) => message.type === 'revealSource'), 'source action');
    assertConsoleHealth();
    finish({
      cardCount: cards.length,
      sourceMessage: postedMessages.find((message) => message.type === 'revealSource'),
    });`;
}

function presentationAssertions() {
  return `
    document.querySelector('#documentation-present').click();
    await waitFor(() => document.body.classList.contains('presentation'), 'presentation mode');
    const presentationControls = document.querySelector('#presentation-controls');
    const themeControl = document.querySelector('#presentation-theme-control');
    if (presentationControls.hidden || themeControl.hidden) {
      throw new Error('Presentation corner controls are hidden.');
    }
    if (presentationControls.textContent.includes('navigate') || presentationControls.textContent.includes('exit')) {
      throw new Error('Legacy presentation help text is still visible.');
    }
    if (document.querySelector('#presentation-exit').textContent.trim() !== 'Esc') {
      throw new Error('The presentation exit action is not labelled Esc.');
    }
    const activeToolbar = document.querySelector('.documentation-card:not([hidden]) .documentation-navigation-controls');
    const toolbarBounds = activeToolbar.getBoundingClientRect();
    const presentationBounds = presentationControls.getBoundingClientRect();
    const toolbarRightMargin = innerWidth - toolbarBounds.right;
    const paginationRightMargin = innerWidth - presentationBounds.right;
    if (
      getComputedStyle(activeToolbar).position !== 'fixed' ||
      toolbarBounds.top < 17 ||
      Math.abs(toolbarRightMargin - paginationRightMargin) > 0.5
    ) {
      throw new Error('Presentation zoom controls are not fixed to the same right margin as pagination.');
    }
    document.querySelector('#presentation-next').click();
    if (document.querySelector('#presentation-counter').textContent !== '2 / 2') {
      throw new Error('The next-diagram button did not update pagination.');
    }
    if (!document.querySelector('#presentation-next').disabled) {
      throw new Error('The next button remains enabled on the last diagram.');
    }
    document.querySelector('#presentation-theme').click();
    const themeMenu = document.querySelector('#presentation-theme-menu');
    if (
      themeMenu.hidden ||
      themeMenu.querySelectorAll('.theme-card').length !== 11 ||
      themeMenu.querySelector('[data-theme="adaptive"]').getAttribute('aria-pressed') !== 'true' ||
      !themeMenu.querySelector('[data-density="comfortable"]').classList.contains('is-active') ||
      !themeMenu.querySelector('[data-pattern="none"]').classList.contains('is-active') ||
      !themeMenu.querySelector('[data-surface="white"]').classList.contains('is-active')
    ) {
      throw new Error('Presentation did not inherit the complete shared appearance.');
    }
    const customSwatch = themeMenu.querySelector('.surface-swatch--custom');
    const customPreview = customSwatch.querySelector('.surface-swatch__custom-preview');
    if (
      customSwatch.classList.contains('is-active') ||
      !getComputedStyle(customPreview).backgroundImage.includes('conic-gradient') ||
      getComputedStyle(customPreview).borderRadius !== '50%'
    ) {
      throw new Error('Presentation does not show an inactive circular Custom checkerboard.');
    }
    themeMenu.querySelector('[data-theme="dark"]').click();
    await waitFor(
      () => postedMessages.some((message) => message.type === 'setDiagramTheme' && message.theme === 'dark'),
      'shared theme update',
    );
    await waitFor(
      () => themeMenu.querySelector('[data-theme="dark"]').getAttribute('aria-pressed') === 'true',
      'selected Dark theme',
    );
    themeMenu.querySelector('[data-density="compact"]').click();
    await waitFor(
      () => postedMessages.some((message) => message.type === 'setDiagramDensity' && message.density === 'compact'),
      'shared density update',
    );
    themeMenu.querySelector('[data-pattern="grid"]').click();
    await waitFor(
      () => postedMessages.some((message) => message.type === 'setDiagramSurface' && message.surface.pattern === 'grid'),
      'shared pattern update',
    );
    await waitFor(
      () => themeMenu.querySelector('[data-pattern="grid"]').classList.contains('is-active'),
      'selected Grid pattern',
    );
    themeMenu.querySelector('[data-surface="soft-blue"]').click();
    await waitFor(
      () => postedMessages.some((message) =>
        message.type === 'setDiagramSurface' &&
        message.surface.preset === 'soft-blue' &&
        message.surface.pattern === 'grid'
      ),
      'shared canvas background update',
    );
    await waitFor(
      () => getComputedStyle(document.documentElement)
        .getPropertyValue('--diagram-canvas-background').trim().toLowerCase() === '#eff6ff' &&
        document.querySelector('.documentation-card:not([hidden]) svg'),
      'settled Soft blue canvas background',
    );
    const customInput = themeMenu.querySelector('#presentation-surface-custom-color');
    const customMessageStart = postedMessages.length;
    const customSvgBeforeDrag = document.querySelector(
      '.documentation-card:not([hidden]) svg',
    );
    for (const color of ['#7c3aed', '#2563eb', '#4f46e5']) {
      customInput.value = color;
      customInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await delay(80);
    if (
      postedMessages.slice(customMessageStart)
        .some((message) => message.type === 'setDiagramSurface') ||
      document.querySelector('.documentation-card:not([hidden]) svg') !== customSvgBeforeDrag ||
      getComputedStyle(document.documentElement)
        .getPropertyValue('--diagram-canvas-background').trim().toLowerCase() !== '#4f46e5'
    ) {
      throw new Error('Presentation Custom dragging did not stay a CSS-only canvas preview.');
    }
    customInput.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(
      () => postedMessages.slice(customMessageStart).some((message) =>
        message.type === 'setDiagramSurface' &&
        message.surface.preset === 'custom' &&
        message.surface.customColor === '#4f46e5' &&
        message.surface.pattern === 'grid'
      ),
      'shared custom canvas color update',
    );
    if (
      postedMessages.slice(customMessageStart)
        .filter((message) => message.type === 'setDiagramSurface').length !== 1
    ) {
      throw new Error('Presentation emitted more than one surface update for one color gesture.');
    }
    await waitFor(
      () => customSwatch.classList.contains('is-active') &&
        getComputedStyle(customPreview).backgroundColor === 'rgb(79, 70, 229)' &&
        getComputedStyle(customPreview).backgroundImage === 'none',
      'selected Custom swatch color',
    );
    if (themeMenu.getBoundingClientRect().top < 0 || themeMenu.getBoundingClientRect().right > innerWidth) {
      throw new Error('The complete Appearance panel overflows the presentation viewport.');
    }
    document.querySelector('#presentation-appearance-close').click();
    if (!themeMenu.hidden) {
      throw new Error('The Appearance panel close button did not close the panel.');
    }
    document.querySelector('#presentation-exit').click();
    if (document.body.classList.contains('presentation')) {
      throw new Error('The Esc button did not exit presentation mode.');
    }
    document.querySelector('#documentation-present').click();
    await waitFor(() => document.body.classList.contains('presentation'), 'restored presentation mode');
    document.querySelector('#presentation-theme').click();
    if (themeMenu.hidden) {
      throw new Error('The complete Appearance panel did not reopen.');
    }
    assertConsoleHealth();
    finish({
      counter: document.querySelector('#presentation-counter').textContent,
      densityMessage: postedMessages.find((message) => message.type === 'setDiagramDensity'),
      surfaceMessage: postedMessages.findLast((message) => message.type === 'setDiagramSurface'),
      themeMessage: postedMessages.find((message) => message.type === 'setDiagramTheme'),
    });`;
}

function lazyInstrumentation() {
  return `
    const diagramWrites = [];
    let detachedDiagramWrites = 0;
    const innerHtml = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(Element.prototype, 'innerHTML', {
      ...innerHtml,
      set(value) {
        if (this.classList.contains('documentation-diagram')) {
          if (!this.isConnected) detachedDiagramWrites += 1;
          diagramWrites.push(this.closest('.documentation-card')?.dataset.blockId);
        }
        innerHtml.set.call(this, value);
      },
    });
    const observedCards = new Map();
    const NativeIntersectionObserver = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class extends NativeIntersectionObserver {
      constructor(callback, options) {
        super(callback, options);
        observedCards.set(this, new Set());
      }
      observe(target) {
        observedCards.get(this).add(target);
        super.observe(target);
      }
      unobserve(target) {
        observedCards.get(this).delete(target);
        super.unobserve(target);
      }
      disconnect() {
        observedCards.get(this).clear();
        super.disconnect();
      }
    };`;
}

function lazyAssertions() {
  return `
    const card = (index) => document.querySelector('[data-block-id="lazy-block-' + index + '"]');
    const diagram = (index) => card(index)?.querySelector('.documentation-diagram > svg');
    const renderedCount = () => document.querySelectorAll('.documentation-diagram > svg').length;
    const settleRendering = async () => {
      await delay(100);
      await waitFor(
        () => !document.querySelector('.documentation-card[data-render-state="rendering"]'),
        'settled visible render queue',
      );
    };
    const updateBlock = (index, source) => {
      currentData = {
        ...currentData,
        blocks: currentData.blocks.map((block) => block.index === index ? { ...block, source } : block),
      };
      window.postMessage(currentData, '*');
    };
    await settleRendering();
    const initialRendered = renderedCount();
    if (initialRendered < 2 || initialRendered > 5 || diagram(12) || diagram(23)) {
      throw new Error('The initial preview rendered distant diagrams instead of visible/nearby cards.');
    }
    if (card(23).getBoundingClientRect().height < 160 ||
        card(23).querySelector('.documentation-canvas').getAttribute('aria-busy') !== 'true') {
      throw new Error('Deferred diagrams do not preserve a usable placeholder.');
    }

    // Export must include every source even though most UI cards are still deferred.
    window.postMessage({
      blocks: currentData.blocks.map((block) => ({
        fileName: 'diagram-' + block.index + '.mmd', id: block.id, source: block.source,
      })),
      fontFamily: currentData.fontFamily,
      maxRasterPixels: 32000000,
      requestId: 'lazy-export-all',
      settings: { format: 'svg' },
      sourceUri: 'file:///documentation-lazy.md',
      type: 'renderDocumentationExport',
    }, '*');
    await waitFor(
      () => postedMessages.some((message) => message.requestId === 'lazy-export-all'),
      'export of deferred diagrams',
    );
    const exported = postedMessages.find((message) => message.requestId === 'lazy-export-all');
    if (exported.type !== 'documentationExportResult' ||
        exported.artifacts.length !== currentData.blocks.length ||
        !exported.artifacts.every((entry, index) =>
          entry.blockId === currentData.blocks[index].id && entry.artifact.dataBase64.length > 0)) {
      throw new Error('The document export omitted a deferred diagram: ' + JSON.stringify(exported));
    }
    if (renderedCount() !== initialRendered) {
      throw new Error('Export unnecessarily rendered deferred preview cards.');
    }

    const firstSvg = diagram(0);
    card(0).querySelector('[data-action="zoom-in"]').click();
    await delay(50);
    const zoomedWidth = firstSvg.style.width;
    updateBlock(1, 'flowchart LR\\n  A[Edited visible diagram] --> B[Saved]');
    await waitFor(() => diagram(1)?.textContent.includes('Edited visible diagram'), 'edited visible diagram');
    if (diagram(0) !== firstSvg || firstSvg.style.width !== zoomedWidth) {
      throw new Error('Editing a nearby block reset the unchanged SVG or zoom.');
    }
    updateBlock(23, 'flowchart LR\\n  A[Deferred latest source] --> B[Saved]');
    await settleRendering();
    if (diagram(23)) throw new Error('An off-screen source edit eagerly rendered its card.');
    if ([...observedCards.values()].some((targets) => [...targets].some((target) => !target.isConnected))) {
      throw new Error('Replaced cards remain observed.');
    }

    card(12).scrollIntoView({ block: 'start' });
    await waitFor(() => diagram(12), 'diagram after scrolling into view');
    await settleRendering();
    if (renderedCount() <= initialRendered || diagram(23) || diagram(22)) {
      throw new Error('Scrolling did not render nearby cards selectively.');
    }
    if (diagram(0) !== firstSvg || firstSvg.style.width !== zoomedWidth) {
      throw new Error('Scrolling discarded the existing diagram or its zoom.');
    }

    document.querySelector('#documentation-present').click();
    const writesBeforeJump = diagramWrites.length;
    for (let index = 0; index < 22; index += 1) document.querySelector('#presentation-next').click();
    await waitFor(() => diagram(22), 'active deferred presentation slide');
    await settleRendering();
    if (document.querySelector('#presentation-counter').textContent !== '23 / 24' ||
        diagramWrites.slice(writesBeforeJump).some((id) => id !== 'lazy-block-22') ||
        diagram(23)) {
      throw new Error('Presentation rendered skipped slides ahead of its active slide.');
    }
    document.querySelector('#presentation-next').click();
    await waitFor(() => diagram(23)?.textContent.includes('Deferred latest source'), 'deferred edit in presentation');

    // Multiple queued source updates must never write into detached cards.
    updateBlock(23, 'flowchart LR\\n  A[Obsolete source] --> B[Old]');
    updateBlock(23, 'flowchart LR\\n  A[Latest source after rapid edits] --> B[Current]');
    await waitFor(
      () => diagram(23)?.textContent.includes('Latest source after rapid edits'),
      'latest presentation source after rapid edits',
    );
    await settleRendering();
    if (detachedDiagramWrites || diagram(0) !== firstSvg || firstSvg.style.width !== zoomedWidth) {
      throw new Error('A stale render wrote into a detached card or reset an unchanged diagram.');
    }
    document.querySelector('#presentation-exit').click();
    card(0).scrollIntoView({ block: 'start' });
    await settleRendering();
    if (diagram(0) !== firstSvg || firstSvg.style.width !== zoomedWidth) {
      throw new Error('Exiting presentation reset the unchanged diagram state.');
    }
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    if ([...observedCards.values()].some((targets) => targets.size) ||
        document.querySelector('.documentation-navigation-controls')) {
      throw new Error('Closing the preview did not disconnect observers and diagram controllers.');
    }
    assertConsoleHealth();
    finish({ initialRendered, exported: exported.artifacts.length, detachedDiagramWrites });`;
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
    throw new Error('Chrome or Chromium is required for documentation visual regression tests.');
  }
  return match;
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
