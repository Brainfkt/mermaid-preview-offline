import mermaid from 'mermaid';

import {
  DocumentationDiagramController,
  type DocumentationDiagramState,
} from './documentationDiagramController';
import { resolvedDiagramFontStack } from './diagramFontAssets';
import type { DiagramFontFamily } from './diagramFont';
import { artifactDataBase64, renderExportArtifact } from './exportRenderer';
import { prepareMermaidExtensions, registerOfflineIconPacks } from './mermaidExtensions';
import type {
  DocumentationPreviewBlock,
  DocumentationWebviewToExtensionMessage,
  ExtensionToDocumentationWebviewMessage,
} from './documentationProtocol';
import type { DiagramTheme } from './protocol';

interface VsCodeApi {
  postMessage(message: DocumentationWebviewToExtensionMessage): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

registerOfflineIconPacks();
const vscode = acquireVsCodeApi();
const list = element<HTMLElement>('documentation-list');
const empty = element<HTMLElement>('documentation-empty');
const title = element<HTMLElement>('documentation-title');
const summary = element<HTMLElement>('documentation-summary');
const format = element<HTMLElement>('documentation-format');
let renderSequence = 0;
let renderGeneration = 0;
let renderQueue = Promise.resolve();
let activeTheme: DiagramTheme = 'adaptive';
let activeFontFamily: DiagramFontFamily = 'vscode';
const MAX_DOCUMENTATION_EXPORT_BASE64_BYTES = 192_000_000;
const diagramControllers = new Map<string, DocumentationDiagramController>();
const diagramStates = new Map<string, DocumentationDiagramState>();

initializeMermaid(activeTheme, activeFontFamily);

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
  activeTheme = data.theme;
  activeFontFamily = data.fontFamily;
  initializeMermaid(activeTheme, activeFontFamily);
  title.textContent = data.fileName;
  format.textContent = formatLabel(data.kind);
  summary.textContent = data.mode === 'cursor'
    ? `Diagram under the cursor · ${data.totalBlocks} Mermaid block${data.totalBlocks === 1 ? '' : 's'} in this document`
    : `${data.totalBlocks} Mermaid block${data.totalBlocks === 1 ? '' : 's'} rendered locally`;
  saveAndDisposeDiagramControllers();
  list.replaceChildren();
  empty.hidden = data.blocks.length > 0;
  list.hidden = data.blocks.length === 0;

  for (const block of data.blocks) {
    if (generation !== renderGeneration) return;
    const card = createDiagramCard(block);
    list.append(card.article);
    const rendered = await queuedRender(
      card.diagram,
      card.error,
      block.source,
      data.fontFamily,
      generation,
    );
    if (generation !== renderGeneration) return;
    if (rendered) {
      const controller = new DocumentationDiagramController(
        card.article,
        card.canvas,
        card.diagram,
        {
          maxHeight: data.maxHeight,
          navigation: data.navigation,
          resizable: data.resizable,
          source: block.source,
        },
        diagramStates.get(block.id),
      );
      diagramControllers.set(block.id, controller);
    }
  }
  const activeIds = new Set(data.blocks.map((block) => block.id));
  for (const id of diagramStates.keys()) {
    if (!activeIds.has(id)) diagramStates.delete(id);
  }
}

function createDiagramCard(block: DocumentationPreviewBlock): {
  article: HTMLElement;
  canvas: HTMLElement;
  diagram: HTMLElement;
  error: HTMLElement;
} {
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
  return { article, canvas, diagram, error };
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
      initializeMermaid(request.settings.theme, request.fontFamily);
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
          settings: request.settings,
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
  const adaptiveTheme = document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast')
    ? 'dark'
    : 'default';
  mermaid.initialize({
    deterministicIds: true,
    deterministicIDSeed: 'mermaid-preview-offline-documentation',
    flowchart: { htmlLabels: false, useMaxWidth: false },
    fontFamily: resolvedDiagramFontStack(fontFamily),
    gantt: { useMaxWidth: false },
    securityLevel: 'strict',
    sequence: { useMaxWidth: false },
    startOnLoad: false,
    theme: theme === 'adaptive' ? adaptiveTheme : theme,
  });
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
