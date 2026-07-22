import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runBrowserHarness } from './browser-harness.mjs';

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
  let resolveWebviewReady;
  const webviewReady = new Promise((resolve) => { resolveWebviewReady = resolve; });
  globalThis.acquireVsCodeApi = () => ({
    getState: () => persistedState,
    setState: (state) => { persistedState = state; },
    postMessage: (message) => {
      postedMessages.push(message);
      if (message.type === 'ready') resolveWebviewReady();
    },
  });
</script>`;
const runner = `<script nonce="${nonce}">
  const examples = ${safeJson(examples)};
  const captureExport = new URLSearchParams(window.location.search).has('capture-export');
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
    await webviewReady;
    const entries = [];
    const interfaceThemes = [];
    let version = 0;
    for (const scheme of captureExport ? schemes.slice(0, 1) : schemes) {
      document.body.className = scheme.className;
      document.body.style.setProperty('--vscode-editor-background', scheme.background);
      document.body.style.setProperty('--vscode-editor-foreground', scheme.foreground);
      document.body.style.setProperty('--vscode-foreground', scheme.foreground);
      document.body.style.setProperty('--vscode-font-family', '-apple-system, BlinkMacSystemFont, sans-serif');
      document.body.style.setProperty('--vscode-font-size', '13px');
      document.body.style.setProperty('--vscode-input-background', scheme.background);
      document.body.style.setProperty('--vscode-input-foreground', scheme.foreground);
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
          diagramDensity: 'comfortable',
          diagramFontFamily: 'noto-sans',
          diagramSurface: { customColor: '#ffffff', pattern: 'dots', preset: 'editor' },
          diagramTheme: 'adaptive',
          largeFileThresholdBytes: 524288,
          minimapEnabled: true,
          navigation: { controlsVisibility: 'always', mouseNavigation: 'always' },
          refreshDelay: 0,
          refreshMode: 'automatic',
        },
      }, '*');
      await delay(50);
      const toolbarStyle = getComputedStyle(document.querySelector('.toolbar'));
      const workspaceBounds = document.querySelector('#workspace').getBoundingClientRect();
      const viewportBounds = document.querySelector('#viewport').getBoundingClientRect();
      const toolbarBounds = document.querySelector('.toolbar').getBoundingClientRect();
      const statusbarBounds = document.querySelector('.statusbar').getBoundingClientRect();
      if (Math.abs(viewportBounds.top) > 1 ||
          Math.abs(viewportBounds.bottom - document.documentElement.clientHeight) > 1 ||
          Math.abs(workspaceBounds.height - viewportBounds.height) > 1 ||
          toolbarBounds.top < viewportBounds.top ||
          toolbarBounds.bottom <= viewportBounds.top ||
          Math.abs(statusbarBounds.bottom - viewportBounds.bottom) > 1 ||
          getComputedStyle(document.querySelector('.toolbar')).position !== 'absolute' ||
          getComputedStyle(document.querySelector('.statusbar')).position !== 'absolute') {
        throw new Error('The preview surface does not extend underneath the toolbar and footer.');
      }
      if (scheme.name !== 'high-contrast' && toolbarStyle.backdropFilter === 'none') {
        throw new Error(scheme.name + ': the toolbar glass backdrop filter is missing.');
      }
      interfaceThemes.push({
        name: scheme.name,
        backdropFilter: toolbarStyle.backdropFilter,
        backgroundColor: toolbarStyle.backgroundColor,
        borderColor: toolbarStyle.borderColor,
        boxShadow: toolbarStyle.boxShadow,
      });

      for (const example of captureExport ? examples.slice(0, 1) : examples) {
        version += 1;
        window.postMessage({
          type: 'document',
          source: example.source,
          fileName: example.fileName,
          sourceUri: 'file:///examples/' + example.fileName,
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
        const diagramText = svg.querySelector('text, foreignObject *');
        if (diagramText &&
            !getComputedStyle(diagramText).fontFamily.includes('Mermaid Offline Noto Sans')) {
          throw new Error('The deterministic visual regression font is not applied to ' +
            example.fileName);
        }
        entries.push({ fileName: example.fileName, scheme: scheme.name, ...signature(svg) });
      }
    }

    document.body.className = 'vscode-dark';
    document.body.style.setProperty('--vscode-editor-background', '#1e1e2e');
    document.body.style.setProperty('--vscode-editor-foreground', '#d7d7e0');
    document.body.style.setProperty('--vscode-foreground', '#d7d7e0');
    document.body.style.setProperty('--vscode-font-family', '-apple-system, BlinkMacSystemFont, sans-serif');
    document.body.style.setProperty('--vscode-font-size', '13px');
    document.body.style.setProperty('--vscode-input-background', '#1e1e2e');
    document.body.style.setProperty('--vscode-input-foreground', '#d7d7e0');
    document.body.style.setProperty('--vscode-descriptionForeground', '#d7d7e0bb');
    document.body.style.setProperty('--vscode-panel-border', '#d7d7e055');
    await delay(80);

    const layoutButton = document.querySelector('#editor-layout');
    const layoutMessageStart = postedMessages.length;
    layoutButton.click();
    const layoutMessages = postedMessages.slice(layoutMessageStart);
    if (layoutMessages.length !== 1 || layoutMessages[0]?.type !== 'chooseEditorMode') {
      throw new Error('The layout control did not emit one native editor choice request.');
    }
    for (const [mode, label] of [
      ['preview', 'Preview'],
      ['beside', 'Beside'],
      ['above', 'Above'],
      ['source', 'Source'],
    ]) {
      window.postMessage({ type: 'editorMode', mode }, '*');
      await waitFor(
        () => document.querySelector('#editor-layout-label')?.textContent === label,
        mode + ' native editor layout label',
      );
    }

    if (document.querySelector('#fullscreen') || document.querySelector('#pan-mode')) {
      throw new Error('Removed full-screen or pan-mode controls are still visible.');
    }
    document.querySelector('#open-new-window').click();
    if (postedMessages.at(-1)?.type !== 'openInNewWindow') {
      throw new Error('The new-window control did not request a detached preview.');
    }

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));
    if (getComputedStyle(document.querySelector('.toolbar')).display === 'none') {
      throw new Error('The toolbar must remain visible.');
    }

    const themeSelect = document.querySelector('[data-theme="forest"]');
    const svgBeforeTheme = document.querySelector('#diagram svg');
    themeSelect.click();
    await waitFor(
      () => postedMessages.some((message) =>
        message.type === 'setDiagramTheme' && message.theme === 'forest'),
      'theme selection',
    );
    await waitFor(
      () => document.querySelector('#diagram svg') !== svgBeforeTheme,
      'theme rerender',
    );
    for (const theme of [
      'default', 'dark', 'forest', 'neutral', 'base', 'neo', 'neo-dark',
      'redux-color', 'redux-dark-color', 'sketch', 'adaptive',
    ]) {
      const previousSvg = document.querySelector('#diagram svg');
      document.querySelector('[data-theme="' + theme + '"]').click();
      await waitFor(
        () => document.querySelector('#diagram svg') !== previousSvg,
        theme + ' appearance render',
      );
    }

    const accentedSource =
      'flowchart LR\\n  A["Échéance · coût · façade · cœur"] --> B["naïve · déjà · Ç"]';
    version += 1;
    window.postMessage({
      type: 'document',
      source: accentedSource,
      fileName: 'accented-labels.mmd',
      sourceUri: 'file:///examples/accented-labels.mmd',
      version,
      byteLength: accentedSource.length,
      isLargeFile: false,
    }, '*');
    await waitFor(
      () => document.querySelector('#diagram')?.dataset.version === String(version),
      'accented labels',
    );
    if (!document.querySelector('#diagram svg')?.textContent.includes('Échéance · coût · façade · cœur')) {
      throw new Error('The renderer did not preserve the accented diagram labels.');
    }
    document.querySelector('#search-open').click();
    const searchInput = document.querySelector('#diagram-search-input');
    searchInput.value = 'Échéance';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await waitFor(
      () => document.querySelectorAll('.diagram-search-hit').length === 1,
      'diagram search highlight',
    );
    document.querySelector('#diagram-search-close').click();
    const sourceNode = document.querySelector('#diagram g.node');
    sourceNode.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 }));
    sourceNode.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 1, clientY: 1 }));
    await waitFor(
      () => postedMessages.some((message) => message.type === 'revealSourceLine' && message.line === 1),
      'click to source',
    );
    document.querySelector('[data-surface="midnight"]').click();
    await waitFor(
      () => postedMessages.some((message) => message.type === 'setDiagramSurface' && message.surface.preset === 'midnight'),
      'canvas surface selection',
    );
    document.querySelector('[data-density="compact"]').click();
    await waitFor(
      () => postedMessages.some((message) => message.type === 'setDiagramDensity' && message.density === 'compact'),
      'diagram density selection',
    );
    for (const [fontFamily, cssFamily] of [
      ['inter', 'Mermaid Offline Inter'],
      ['noto-sans', 'Mermaid Offline Noto Sans'],
      ['vscode', '-apple-system'],
    ]) {
      const previousSvg = document.querySelector('#diagram svg');
      window.postMessage({
        type: 'configuration',
        configuration: {
          diagramDensity: 'comfortable',
          diagramFontFamily: fontFamily,
          diagramSurface: { customColor: '#ffffff', pattern: 'dots', preset: 'editor' },
          diagramTheme: 'forest',
          largeFileThresholdBytes: 524288,
          minimapEnabled: true,
          navigation: { controlsVisibility: 'always', mouseNavigation: 'always' },
          refreshDelay: 0,
          refreshMode: 'automatic',
        },
      }, '*');
      await waitFor(
        () => document.querySelector('#diagram svg') !== previousSvg,
        fontFamily + ' font rerender',
      );
      const text = document.querySelector('#diagram svg text, #diagram svg foreignObject *');
      if (!text || !getComputedStyle(text).fontFamily.includes(cssFamily)) {
        throw new Error(fontFamily + ': selected font is not applied to diagram text.');
      }
      if (fontFamily !== 'vscode' &&
          !document.fonts.check('400 16px "' + cssFamily + '"', 'Échéance · cœur · Łódź')) {
        throw new Error(fontFamily + ': bundled Latin fonts are not ready.');
      }
    }

    const svgBeforeRefresh = document.querySelector('#diagram svg');
    document.querySelector('#refresh').click();
    await waitFor(
      () => document.querySelector('#diagram svg') !== svgBeforeRefresh,
      'manual refresh',
    );

    if (document.querySelector('#file-size')?.textContent === '0 B' ||
        !/px$/u.test(document.querySelector('#diagram-size')?.textContent ?? '')) {
      throw new Error('File size or natural diagram dimensions are missing.');
    }

    const minimapExample = examples.find((example) => example.fileName === '02-flowchart-elk.mmd');
    if (!minimapExample) throw new Error('Missing flowchart minimap fixture.');
    version += 1;
    window.postMessage({
      type: 'document',
      source: minimapExample.source,
      fileName: minimapExample.fileName,
      sourceUri: 'file:///examples/' + minimapExample.fileName,
      version,
      byteLength: minimapExample.source.length,
      isLargeFile: false,
    }, '*');
    await waitFor(
      () => document.querySelector('#diagram')?.dataset.version === String(version),
      'flowchart minimap fidelity fixture',
    );

    const minimapTestViewport = document.querySelector('#viewport');
    minimapTestViewport.style.width = '180px';
    minimapTestViewport.style.height = '120px';
    for (let index = 0; index < 26; index += 1) {
      document.querySelector('#zoom-in').click();
    }
    await delay(250);
    if (document.querySelector('#minimap').hidden) {
      throw new Error('Large diagram minimap stayed hidden: ' + JSON.stringify({
        clientHeight: minimapTestViewport.clientHeight,
        clientWidth: minimapTestViewport.clientWidth,
        diagramHidden: document.querySelector('#diagram').hidden,
        minimapImage: Boolean(document.querySelector('#minimap-diagram img')),
        scrollHeight: minimapTestViewport.scrollHeight,
        scrollWidth: minimapTestViewport.scrollWidth,
        zoom: document.querySelector('#zoom-status').textContent,
      }));
    }
    const minimapImage = document.querySelector('#minimap-diagram img');
    await waitFor(
      () => minimapImage?.complete && minimapImage.naturalWidth > 0,
      'isolated minimap SVG image',
    );
    const svgRootId = document.querySelector('#diagram svg')?.id;
    if (!minimapImage.src.startsWith('blob:') ||
        !svgRootId ||
        document.querySelector('#minimap-diagram svg')) {
      throw new Error('The minimap did not use an isolated Blob-backed SVG image.');
    }
    minimapTestViewport.style.width = '';
    minimapTestViewport.style.height = '';
    await delay(80);
    minimapTestViewport.scrollTo({ left: 600, top: 60 });
    await delay(80);
    const overlayViewportBounds = minimapTestViewport.getBoundingClientRect();
    const overlayToolbarBounds = document.querySelector('.toolbar').getBoundingClientRect();
    const overlayStatusbarBounds = document.querySelector('.statusbar').getBoundingClientRect();
    const overlaySvgBounds = document.querySelector('#diagram svg').getBoundingClientRect();
    if (Math.abs(overlayViewportBounds.height - document.documentElement.clientHeight) > 1 ||
        overlaySvgBounds.top >= overlayToolbarBounds.bottom ||
        overlaySvgBounds.bottom <= overlayToolbarBounds.top ||
        overlaySvgBounds.left >= overlayToolbarBounds.right ||
        overlaySvgBounds.right <= overlayToolbarBounds.left ||
        overlaySvgBounds.bottom <= overlayStatusbarBounds.top) {
      throw new Error('A zoomed diagram does not continue underneath both interface overlays.');
    }
    if (new URLSearchParams(window.location.search).has('capture-overlay')) {
      document.body.dataset.visualComplete = 'capture';
      return;
    }
    document.querySelector('#fit').click();

    window.postMessage({
      type: 'exportConfiguration',
      profiles: [],
      settings: {
        background: 'transparent',
        backgroundColor: '#ffffff',
        previewBackgroundColor: '#ffffff',
        density: 'comfortable',
        dpi: 144,
        fileNameTemplate: '{name}-{theme}@{scale}x.{format}',
        format: 'png',
        includeMetadata: true,
        margin: 24,
        optimizeSvg: true,
        scale: 1,
        svgVariant: 'optimized',
        theme: 'default',
      },
    }, '*');
    await waitFor(
      () => document.querySelector('#export-dpi').value === '144' &&
        document.querySelector('#export-metadata').checked,
      'professional export configuration',
    );
    document.querySelector('#export-open').click();
    await waitFor(
      () => document.querySelector('#export-dialog').open,
      'professional export dialog',
    );
    if (!document.querySelector('#export-metadata').checked) {
      throw new Error('Opening the professional export dialog reset the metadata setting.');
    }
    await waitFor(
      () => document.querySelector('#export-preview-image').src.startsWith('data:image/png') ||
        !document.querySelector('#export-preview-error').hidden,
      'professional export preview result',
    );
    if (!document.querySelector('#export-preview-error').hidden) {
      throw new Error('The professional export preview reports: ' +
        document.querySelector('#export-preview-error').textContent);
    }
    const exportFormat = document.querySelector('#export-format');
    exportFormat.value = 'webp';
    exportFormat.dispatchEvent(new Event('change', { bubbles: true }));
    const exportTheme = document.querySelector('#export-theme');
    exportTheme.value = 'dark';
    exportTheme.dispatchEvent(new Event('change', { bubbles: true }));
    const exportDpi = document.querySelector('#export-dpi');
    exportDpi.value = '300';
    exportDpi.dispatchEvent(new Event('input', { bubbles: true }));
    const exportScale = document.querySelector('#export-scale');
    exportScale.value = '0.5';
    exportScale.dispatchEvent(new Event('input', { bubbles: true }));
    const exportBackground = document.querySelector('#export-background');
    exportBackground.value = 'color';
    exportBackground.dispatchEvent(new Event('change', { bubbles: true }));
    const exportColor = document.querySelector('#export-background-color');
    exportColor.value = '#1e1e2e';
    exportColor.dispatchEvent(new Event('input', { bubbles: true }));
    await waitFor(
      () => /300 DPI · WEBP/u.test(document.querySelector('#export-preview-metrics').textContent),
      'updated WebP export preview',
    );
    if (!document.querySelector('#export-metadata').checked) {
      throw new Error('Updating the professional export form reset the metadata setting.');
    }
    document.querySelector('#export-folder').click();
    if (postedMessages.at(-1)?.type !== 'exportFolder' ||
        postedMessages.at(-1)?.settings?.format !== 'webp') {
      throw new Error('Folder export did not forward the selected settings.');
    }
    if (!document.querySelector('#export-metadata').checked) {
      throw new Error('The professional export dialog lost the metadata setting.');
    }
    const optimizedCopyStart = postedMessages.length;
    document.querySelector('#export-copy-svg-optimized').click();
    await waitFor(
      () => postedMessages.slice(optimizedCopyStart).some((message) =>
        message.type === 'copySvg') || !document.querySelector('#export-preview-error').hidden,
      'optimized SVG clipboard export result',
    );
    if (!document.querySelector('#export-preview-error').hidden) {
      throw new Error('The optimized SVG clipboard export reports: ' +
        document.querySelector('#export-preview-error').textContent);
    }
    const optimizedCopy = postedMessages.slice(optimizedCopyStart).find((message) =>
      message.type === 'copySvg');
    if (!optimizedCopy?.svg.includes('mermaid-preview-offline-metadata')) {
      throw new Error('The optimized SVG clipboard export omitted source metadata.');
    }
    const profileMessageStart = postedMessages.length;
    document.querySelector('#export-profile-name').value = 'Documentation';
    document.querySelector('#export-profile-save').click();
    if (!postedMessages.slice(profileMessageStart).some((message) =>
      message.type === 'saveExportProfiles' && message.profiles[0]?.name === 'Documentation')) {
      throw new Error('The export profile was not persisted.');
    }
    if (captureExport) {
      document.body.dataset.visualComplete = 'capture';
      return;
    }
    document.querySelector('#export-close').click();

    version += 1;
    const diagnosticStart = postedMessages.length;
    const invalidSource = 'flowchart LR\\n  broken -->';
    window.postMessage({
      type: 'document',
      source: invalidSource,
      fileName: 'invalid.mmd',
      sourceUri: 'file:///examples/invalid.mmd',
      version,
      byteLength: invalidSource.length,
      isLargeFile: false,
    }, '*');
    await waitFor(
      () => !document.querySelector('#error-state').hidden,
      'syntax diagnostic',
    );
    const diagnostic = postedMessages
      .slice(diagnosticStart)
      .find((message) => message.type === 'diagnostic');
    if (!diagnostic || /addHook is not a function/u.test(diagnostic.message)) {
      throw new Error('The renderer did not report a valid Mermaid syntax diagnostic.');
    }

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

const webviewModule = `<script type="module" nonce="${nonce}" src="${webviewScript}"></script>`;
if (!html.includes(webviewModule)) {
  throw new Error('Could not locate the preview module in the visual harness HTML.');
}
html = html.replace(webviewModule, `${stub}${webviewModule}${runner}`);
const harnessPath = join(outputDirectory, 'harness.html');
writeFileSync(harnessPath, html);
const httpHarnessPath = join(outputDirectory, 'harness-http.html');
writeFileSync(
  httpHarnessPath,
  html
    .replaceAll(webviewScript, '/dist/webview.js')
    .replaceAll(stylesheet, '/media/preview.css')
    .replaceAll('img-src file:', "img-src 'self'")
    .replaceAll('style-src file:', "style-src 'self'")
    .replaceAll('script-src file:', "script-src 'self'"),
);

const chrome = findChrome();
const actual = await runBrowserHarness({
  chrome,
  compiledRoot,
  harnessPath,
  label: 'Visual regression harness',
  resultElementId: 'visual-results',
});
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
  const ratioToleranceByExample = new Map([
    ['19-mindmap.mmd', 0.25],
  ]);
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
    const ratioTolerance = ratioToleranceByExample.get(entry.fileName) ?? 0.18;
    if (ratioDelta > ratioTolerance) {
      failures.push(
        `${key}: aspect ratio changed by ${Math.round(ratioDelta * 100)}% ` +
        `(${baseline.ratio} → ${entry.ratio})`,
      );
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
