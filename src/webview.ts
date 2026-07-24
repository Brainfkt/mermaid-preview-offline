import mermaid from 'mermaid';

import {
  DEFAULT_EXPORT_SETTINGS,
  normalizeExportProfiles,
  normalizeExportSettings,
  type ExportProfile,
  type ExportSettings,
  type ExportSourceMetadata,
} from './exportSettings';
import {
  artifactDataBase64,
  prepareSvg,
  renderExportArtifact,
  renderExportPreview,
  type ExportArtifact,
} from './exportRenderer';
import { describeMermaidError } from './mermaidError';
import { prepareMermaidExtensions, registerOfflineIconPacks } from './mermaidExtensions';
import { resolvedDiagramFontStack } from './diagramFontAssets';
import { clamp, isDiagramTheme, normalizePreviewState } from './previewState';
import {
  DEFAULT_DIAGRAM_SURFACE,
  diagramSpacing,
  diagramSurfaceColor,
  isDarkHexColor,
  isDiagramDensity,
  resolveDiagramAppearance,
  type DiagramAppearance,
} from './appearance';
import type {
  DiagramDensity,
  DiagramSurfaceConfiguration,
  DiagramSurfacePattern,
  DiagramSurfacePreset,
  DiagramTheme,
  ExtensionToWebviewMessage,
  MermaidEditorMode,
  PersistedPreviewState,
  PreviewConfiguration,
  SerializedExportArtifact,
  WebviewToExtensionMessage,
} from './protocol';
import { formatByteLength } from './renderPolicy';
import type { PreviewColorScheme } from './theme';
import { DEFAULT_DIAGRAM_NAVIGATION_CONFIGURATION } from './navigationSettings';
import { writePngToClipboard } from './pngClipboard';

interface VsCodeApi {
  getState(): unknown;
  postMessage(message: WebviewToExtensionMessage): void;
  setState(state: PersistedPreviewState): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const DEFAULT_CONFIGURATION: PreviewConfiguration = {
  diagramDensity: 'comfortable',
  diagramFontFamily: 'vscode',
  diagramSurface: DEFAULT_DIAGRAM_SURFACE,
  diagramTheme: 'adaptive',
  largeFileThresholdBytes: 512 * 1024,
  minimapEnabled: true,
  navigation: DEFAULT_DIAGRAM_NAVIGATION_CONFIGURATION,
  refreshDelay: 140,
  refreshMode: 'automatic',
};

registerOfflineIconPacks();

const vscode = acquireVsCodeApi();
const rawPreviousState = vscode.getState();
const hadPersistedState = rawPreviousState !== undefined;
const initialState = normalizePreviewState(rawPreviousState);
const workspace = element<HTMLElement>('workspace');
const sourcePane = element<HTMLElement>('source-pane');
const previewPane = element<HTMLElement>('preview-pane');
const sourceEditor = element<HTMLTextAreaElement>('source-editor');
const sourceLineNumbers = element<HTMLElement>('source-line-numbers');
const sourceEditStatus = element<HTMLElement>('source-edit-status');
const sourceReloadButton = element<HTMLButtonElement>('source-reload');
const splitHandle = element<HTMLElement>('split-handle');
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
const saveSvgButton = element<HTMLButtonElement>('save-svg');
const exportOpenButton = element<HTMLButtonElement>('export-open');
const themePicker = element<HTMLButtonElement>('theme-picker');
const appearanceLabel = element<HTMLElement>('appearance-label');
const appearancePopover = element<HTMLElement>('appearance-popover');
const themeGallery = element<HTMLElement>('theme-gallery');
const densityPicker = element<HTMLElement>('density-picker');
const patternPicker = element<HTMLElement>('pattern-picker');
const surfacePicker = element<HTMLElement>('surface-picker');
const surfaceCustomColor = element<HTMLInputElement>('surface-custom-color');
const searchPanel = element<HTMLElement>('diagram-search');
const searchInput = element<HTMLInputElement>('diagram-search-input');
const searchCount = element<HTMLElement>('diagram-search-count');
const navigationControls = element<HTMLElement>('diagram-navigation-controls');
const editorLayoutButton = element<HTMLButtonElement>('editor-layout');
const editorLayoutLabel = element<HTMLElement>('editor-layout-label');
const exportDialog = element<HTMLDialogElement>('export-dialog');
const exportForm = element<HTMLFormElement>('export-form');
const exportPreviewImage = element<HTMLImageElement>('export-preview-image');
const exportPreviewSpinner = element<HTMLElement>('export-preview-spinner');
const exportPreviewMetrics = element<HTMLElement>('export-preview-metrics');
const exportPreviewError = element<HTMLElement>('export-preview-error');
const exportProfileSelect = element<HTMLSelectElement>('export-profile');
const exportProfileName = element<HTMLInputElement>('export-profile-name');
const exportProfileDelete = element<HTMLButtonElement>('export-profile-delete');
const exportFormat = element<HTMLSelectElement>('export-format');
const exportTheme = element<HTMLSelectElement>('export-theme');
const exportScale = element<HTMLInputElement>('export-scale');
const exportDpi = element<HTMLInputElement>('export-dpi');
const exportMargin = element<HTMLInputElement>('export-margin');
const exportBackground = element<HTMLSelectElement>('export-background');
const exportBackgroundColor = element<HTMLInputElement>('export-background-color');
const exportNameTemplate = element<HTMLInputElement>('export-name-template');
const exportOptimize = element<HTMLInputElement>('export-optimize');
const exportMetadata = element<HTMLInputElement>('export-metadata');
const exportSvgOriginal = element<HTMLInputElement>('export-svg-original');

let configuration = DEFAULT_CONFIGURATION;
let zoom = initialState.zoom;
let autoFit = initialState.autoFit;
let savedScrollLeft = initialState.scrollLeft;
let savedScrollTop = initialState.scrollTop;
let splitRatio = initialState.splitRatio;
let editorMode: MermaidEditorMode = 'preview';
let detachedPreview = false;
let diagramTheme: DiagramTheme = DEFAULT_CONFIGURATION.diagramTheme;
let naturalWidth = 800;
let naturalHeight = 600;
let lastSvg = '';
let lastSvgFontFamily = DEFAULT_CONFIGURATION.diagramFontFamily;
let lastSvgAppearance = '';
let latestRequest = 0;
let latestSource = '';
let latestSourceUri = '';
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
let minimapObjectUrl: string | undefined;
let minimapViewportFrame: number | undefined;
let exportSettings = { ...DEFAULT_EXPORT_SETTINGS };
let exportProfiles: ExportProfile[] = [];
let exportPreviewTimer: number | undefined;
let exportPreviewGeneration = 0;
let exportJob = Promise.resolve();
let exportDialogRequested = false;
let searchMatches: Element[] = [];
let searchIndex = -1;
let diagramPointerStart: { x: number; y: number } | undefined;
let sourceDocumentVersion = -1;
let lastAcknowledgedSource = '';
let sourceEditSequence = 0;
let sourceEditTimer: number | undefined;
let sourceEditInFlight: { requestId: number; source: string } | undefined;
let conflictingDocument: { source: string; version: number } | undefined;

updateThemePicker();
applyCanvasAppearance();
zoomStatus.textContent = `${Math.round(zoom * 100)} %`;
updateEditorMode();

window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'configuration': {
      const previousAppearance = appearanceSignature(currentAppearance());
      const previousFontFamily = configuration.diagramFontFamily;
      configuration = message.configuration;
      diagramTheme = configuration.diagramTheme;
      updateThemePicker();
      applyCanvasAppearance();
      updateRefreshControls();
      updateNavigationConfiguration();
      updateMinimap();
      if (
        latestSource &&
        (previousAppearance !== appearanceSignature(currentAppearance()) ||
          previousFontFamily !== configuration.diagramFontFamily)
      ) {
        scheduleRender(latestSource, 0);
      }
      break;
    }
    case 'document':
      fileName.textContent = message.fileName;
      latestSourceUri = message.sourceUri;
      latestVersion = message.version;
      latestByteLength = message.byteLength;
      receiveDocumentSource(message.documentSource, message.version);
      updateFileSize(message.byteLength);
      pendingDocument = false;
      updateLargeFileLabel(message.isLargeFile, message.byteLength);
      updateRefreshControls();
      if (message.renderBlockedReason) {
        latestSource = '';
        latestRequest += 1;
        activeRenderController?.abort();
        lastSvg = '';
        diagramSize.textContent = '—';
        copyButton.disabled = true;
        saveSvgButton.disabled = true;
        exportOpenButton.disabled = true;
        displayError(new Error(message.renderBlockedReason), '');
        renderStatus.textContent = 'Render paused';
        showState('error');
        break;
      }
      scheduleRender(message.source, 0);
      break;
    case 'documentChanged':
      fileName.textContent = message.fileName;
      latestVersion = message.version;
      latestByteLength = message.byteLength;
      receiveDocumentSource(message.documentSource, message.version);
      updateFileSize(message.byteLength);
      pendingDocument = true;
      renderStatus.textContent = 'Changes pending';
      updateRefreshControls();
      break;
    case 'sourceEditResult':
      handleSourceEditResult(message);
      break;
    case 'restoreViewState':
      restoreViewState(message.state);
      break;
    case 'editorMode':
      editorMode = message.mode;
      detachedPreview = message.detached;
      updateEditorMode();
      requestAnimationFrame(focusActiveSurface);
      break;
    case 'exportConfiguration':
      exportSettings = normalizeExportSettings(message.settings);
      exportProfiles = normalizeExportProfiles(message.profiles);
      renderExportProfileOptions();
      if (!exportDialog.open) {
        writeExportForm(exportSettings);
      }
      break;
    case 'showExportDialog':
      openExportDialog();
      break;
    case 'batchExportFile':
      queueExportJob(async () => {
        try {
          const artifact = await createArtifact(
            message.source,
            message.sourceUri,
            message.fileName,
            message.settings,
          );
          vscode.postMessage({
            type: 'batchExportResult',
            artifact: serializeArtifact(artifact),
            batchId: message.batchId,
            fileId: message.fileId,
            relativeDirectory: message.relativeDirectory,
          });
        } catch (error: unknown) {
          vscode.postMessage({
            type: 'batchExportError',
            batchId: message.batchId,
            fileId: message.fileId,
            message: errorMessageOf(error),
          });
        }
      });
      break;
  }
});

bindButton('editor-layout', () => {
  vscode.postMessage({ type: 'chooseEditorMode' });
});
bindButton('open-native-source', () => {
  flushSourceEdit();
  vscode.postMessage({ type: 'openNativeSource' });
});
bindButton('source-reload', reloadConflictingSource);
bindButton('empty-open-source', openSourceOnly);
bindButton('empty-open-gallery', () => vscode.postMessage({ type: 'openDiagramGallery' }));
bindButton('error-open-source', openSourceOnly);
bindButton('error-retry', retryRender);
bindButton('refresh', refreshDocument);
bindButton('open-new-window', () => vscode.postMessage({ type: 'openInNewWindow' }));
bindButton('theme-picker', toggleAppearancePopover);
bindButton('appearance-close', closeAppearancePopover);
bindButton('search-open', openDiagramSearch);
bindButton('diagram-search-close', closeDiagramSearch);
bindButton('diagram-search-previous', () => selectSearchMatch(-1));
bindButton('diagram-search-next', () => selectSearchMatch(1));
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
bindButton('export-open', openExportDialog);
bindButton('export-close', closeExportDialog);
bindButton('export-profile-save', saveExportProfile);
bindButton('export-profile-delete', deleteExportProfile);
bindButton('export-copy-svg-original', copyOriginalSvg);
bindButton('export-copy-svg-optimized', copyOptimizedSvg);
bindButton('export-copy-png', copyPng);
bindButton('export-folder', exportFolder);
bindButton('export-save', saveExport);

exportForm.addEventListener('submit', (event) => event.preventDefault());
exportDialog.addEventListener('click', (event) => {
  if (event.target === exportDialog) {
    closeExportDialog();
  }
});
exportProfileSelect.addEventListener('change', applySelectedExportProfile);
for (const control of Array.from(exportForm.querySelectorAll('input, select'))) {
  if (
    control === exportProfileSelect ||
    control === exportProfileName
  ) {
    continue;
  }
  control.addEventListener('input', handleExportSettingsChanged);
  control.addEventListener('change', handleExportSettingsChanged);
}

themeGallery.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-theme]');
  if (button && isDiagramTheme(button.dataset.theme)) setDiagramTheme(button.dataset.theme);
});
densityPicker.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-density]');
  if (button && isDiagramDensity(button.dataset.density)) setDiagramDensity(button.dataset.density);
});
patternPicker.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-pattern]');
  const pattern = button?.dataset.pattern;
  if (pattern === 'none' || pattern === 'dots' || pattern === 'grid') setDiagramPattern(pattern);
});
surfacePicker.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-surface]');
  if (button?.dataset.surface) setDiagramSurfacePreset(button.dataset.surface as DiagramSurfacePreset);
});
surfaceCustomColor.addEventListener('input', () => {
  setDiagramSurface({
    ...configuration.diagramSurface,
    customColor: surfaceCustomColor.value,
    preset: 'custom',
  });
});
sourceEditor.addEventListener('input', handleSourceInput);
sourceEditor.addEventListener('scroll', () => {
  sourceLineNumbers.scrollTop = sourceEditor.scrollTop;
});
sourceEditor.addEventListener('blur', flushSourceEdit);
sourceEditor.addEventListener('keydown', handleSourceEditorKeydown);
searchInput.addEventListener('input', updateDiagramSearch);
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    selectSearchMatch(event.shiftKey ? -1 : 1);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closeDiagramSearch();
  }
});
document.addEventListener('pointerdown', (event) => {
  if (!appearancePopover.hidden &&
      !appearancePopover.contains(event.target as Node) &&
      !themePicker.contains(event.target as Node)) {
    closeAppearancePopover();
  }
});

window.addEventListener('keydown', (event) => {
  if ((event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f')) &&
      !exportDialog.open && !isTypingTarget(event.target)) {
    event.preventDefault();
    openDiagramSearch();
    return;
  }
  if (event.key === 'Escape' && !appearancePopover.hidden) {
    closeAppearancePopover();
    return;
  }
  if (
    event.key.toLowerCase() === 'p' &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !exportDialog.open &&
    !isTypingTarget(event.target)
  ) {
    event.preventDefault();
    vscode.postMessage({ type: 'cycleEditorMode' });
    return;
  }
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
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      return;
    }
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.012 : 0.002));
    setZoomAtPoint(zoom * factor, event.clientX, event.clientY);
  },
  { passive: false },
);

for (const target of [viewport, navigationControls]) {
  target.addEventListener('mouseenter', updateNavigationControlsVisibility);
  target.addEventListener('mouseleave', updateNavigationControlsVisibility);
  target.addEventListener('focusin', updateNavigationControlsVisibility);
  target.addEventListener('focusout', updateNavigationControlsVisibility);
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Alt') updatePanAffordance(true);
});
window.addEventListener('keyup', (event) => {
  if (event.key === 'Alt') updatePanAffordance(false);
});
window.addEventListener('blur', () => updatePanAffordance(false));

viewport.addEventListener('scroll', () => {
  savedScrollLeft = viewport.scrollLeft;
  savedScrollTop = viewport.scrollTop;
  schedulePersistState();
  scheduleMinimapViewportUpdate();
});

installDragToPan();
installMinimapNavigation();
installPreviewFocus();
installSourceNavigation();
installSplitResize();
updateNavigationConfiguration();

new ResizeObserver(() => {
  if (editorMode !== 'source' && autoFit && !diagram.hidden) {
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
  applyCanvasAppearance();
  if (
    latestSource &&
    (diagramTheme === 'adaptive' || diagramTheme === 'sketch' ||
      configuration.diagramSurface.preset === 'editor' ||
      configuration.diagramFontFamily === 'vscode')
  ) {
    scheduleRender(latestSource, 0);
  }
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

window.addEventListener('pagehide', () => {
  flushSourceEdit();
  persistState();
  clearMinimapThumbnail();
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
  const fontFamily = configuration.diagramFontFamily;
  const appearance = currentAppearance();
  const controller = new AbortController();
  activeRenderController = controller;
  rendering = true;

  if (!/\S/u.test(source)) {
    lastSvg = '';
    diagramSize.textContent = '—';
    copyButton.disabled = true;
    saveSvgButton.disabled = true;
    exportOpenButton.disabled = true;
    showState('empty');
    renderStatus.textContent = 'Empty file';
    vscode.postMessage({ type: 'clearDiagnostic', version: latestVersion, rendered: false });
    activeRenderController = undefined;
    rendering = false;
    return;
  }

  showState('loading');
  const startedAt = performance.now();
  const renderId = `mermaid-preview-${request}`;

  try {
    await prepareMermaidExtensions(source, fontFamily);
    throwIfCancelled(controller.signal, request);
    initializeMermaid(appearance, fontFamily);

    const { svg } = await mermaid.render(renderId, source);
    throwIfCancelled(controller.signal, request);

    diagram.innerHTML = svg;
    diagram.dataset.version = String(latestVersion);
    lastSvg = svg;
    clearMinimapThumbnail();
    lastSvgFontFamily = fontFamily;
    lastSvgAppearance = appearanceSignature(appearance);
    const svgElement = diagram.querySelector('svg');
    if (!svgElement) {
      throw new Error('Mermaid did not produce an SVG element.');
    }

    readNaturalSize(svgElement);
    prepareDiagramInteractivity();
    updateDiagramSearch();
    showState('diagram');
    copyButton.disabled = false;
    saveSvgButton.disabled = false;
    exportOpenButton.disabled = false;
    if (exportDialogRequested) {
      exportDialogRequested = false;
      openExportDialog();
    }
    if (autoFit && editorMode !== 'source') {
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
    vscode.postMessage({ type: 'clearDiagnostic', version: latestVersion, rendered: true });
  } catch (error: unknown) {
    cleanupFailedRender(renderId);
    if (error instanceof RenderCancelledError) {
      return;
    }
    if (request === latestRequest) {
      lastSvg = '';
      diagramSize.textContent = '—';
      copyButton.disabled = true;
      saveSvgButton.disabled = true;
      exportOpenButton.disabled = true;
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

function setZoomAtPoint(value: number, clientX: number, clientY: number): void {
  const svg = diagram.querySelector('svg');
  if (!svg) {
    setZoom(value, false);
    return;
  }
  const oldZoom = zoom;
  const oldBounds = svg.getBoundingClientRect();
  const diagramX = (clientX - oldBounds.left) / oldZoom;
  const diagramY = (clientY - oldBounds.top) / oldZoom;
  zoom = clamp(value, 0.15, 4);
  autoFit = false;
  applyZoom();
  const newBounds = svg.getBoundingClientRect();
  viewport.scrollBy({
    left: newBounds.left + diagramX * zoom - clientX,
    top: newBounds.top + diagramY * zoom - clientY,
  });
  savedScrollLeft = viewport.scrollLeft;
  savedScrollTop = viewport.scrollTop;
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
  splitRatio = state.splitRatio;
  applySplitRatio();
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
    splitRatio,
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
    updatePanAffordance(false);
    window.requestAnimationFrame(updateMinimap);
  } else {
    updatePanAffordance(false);
    minimap.hidden = true;
  }
}

function currentAppearance(theme: DiagramTheme = diagramTheme): DiagramAppearance {
  return resolveDiagramAppearance(
    theme,
    vscodeColorScheme(),
    configuration.diagramSurface,
    configuration.diagramDensity,
  );
}

function appearanceSignature(appearance: DiagramAppearance): string {
  return `${appearance.theme}:${appearance.look}:${appearance.handDrawnSeed ?? ''}:${appearance.density}`;
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
    above: 'Source above preview in one editor',
    beside: 'Source beside preview in one editor',
    preview: 'Preview only',
    source: 'Source only',
  };
  workspace.classList.remove(
    'workspace--preview',
    'workspace--source',
    'workspace--beside',
    'workspace--above',
  );
  workspace.classList.add(`workspace--${editorMode}`);
  const sourceVisible = editorMode !== 'preview';
  const previewVisible = editorMode !== 'source';
  sourcePane.setAttribute('aria-hidden', String(!sourceVisible));
  previewPane.setAttribute('aria-hidden', String(!previewVisible));
  splitHandle.setAttribute(
    'aria-orientation',
    editorMode === 'above' ? 'horizontal' : 'vertical',
  );
  editorLayoutButton.disabled = false;
  editorLayoutLabel.textContent = labels[editorMode];
  const detachedSuffix = detachedPreview ? ' in this detached window' : '';
  editorLayoutButton.title =
    `Editor layout: ${descriptions[editorMode]}${detachedSuffix} (P to cycle)`;
  editorLayoutButton.setAttribute(
    'aria-label',
    `Choose editor layout, current layout: ${descriptions[editorMode]}${detachedSuffix}; ` +
      'press P to cycle preview layouts',
  );
  applySplitRatio();
  window.requestAnimationFrame(() => {
    if (previewVisible && autoFit && !diagram.hidden) {
      fitDiagram();
    } else {
      updateMinimap();
    }
  });
}

function updateFileSize(byteLength: number): void {
  fileSize.textContent = formatByteLength(byteLength);
  fileSize.title = `${byteLength.toLocaleString()} bytes`;
}

function formatDimension(value: number): string {
  return Math.round(value).toLocaleString();
}

function createMinimapThumbnail(svgSource: string): HTMLImageElement | undefined {
  if (svgSource.length > 5 * 1024 * 1024) {
    return undefined;
  }
  const thumbnail = document.createElement('img');
  thumbnail.alt = '';
  thumbnail.decoding = 'async';
  thumbnail.draggable = false;
  minimapObjectUrl = URL.createObjectURL(new Blob([svgSource], { type: 'image/svg+xml' }));
  thumbnail.src = minimapObjectUrl;
  minimapDiagram.replaceChildren(thumbnail);
  return thumbnail;
}

function clearMinimapThumbnail(): void {
  minimapDiagram.replaceChildren();
  if (minimapObjectUrl) {
    URL.revokeObjectURL(minimapObjectUrl);
    minimapObjectUrl = undefined;
  }
}

function updateMinimap(): void {
  const hasOverflow =
    viewport.scrollWidth > viewport.clientWidth + 1 ||
    viewport.scrollHeight > viewport.clientHeight + 1;
  const visible = configuration.minimapEnabled && !diagram.hidden && hasOverflow;
  minimap.hidden = !visible;
  if (!visible) {
    clearMinimapThumbnail();
    return;
  }

  const svg = diagram.querySelector('svg');
  const thumbnail = minimapDiagram.querySelector('img') ?? createMinimapThumbnail(lastSvg);
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
  scheduleMinimapViewportUpdate();
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

function scheduleMinimapViewportUpdate(): void {
  if (minimapViewportFrame !== undefined) return;
  minimapViewportFrame = window.requestAnimationFrame(() => {
    minimapViewportFrame = undefined;
    updateMinimapViewport();
  });
}

function updateThemePicker(): void {
  const labels: Record<DiagramTheme, string> = {
    adaptive: 'Adaptive', base: 'Base', dark: 'Dark', default: 'Default', forest: 'Forest',
    neo: 'Neo', 'neo-dark': 'Neo Dark', neutral: 'Neutral', 'redux-color': 'Vibrant',
    'redux-dark-color': 'Vibrant Dark', sketch: 'Sketch',
  };
  const label = labels[diagramTheme];
  appearanceLabel.textContent = label;
  themePicker.title = `Diagram appearance: ${label}`;
  themePicker.setAttribute('aria-label', `Diagram appearance: ${label}`);
  for (const button of Array.from(themeGallery.querySelectorAll<HTMLButtonElement>('[data-theme]'))) {
    button.setAttribute('aria-pressed', String(button.dataset.theme === diagramTheme));
  }
}

function toggleAppearancePopover(): void {
  appearancePopover.hidden = !appearancePopover.hidden;
  themePicker.setAttribute('aria-expanded', String(!appearancePopover.hidden));
}

function closeAppearancePopover(): void {
  appearancePopover.hidden = true;
  themePicker.setAttribute('aria-expanded', 'false');
}

function setDiagramTheme(theme: DiagramTheme): void {
  if (theme === diagramTheme) return;
  diagramTheme = theme;
  configuration = { ...configuration, diagramTheme: theme };
  updateThemePicker();
  applyCanvasAppearance();
  vscode.postMessage({ type: 'setDiagramTheme', theme });
  if (latestSource) scheduleRender(latestSource, 0);
}

function setDiagramDensity(density: DiagramDensity): void {
  if (density === configuration.diagramDensity) return;
  configuration = { ...configuration, diagramDensity: density };
  applyCanvasAppearance();
  vscode.postMessage({ type: 'setDiagramDensity', density });
  if (latestSource) scheduleRender(latestSource, 0);
}

function setDiagramPattern(pattern: DiagramSurfacePattern): void {
  setDiagramSurface({ ...configuration.diagramSurface, pattern });
}

function setDiagramSurfacePreset(preset: DiagramSurfacePreset): void {
  setDiagramSurface({ ...configuration.diagramSurface, preset });
}

function setDiagramSurface(surface: DiagramSurfaceConfiguration): void {
  configuration = { ...configuration, diagramSurface: surface };
  applyCanvasAppearance();
  vscode.postMessage({ type: 'setDiagramSurface', surface });
  if (latestSource && (diagramTheme === 'adaptive' || diagramTheme === 'sketch')) {
    scheduleRender(latestSource, 0);
  }
}

function applyCanvasAppearance(): void {
  const editorColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--vscode-editor-background').trim() || '#ffffff';
  const background = diagramSurfaceColor(configuration.diagramSurface, editorColor) ?? editorColor;
  document.documentElement.style.setProperty('--diagram-canvas-background', background);
  document.documentElement.style.setProperty(
    '--diagram-pattern-ink',
    isDarkHexColor(background) ? '#ffffff18' : '#0f172a17',
  );
  for (const surface of [viewport, minimap]) {
    surface.classList.toggle('pattern-dots', configuration.diagramSurface.pattern === 'dots');
    surface.classList.toggle('pattern-grid', configuration.diagramSurface.pattern === 'grid');
  }
  for (const button of Array.from(densityPicker.querySelectorAll<HTMLButtonElement>('[data-density]'))) {
    button.classList.toggle('is-active', button.dataset.density === configuration.diagramDensity);
  }
  for (const button of Array.from(patternPicker.querySelectorAll<HTMLButtonElement>('[data-pattern]'))) {
    button.classList.toggle('is-active', button.dataset.pattern === configuration.diagramSurface.pattern);
  }
  for (const button of Array.from(surfacePicker.querySelectorAll<HTMLButtonElement>('[data-surface]'))) {
    button.classList.toggle('is-active', button.dataset.surface === configuration.diagramSurface.preset);
  }
  surfaceCustomColor.value = configuration.diagramSurface.customColor;
  surfaceCustomColor.closest('.surface-swatch')?.classList.toggle(
    'is-active', configuration.diagramSurface.preset === 'custom',
  );
}

function openExportDialog(): void {
  if (!lastSvg || !latestSource) {
    exportDialogRequested = true;
    return;
  }
  renderExportProfileOptions();
  writeExportForm(exportSettings);
  if (!exportDialog.open) {
    exportDialog.showModal();
  }
  scheduleExportPreview();
}

function closeExportDialog(): void {
  if (exportPreviewTimer !== undefined) {
    window.clearTimeout(exportPreviewTimer);
    exportPreviewTimer = undefined;
  }
  exportPreviewGeneration += 1;
  if (exportDialog.open) {
    exportDialog.close();
  }
}

function writeExportForm(settingsValue: ExportSettings): void {
  const settings = normalizeExportSettings(settingsValue);
  exportFormat.value = settings.format;
  exportTheme.value = settings.theme;
  exportScale.value = String(settings.scale);
  exportDpi.value = String(settings.dpi);
  exportMargin.value = String(settings.margin);
  exportBackground.value = settings.background;
  exportBackgroundColor.value = settings.backgroundColor;
  exportNameTemplate.value = settings.fileNameTemplate;
  exportOptimize.checked = settings.optimizeSvg;
  exportMetadata.checked = settings.includeMetadata;
  exportSvgOriginal.checked = settings.svgVariant === 'original';
  updateExportFieldAvailability();
}

function readExportForm(): ExportSettings {
  const editorColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--vscode-editor-background').trim() || '#ffffff';
  return normalizeExportSettings({
    background: exportBackground.value,
    backgroundColor: exportBackgroundColor.value,
    dpi: Number(exportDpi.value),
    density: configuration.diagramDensity,
    fileNameTemplate: exportNameTemplate.value,
    format: exportFormat.value,
    includeMetadata: exportMetadata.checked,
    margin: Number(exportMargin.value),
    optimizeSvg: exportOptimize.checked,
    previewBackgroundColor:
      diagramSurfaceColor(configuration.diagramSurface, editorColor) ?? editorColor,
    scale: Number(exportScale.value),
    svgVariant: exportSvgOriginal.checked ? 'original' : 'optimized',
    theme: exportTheme.value,
  });
}

function handleExportSettingsChanged(): void {
  exportSettings = readExportForm();
  exportProfileSelect.value = '';
  exportProfileDelete.disabled = true;
  updateExportFieldAvailability();
  scheduleExportPreview();
}

function updateExportFieldAvailability(): void {
  const isOriginalSvg = exportFormat.value === 'svg' && exportSvgOriginal.checked;
  exportBackgroundColor.disabled = exportBackground.value !== 'color' || isOriginalSvg;
  exportScale.disabled = exportFormat.value === 'svg';
  exportDpi.disabled = exportFormat.value === 'svg';
  exportMargin.disabled = isOriginalSvg;
  exportBackground.disabled = isOriginalSvg;
  exportOptimize.disabled = isOriginalSvg;
  exportMetadata.disabled = isOriginalSvg;
  exportSvgOriginal.disabled = exportFormat.value !== 'svg';
}

function renderExportProfileOptions(): void {
  const selected = exportProfileSelect.value;
  exportProfileSelect.replaceChildren(new Option('Custom settings', ''));
  for (const profile of exportProfiles) {
    exportProfileSelect.add(new Option(profile.name, profile.id));
  }
  exportProfileSelect.value = exportProfiles.some((profile) => profile.id === selected)
    ? selected
    : '';
  exportProfileDelete.disabled = !exportProfileSelect.value;
}

function applySelectedExportProfile(): void {
  const profile = exportProfiles.find((entry) => entry.id === exportProfileSelect.value);
  exportProfileDelete.disabled = !profile;
  if (!profile) {
    exportProfileName.value = '';
    return;
  }
  exportProfileName.value = profile.name;
  exportSettings = normalizeExportSettings(profile.settings);
  writeExportForm(exportSettings);
  scheduleExportPreview();
}

function saveExportProfile(): void {
  const selectedId = exportProfileSelect.value;
  const name = exportProfileName.value.trim() || `Export profile ${exportProfiles.length + 1}`;
  const profile: ExportProfile = {
    id: selectedId || crypto.randomUUID(),
    name,
    settings: readExportForm(),
  };
  const index = exportProfiles.findIndex((entry) => entry.id === profile.id);
  if (index >= 0) {
    exportProfiles[index] = profile;
  } else {
    exportProfiles.push(profile);
  }
  exportProfiles = normalizeExportProfiles(exportProfiles);
  vscode.postMessage({ type: 'saveExportProfiles', profiles: exportProfiles });
  renderExportProfileOptions();
  exportProfileSelect.value = profile.id;
  exportProfileDelete.disabled = false;
  renderStatus.textContent = `Export profile “${profile.name}” saved`;
}

function deleteExportProfile(): void {
  const selectedId = exportProfileSelect.value;
  if (!selectedId) {
    return;
  }
  exportProfiles = exportProfiles.filter((entry) => entry.id !== selectedId);
  vscode.postMessage({ type: 'saveExportProfiles', profiles: exportProfiles });
  exportProfileName.value = '';
  renderExportProfileOptions();
  renderStatus.textContent = 'Export profile deleted';
}

function scheduleExportPreview(): void {
  exportPreviewGeneration += 1;
  if (exportPreviewTimer !== undefined) {
    window.clearTimeout(exportPreviewTimer);
  }
  exportPreviewSpinner.hidden = false;
  exportPreviewError.hidden = true;
  exportPreviewTimer = window.setTimeout(() => {
    exportPreviewTimer = undefined;
    const generation = exportPreviewGeneration;
    queueExportJob(async () => {
      if (!exportDialog.open || generation !== exportPreviewGeneration) {
        return;
      }
      try {
        const settings = readExportForm();
        const fontFamily = configuration.diagramFontFamily;
        const svg = await renderSvgForExport(latestSource, settings.theme, fontFamily);
        const preview = await renderExportPreview({
          fileName: fileName.textContent || 'diagram.mmd',
          fontFamily,
          metadata: currentExportMetadata(),
          settings,
          svg,
        });
        if (generation !== exportPreviewGeneration) {
          return;
        }
        exportPreviewImage.src = preview.dataUrl;
        exportPreviewMetrics.textContent =
          `${preview.width.toLocaleString()} × ${preview.height.toLocaleString()} px · ` +
          `${settings.dpi} DPI · ${settings.format.toUpperCase()}`;
        exportPreviewSpinner.hidden = true;
      } catch (error: unknown) {
        if (generation === exportPreviewGeneration) {
          showExportError(error);
        }
      }
    });
  }, 180);
}

function saveExport(): void {
  queueExportJob(async () => {
    setExportBusy(true);
    try {
      const artifact = await createArtifact(
        latestSource,
        latestSourceUri,
        fileName.textContent || 'diagram.mmd',
        readExportForm(),
      );
      vscode.postMessage({ type: 'saveExport', artifact: serializeArtifact(artifact) });
      renderStatus.textContent = `${artifact.format.toUpperCase()} ready to save`;
    } catch (error: unknown) {
      showExportError(error);
    } finally {
      setExportBusy(false);
    }
  });
}

function exportFolder(): void {
  exportSettings = readExportForm();
  vscode.postMessage({ type: 'exportFolder', settings: exportSettings });
}

function copyOriginalSvg(): void {
  if (lastSvg) {
    vscode.postMessage({ type: 'copySvg', svg: lastSvg });
  }
}

function copyOptimizedSvg(): void {
  queueExportJob(async () => {
    try {
      const settings = normalizeExportSettings({
        ...readExportForm(),
        format: 'svg',
        optimizeSvg: true,
        svgVariant: 'optimized',
      });
      const fontFamily = configuration.diagramFontFamily;
      const svg = await renderSvgForExport(latestSource, settings.theme, fontFamily);
      const prepared = prepareSvg(
        svg,
        settings,
        currentExportMetadata(),
        fontFamily,
      );
      vscode.postMessage({ type: 'copySvg', svg: prepared.source });
    } catch (error: unknown) {
      showExportError(error);
    }
  });
}

function copyPng(): void {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    showExportError(new Error('Image clipboard access is unavailable in this VS Code version.'));
    return;
  }

  setExportBusy(true);
  try {
    // Clipboard access must start during the click's user activation. Chromium
    // accepts a promised Blob, so PNG rendering can finish asynchronously.
    const clipboardWrite = writePngToClipboard(
      (items) => navigator.clipboard.write(items),
      (data) => new ClipboardItem(data),
      () => new Promise<Blob>((resolvePromise, rejectPromise) => {
        queueExportJob(async () => {
          try {
            const artifact = await createArtifact(
              latestSource,
              latestSourceUri,
              fileName.textContent || 'diagram.mmd',
              normalizeExportSettings({ ...readExportForm(), format: 'png' }),
            );
            resolvePromise(
              new Blob([Uint8Array.from(artifact.bytes).buffer], { type: 'image/png' }),
            );
          } catch (error: unknown) {
            rejectPromise(
              error instanceof Error ? error : new Error(errorMessageOf(error)),
            );
          }
        });
      }),
    );
    void clipboardWrite
      .then(() => {
        renderStatus.textContent = 'PNG copied to the clipboard';
      })
      .catch((error: unknown) => {
        showExportError(error);
      })
      .finally(() => {
        setExportBusy(false);
      });
  } catch (error: unknown) {
    showExportError(error);
    setExportBusy(false);
  }
}

async function createArtifact(
  source: string,
  sourceUri: string,
  sourceFileName: string,
  rawSettings: ExportSettings,
): Promise<ExportArtifact> {
  const settings = normalizeExportSettings(rawSettings);
  const fontFamily = configuration.diagramFontFamily;
  const svg = await renderSvgForExport(source, settings.theme, fontFamily);
  return renderExportArtifact({
    fileName: sourceFileName,
    fontFamily,
    metadata: {
      exportedAt: new Date().toISOString(),
      fileName: sourceFileName,
      sourceUri,
    },
    settings,
    svg,
  });
}

async function renderSvgForExport(
  source: string,
  theme: DiagramTheme,
  fontFamily: PreviewConfiguration['diagramFontFamily'],
): Promise<string> {
  const appearance = currentAppearance(theme);
  if (
    source === latestSource &&
    appearanceSignature(appearance) === lastSvgAppearance &&
    fontFamily === lastSvgFontFamily &&
    lastSvg
  ) {
    return lastSvg;
  }
  const renderId = `mermaid-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    await prepareMermaidExtensions(source, fontFamily);
    initializeMermaid(appearance, fontFamily);
    return (await mermaid.render(renderId, source)).svg;
  } finally {
    cleanupFailedRender(renderId);
  }
}

function currentExportMetadata(): ExportSourceMetadata {
  return {
    exportedAt: new Date().toISOString(),
    fileName: fileName.textContent || 'diagram.mmd',
    sourceUri: latestSourceUri,
  };
}

function serializeArtifact(artifact: ExportArtifact): SerializedExportArtifact {
  return {
    dataBase64: artifactDataBase64(artifact),
    fileName: artifact.fileName,
    format: artifact.format,
    height: artifact.height,
    mimeType: artifact.mimeType,
    width: artifact.width,
  };
}

function setExportBusy(busy: boolean): void {
  for (const id of [
    'export-save',
    'export-folder',
    'export-copy-svg-original',
    'export-copy-svg-optimized',
    'export-copy-png',
  ]) {
    element<HTMLButtonElement>(id).disabled = busy;
  }
  exportPreviewSpinner.hidden = !busy;
}

function showExportError(error: unknown): void {
  exportPreviewSpinner.hidden = true;
  exportPreviewError.hidden = false;
  exportPreviewError.textContent = errorMessageOf(error);
  renderStatus.textContent = 'Export failed';
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function queueExportJob(task: () => Promise<void>): void {
  exportJob = exportJob.then(task, task);
}

function initializeMermaid(
  appearance: DiagramAppearance,
  fontFamily: PreviewConfiguration['diagramFontFamily'],
): void {
  const spacing = diagramSpacing(appearance.density);
  mermaid.initialize({
    deterministicIds: true,
    deterministicIDSeed: 'mermaid-preview-offline',
    startOnLoad: false,
    securityLevel: 'strict',
    theme: appearance.theme,
    look: appearance.look,
    handDrawnSeed: appearance.handDrawnSeed,
    fontFamily: resolvedDiagramFontStack(fontFamily),
    flowchart: { htmlLabels: false, useMaxWidth: false, ...spacing.flowchart },
    sequence: { useMaxWidth: false, ...spacing.sequence },
    gantt: { useMaxWidth: false },
  });
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
  editorMode = 'source';
  updateEditorMode();
  requestAnimationFrame(() => sourceEditor.focus({ preventScroll: true }));
  vscode.postMessage({ type: 'setEditorMode', mode: 'source' });
}

function receiveDocumentSource(source: string, version: number): void {
  if (sourceDocumentVersion < 0) {
    setSourceDocument(source, version);
    return;
  }
  if (sourceEditInFlight?.source === source) {
    sourceDocumentVersion = version;
    lastAcknowledgedSource = source;
    updateSourceEditStatus();
    return;
  }
  if (!sourceEditInFlight && sourceEditor.value === lastAcknowledgedSource) {
    setSourceDocument(source, version);
    return;
  }
  if (source === lastAcknowledgedSource) {
    sourceDocumentVersion = version;
    return;
  }
  conflictingDocument = { source, version };
  sourceReloadButton.hidden = false;
  sourceEditStatus.textContent = 'File changed elsewhere';
}

function setSourceDocument(source: string, version: number): void {
  sourceDocumentVersion = version;
  lastAcknowledgedSource = source;
  conflictingDocument = undefined;
  sourceReloadButton.hidden = true;
  if (sourceEditor.value !== source) {
    const selectionStart = Math.min(sourceEditor.selectionStart, source.length);
    const selectionEnd = Math.min(sourceEditor.selectionEnd, source.length);
    sourceEditor.value = source;
    sourceEditor.setSelectionRange(selectionStart, selectionEnd);
  }
  updateSourceLineNumbers();
  updateSourceEditStatus();
}

function handleSourceInput(): void {
  updateSourceLineNumbers();
  sourceEditStatus.textContent = 'Editing…';
  if (sourceEditTimer !== undefined) {
    window.clearTimeout(sourceEditTimer);
  }
  sourceEditTimer = window.setTimeout(() => {
    sourceEditTimer = undefined;
    flushSourceEdit();
  }, 120);
}

function flushSourceEdit(): void {
  if (sourceEditTimer !== undefined) {
    window.clearTimeout(sourceEditTimer);
    sourceEditTimer = undefined;
  }
  if (sourceEditInFlight || sourceDocumentVersion < 0) {
    return;
  }
  const source = sourceEditor.value;
  if (source === lastAcknowledgedSource) {
    updateSourceEditStatus();
    return;
  }
  sourceEditSequence += 1;
  sourceEditInFlight = { requestId: sourceEditSequence, source };
  sourceEditStatus.textContent = 'Saving…';
  vscode.postMessage({
    type: 'replaceDocument',
    requestId: sourceEditSequence,
    source,
    version: sourceDocumentVersion,
  });
}

function handleSourceEditResult(
  message: Extract<ExtensionToWebviewMessage, { type: 'sourceEditResult' }>,
): void {
  const pending = sourceEditInFlight;
  if (!pending || pending.requestId !== message.requestId) {
    return;
  }
  sourceEditInFlight = undefined;
  sourceDocumentVersion = message.version;
  if (message.applied) {
    lastAcknowledgedSource = pending.source;
    conflictingDocument = undefined;
    sourceReloadButton.hidden = true;
    updateSourceEditStatus();
    if (sourceEditor.value !== lastAcknowledgedSource) {
      flushSourceEdit();
    }
    return;
  }
  if (message.documentSource !== undefined) {
    conflictingDocument = {
      source: message.documentSource,
      version: message.version,
    };
    sourceReloadButton.hidden = false;
  }
  sourceEditStatus.textContent = message.error
    ? `Save failed: ${message.error}`
    : 'File changed elsewhere';
}

function updateSourceEditStatus(): void {
  if (conflictingDocument) {
    sourceEditStatus.textContent = 'File changed elsewhere';
  } else if (sourceEditInFlight) {
    sourceEditStatus.textContent = 'Saving…';
  } else if (sourceEditor.value !== lastAcknowledgedSource) {
    sourceEditStatus.textContent = 'Unsaved';
  } else {
    sourceEditStatus.textContent = 'Saved';
  }
}

function reloadConflictingSource(): void {
  if (!conflictingDocument) return;
  setSourceDocument(conflictingDocument.source, conflictingDocument.version);
}

function updateSourceLineNumbers(): void {
  const lineCount = Math.max(sourceEditor.value.split('\n').length, 1);
  let numbers = '';
  for (let line = 1; line <= lineCount; line += 1) {
    numbers += `${line}\n`;
  }
  sourceLineNumbers.textContent = numbers;
  sourceLineNumbers.scrollTop = sourceEditor.scrollTop;
}

function handleSourceEditorKeydown(event: KeyboardEvent): void {
  if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    const indentation = '  ';
    sourceEditor.setRangeText(
      indentation,
      sourceEditor.selectionStart,
      sourceEditor.selectionEnd,
      'end',
    );
    handleSourceInput();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    flushSourceEdit();
    vscode.postMessage({ type: 'saveDocument' });
    return;
  }
  if (event.altKey && event.key.toLowerCase() === 'p') {
    event.preventDefault();
    flushSourceEdit();
    vscode.postMessage({ type: 'cycleEditorMode' });
  }
}

function applySplitRatio(): void {
  workspace.style.setProperty('--source-ratio', `${Math.round(splitRatio * 10_000) / 100}%`);
  splitHandle.setAttribute('aria-valuenow', String(Math.round(splitRatio * 100)));
}

function installSplitResize(): void {
  let pointerId: number | undefined;
  const updateFromPointer = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) return;
    const bounds = workspace.getBoundingClientRect();
    const next = editorMode === 'above'
      ? (event.clientY - bounds.top) / Math.max(bounds.height, 1)
      : (event.clientX - bounds.left) / Math.max(bounds.width, 1);
    splitRatio = clamp(next, 0.2, 0.8);
    applySplitRatio();
    schedulePersistState();
  };
  const stop = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) return;
    splitHandle.releasePointerCapture(pointerId);
    pointerId = undefined;
    splitHandle.classList.remove('split-handle--dragging');
    persistState();
  };
  splitHandle.addEventListener('pointerdown', (event) => {
    if (editorMode !== 'above' && editorMode !== 'beside') return;
    pointerId = event.pointerId;
    splitHandle.setPointerCapture(pointerId);
    splitHandle.classList.add('split-handle--dragging');
    updateFromPointer(event);
  });
  splitHandle.addEventListener('pointermove', updateFromPointer);
  splitHandle.addEventListener('pointerup', stop);
  splitHandle.addEventListener('pointercancel', stop);
  splitHandle.addEventListener('keydown', (event) => {
    const decrease =
      (editorMode === 'beside' && event.key === 'ArrowLeft') ||
      (editorMode === 'above' && event.key === 'ArrowUp');
    const increase =
      (editorMode === 'beside' && event.key === 'ArrowRight') ||
      (editorMode === 'above' && event.key === 'ArrowDown');
    if (!decrease && !increase) return;
    event.preventDefault();
    splitRatio = clamp(splitRatio + (increase ? 0.05 : -0.05), 0.2, 0.8);
    applySplitRatio();
    persistState();
  });
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

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function focusPreviewSurface(): void {
  if (!exportDialog.open && editorMode !== 'source') {
    viewport.focus({ preventScroll: true });
  }
}

function focusActiveSurface(): void {
  if (editorMode === 'source') {
    sourceEditor.focus({ preventScroll: true });
  } else {
    focusPreviewSurface();
  }
}

function installPreviewFocus(): void {
  window.addEventListener(
    'pointerdown',
    (event) => {
      if (
        event.target instanceof Node &&
        previewPane.contains(event.target) &&
        !isInteractiveTarget(event.target) &&
        !exportDialog.open
      ) {
        focusPreviewSurface();
      }
    },
    { capture: true },
  );
}

const DIAGRAM_ITEM_SELECTOR =
  'g.node, g.rough-node, g.cluster, g.mindmap-node, g[class*="timeline-node"], .actor';

function prepareDiagramInteractivity(): void {
  for (const item of Array.from(diagram.querySelectorAll<SVGElement>(DIAGRAM_ITEM_SELECTOR))) {
    const target = item.classList.contains('actor') ? item.parentElement : item;
    target?.setAttribute('tabindex', '0');
  }
}

function clickableDiagramGroup(target: Element): Element | undefined {
  const group = target.closest(
    'g.node, g.rough-node, g.cluster, g.mindmap-node, g[class*="timeline-node"]',
  );
  if (group) return group;
  const actor = target.closest('.actor');
  return actor?.parentElement ?? undefined;
}

function sourceLineFor(group: Element): number | undefined {
  const lines = latestSource.split('\n');
  const rawId = group.id.replace(/^mermaid-(?:preview|export)-[^-]+-/, '');
  const idMatch = rawId.match(/^[A-Za-z][\w-]*-(.+)-\d+$/u);
  const identifier = idMatch?.[1] ?? (group.classList.contains('cluster') ? rawId : undefined);
  if (identifier) {
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const expression = new RegExp(`(^|[^\\w])${escaped}([^\\w]|$)`, 'u');
    const index = lines.findIndex((line) => expression.test(line));
    if (index >= 0) return index;
  }
  const label = group.querySelector('.nodeLabel, .label, text')?.textContent?.trim();
  if (!label) return undefined;
  const index = lines.findIndex((line) => line.includes(label));
  return index >= 0 ? index : undefined;
}

function installSourceNavigation(): void {
  diagram.addEventListener('pointerdown', (event) => {
    diagramPointerStart = { x: event.clientX, y: event.clientY };
  });
  diagram.addEventListener('click', (event) => {
    if (event.altKey || !(event.target instanceof Element)) return;
    if (diagramPointerStart &&
        (Math.abs(event.clientX - diagramPointerStart.x) > 4 ||
         Math.abs(event.clientY - diagramPointerStart.y) > 4)) return;
    const group = clickableDiagramGroup(event.target);
    if (!group) return;
    const line = sourceLineFor(group);
    if (line !== undefined) revealInternalSourceLine(line);
  });
  diagram.addEventListener('keydown', (event) => {
    if ((event.key !== 'Enter' && event.key !== ' ') || !(event.target instanceof Element)) return;
    const group = clickableDiagramGroup(event.target);
    if (!group) return;
    const line = sourceLineFor(group);
    if (line !== undefined) {
      event.preventDefault();
      revealInternalSourceLine(line);
    }
  });
}

function revealInternalSourceLine(line: number): void {
  if (editorMode === 'preview') {
    editorMode = 'beside';
    updateEditorMode();
    vscode.postMessage({ type: 'setEditorMode', mode: 'beside' });
  }
  const source = sourceEditor.value;
  let start = 0;
  for (let currentLine = 0; currentLine < line && start < source.length; currentLine += 1) {
    const nextBreak = source.indexOf('\n', start);
    start = nextBreak < 0 ? source.length : nextBreak + 1;
  }
  const end = source.indexOf('\n', start);
  sourceEditor.focus({ preventScroll: true });
  sourceEditor.setSelectionRange(start, end < 0 ? source.length : end);
  const lineHeight = Number.parseFloat(getComputedStyle(sourceEditor).lineHeight);
  if (Number.isFinite(lineHeight)) {
    sourceEditor.scrollTop = Math.max(0, line * lineHeight - sourceEditor.clientHeight / 2);
    sourceLineNumbers.scrollTop = sourceEditor.scrollTop;
  }
}

function clearSearchHighlights(): void {
  for (const item of Array.from(diagram.querySelectorAll('.diagram-search-dim, .diagram-search-hit'))) {
    item.classList.remove('diagram-search-dim', 'diagram-search-hit');
  }
}

function updateDiagramSearch(): void {
  clearSearchHighlights();
  searchMatches = [];
  searchIndex = -1;
  const query = searchInput.value.trim().toLocaleLowerCase();
  const svg = diagram.querySelector('svg');
  if (!query || !svg) {
    searchCount.textContent = '';
    return;
  }
  const seen = new Set<Element>();
  for (const label of Array.from(svg.querySelectorAll('text, .nodeLabel, .label'))) {
    if (!(label.textContent ?? '').toLocaleLowerCase().includes(query)) continue;
    const target = clickableDiagramGroup(label) ?? label;
    if (seen.has(target)) continue;
    seen.add(target);
    searchMatches.push(target);
  }
  if (!searchMatches.length) {
    searchCount.textContent = '0';
    return;
  }
  for (const item of Array.from(svg.querySelectorAll(DIAGRAM_ITEM_SELECTOR))) {
    const target = item.classList.contains('actor') ? item.parentElement : item;
    target?.classList.add('diagram-search-dim');
  }
  for (const match of searchMatches) match.classList.remove('diagram-search-dim');
  selectSearchMatch(1);
}

function selectSearchMatch(delta: number): void {
  if (!searchMatches.length) return;
  if (searchIndex >= 0) searchMatches[searchIndex]?.classList.remove('diagram-search-hit');
  searchIndex = (searchIndex + delta + searchMatches.length) % searchMatches.length;
  const match = searchMatches[searchIndex];
  if (!match) return;
  match.classList.add('diagram-search-hit');
  searchCount.textContent = `${searchIndex + 1}/${searchMatches.length}`;
  const matchBounds = match.getBoundingClientRect();
  const viewportBounds = viewport.getBoundingClientRect();
  viewport.scrollBy({
    behavior: 'smooth',
    left: matchBounds.left + matchBounds.width / 2 - viewportBounds.left - viewportBounds.width / 2,
    top: matchBounds.top + matchBounds.height / 2 - viewportBounds.top - viewportBounds.height / 2,
  });
}

function openDiagramSearch(): void {
  searchPanel.hidden = false;
  searchInput.focus();
  searchInput.select();
  updateDiagramSearch();
}

function closeDiagramSearch(): void {
  searchPanel.hidden = true;
  clearSearchHighlights();
  searchMatches = [];
  searchIndex = -1;
  searchCount.textContent = '';
  focusPreviewSurface();
}

function throwIfCancelled(signal: AbortSignal, request: number): void {
  if (signal.aborted || request !== latestRequest) {
    throw new RenderCancelledError();
  }
}

function installDragToPan(): void {
  let pointerId: number | undefined;
  let moved = false;
  let suppressNextClick = false;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;

  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || diagram.hidden || !canPanWithPointer(event.altKey)) {
      return;
    }
    event.preventDefault();
    pointerId = event.pointerId;
    moved = false;
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
    if (Math.abs(event.clientX - startX) > 3 || Math.abs(event.clientY - startY) > 3) {
      moved = true;
    }
    viewport.scrollLeft = startScrollLeft - (event.clientX - startX);
    viewport.scrollTop = startScrollTop - (event.clientY - startY);
  });

  const stopDragging = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) {
      return;
    }
    pointerId = undefined;
    suppressNextClick = moved;
    viewport.classList.remove('viewport--dragging');
    updatePanAffordance(event.altKey);
  };
  viewport.addEventListener('pointerup', stopDragging);
  viewport.addEventListener('pointercancel', stopDragging);
  viewport.addEventListener('click', (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      event.preventDefault();
      return;
    }
    if (!event.altKey || diagram.hidden) return;
    event.preventDefault();
    setZoomAtPoint(zoom * (event.shiftKey ? 0.8 : 1.25), event.clientX, event.clientY);
  });
}

function canPanWithPointer(altKey: boolean): boolean {
  return configuration.navigation.mouseNavigation === 'always' ||
    (configuration.navigation.mouseNavigation === 'alt' && altKey);
}

function updatePanAffordance(altKey: boolean): void {
  viewport.classList.toggle(
    'viewport--pan-ready',
    !diagram.hidden && canPanWithPointer(altKey),
  );
}

function updateNavigationConfiguration(): void {
  const visibility = configuration.navigation.controlsVisibility;
  navigationControls.hidden = visibility === 'never';
  navigationControls.classList.toggle(
    'toolbar__navigation--conditional',
    visibility === 'onHoverOrFocus',
  );
  updateNavigationControlsVisibility();
  updatePanAffordance(false);
}

function updateNavigationControlsVisibility(): void {
  const visible = configuration.navigation.controlsVisibility === 'always' ||
    viewport.matches(':hover') ||
    navigationControls.matches(':hover') ||
    viewport.contains(document.activeElement) ||
    navigationControls.contains(document.activeElement);
  navigationControls.classList.toggle('toolbar__navigation--visible', visible);
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
