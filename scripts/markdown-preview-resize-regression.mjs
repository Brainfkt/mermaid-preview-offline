import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runBrowserHarness } from './browser-harness.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compiledRoot = join(root, '.test-dist', 'src');
const outputDirectory = join(root, '.test-dist', 'markdown-preview');
const enhancementScript = pathToFileURL(
  join(root, 'dist', 'markdown-preview-resize.js'),
).href;

mkdirSync(outputDirectory, { recursive: true });
const harnessPath = join(outputDirectory, 'resize-fit.html');
writeFileSync(harnessPath, `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta id="vscode-markdown-preview-data" data-settings='{"source":"file:///workspace/a.md"}'>
  <style>
    body { margin: 0; padding: 24px; }
    .mermaid-wrapper { position: relative; width: 600px; height: 240px; overflow: hidden; }
    .mermaid-content { transform-origin: 0 0; }
    svg { display: block; width: 800px; height: 400px; background: #7c3aed22; }
  </style>
</head>
<body>
  <span
    id="mermaid-preview-offline-markdown-configuration"
    aria-hidden="true"
    data-configuration='{&quot;rememberResizedHeight&quot;:true}'
  ></span>
  <main id="markdown-body"></main>
  <script>
    localStorage.removeItem('mermaidPreviewOffline.markdownResizeHeights.v1');
    const markdownBody = document.querySelector('#markdown-body');
    let wrapper;
    let content;
    let reset;
    let resizeHandle;
    let nativeState;
    const applyTransform = () => {
      content.style.transform =
        'translate(' + nativeState.translateX + 'px, ' +
        nativeState.translateY + 'px) scale(' + nativeState.scale + ')';
    };
    const mountDiagram = (source) => {
      markdownBody.replaceChildren();
      wrapper = document.createElement('div');
      wrapper.className = 'mermaid-wrapper';
      wrapper.tabIndex = 0;
      wrapper.innerHTML =
        '<div class="mermaid-content">' +
          '<div class="mermaid" id="mermaid-stable">' +
            '<svg viewBox="0 0 800 400"></svg>' +
          '</div>' +
        '</div>' +
        '<div class="mermaid-zoom-controls">' +
          '<button class="zoom-reset-btn" title="Reset Zoom" aria-label="Reset Zoom">Fit</button>' +
        '</div>' +
        '<div class="mermaid-resize-handle" tabindex="0"></div>';
      markdownBody.append(wrapper);
      content = wrapper.querySelector('.mermaid-content');
      reset = wrapper.querySelector('.zoom-reset-btn');
      resizeHandle = wrapper.querySelector('.mermaid-resize-handle');
      nativeState = {
        customHeight: 240,
        isResizing: false,
        panning: false,
        resetCalls: 0,
        resizeStartHeight: 0,
        resizeStartY: 0,
        scale: 1.5,
        source,
        startX: 0,
        startY: 0,
        translateX: -150,
        translateY: -30,
      };
      applyTransform();
      reset.addEventListener('click', () => {
        nativeState.resetCalls += 1;
        nativeState.customHeight = undefined;
        nativeState.scale = 1;
        nativeState.translateX = -100;
        nativeState.translateY = 0;
        wrapper.style.height = '400px';
        applyTransform();
      });
      resizeHandle.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        nativeState.isResizing = true;
        nativeState.resizeStartY = event.clientY;
        nativeState.resizeStartHeight = wrapper.getBoundingClientRect().height;
      });
      wrapper.addEventListener('wheel', (event) => {
        if (!event.altKey) return;
        event.preventDefault();
        const bounds = wrapper.getBoundingClientRect();
        const pointX = event.clientX - bounds.left;
        const pointY = event.clientY - bounds.top;
        const nextScale = Math.min(
          10,
          Math.max(0.5, nativeState.scale * (1 - event.deltaY * 0.002)),
        );
        const ratio = nextScale / nativeState.scale;
        nativeState.translateX =
          pointX - (pointX - nativeState.translateX) * ratio;
        nativeState.translateY =
          pointY - (pointY - nativeState.translateY) * ratio;
        nativeState.scale = nextScale;
        applyTransform();
      }, { passive: false });
      wrapper.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        nativeState.panning = true;
        nativeState.startX = event.clientX - nativeState.translateX;
        nativeState.startY = event.clientY - nativeState.translateY;
      });
    };
    document.addEventListener('mousemove', (event) => {
      if (nativeState.isResizing && event.buttons !== 0) {
        const height =
          nativeState.resizeStartHeight + event.clientY - nativeState.resizeStartY;
        nativeState.customHeight = Math.max(100, height);
        wrapper.style.height = nativeState.customHeight + 'px';
        return;
      }
      if (!nativeState.panning || event.buttons === 0) return;
      nativeState.translateX = event.clientX - nativeState.startX;
      nativeState.translateY = event.clientY - nativeState.startY;
      applyTransform();
    });
    document.addEventListener('mouseup', () => {
      nativeState.isResizing = false;
      nativeState.panning = false;
    });
    const navigate = (source) => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'updateContent', source },
      }));
      mountDiagram(source);
      window.dispatchEvent(new CustomEvent('vscode.markdown.updateContent'));
    };
    const dragResizeTo = (height) => {
      const bounds = wrapper.getBoundingClientRect();
      resizeHandle.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.bottom,
      }));
      document.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        buttons: 1,
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.bottom + height - bounds.height,
      }));
      document.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        button: 0,
        buttons: 0,
      }));
    };
    mountDiagram('file:///workspace/a.md');
  </script>
  <script type="module" src="${enhancementScript}"></script>
  <script>
    const delay = (milliseconds) =>
      new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
    (async () => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (reset.getAttribute('aria-label') === 'Fit Diagram') break;
        await delay(10);
      }
      reset.click();
      await delay(20);
      const fitResult = {
        ariaLabel: reset.getAttribute('aria-label'),
        customHeight: nativeState.customHeight,
        height: wrapper.getBoundingClientRect().height,
        resetCalls: nativeState.resetCalls,
        scale: nativeState.scale,
        title: reset.title,
        translateX: nativeState.translateX,
        translateY: nativeState.translateY,
      };

      dragResizeTo(330);
      await delay(30);
      navigate('file:///workspace/b.md');
      await delay(50);
      const unrelatedDocumentHeight = wrapper.getBoundingClientRect().height;
      navigate('file:///workspace/a.md');
      await delay(80);
      const restoredResult = {
        customHeight: nativeState.customHeight,
        height: wrapper.getBoundingClientRect().height,
        scale: nativeState.scale,
        translateX: nativeState.translateX,
        translateY: nativeState.translateY,
      };

      const configuration = document.querySelector(
        '#mermaid-preview-offline-markdown-configuration',
      );
      configuration.dataset.configuration =
        JSON.stringify({ rememberResizedHeight: false });
      window.dispatchEvent(new CustomEvent('vscode.markdown.updateContent'));
      await delay(20);
      navigate('file:///workspace/b.md');
      await delay(30);
      navigate('file:///workspace/a.md');
      await delay(50);
      const result = {
        disabledRestoredHeight: wrapper.getBoundingClientRect().height,
        fitResult,
        restoredResult,
        unrelatedDocumentHeight,
      };
      const output = document.createElement('script');
      output.id = 'markdown-resize-results';
      output.type = 'application/json';
      output.textContent = JSON.stringify(result);
      document.body.append(output);
    })().catch((error) => {
      const output = document.createElement('script');
      output.id = 'markdown-resize-results';
      output.type = 'application/json';
      output.textContent = JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      });
      document.body.append(output);
    });
  </script>
</body>
</html>`);

const result = await runBrowserHarness({
  chrome: findChrome(),
  compiledRoot,
  harnessPath,
  label: 'Native Markdown Mermaid resize-fit regression harness',
  resultElementId: 'markdown-resize-results',
  windowSize: '900,500',
});

if (result.error) throw new Error(result.error);
assertClose(result.fitResult.height, 240, 'The resized block height changed');
assertClose(result.fitResult.customHeight, 240, 'The native custom height was cleared');
assertClose(result.fitResult.scale, 0.56, 'The diagram did not fit the resized height');
assertClose(result.fitResult.translateX, 76, 'The diagram was not centered horizontally');
assertClose(result.fitResult.translateY, 8, 'The diagram was not centered vertically');
if (result.fitResult.resetCalls !== 0) {
  throw new Error('The destructive native reset handler was not intercepted.');
}
if (
  result.fitResult.title !== 'Fit Diagram' ||
  result.fitResult.ariaLabel !== 'Fit Diagram'
) {
  throw new Error('The native reset control was not exposed as a Fit action.');
}
assertClose(
  result.unrelatedDocumentHeight,
  240,
  'A resized height leaked into another Markdown document',
);
assertClose(
  result.restoredResult.height,
  330,
  'The resized height was not restored after returning to the document',
);
assertClose(
  result.restoredResult.customHeight,
  330,
  'The native renderer did not receive the restored custom height',
);
assertClose(
  result.restoredResult.scale,
  0.73,
  'The restored diagram did not fit its remembered viewport',
);
assertClose(
  result.restoredResult.translateX,
  8,
  'The restored diagram was not centered horizontally',
);
assertClose(
  result.restoredResult.translateY,
  19,
  'The restored diagram was not centered vertically',
);
assertClose(
  result.disabledRestoredHeight,
  240,
  'The height was restored after resize memory was disabled',
);
console.log('Markdown Mermaid resize-fit and navigation memory regression passed.');

function assertClose(actual, expected, message) {
  if (typeof actual !== 'number' || Math.abs(actual - expected) > 0.75) {
    throw new Error(`${message}: expected ${expected}, received ${String(actual)}.`);
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
    throw new Error(
      'Chrome or Chromium is required for Markdown resize-fit regression tests. ' +
      'Set CHROME_PATH to its executable.',
    );
  }
  return match;
}
