import { icons as logosIcons } from '@iconify-json/logos';
import { icons as materialIconThemeIcons } from '@iconify-json/material-icon-theme';
import zenuml from '@mermaid-js/mermaid-zenuml';
import mermaid from 'mermaid';

import { artifactDataBase64, renderExportArtifact } from './exportRenderer';
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

mermaid.registerIconPacks([
  { name: logosIcons.prefix, icons: logosIcons },
  { name: materialIconThemeIcons.prefix, icons: materialIconThemeIcons },
]);
const mermaidExtensionsReady = mermaid.registerExternalDiagrams([zenuml]);
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

initializeMermaid(activeTheme);

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
  initializeMermaid(activeTheme);
  title.textContent = data.fileName;
  format.textContent = formatLabel(data.kind);
  summary.textContent = data.mode === 'cursor'
    ? `Diagram under the cursor · ${data.totalBlocks} Mermaid block${data.totalBlocks === 1 ? '' : 's'} in this document`
    : `${data.totalBlocks} Mermaid block${data.totalBlocks === 1 ? '' : 's'} rendered locally`;
  list.replaceChildren();
  empty.hidden = data.blocks.length > 0;
  list.hidden = data.blocks.length === 0;

  for (const block of data.blocks) {
    const card = createDiagramCard(block);
    list.append(card.article);
    await queuedRender(card.diagram, card.error, block.source, generation);
  }
}

function createDiagramCard(block: DocumentationPreviewBlock): {
  article: HTMLElement;
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
  canvas.addEventListener('dblclick', () => {
    vscode.postMessage({ blockId: block.id, type: 'revealSource' });
  });
  const diagram = document.createElement('div');
  diagram.className = 'documentation-diagram';
  const error = document.createElement('pre');
  error.className = 'documentation-error';
  error.hidden = true;
  canvas.append(diagram, error);
  article.append(header, canvas);
  return { article, diagram, error };
}

async function queuedRender(
  target: HTMLElement,
  errorTarget: HTMLElement,
  source: string,
  generation: number,
): Promise<void> {
  const task = async (): Promise<void> => {
    if (generation !== renderGeneration) return;
    try {
      await mermaidExtensionsReady;
      const { svg } = await mermaid.render(`mermaid-document-${++renderSequence}`, source);
      if (generation !== renderGeneration) return;
      target.innerHTML = svg;
      target.hidden = false;
      errorTarget.hidden = true;
    } catch (error: unknown) {
      if (generation !== renderGeneration) return;
      target.replaceChildren();
      target.hidden = true;
      errorTarget.textContent = errorMessageOf(error);
      errorTarget.hidden = false;
      removeTemporaryRenderNodes();
    }
  };
  const queued = renderQueue.then(task, task);
  renderQueue = queued.then(() => undefined, () => undefined);
  await queued;
}

async function renderDocumentationExport(
  request: Extract<
    ExtensionToDocumentationWebviewMessage,
    { type: 'renderDocumentationExport' }
  >,
): Promise<void> {
  const execute = async (): Promise<void> => {
    try {
      initializeMermaid(request.settings.theme);
      await mermaidExtensionsReady;
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
      for (const block of request.blocks) {
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
        });
        artifacts.push({
          artifact: {
            dataBase64: artifactDataBase64(artifact),
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
      initializeMermaid(activeTheme);
    }
  };
  const queued = renderQueue.then(execute, execute);
  renderQueue = queued.then(() => undefined, () => undefined);
  await queued;
}

function initializeMermaid(theme: DiagramTheme): void {
  const adaptiveTheme = document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast')
    ? 'dark'
    : 'default';
  mermaid.initialize({
    deterministicIds: true,
    deterministicIDSeed: 'mermaid-preview-offline-documentation',
    flowchart: { htmlLabels: false, useMaxWidth: false },
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
