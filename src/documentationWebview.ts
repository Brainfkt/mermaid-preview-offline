import mermaid from 'mermaid';

import {
  DEFAULT_DIAGRAM_SURFACE,
  diagramSpacing,
  diagramSurfaceColor,
  isDarkHexColor,
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
import type {
  DocumentationPreviewBlock,
  DocumentationWebviewToExtensionMessage,
  ExtensionToDocumentationWebviewMessage,
} from './documentationProtocol';
import type { DiagramDensity, DiagramSurfaceConfiguration, DiagramTheme } from './protocol';

interface VsCodeApi {
  postMessage(message: DocumentationWebviewToExtensionMessage): void;
}

interface DocumentationCard {
  article: HTMLElement;
  canvas: HTMLElement;
  controllerConfiguration: string;
  diagram: HTMLElement;
  error: HTMLElement;
  index: HTMLElement;
  location: HTMLElement;
  settled: boolean;
  source: string;
}

declare function acquireVsCodeApi(): VsCodeApi;

registerOfflineIconPacks();
const vscode = acquireVsCodeApi();
const list = element<HTMLElement>('documentation-list');
const empty = element<HTMLElement>('documentation-empty');
const title = element<HTMLElement>('documentation-title');
const summary = element<HTMLElement>('documentation-summary');
const format = element<HTMLElement>('documentation-format');
const presentButton = element<HTMLButtonElement>('documentation-present');
const presentationControls = element<HTMLElement>('presentation-controls');
const presentationCounter = element<HTMLElement>('presentation-counter');
let renderSequence = 0;
let renderGeneration = 0;
let renderQueue = Promise.resolve();
let activeTheme: DiagramTheme = 'adaptive';
let activeFontFamily: DiagramFontFamily = 'vscode';
let activeDensity: DiagramDensity = 'comfortable';
let activeSurface: DiagramSurfaceConfiguration = DEFAULT_DIAGRAM_SURFACE;
let presentationMode = false;
let presentationIndex = 0;
const MAX_DOCUMENTATION_EXPORT_BASE64_BYTES = 192_000_000;
const diagramControllers = new Map<string, DocumentationDiagramController>();
const diagramStates = new Map<string, DocumentationDiagramState>();
const documentationCards = new Map<string, DocumentationCard>();

initializeMermaid(activeTheme, activeFontFamily);

element<HTMLButtonElement>('documentation-popout').addEventListener('click', () => {
  vscode.postMessage({ type: 'openInNewWindow' });
});
presentButton.addEventListener('click', enterPresentation);
element<HTMLButtonElement>('presentation-exit').addEventListener('click', exitPresentation);
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
  const renderConfigurationChanged = activeTheme !== data.theme ||
    activeFontFamily !== data.fontFamily || activeDensity !== data.density;
  activeTheme = data.theme;
  activeFontFamily = data.fontFamily;
  activeDensity = data.density;
  activeSurface = data.surface;
  applyDocumentationSurface();
  initializeMermaid(activeTheme, activeFontFamily);
  title.textContent = data.fileName;
  format.textContent = formatLabel(data.kind);
  summary.textContent = data.mode === 'cursor'
    ? `Diagram under the cursor · ${data.totalBlocks} Mermaid block${data.totalBlocks === 1 ? '' : 's'} in this document`
    : `${data.totalBlocks} Mermaid block${data.totalBlocks === 1 ? '' : 's'} rendered locally`;
  empty.hidden = data.blocks.length > 0;
  list.hidden = data.blocks.length === 0;
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

  const header = document.createElement('header');
  header.className = 'documentation-card__header';
  const identity = document.createElement('div');
  const index = document.createElement('strong');
  index.textContent = `Diagram ${block.index + 1}`;
  const location = document.createElement('span');
  location.textContent = lineLabel(block.startLine, block.endLine);
  identity.append(index, location);

  const reveal = document.createElement('button');
  reveal.className = 'source-button';
  reveal.type = 'button';
  reveal.textContent = 'Go to source';
  reveal.addEventListener('click', () => {
    vscode.postMessage({ blockId: block.id, type: 'revealSource' });
  });
  header.append(identity, reveal);

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
  article.append(header, canvas);
  return {
    article,
    canvas,
    controllerConfiguration,
    diagram,
    error,
    index,
    location,
    settled: false,
    source: block.source,
  };
}

function updateDiagramCard(card: DocumentationCard, block: DocumentationPreviewBlock): void {
  card.article.dataset.blockId = block.id;
  card.index.textContent = `Diagram ${block.index + 1}`;
  card.location.textContent = lineLabel(block.startLine, block.endLine);
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

function applyDocumentationSurface(): void {
  const editorColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--vscode-editor-background').trim() || '#ffffff';
  const color = diagramSurfaceColor(activeSurface, editorColor) ?? editorColor;
  document.documentElement.style.setProperty('--diagram-canvas-background', color);
  document.documentElement.style.setProperty(
    '--diagram-pattern-ink',
    isDarkHexColor(color) ? '#ffffff18' : '#0f172a17',
  );
  for (const card of documentationCards.values()) {
    card.canvas.classList.toggle('pattern-dots', activeSurface.pattern === 'dots');
    card.canvas.classList.toggle('pattern-grid', activeSurface.pattern === 'grid');
  }
}

function enterPresentation(): void {
  if (!documentationCards.size) return;
  presentationMode = true;
  presentationIndex = 0;
  document.body.classList.add('presentation');
  presentationControls.hidden = false;
  updatePresentation();
}

function exitPresentation(): void {
  if (!presentationMode) return;
  presentationMode = false;
  document.body.classList.remove('presentation');
  presentationControls.hidden = true;
  for (const card of documentationCards.values()) card.article.hidden = false;
}

function updatePresentation(): void {
  const cards = Array.from(documentationCards.values());
  if (!cards.length) return exitPresentation();
  presentationIndex = Math.min(Math.max(presentationIndex, 0), cards.length - 1);
  cards.forEach((card, index) => { card.article.hidden = index !== presentationIndex; });
  presentationCounter.textContent = `${presentationIndex + 1} / ${cards.length}`;
  cards[presentationIndex]?.canvas.focus({ preventScroll: true });
}

function handlePresentationKey(event: KeyboardEvent): void {
  if (!presentationMode) return;
  if (event.key === 'Escape') {
    event.preventDefault();
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

function lineLabel(startLine: number, endLine: number): string {
  return startLine === endLine
    ? `line ${startLine + 1}`
    : `lines ${startLine + 1}–${endLine + 1}`;
}

function formatLabel(kind: 'asciidoc' | 'markdown' | 'mdx'): string {
  if (kind === 'asciidoc') return 'AsciiDoc';
  return kind === 'mdx' ? 'MDX' : 'Markdown';
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
