import mermaid from 'mermaid';

import {
  DEFAULT_DIAGRAM_SURFACE,
  diagramSpacing,
  diagramSurfaceColor,
  isDarkHexColor,
  isDiagramDensity,
  resolveDiagramAppearance,
} from './appearance';

import {
  DocumentationDiagramController,
  type DocumentationDiagramState,
} from './documentationDiagramController';
import { resolvedDiagramFontStack } from './diagramFontAssets';
import type { DiagramFontFamily } from './diagramFont';
import { artifactDataBase64, renderExportArtifact } from './exportRenderer';
import { normalizeExportSettings } from './exportSettings';
import { prepareMermaidExtensions, registerOfflineIconPacks } from './mermaidExtensions';
import { isDiagramTheme } from './previewState';
import type {
  DocumentationPreviewBlock,
  DocumentationWebviewToExtensionMessage,
  ExtensionToDocumentationWebviewMessage,
} from './documentationProtocol';
import type {
  DiagramDensity,
  DiagramSurfaceConfiguration,
  DiagramSurfacePattern,
  DiagramSurfacePreset,
  DiagramTheme,
} from './protocol';

interface VsCodeApi {
  postMessage(message: DocumentationWebviewToExtensionMessage): void;
}

interface DocumentationCard {
  article: HTMLElement;
  canvas: HTMLElement;
  controllerConfiguration: string;
  diagram: HTMLElement;
  error: HTMLElement;
  settled: boolean;
  source: string;
}

declare function acquireVsCodeApi(): VsCodeApi;

registerOfflineIconPacks();
const vscode = acquireVsCodeApi();
const list = element<HTMLElement>('documentation-list');
const empty = element<HTMLElement>('documentation-empty');
const presentButton = element<HTMLButtonElement>('documentation-present');
const presentationControls = element<HTMLElement>('presentation-controls');
const presentationCounter = element<HTMLElement>('presentation-counter');
const presentationPrevious = element<HTMLButtonElement>('presentation-previous');
const presentationNext = element<HTMLButtonElement>('presentation-next');
const presentationThemeControl = element<HTMLElement>('presentation-theme-control');
const presentationThemeButton = element<HTMLButtonElement>('presentation-theme');
const presentationThemeMenu = element<HTMLElement>('presentation-theme-menu');
const presentationThemeGrid = element<HTMLElement>('presentation-theme-grid');
const presentationDensityPicker = element<HTMLElement>('presentation-density-picker');
const presentationPatternPicker = element<HTMLElement>('presentation-pattern-picker');
const presentationSurfacePicker = element<HTMLElement>('presentation-surface-picker');
const presentationSurfaceCustomColor = element<HTMLInputElement>(
  'presentation-surface-custom-color',
);
let renderSequence = 0;
let renderGeneration = 0;
let renderQueue = Promise.resolve();
let activeTheme: DiagramTheme = 'adaptive';
let activeFontFamily: DiagramFontFamily = 'vscode';
let activeDensity: DiagramDensity = 'comfortable';
let activeSurface: DiagramSurfaceConfiguration = DEFAULT_DIAGRAM_SURFACE;
let selectedTheme: DiagramTheme = activeTheme;
let selectedDensity: DiagramDensity = activeDensity;
let selectedSurface: DiagramSurfaceConfiguration = activeSurface;
let presentationMode = false;
let presentationIndex = 0;
const MAX_DOCUMENTATION_EXPORT_BASE64_BYTES = 192_000_000;
const diagramControllers = new Map<string, DocumentationDiagramController>();
const diagramStates = new Map<string, DocumentationDiagramState>();
const documentationCards = new Map<string, DocumentationCard>();

initializeMermaid(activeTheme, activeFontFamily);

presentButton.addEventListener('click', enterPresentation);
presentationPrevious.addEventListener('click', () => movePresentation(-1));
presentationNext.addEventListener('click', () => movePresentation(1));
element<HTMLButtonElement>('presentation-exit').addEventListener('click', exitPresentation);
presentationThemeButton.addEventListener('click', togglePresentationThemeMenu);
presentationThemeGrid.addEventListener('click', handlePresentationThemeClick);
presentationDensityPicker.addEventListener('click', handlePresentationDensityClick);
presentationPatternPicker.addEventListener('click', handlePresentationPatternClick);
presentationSurfacePicker.addEventListener('click', handlePresentationSurfaceClick);
presentationSurfaceCustomColor.addEventListener('input', previewPresentationCustomColor);
presentationSurfaceCustomColor.addEventListener('change', commitPresentationCustomColor);
element<HTMLButtonElement>('presentation-appearance-close').addEventListener(
  'click',
  closePresentationThemeMenu,
);
document.addEventListener('click', handleDocumentClick);
window.addEventListener('keydown', handlePresentationKey);

window.addEventListener(
  'message',
  (event: MessageEvent<ExtensionToDocumentationWebviewMessage>) => {
    if (event.data.type === 'documentationData') {
      void showDocumentation(event.data);
    } else {
      void renderDocumentationExport(event.data);
    }
  },
);

vscode.postMessage({ type: 'ready' });

async function showDocumentation(
  data: Extract<ExtensionToDocumentationWebviewMessage, { type: 'documentationData' }>,
): Promise<void> {
  const generation = ++renderGeneration;
  const surfaceAffectsRender =
    !diagramSurfacesEqual(activeSurface, data.surface) &&
    (activeTheme === 'adaptive' ||
      activeTheme === 'sketch' ||
      data.theme === 'adaptive' ||
      data.theme === 'sketch');
  const renderConfigurationChanged = activeTheme !== data.theme ||
    activeFontFamily !== data.fontFamily ||
    activeDensity !== data.density ||
    surfaceAffectsRender;
  activeTheme = data.theme;
  activeFontFamily = data.fontFamily;
  activeDensity = data.density;
  activeSurface = data.surface;
  selectedTheme = data.theme;
  selectedDensity = data.density;
  selectedSurface = data.surface;
  applyDocumentationSurface();
  initializeMermaid(activeTheme, activeFontFamily);
  updatePresentationAppearance(activeTheme, activeDensity, activeSurface);
  empty.hidden = data.blocks.length > 0;
  list.hidden = data.blocks.length === 0;
  presentButton.hidden = data.blocks.length === 0 || presentationMode;
  const controllerConfiguration = documentationControllerConfiguration(data);
  const nextCards = new Map<string, DocumentationCard>();
  const cardsToRender: Array<{ block: DocumentationPreviewBlock; card: DocumentationCard }> = [];

  for (const block of data.blocks) {
    const existing = documentationCards.get(block.id);
    if (
      existing?.settled &&
      existing.source === block.source &&
      !renderConfigurationChanged
    ) {
      updateDiagramCard(existing, block);
      if (existing.controllerConfiguration !== controllerConfiguration) {
        disposeDiagramController(block.id);
        existing.controllerConfiguration = controllerConfiguration;
        if (existing.diagram.querySelector('svg')) {
          diagramControllers.set(
            block.id,
            createDiagramController(existing, block, data, diagramStates.get(block.id)),
          );
        }
      }
      nextCards.set(block.id, existing);
      continue;
    }

    if (existing) {
      disposeDiagramController(block.id);
      existing.article.remove();
    }
    const card = createDiagramCard(block, controllerConfiguration);
    nextCards.set(block.id, card);
    cardsToRender.push({ block, card });
  }

  for (const [id, card] of documentationCards) {
    if (nextCards.has(id)) continue;
    disposeDiagramController(id);
    diagramStates.delete(id);
    card.article.remove();
  }
  documentationCards.clear();
  for (const [id, card] of nextCards) documentationCards.set(id, card);
  reconcileDocumentationCardOrder(nextCards.values());
  if (presentationMode) updatePresentation();

  for (const { block, card } of cardsToRender) {
    if (generation !== renderGeneration) return;
    const rendered = await queuedRender(
      card.diagram,
      card.error,
      block.source,
      data.fontFamily,
      generation,
    );
    if (generation !== renderGeneration) return;
    card.settled = true;
    if (rendered) {
      diagramControllers.set(
        block.id,
        createDiagramController(card, block, data, diagramStates.get(block.id)),
      );
    }
  }
}

function reconcileDocumentationCardOrder(cards: Iterable<DocumentationCard>): void {
  let current = list.firstElementChild;
  for (const card of cards) {
    if (card.article === current) {
      current = current.nextElementSibling;
    } else {
      list.insertBefore(card.article, current);
    }
  }
}

function createDiagramCard(
  block: DocumentationPreviewBlock,
  controllerConfiguration: string,
): DocumentationCard {
  const article = document.createElement('article');
  article.className = 'documentation-card';
  article.dataset.blockId = block.id;

  const canvas = document.createElement('div');
  canvas.className = 'documentation-canvas';
  canvas.classList.toggle('pattern-dots', activeSurface.pattern === 'dots');
  canvas.classList.toggle('pattern-grid', activeSurface.pattern === 'grid');
  canvas.tabIndex = 0;
  canvas.title = 'Double-click to reveal this Mermaid block in the source document';
  canvas.addEventListener('dblclick', (event) => {
    if (event.altKey) return;
    vscode.postMessage({ blockId: block.id, type: 'revealSource' });
  });
  const diagram = document.createElement('div');
  diagram.className = 'documentation-diagram';
  const error = document.createElement('pre');
  error.className = 'documentation-error';
  error.hidden = true;
  canvas.append(diagram, error);
  article.append(canvas);
  return {
    article,
    canvas,
    controllerConfiguration,
    diagram,
    error,
    settled: false,
    source: block.source,
  };
}

function updateDiagramCard(card: DocumentationCard, block: DocumentationPreviewBlock): void {
  card.article.dataset.blockId = block.id;
}

function documentationControllerConfiguration(
  data: Extract<ExtensionToDocumentationWebviewMessage, { type: 'documentationData' }>,
): string {
  return [
    data.maxHeight,
    data.navigation.controlsVisibility,
    data.navigation.mouseNavigation,
    data.resizable ? 'resizable' : 'fixed',
  ].join('\0');
}

function createDiagramController(
  card: DocumentationCard,
  block: DocumentationPreviewBlock,
  data: Extract<ExtensionToDocumentationWebviewMessage, { type: 'documentationData' }>,
  state?: DocumentationDiagramState,
): DocumentationDiagramController {
  card.canvas.style.height = '';
  card.canvas.style.maxHeight = '';
  return new DocumentationDiagramController(
    card.article,
    card.canvas,
    card.diagram,
    {
      maxHeight: data.maxHeight,
      navigation: data.navigation,
      onRevealSource: () => {
        vscode.postMessage({ blockId: block.id, type: 'revealSource' });
      },
      resizable: data.resizable,
      source: block.source,
    },
    state,
  );
}

function disposeDiagramController(id: string): void {
  const controller = diagramControllers.get(id);
  if (!controller) return;
  diagramStates.set(id, controller.dispose());
  diagramControllers.delete(id);
}

async function queuedRender(
  target: HTMLElement,
  errorTarget: HTMLElement,
  source: string,
  fontFamily: DiagramFontFamily,
  generation: number,
): Promise<boolean> {
  const task = async (): Promise<boolean> => {
    if (generation !== renderGeneration) return false;
    try {
      await prepareMermaidExtensions(source, fontFamily);
      const { svg } = await mermaid.render(`mermaid-document-${++renderSequence}`, source);
      if (generation !== renderGeneration) return false;
      target.innerHTML = svg;
      target.hidden = false;
      errorTarget.hidden = true;
      return true;
    } catch (error: unknown) {
      if (generation !== renderGeneration) return false;
      target.replaceChildren();
      target.hidden = true;
      errorTarget.textContent = errorMessageOf(error);
      errorTarget.hidden = false;
      removeTemporaryRenderNodes();
      return false;
    }
  };
  const queued = renderQueue.then(task, task);
  renderQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

function saveAndDisposeDiagramControllers(): void {
  for (const [id, controller] of diagramControllers) {
    diagramStates.set(id, controller.dispose());
  }
  diagramControllers.clear();
}

window.addEventListener('pagehide', saveAndDisposeDiagramControllers);

async function renderDocumentationExport(
  request: Extract<
    ExtensionToDocumentationWebviewMessage,
    { type: 'renderDocumentationExport' }
  >,
): Promise<void> {
  const execute = async (): Promise<void> => {
    try {
      const editorColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--vscode-editor-background').trim() || '#ffffff';
      const settings = normalizeExportSettings({
        ...request.settings,
        density: activeDensity,
        previewBackgroundColor: diagramSurfaceColor(activeSurface, editorColor) ?? editorColor,
      });
      initializeMermaid(settings.theme, request.fontFamily);
      const artifacts: Array<{
        artifact: {
          dataBase64: string;
          fileName: string;
          format: 'pdf' | 'png' | 'svg' | 'webp';
          height: number;
          mimeType: string;
          width: number;
        };
        blockId: string;
      }> = [];
      let totalBase64Bytes = 0;
      for (const block of request.blocks) {
        await prepareMermaidExtensions(block.source, request.fontFamily);
        const renderId = `mermaid-document-export-${++renderSequence}`;
        const { svg } = await mermaid.render(renderId, block.source);
        const artifact = await renderExportArtifact({
          fileName: block.fileName,
          maxRasterPixels: request.maxRasterPixels,
          metadata: {
            exportedAt: new Date().toISOString(),
            fileName: block.fileName,
            sourceUri: `${request.sourceUri}#${block.id}`,
          },
          settings,
          svg,
          fontFamily: request.fontFamily,
        });
        const dataBase64 = artifactDataBase64(artifact);
        totalBase64Bytes += dataBase64.length;
        if (totalBase64Bytes > MAX_DOCUMENTATION_EXPORT_BASE64_BYTES) {
          throw new Error(
            'The combined documentation export exceeds 192 MB. Export fewer diagrams at a time.',
          );
        }
        artifacts.push({
          artifact: {
            dataBase64,
            fileName: artifact.fileName,
            format: artifact.format,
            height: artifact.height,
            mimeType: artifact.mimeType,
            width: artifact.width,
          },
          blockId: block.id,
        });
        document.getElementById(renderId)?.remove();
        document.getElementById(`d${renderId}`)?.remove();
      }
      vscode.postMessage({
        artifacts,
        requestId: request.requestId,
        type: 'documentationExportResult',
      });
    } catch (error: unknown) {
      removeTemporaryRenderNodes();
      vscode.postMessage({
        message: errorMessageOf(error),
        requestId: request.requestId,
        type: 'documentationExportError',
      });
    } finally {
      initializeMermaid(activeTheme, activeFontFamily);
    }
  };
  const queued = renderQueue.then(execute, execute);
  renderQueue = queued.then(() => undefined, () => undefined);
  await queued;
}

function initializeMermaid(theme: DiagramTheme, fontFamily: DiagramFontFamily): void {
  const colorScheme = document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast')
    ? 'dark' as const
    : 'light' as const;
  const appearance = resolveDiagramAppearance(
    theme,
    colorScheme,
    activeSurface,
    activeDensity,
  );
  const spacing = diagramSpacing(appearance.density);
  mermaid.initialize({
    deterministicIds: true,
    deterministicIDSeed: 'mermaid-preview-offline-documentation',
    flowchart: { htmlLabels: false, useMaxWidth: false, ...spacing.flowchart },
    fontFamily: resolvedDiagramFontStack(fontFamily),
    gantt: { useMaxWidth: false },
    securityLevel: 'strict',
    sequence: { useMaxWidth: false, ...spacing.sequence },
    startOnLoad: false,
    theme: appearance.theme,
    look: appearance.look,
    handDrawnSeed: appearance.handDrawnSeed,
  });
}

function applyDocumentationSurface(
  surface: DiagramSurfaceConfiguration = activeSurface,
): void {
  const editorColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--vscode-editor-background').trim() || '#ffffff';
  const color = diagramSurfaceColor(surface, editorColor) ?? editorColor;
  document.documentElement.style.setProperty('--diagram-canvas-background', color);
  document.documentElement.style.setProperty(
    '--diagram-pattern-ink',
    isDarkHexColor(color) ? '#ffffff18' : '#0f172a17',
  );
  for (const card of documentationCards.values()) {
    card.canvas.classList.toggle('pattern-dots', surface.pattern === 'dots');
    card.canvas.classList.toggle('pattern-grid', surface.pattern === 'grid');
  }
}

function enterPresentation(): void {
  if (!documentationCards.size) return;
  presentationMode = true;
  presentationIndex = 0;
  document.body.classList.add('presentation');
  presentButton.hidden = true;
  presentationControls.hidden = false;
  presentationThemeControl.hidden = false;
  updatePresentation();
}

function exitPresentation(): void {
  if (!presentationMode) return;
  presentationMode = false;
  document.body.classList.remove('presentation');
  presentationControls.hidden = true;
  presentationThemeControl.hidden = true;
  closePresentationThemeMenu();
  presentButton.hidden = documentationCards.size === 0;
  for (const card of documentationCards.values()) card.article.hidden = false;
}

function updatePresentation(): void {
  const cards = Array.from(documentationCards.values());
  if (!cards.length) return exitPresentation();
  presentationIndex = Math.min(Math.max(presentationIndex, 0), cards.length - 1);
  cards.forEach((card, index) => { card.article.hidden = index !== presentationIndex; });
  presentationCounter.textContent = `${presentationIndex + 1} / ${cards.length}`;
  presentationPrevious.disabled = presentationIndex === 0;
  presentationNext.disabled = presentationIndex === cards.length - 1;
  cards[presentationIndex]?.canvas.focus({ preventScroll: true });
}

function movePresentation(direction: -1 | 1): void {
  if (!presentationMode) return;
  presentationIndex += direction;
  updatePresentation();
}

function handlePresentationKey(event: KeyboardEvent): void {
  if (!presentationMode) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    if (!presentationThemeMenu.hidden) {
      closePresentationThemeMenu();
      presentationThemeButton.focus();
      return;
    }
    exitPresentation();
    return;
  }
  let next: number | undefined;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === ' ' || event.key === 'PageDown') next = presentationIndex + 1;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') next = presentationIndex - 1;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = documentationCards.size - 1;
  if (next === undefined) return;
  event.preventDefault();
  presentationIndex = next;
  updatePresentation();
}

function togglePresentationThemeMenu(): void {
  presentationThemeMenu.hidden = !presentationThemeMenu.hidden;
  presentationThemeButton.setAttribute(
    'aria-expanded',
    String(!presentationThemeMenu.hidden),
  );
}

function closePresentationThemeMenu(): void {
  presentationThemeMenu.hidden = true;
  presentationThemeButton.setAttribute('aria-expanded', 'false');
}

function handlePresentationThemeClick(event: MouseEvent): void {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-theme]');
  if (!button || !isDiagramTheme(button.dataset.theme)) return;
  selectedTheme = button.dataset.theme;
  updatePresentationAppearance(selectedTheme, selectedDensity, selectedSurface);
  vscode.postMessage({ theme: button.dataset.theme, type: 'setDiagramTheme' });
}

function handlePresentationDensityClick(event: MouseEvent): void {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-density]');
  if (!button || !isDiagramDensity(button.dataset.density)) return;
  selectedDensity = button.dataset.density;
  updatePresentationAppearance(selectedTheme, selectedDensity, selectedSurface);
  vscode.postMessage({ density: button.dataset.density, type: 'setDiagramDensity' });
}

function handlePresentationPatternClick(event: MouseEvent): void {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-pattern]');
  const pattern = button?.dataset.pattern;
  if (!isDiagramSurfacePattern(pattern)) return;
  selectedSurface = { ...selectedSurface, pattern };
  updatePresentationAppearance(selectedTheme, selectedDensity, selectedSurface);
  vscode.postMessage({ surface: selectedSurface, type: 'setDiagramSurface' });
}

function handlePresentationSurfaceClick(event: MouseEvent): void {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-surface]');
  const preset = button?.dataset.surface;
  if (!isDiagramSurfacePreset(preset)) return;
  selectedSurface = { ...selectedSurface, preset };
  updatePresentationAppearance(selectedTheme, selectedDensity, selectedSurface);
  vscode.postMessage({ surface: selectedSurface, type: 'setDiagramSurface' });
}

function previewPresentationCustomColor(): void {
  selectedSurface = {
    ...selectedSurface,
    customColor: presentationSurfaceCustomColor.value,
    preset: 'custom',
  };
  updatePresentationAppearance(selectedTheme, selectedDensity, selectedSurface);
  applyDocumentationSurface(selectedSurface);
}

function commitPresentationCustomColor(): void {
  previewPresentationCustomColor();
  vscode.postMessage({ surface: selectedSurface, type: 'setDiagramSurface' });
}

function handleDocumentClick(event: MouseEvent): void {
  if (
    presentationThemeMenu.hidden ||
    presentationThemeControl.contains(event.target as Node)
  ) {
    return;
  }
  closePresentationThemeMenu();
}

function updatePresentationAppearance(
  theme: DiagramTheme,
  density: DiagramDensity,
  surface: DiagramSurfaceConfiguration,
): void {
  const label = diagramThemeLabel(theme);
  presentationThemeButton.title = `Diagram appearance: ${label}`;
  presentationThemeButton.setAttribute('aria-label', `Diagram appearance: ${label}`);
  for (const button of Array.from(
    presentationThemeGrid.querySelectorAll<HTMLButtonElement>('[data-theme]'),
  )) {
    button.setAttribute('aria-pressed', String(button.dataset.theme === theme));
  }
  for (const button of Array.from(
    presentationDensityPicker.querySelectorAll<HTMLButtonElement>('[data-density]'),
  )) {
    button.classList.toggle('is-active', button.dataset.density === density);
  }
  for (const button of Array.from(
    presentationPatternPicker.querySelectorAll<HTMLButtonElement>('[data-pattern]'),
  )) {
    button.classList.toggle('is-active', button.dataset.pattern === surface.pattern);
  }
  for (const button of Array.from(
    presentationSurfacePicker.querySelectorAll<HTMLButtonElement>('[data-surface]'),
  )) {
    button.classList.toggle('is-active', button.dataset.surface === surface.preset);
  }
  presentationSurfaceCustomColor.value = surface.customColor;
  const customSurfaceSwatch =
    presentationSurfaceCustomColor.closest<HTMLElement>('.surface-swatch');
  customSurfaceSwatch?.style.setProperty('--custom-swatch-color', surface.customColor);
  customSurfaceSwatch?.classList.toggle(
    'is-active',
    surface.preset === 'custom',
  );
}

function diagramThemeLabel(theme: DiagramTheme): string {
  const labels: Record<DiagramTheme, string> = {
    adaptive: 'Adaptive',
    base: 'Base',
    dark: 'Dark',
    default: 'Default',
    forest: 'Forest',
    neo: 'Neo',
    'neo-dark': 'Neo Dark',
    neutral: 'Neutral',
    'redux-color': 'Vibrant',
    'redux-dark-color': 'Vibrant Dark',
    sketch: 'Sketch',
  };
  return labels[theme];
}

function isDiagramSurfacePattern(value: unknown): value is DiagramSurfacePattern {
  return value === 'none' || value === 'dots' || value === 'grid';
}

function isDiagramSurfacePreset(value: unknown): value is DiagramSurfacePreset {
  return value === 'editor' ||
    value === 'white' ||
    value === 'paper' ||
    value === 'soft-gray' ||
    value === 'soft-blue' ||
    value === 'soft-rose' ||
    value === 'slate' ||
    value === 'midnight';
}

function diagramSurfacesEqual(
  left: DiagramSurfaceConfiguration,
  right: DiagramSurfaceConfiguration,
): boolean {
  return left.preset === right.preset &&
    left.pattern === right.pattern &&
    left.customColor === right.customColor;
}

function removeTemporaryRenderNodes(): void {
  document
    .querySelectorAll('body > [id^="dmermaid-document-"]')
    .forEach((node) => node.remove());
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing #${id}.`);
  return value as T;
}
