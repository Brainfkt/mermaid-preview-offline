import { icons as logosIcons } from '@iconify-json/logos';
import { icons as materialIconThemeIcons } from '@iconify-json/material-icon-theme';
import zenuml from '@mermaid-js/mermaid-zenuml';
import mermaid from 'mermaid';

import { describeMermaidError } from './mermaidError';
import { clamp, isDiagramTheme, normalizePreviewState } from './previewState';
import type {
  DiagramTheme,
  ExtensionToWebviewMessage,
  MermaidEditorMode,
  PersistedPreviewState,
  PreviewConfiguration,
  WebviewToExtensionMessage,
} from './protocol';
import { formatByteLength } from './renderPolicy';
import { resolveDiagramTheme, type PreviewColorScheme } from './theme';

interface VsCodeApi {
  getState(): unknown;
  postMessage(message: WebviewToExtensionMessage): void;
  setState(state: PersistedPreviewState): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const DEFAULT_CONFIGURATION: PreviewConfiguration = {
  diagramTheme: 'adaptive',
  largeFileThresholdBytes: 512 * 1024,
  minimapEnabled: true,
  refreshDelay: 140,
  refreshMode: 'automatic',
};

mermaid.registerIconPacks([
  { name: logosIcons.prefix, icons: logosIcons },
  { name: materialIconThemeIcons.prefix, icons: materialIconThemeIcons },
]);
const mermaidExtensionsReady = mermaid.registerExternalDiagrams([zenuml]);

const vscode = acquireVsCodeApi();
const rawPreviousState = vscode.getState();
const hadPersistedState = rawPreviousState !== undefined;
const initialState = normalizePreviewState(rawPreviousState);
const viewport = element<HTMLElement>('viewport');
const diagram = element<HTMLElement>('diagram');
const minimap = element<HTMLElement>('minimap');
const minimapDiagram = element<HTMLElement>('minimap-diagram');
const minimapWindow = element<HTMLElement>('minimap-window');
const emptyState = element<HTMLElement>('empty-state');
const loadingState = element<HTMLElement>('loading-state');
const errorState = element<HTMLElement>('error-state');
const errorMessage = element<HTMLElement>('error-message');
const errorLocation = element<HTMLElement>('error-location');
const errorExcerpt = element<HTMLElement>('error-excerpt');
const errorHelp = element<HTMLElement>('error-help');
const fileName = element<HTMLElement>('file-name');
const fileSize = element<HTMLElement>('file-size');
const diagramSize = element<HTMLElement>('diagram-size');
const renderStatus = element<HTMLElement>('render-status');
const zoomStatus = element<HTMLElement>('zoom-status');
const largeFileLabel = element<HTMLElement>('large-file-label');
const refreshButton = element<HTMLButtonElement>('refresh');
const copyButton = element<HTMLButtonElement>('copy-svg');
const saveButton = element<HTMLButtonElement>('save-svg');
const themeSelect = element<HTMLSelectElement>('diagram-theme');
const themePicker = element<HTMLElement>('theme-picker');
const editorLayoutButton = element<HTMLButtonElement>('editor-layout');
const editorLayoutLabel = element<HTMLElement>('editor-layout-label');

let configuration = DEFAULT_CONFIGURATION;
let zoom = initialState.zoom;
let autoFit = initialState.autoFit;
let savedScrollLeft = initialState.scrollLeft;
let savedScrollTop = initialState.scrollTop;
let editorMode: MermaidEditorMode = 'preview';
let diagramTheme: DiagramTheme = DEFAULT_CONFIGURATION.diagramTheme;
let naturalWidth = 800;
let naturalHeight = 600;
let lastSvg = '';
let latestRequest = 0;
let latestSource = '';
let latestVersion = -1;
let latestByteLength = 0;
let pendingDocument = false;
let rendering = false;
let renderTimer: number | undefined;
let persistTimer: number | undefined;
let activeRenderController: AbortController | undefined;
let lastColorScheme = vscodeColorScheme();
let minimapScale = 1;
let minimapOffsetX = 0;
let minimapOffsetY = 0;

themeSelect.value = diagramTheme;
updateThemePicker();
zoomStatus.textContent = `${Math.round(zoom * 100)} %`;
updateEditorMode();

window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'configuration': {
      const previousTheme = resolvedDiagramTheme();
      configuration = message.configuration;
      diagramTheme = configuration.diagramTheme;
      themeSelect.value = diagramTheme;
      updateThemePicker();
      updateRefreshControls();
      updateMinimap();
      if (latestSource && previousTheme !== resolvedDiagramTheme()) {
        scheduleRender(latestSource, 0);
      }
      break;
    }
    case 'document':
      fileName.textContent = message.fileName;
      latestVersion = message.version;
      latestByteLength = message.byteLength;
      updateFileSize(message.byteLength);
      pendingDocument = false;
      updateLargeFileLabel(message.isLargeFile, message.byteLength);
      updateRefreshControls();
      scheduleRender(message.source, 0);
      break;
    case 'documentChanged':
      fileName.textContent = message.fileName;
      latestVersion = message.version;
      latestByteLength = message.byteLength;
      updateFileSize(message.byteLength);
      pendingDocument = true;
      renderStatus.textContent = 'Changes pending';
      updateRefreshControls();
      break;
    case 'restoreViewState':
      restoreViewState(message.state);
      break;
    case 'editorMode':
      editorMode = message.mode;
      updateEditorMode();
      break;
  }
});

bindButton('editor-layout', () => {
  vscode.postMessage({ type: 'chooseEditorMode' });
});
bindButton('empty-open-source', openSourceOnly);
bindButton('error-open-source', openSourceOnly);
bindButton('error-retry', retryRender);
bindButton('refresh', refreshDocument);
bindButton('fullscreen', () => vscode.postMessage({ type: 'toggleFullscreen' }));
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

themeSelect.addEventListener('change', () => {
  if (!isDiagramTheme(themeSelect.value)) {
    return;
  }
  diagramTheme = themeSelect.value;
  updateThemePicker();
  vscode.postMessage({ type: 'setDiagramTheme', theme: diagramTheme });
  if (latestSource) {
    scheduleRender(latestSource, 0);
  }
});

window.addEventListener('keydown', (event) => {
  if (isInteractiveTarget(event.target)) {
    return;
  }
  if (event.key.toLowerCase() === 'e' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    openSourceOnly();
    return;
  }
  if (event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    refreshDocument();
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

viewport.addEventListener('scroll', () => {
  savedScrollLeft = viewport.scrollLeft;
  savedScrollTop = viewport.scrollTop;
  schedulePersistState();
  updateMinimapViewport();
});

installDragToPan();
installMinimapNavigation();

new ResizeObserver(() => {
  if (autoFit && !diagram.hidden) {
    fitDiagram();
  } else {
    updateMinimap();
  }
}).observe(viewport);

new MutationObserver(() => {
  const colorScheme = vscodeColorScheme();
  if (colorScheme === lastColorScheme) {
    return;
  }
  lastColorScheme = colorScheme;
  if (diagramTheme === 'adaptive' && latestSource) {
    scheduleRender(latestSource, 0);
  }
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

window.addEventListener('pagehide', () => {
  persistState();
});

vscode.postMessage({ type: 'ready', hasPersistedState: hadPersistedState });

function scheduleRender(source: string, delay: number): void {
  latestSource = source;
  latestRequest += 1;
  activeRenderController?.abort();
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
    activeRenderController?.abort();
    return;
  }

  const request = latestRequest;
  const source = latestSource;
  const controller = new AbortController();
  activeRenderController = controller;
  rendering = true;

  if (!/\S/u.test(source)) {
    lastSvg = '';
    diagramSize.textContent = '—';
    copyButton.disabled = true;
    saveButton.disabled = true;
    showState('empty');
    renderStatus.textContent = 'Empty file';
    vscode.postMessage({ type: 'clearDiagnostic', version: latestVersion });
    activeRenderController = undefined;
    rendering = false;
    return;
  }

  showState('loading');
  const startedAt = performance.now();
  const renderId = `mermaid-preview-${request}`;

  try {
    await mermaidExtensionsReady;
    throwIfCancelled(controller.signal, request);
    mermaid.initialize({
      deterministicIds: true,
      deterministicIDSeed: 'mermaid-preview-offline',
      startOnLoad: false,
      securityLevel: 'strict',
      theme: resolvedDiagramTheme(),
      fontFamily: getComputedStyle(document.body).fontFamily,
      flowchart: { htmlLabels: false, useMaxWidth: false },
      sequence: { useMaxWidth: false },
    });

    await mermaid.parse(source);
    throwIfCancelled(controller.signal, request);
    const { svg } = await mermaid.render(renderId, source);
    throwIfCancelled(controller.signal, request);

    diagram.innerHTML = svg;
    diagram.dataset.version = String(latestVersion);
    lastSvg = svg;
    const svgElement = diagram.querySelector('svg');
    if (!svgElement) {
      throw new Error('Mermaid did not produce an SVG element.');
    }

    readNaturalSize(svgElement);
    refreshMinimapDiagram(svg);
    showState('diagram');
    copyButton.disabled = false;
    saveButton.disabled = false;
    if (autoFit) {
      fitDiagram();
    } else {
      applyZoom();
      restoreScrollPosition();
    }
    const sizeStatus =
      latestByteLength >= configuration.largeFileThresholdBytes
        ? ` • ${formatByteLength(latestByteLength)}`
        : '';
    renderStatus.textContent = `Rendered • ${Math.round(performance.now() - startedAt)} ms${sizeStatus}`;
    vscode.postMessage({ type: 'clearDiagnostic', version: latestVersion });
  } catch (error: unknown) {
    cleanupFailedRender(renderId);
    if (error instanceof RenderCancelledError) {
      return;
    }
    if (request === latestRequest) {
      lastSvg = '';
      diagramSize.textContent = '—';
      copyButton.disabled = true;
      saveButton.disabled = true;
      displayError(error, source);
      renderStatus.textContent = 'Syntax error';
      showState('error');
    }
  } finally {
    if (activeRenderController === controller) {
      activeRenderController = undefined;
    }
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
  diagramSize.textContent = `${formatDimension(naturalWidth)} × ${formatDimension(naturalHeight)} px`;
}

function fitDiagram(): void {
  const horizontalRoom = Math.max(viewport.clientWidth - 72, 120);
  const verticalRoom = Math.max(viewport.clientHeight - 88, 120);
  const fittedZoom = Math.min(horizontalRoom / naturalWidth, verticalRoom / naturalHeight, 1.5);
  setZoom(fittedZoom, true);
  savedScrollLeft = 0;
  savedScrollTop = 0;
  viewport.scrollTo({ left: 0, top: 0 });
  schedulePersistState();
}

function setZoom(value: number, shouldAutoFit: boolean): void {
  zoom = clamp(value, 0.15, 4);
  autoFit = shouldAutoFit;
  applyZoom();
  persistState();
}

function applyZoom(): void {
  const svg = diagram.querySelector('svg');
  if (svg) {
    svg.style.width = `${Math.round(naturalWidth * zoom)}px`;
    svg.style.height = `${Math.round(naturalHeight * zoom)}px`;
  }
  zoomStatus.textContent = `${Math.round(zoom * 100)} %`;
  updateMinimap();
}

function restoreScrollPosition(): void {
  const left = savedScrollLeft;
  const top = savedScrollTop;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => viewport.scrollTo({ left, top }));
  });
}

function restoreViewState(value: PersistedPreviewState): void {
  const state = normalizePreviewState(value);
  zoom = state.zoom;
  autoFit = state.autoFit;
  savedScrollLeft = state.scrollLeft;
  savedScrollTop = state.scrollTop;
  applyZoom();
  persistState();
}

function persistState(): void {
  if (persistTimer !== undefined) {
    window.clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  const state: PersistedPreviewState = {
    autoFit,
    scrollLeft: savedScrollLeft,
    scrollTop: savedScrollTop,
    zoom,
  };
  vscode.setState(state);
  vscode.postMessage({ type: 'viewState', state });
}

function schedulePersistState(): void {
  if (persistTimer !== undefined) {
    window.clearTimeout(persistTimer);
  }
  persistTimer = window.setTimeout(persistState, 120);
}

function showState(state: 'diagram' | 'empty' | 'error' | 'loading'): void {
  diagram.hidden = state !== 'diagram';
  emptyState.hidden = state !== 'empty';
  errorState.hidden = state !== 'error';
  loadingState.hidden = state !== 'loading';
  if (state === 'diagram') {
    window.requestAnimationFrame(updateMinimap);
  } else {
    minimap.hidden = true;
  }
}

function resolvedDiagramTheme(): Exclude<DiagramTheme, 'adaptive'> {
  return resolveDiagramTheme(diagramTheme, vscodeColorScheme());
}

function vscodeColorScheme(): PreviewColorScheme {
  if (document.body.classList.contains('vscode-high-contrast')) {
    return 'highContrastDark';
  }
  if (document.body.classList.contains('vscode-high-contrast-light')) {
    return 'highContrastLight';
  }
  return document.body.classList.contains('vscode-dark') ? 'dark' : 'light';
}

function displayError(error: unknown, source: string): void {
  const details = describeMermaidError(error, source);
  errorMessage.textContent = details.message;
  errorLocation.hidden = details.line === undefined;
  errorLocation.textContent = details.line
    ? `Line ${details.line}${details.column ? `, column ${details.column}` : ''}`
    : '';
  errorExcerpt.hidden = !details.excerpt;
  errorExcerpt.textContent = details.excerpt ?? '';
  vscode.postMessage({
    type: 'diagnostic',
    version: latestVersion,
    message: details.message,
    line: details.line,
    column: details.column,
  });
}

function updateLargeFileLabel(isLargeFile: boolean, byteLength: number): void {
  largeFileLabel.hidden = !isLargeFile;
  largeFileLabel.textContent = isLargeFile ? `Large file · ${formatByteLength(byteLength)}` : '';
}

function updateRefreshControls(): void {
  refreshButton.classList.toggle('button--pending', pendingDocument);
  refreshButton.setAttribute(
    'aria-label',
    pendingDocument ? 'Refresh diagram, changes pending' : 'Refresh diagram',
  );
  refreshButton.title =
    configuration.refreshMode === 'manual'
      ? 'Refresh diagram; automatic rendering is disabled (R)'
      : 'Refresh diagram (R)';
  errorHelp.textContent =
    configuration.refreshMode === 'manual'
      ? 'Fix the source, then retry or refresh the preview.'
      : 'Fix the source and the preview will update automatically.';
}

function updateEditorMode(): void {
  const labels: Record<MermaidEditorMode, string> = {
    above: 'Above',
    beside: 'Beside',
    preview: 'Preview',
    source: 'Source',
  };
  const descriptions: Record<MermaidEditorMode, string> = {
    above: 'Source above preview',
    beside: 'Source beside preview',
    preview: 'Preview only',
    source: 'Source only',
  };
  editorLayoutLabel.textContent = labels[editorMode];
  editorLayoutButton.title = `Editor layout: ${descriptions[editorMode]}`;
  editorLayoutButton.setAttribute(
    'aria-label',
    `Choose editor layout, current layout: ${descriptions[editorMode]}`,
  );
}

function updateFileSize(byteLength: number): void {
  fileSize.textContent = formatByteLength(byteLength);
  fileSize.title = `${byteLength.toLocaleString()} bytes`;
}

function formatDimension(value: number): string {
  return Math.round(value).toLocaleString();
}

function refreshMinimapDiagram(svgSource: string): void {
  const thumbnail = document.createElement('img');
  thumbnail.alt = '';
  thumbnail.decoding = 'async';
  thumbnail.draggable = false;
  thumbnail.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgSource)}`;
  minimapDiagram.replaceChildren(thumbnail);
}

function updateMinimap(): void {
  const hasOverflow =
    viewport.scrollWidth > viewport.clientWidth + 1 ||
    viewport.scrollHeight > viewport.clientHeight + 1;
  const visible = configuration.minimapEnabled && !diagram.hidden && hasOverflow;
  minimap.hidden = !visible;
  if (!visible) {
    return;
  }

  const svg = diagram.querySelector('svg');
  const thumbnail = minimapDiagram.querySelector('img');
  if (!svg || !thumbnail) {
    minimap.hidden = true;
    return;
  }

  const minimapWidth = Math.max(minimap.clientWidth, 1);
  const minimapHeight = Math.max(minimap.clientHeight, 1);
  const contentWidth = Math.max(viewport.scrollWidth, 1);
  const contentHeight = Math.max(viewport.scrollHeight, 1);
  minimapScale = Math.min(minimapWidth / contentWidth, minimapHeight / contentHeight);
  minimapOffsetX = (minimapWidth - contentWidth * minimapScale) / 2;
  minimapOffsetY = (minimapHeight - contentHeight * minimapScale) / 2;

  const viewportBounds = viewport.getBoundingClientRect();
  const svgBounds = svg.getBoundingClientRect();
  const svgLeft = svgBounds.left - viewportBounds.left + viewport.scrollLeft;
  const svgTop = svgBounds.top - viewportBounds.top + viewport.scrollTop;
  thumbnail.style.left = `${svgLeft}px`;
  thumbnail.style.top = `${svgTop}px`;
  thumbnail.style.width = `${svgBounds.width}px`;
  thumbnail.style.height = `${svgBounds.height}px`;

  minimapDiagram.style.width = `${contentWidth}px`;
  minimapDiagram.style.height = `${contentHeight}px`;
  minimapDiagram.style.transform =
    `translate(${minimapOffsetX}px, ${minimapOffsetY}px) scale(${minimapScale})`;
  updateMinimapViewport();
}

function updateMinimapViewport(): void {
  if (minimap.hidden) {
    return;
  }
  const contentWidth = Math.max(viewport.scrollWidth, 1);
  const contentHeight = Math.max(viewport.scrollHeight, 1);
  const left = minimapOffsetX + viewport.scrollLeft * minimapScale;
  const top = minimapOffsetY + viewport.scrollTop * minimapScale;
  const width = Math.min(viewport.clientWidth * minimapScale, contentWidth * minimapScale);
  const height = Math.min(viewport.clientHeight * minimapScale, contentHeight * minimapScale);
  minimapWindow.style.left = `${left}px`;
  minimapWindow.style.top = `${top}px`;
  minimapWindow.style.width = `${Math.max(width, 8)}px`;
  minimapWindow.style.height = `${Math.max(height, 8)}px`;
}

function updateThemePicker(): void {
  const selectedOption = themeSelect.selectedOptions[0];
  const label = selectedOption?.textContent?.trim() || diagramTheme;
  themePicker.title = `Diagram theme: ${label}`;
  themePicker.setAttribute('aria-label', `Diagram theme: ${label}`);
}

function refreshDocument(): void {
  if (pendingDocument || configuration.refreshMode === 'manual') {
    renderStatus.textContent = 'Refreshing…';
    vscode.postMessage({ type: 'requestDocument' });
  } else {
    retryRender();
  }
}

function retryRender(): void {
  if (latestSource) {
    scheduleRender(latestSource, 0);
  } else {
    vscode.postMessage({ type: 'requestDocument' });
  }
}

function cleanupFailedRender(renderId: string): void {
  document.getElementById(renderId)?.remove();
  document.getElementById(`d${renderId}`)?.remove();
}

function openSourceOnly(): void {
  vscode.postMessage({ type: 'setEditorMode', mode: 'source' });
}

function bindButton(id: string, listener: () => void): void {
  element<HTMLButtonElement>(id).addEventListener('click', listener);
}

function element<T extends HTMLElement>(id: string): T {
  const match = document.getElementById(id);
  if (!match) {
    throw new Error(`Missing webview element: ${id}`);
  }
  return match as T;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement
  );
}

function throwIfCancelled(signal: AbortSignal, request: number): void {
  if (signal.aborted || request !== latestRequest) {
    throw new RenderCancelledError();
  }
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

function installMinimapNavigation(): void {
  let pointerId: number | undefined;

  const navigate = (event: PointerEvent): void => {
    const bounds = minimap.getBoundingClientRect();
    const contentX = (event.clientX - bounds.left - minimapOffsetX) / minimapScale;
    const contentY = (event.clientY - bounds.top - minimapOffsetY) / minimapScale;
    viewport.scrollTo({
      left: contentX - viewport.clientWidth / 2,
      top: contentY - viewport.clientHeight / 2,
    });
  };

  minimap.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    pointerId = event.pointerId;
    minimap.setPointerCapture(pointerId);
    minimap.classList.add('minimap--dragging');
    navigate(event);
  });
  minimap.addEventListener('pointermove', (event) => {
    if (event.pointerId === pointerId) {
      navigate(event);
    }
  });
  const stopDragging = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) {
      return;
    }
    pointerId = undefined;
    minimap.classList.remove('minimap--dragging');
  };
  minimap.addEventListener('pointerup', stopDragging);
  minimap.addEventListener('pointercancel', stopDragging);
}

class RenderCancelledError extends Error {}
