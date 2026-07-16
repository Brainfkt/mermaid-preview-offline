import mermaid from 'mermaid';

import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from './protocol';

interface VsCodeApi {
  getState(): PersistedState | undefined;
  postMessage(message: WebviewToExtensionMessage): void;
  setState(state: PersistedState): void;
}

interface PersistedState {
  autoFit: boolean;
  zoom: number;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const viewport = element<HTMLElement>('viewport');
const diagram = element<HTMLElement>('diagram');
const emptyState = element<HTMLElement>('empty-state');
const loadingState = element<HTMLElement>('loading-state');
const errorState = element<HTMLElement>('error-state');
const errorMessage = element<HTMLElement>('error-message');
const fileName = element<HTMLElement>('file-name');
const renderStatus = element<HTMLElement>('render-status');
const zoomStatus = element<HTMLElement>('zoom-status');
const copyButton = element<HTMLButtonElement>('copy-svg');
const saveButton = element<HTMLButtonElement>('save-svg');

const previousState = vscode.getState();
let zoom = previousState?.zoom ?? 1;
let autoFit = previousState?.autoFit ?? true;
let naturalWidth = 800;
let naturalHeight = 600;
let lastSvg = '';
let latestRequest = 0;
let latestSource = '';
let rendering = false;
let renderTimer: number | undefined;

window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage>) => {
  if (event.data.type !== 'document') {
    return;
  }
  fileName.textContent = event.data.fileName;
  scheduleRender(event.data.source);
});

bindButton('open-source', openSource);
bindButton('empty-open-source', openSource);
bindButton('error-open-source', openSource);
bindButton('zoom-out', () => setZoom(zoom - 0.15, false));
bindButton('zoom-in', () => setZoom(zoom + 0.15, false));
bindButton('fit', fitDiagram);
bindButton('copy-svg', () => {
  if (lastSvg) {
    vscode.postMessage({ type: 'copySvg', svg: lastSvg });
  }
});
bindButton('save-svg', () => {
  if (lastSvg) {
    vscode.postMessage({ type: 'saveSvg', svg: lastSvg });
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'e' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    openSource();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === '0') {
    event.preventDefault();
    fitDiagram();
    return;
  }
  if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    setZoom(zoom + 0.15, false);
  } else if (event.key === '-' || event.key === '_') {
    event.preventDefault();
    setZoom(zoom - 0.15, false);
  }
});

viewport.addEventListener(
  'wheel',
  (event) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    setZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1), false);
  },
  { passive: false },
);

installDragToPan();

new ResizeObserver(() => {
  if (autoFit && !diagram.hidden) {
    fitDiagram();
  }
}).observe(viewport);

new MutationObserver(() => {
  scheduleRender(latestSource, 0);
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

vscode.postMessage({ type: 'ready' });

function scheduleRender(source: string, delay = 110): void {
  latestSource = source;
  latestRequest += 1;
  if (renderTimer !== undefined) {
    window.clearTimeout(renderTimer);
  }
  renderTimer = window.setTimeout(() => {
    renderTimer = undefined;
    void renderLatest();
  }, delay);
}

async function renderLatest(): Promise<void> {
  if (rendering) {
    return;
  }

  const request = latestRequest;
  const source = latestSource.trim();
  rendering = true;

  if (!source) {
    lastSvg = '';
    copyButton.disabled = true;
    saveButton.disabled = true;
    showState('empty');
    renderStatus.textContent = 'Fichier vide';
    rendering = false;
    return;
  }

  showState('loading');
  const startedAt = performance.now();
  const renderId = `mermaid-preview-${request}`;

  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: currentTheme(),
      fontFamily: getComputedStyle(document.body).fontFamily,
      flowchart: { htmlLabels: false, useMaxWidth: false },
      sequence: { useMaxWidth: false },
    });

    await mermaid.parse(source);
    const { svg } = await mermaid.render(renderId, source);
    if (request !== latestRequest) {
      return;
    }

    diagram.innerHTML = svg;
    lastSvg = svg;
    const svgElement = diagram.querySelector('svg');
    if (!svgElement) {
      throw new Error('Mermaid n’a produit aucun élément SVG.');
    }

    readNaturalSize(svgElement);
    showState('diagram');
    copyButton.disabled = false;
    saveButton.disabled = false;
    if (autoFit) {
      fitDiagram();
    } else {
      applyZoom();
    }
    renderStatus.textContent = `Rendu local • ${Math.round(performance.now() - startedAt)} ms`;
  } catch (error: unknown) {
    cleanupFailedRender(renderId);
    if (request === latestRequest) {
      lastSvg = '';
      copyButton.disabled = true;
      saveButton.disabled = true;
      errorMessage.textContent = readableError(error);
      renderStatus.textContent = 'Erreur de syntaxe';
      showState('error');
    }
  } finally {
    rendering = false;
    if (request !== latestRequest) {
      void renderLatest();
    }
  }
}

function readNaturalSize(svg: SVGSVGElement): void {
  const viewBox = svg.viewBox.baseVal;
  const box = svg.getBoundingClientRect();
  naturalWidth = viewBox.width > 0 ? viewBox.width : Math.max(box.width, 1);
  naturalHeight = viewBox.height > 0 ? viewBox.height : Math.max(box.height, 1);
  svg.style.maxWidth = 'none';
}

function fitDiagram(): void {
  const horizontalRoom = Math.max(viewport.clientWidth - 72, 120);
  const verticalRoom = Math.max(viewport.clientHeight - 72, 120);
  const fittedZoom = Math.min(horizontalRoom / naturalWidth, verticalRoom / naturalHeight, 1.5);
  setZoom(fittedZoom, true);
  viewport.scrollTo({ left: 0, top: 0 });
}

function setZoom(value: number, shouldAutoFit: boolean): void {
  zoom = clamp(value, 0.15, 4);
  autoFit = shouldAutoFit;
  applyZoom();
  vscode.setState({ autoFit, zoom });
}

function applyZoom(): void {
  const svg = diagram.querySelector('svg');
  if (svg) {
    svg.style.width = `${Math.round(naturalWidth * zoom)}px`;
    svg.style.height = `${Math.round(naturalHeight * zoom)}px`;
  }
  zoomStatus.textContent = `${Math.round(zoom * 100)} %`;
}

function showState(state: 'diagram' | 'empty' | 'error' | 'loading'): void {
  diagram.hidden = state !== 'diagram';
  emptyState.hidden = state !== 'empty';
  errorState.hidden = state !== 'error';
  loadingState.hidden = state !== 'loading';
}

function currentTheme(): 'dark' | 'default' {
  return document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast')
    ? 'dark'
    : 'default';
}

function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error:\s*/u, '').replace(/\n{3,}/gu, '\n\n').trim();
}

function cleanupFailedRender(renderId: string): void {
  document.getElementById(renderId)?.remove();
  document.getElementById(`d${renderId}`)?.remove();
}

function openSource(): void {
  vscode.postMessage({ type: 'openSource' });
}

function bindButton(id: string, listener: () => void): void {
  element<HTMLButtonElement>(id).addEventListener('click', listener);
}

function element<T extends HTMLElement>(id: string): T {
  const match = document.getElementById(id);
  if (!match) {
    throw new Error(`Élément de webview manquant : ${id}`);
  }
  return match as T;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function installDragToPan(): void {
  let pointerId: number | undefined;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;

  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || diagram.hidden) {
      return;
    }
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startScrollLeft = viewport.scrollLeft;
    startScrollTop = viewport.scrollTop;
    viewport.setPointerCapture(pointerId);
    viewport.classList.add('viewport--dragging');
  });

  viewport.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId) {
      return;
    }
    viewport.scrollLeft = startScrollLeft - (event.clientX - startX);
    viewport.scrollTop = startScrollTop - (event.clientY - startY);
  });

  const stopDragging = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) {
      return;
    }
    pointerId = undefined;
    viewport.classList.remove('viewport--dragging');
  };
  viewport.addEventListener('pointerup', stopDragging);
  viewport.addEventListener('pointercancel', stopDragging);
}
