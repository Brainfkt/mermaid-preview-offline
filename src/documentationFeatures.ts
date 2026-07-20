import { Buffer } from 'node:buffer';

import * as vscode from 'vscode';

import {
  documentationImageReference,
  documentationKind,
  extractMermaidBlocks,
  mermaidBlockAtLine,
  replaceMermaidBlocks,
  type DocumentationKind,
  type MermaidDocumentationBlock,
} from './documentationBlocks';
import type {
  DocumentationPreviewMode,
  DocumentationWebviewToExtensionMessage,
} from './documentationProtocol';
import { createDocumentationWebviewHtml } from './documentationWebviewHtml';
import { sanitizeFileName, type ExportFormat } from './exportSettings';
import { inlineLocalImages } from './localImages';
import { readExportConfiguration } from './mermaidPreviewProvider';
import type { DiagramTheme, SerializedExportArtifact } from './protocol';
import { loadWorkspaceImage } from './workspaceImages';

interface PreviewContext {
  kind: DocumentationKind;
  mode: DocumentationPreviewMode;
  selectedBlockIndex?: number;
  uri: vscode.Uri;
}

interface PendingDocumentationExport {
  reject(error: Error): void;
  resolve(
    artifacts: Array<{ artifact: SerializedExportArtifact; blockId: string }>,
  ): void;
  timer: NodeJS.Timeout;
}

type DocumentationExportFormat = Extract<ExportFormat, 'png' | 'svg'>;
const MAX_DOCUMENTATION_EXPORT_BASE64_BYTES = 192_000_000;

export class MermaidDocumentationFeatures implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly pendingExports = new Map<string, PendingDocumentationExport>();
  private panel: vscode.WebviewPanel | undefined;
  private panelReady: Promise<void> = Promise.resolve();
  private resolvePanelReady: (() => void) | undefined;
  private previewContext: PreviewContext | undefined;
  private previewBlocks: MermaidDocumentationBlock[] = [];
  private refreshGeneration = 0;
  private refreshTimer: NodeJS.Timeout | undefined;
  private dirtyWhileHidden = false;

  public constructor(private readonly extensionContext: vscode.ExtensionContext) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === this.previewContext?.uri.toString()) {
          this.schedulePreviewRefresh();
        }
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('mermaidPreviewOffline.diagramTheme')) {
          this.schedulePreviewRefresh(0);
        }
      }),
    );
  }

  public dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    for (const disposable of this.disposables) disposable.dispose();
    this.panel?.dispose();
    this.rejectPendingExports(new Error('The documentation renderer was closed.'));
  }

  public async previewBlockUnderCursor(resource?: vscode.Uri): Promise<void> {
    const document = await this.documentationDocument(resource);
    if (!document) return;
    const kind = documentationKind(document.languageId, document.uri.path);
    if (!kind) return;
    const blocks = extractMermaidBlocks(document.getText(), kind);
    const editor = vscode.window.activeTextEditor;
    const cursorLine = editor?.document.uri.toString() === document.uri.toString()
      ? editor.selection.active.line
      : 0;
    const selected = mermaidBlockAtLine(blocks, cursorLine);
    if (!selected) {
      void vscode.window.showWarningMessage(
        'Place the cursor inside a Mermaid block before opening its preview.',
      );
      return;
    }
    this.previewContext = {
      kind,
      mode: 'cursor',
      selectedBlockIndex: selected.index,
      uri: document.uri,
    };
    await this.showPreview(document);
  }

  public async previewAllBlocks(resource?: vscode.Uri): Promise<void> {
    const document = await this.documentationDocument(resource);
    if (!document) return;
    const kind = documentationKind(document.languageId, document.uri.path);
    if (!kind) return;
    this.previewContext = { kind, mode: 'all', uri: document.uri };
    await this.showPreview(document);
  }

  public async exportDocument(resource?: vscode.Uri): Promise<void> {
    const document = await this.documentationDocument(resource);
    if (!document) return;
    const kind = documentationKind(document.languageId, document.uri.path);
    if (!kind) return;
    const source = document.getText();
    const blocks = extractMermaidBlocks(source, kind);
    if (blocks.length === 0) {
      void vscode.window.showWarningMessage('No Mermaid blocks were found in this document.');
      return;
    }

    const exportFormat = await this.chooseExportFormat();
    if (!exportFormat) return;
    const target = await vscode.window.showSaveDialog({
      defaultUri: defaultDocumentationExportUri(document.uri),
      filters: documentationFilters(kind),
      saveLabel: 'Export Document',
      title: `Export ${blocks.length} Mermaid block${blocks.length === 1 ? '' : 's'} as ${exportFormat.toUpperCase()}`,
    });
    if (!target) return;
    if (target.toString() === document.uri.toString()) {
      void vscode.window.showErrorMessage(
        'Choose a different file so the Mermaid source document is not overwritten.',
      );
      return;
    }

    this.previewContext = { kind, mode: 'all', uri: document.uri };
    this.ensurePanel(document);
    await this.panelReady;
    await this.postPreviewData(document);

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Exporting ${blocks.length} Mermaid diagram${blocks.length === 1 ? '' : 's'}…`,
        },
        async () => this.renderAndWriteDocumentExport(
          document,
          kind,
          source,
          blocks,
          target,
          exportFormat,
        ),
      );
      void vscode.window.showInformationMessage(
        `Documentation exported to ${target.fsPath || target.path}.`,
      );
    } catch (error: unknown) {
      void vscode.window.showErrorMessage(
        `Could not export Mermaid documentation: ${errorMessageOf(error)}`,
      );
    }
  }

  private async showPreview(document: vscode.TextDocument): Promise<void> {
    this.ensurePanel(document);
    await this.panelReady;
    await this.postPreviewData(document);
  }

  private ensurePanel(document: vscode.TextDocument): void {
    if (this.panel) {
      this.panel.title = `Mermaid blocks · ${fileNameOf(document.uri)}`;
      this.panel.reveal(vscode.ViewColumn.Active, true);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'mermaidPreviewOffline.documentation',
      `Mermaid blocks · ${fileNameOf(document.uri)}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionContext.extensionUri, 'dist'),
          vscode.Uri.joinPath(this.extensionContext.extensionUri, 'media'),
        ],
        retainContextWhenHidden: true,
      },
    );
    this.panel = panel;
    this.panelReady = new Promise((resolve) => {
      this.resolvePanelReady = resolve;
    });
    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionContext.extensionUri, 'dist', 'documentation-webview.js'),
    );
    const styleUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionContext.extensionUri, 'media', 'documentation.css'),
    );
    panel.webview.html = createDocumentationWebviewHtml({
      cspSource: panel.webview.cspSource,
      scriptUri: scriptUri.toString(),
      styleUri: styleUri.toString(),
      title: panel.title,
    });
    const messageSubscription = panel.webview.onDidReceiveMessage(
      async (message: unknown) => this.handleWebviewMessage(message),
    );
    const viewStateSubscription = panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.visible && this.dirtyWhileHidden) {
        this.dirtyWhileHidden = false;
        this.schedulePreviewRefresh(0);
      }
    });
    panel.onDidDispose(() => {
      messageSubscription.dispose();
      viewStateSubscription.dispose();
      if (this.panel === panel) this.panel = undefined;
      this.dirtyWhileHidden = false;
      this.resolvePanelReady?.();
      this.resolvePanelReady = undefined;
      this.panelReady = Promise.resolve();
      this.rejectPendingExports(new Error('The documentation renderer was closed.'));
    });
  }

  private async handleWebviewMessage(message: unknown): Promise<void> {
    if (!isDocumentationWebviewMessage(message)) return;
    if (message.type === 'ready') {
      this.resolvePanelReady?.();
      this.resolvePanelReady = undefined;
      return;
    }
    if (message.type === 'revealSource') {
      await this.revealSource(message.blockId);
      return;
    }
    const pending = this.pendingExports.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingExports.delete(message.requestId);
    if (message.type === 'documentationExportError') {
      pending.reject(new Error(message.message));
    } else {
      pending.resolve(message.artifacts);
    }
  }

  private async revealSource(blockId: string): Promise<void> {
    const context = this.previewContext;
    const block = this.previewBlocks.find((candidate) => candidate.id === blockId);
    if (!context || !block) return;
    const document = await vscode.workspace.openTextDocument(context.uri);
    const lastLine = Math.max(0, document.lineCount - 1);
    const startLine = Math.min(block.sourceStartLine, lastLine);
    const endLine = Math.min(Math.max(block.sourceEndLine, startLine), lastLine);
    const endCharacter = document.lineAt(endLine).range.end.character;
    const range = new vscode.Range(startLine, 0, endLine, endCharacter);
    const editor = await vscode.window.showTextDocument(document, {
      preview: false,
      selection: range,
      viewColumn: vscode.ViewColumn.Beside,
    });
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private schedulePreviewRefresh(delay = 120): void {
    this.refreshGeneration += 1;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.panel && !this.panel.visible) {
      this.refreshTimer = undefined;
      this.dirtyWhileHidden = true;
      return;
    }
    const generation = this.refreshGeneration;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      if (generation !== this.refreshGeneration) return;
      void this.refreshOpenPreview();
    }, delay);
  }

  private async refreshOpenPreview(): Promise<void> {
    if (!this.previewContext || !this.panel) return;
    try {
      const document = await vscode.workspace.openTextDocument(this.previewContext.uri);
      await this.postPreviewData(document);
    } catch {
      // The document may have been removed while its preview was hidden.
    }
  }

  private async postPreviewData(document: vscode.TextDocument): Promise<void> {
    const context = this.previewContext;
    const panel = this.panel;
    if (!context || !panel || context.uri.toString() !== document.uri.toString()) return;
    const generation = ++this.refreshGeneration;
    const blocks = extractMermaidBlocks(document.getText(), context.kind);
    this.previewBlocks = blocks;
    const visibleBlocks = context.mode === 'cursor'
      ? blocks.filter((block) => block.index === context.selectedBlockIndex)
      : blocks;
    const preparedBlocks = await mapWithConcurrency(visibleBlocks, 4, async (block) => ({
      endLine: block.endLine,
      id: block.id,
      index: block.index,
      source: await inlineLocalImages(block.source, (reference) =>
        loadWorkspaceImage(document.uri, reference),
      ),
      startLine: block.startLine,
    }));
    if (generation !== this.refreshGeneration || this.panel !== panel) return;
    this.dirtyWhileHidden = false;
    await panel.webview.postMessage({
      blocks: preparedBlocks,
      fileName: fileNameOf(document.uri),
      kind: context.kind,
      mode: context.mode,
      theme: configuredDiagramTheme(),
      totalBlocks: blocks.length,
      type: 'documentationData',
    });
  }

  private async renderAndWriteDocumentExport(
    document: vscode.TextDocument,
    kind: DocumentationKind,
    source: string,
    blocks: readonly MermaidDocumentationBlock[],
    target: vscode.Uri,
    format: DocumentationExportFormat,
  ): Promise<void> {
    const panel = this.panel;
    if (!panel) throw new Error('The documentation renderer is unavailable.');
    const sourceStem = safePathSegment(fileStem(fileNameOf(document.uri)));
    const targetStem = safePathSegment(fileStem(fileNameOf(target)));
    const assetDirectoryName = `${targetStem}.assets`;
    const assetDirectory = vscode.Uri.joinPath(target, '..', assetDirectoryName);
    const settings = {
      ...readExportConfiguration(document.uri),
      fileNameTemplate: '{name}.{format}',
      format,
      svgVariant: 'optimized' as const,
    };
    const renderBlocks = await mapWithConcurrency(blocks, 4, async (block) => ({
      fileName: `${sourceStem}-diagram-${block.index + 1}.mmd`,
      id: block.id,
      source: await inlineLocalImages(block.source, (reference) =>
        loadWorkspaceImage(document.uri, reference),
      ),
    }));
    const requestId = `documentation-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = new Promise<Array<{ artifact: SerializedExportArtifact; blockId: string }>>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingExports.delete(requestId);
          reject(new Error('The documentation renderer timed out.'));
        }, 60_000);
        this.pendingExports.set(requestId, { reject, resolve, timer });
      },
    );
    const delivered = await panel.webview.postMessage({
      blocks: renderBlocks,
      requestId,
      settings,
      sourceUri: document.uri.toString(),
      type: 'renderDocumentationExport',
    });
    if (!delivered) {
      const pending = this.pendingExports.get(requestId);
      if (pending) clearTimeout(pending.timer);
      this.pendingExports.delete(requestId);
      throw new Error('The documentation renderer is no longer available.');
    }
    const artifacts = await result;
    if (artifacts.length !== blocks.length) {
      throw new Error(`Rendered ${artifacts.length} of ${blocks.length} Mermaid blocks.`);
    }
    const artifactByBlock = new Map(artifacts.map((entry) => [entry.blockId, entry.artifact]));
    for (const block of blocks) {
      const artifact = artifactByBlock.get(block.id);
      if (!artifact || artifact.format !== format) {
        throw new Error(`Missing ${format.toUpperCase()} output for diagram ${block.index + 1}.`);
      }
    }

    await vscode.workspace.fs.createDirectory(assetDirectory);
    for (const block of blocks) {
      const artifact = artifactByBlock.get(block.id);
      if (!artifact) continue;
      const assetName = sanitizeFileName(artifact.fileName);
      if (!assetName || assetName !== artifact.fileName) {
        throw new Error(`Invalid output name for diagram ${block.index + 1}.`);
      }
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(assetDirectory, assetName),
        Uint8Array.from(Buffer.from(artifact.dataBase64, 'base64')),
      );
    }
    const exportedSource = replaceMermaidBlocks(source, blocks, (block) => {
      const artifact = artifactByBlock.get(block.id);
      if (!artifact) throw new Error(`Missing output for diagram ${block.index + 1}.`);
      const relativePath = `${assetDirectoryName}/${artifact.fileName}`;
      const reference = documentationImageReference(
        kind,
        relativePath,
        `Mermaid diagram ${block.index + 1}`,
      );
      return `${block.indent}${reference}`;
    });
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(exportedSource));
  }

  private async documentationDocument(resource?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
    const activeDocument = vscode.window.activeTextEditor?.document;
    const uri = resource ?? activeDocument?.uri ?? activeTextTabUri();
    if (!uri) {
      void vscode.window.showWarningMessage('Open a Markdown, MDX, or AsciiDoc document first.');
      return undefined;
    }
    const document = activeDocument?.uri.toString() === uri.toString()
      ? activeDocument
      : await vscode.workspace.openTextDocument(uri);
    if (!documentationKind(document.languageId, document.uri.path)) {
      void vscode.window.showWarningMessage('Open a Markdown, MDX, or AsciiDoc document first.');
      return undefined;
    }
    return document;
  }

  private async chooseExportFormat(): Promise<DocumentationExportFormat | undefined> {
    const choice = await vscode.window.showQuickPick(
      [
        {
          description: 'Scalable, compact, and ideal for documentation',
          format: 'svg' as const,
          label: 'SVG images',
        },
        {
          description: 'Raster images using the configured DPI and scale',
          format: 'png' as const,
          label: 'PNG images',
        },
      ],
      {
        placeHolder: 'Choose the image format used to replace Mermaid blocks',
        title: 'Export Mermaid Documentation',
      },
    );
    return choice?.format;
  }

  private rejectPendingExports(error: Error): void {
    for (const pending of this.pendingExports.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingExports.clear();
  }
}

function configuredDiagramTheme(): DiagramTheme {
  const theme = vscode.workspace
    .getConfiguration('mermaidPreviewOffline')
    .get<unknown>('diagramTheme', 'adaptive');
  return theme === 'default' ||
    theme === 'dark' ||
    theme === 'forest' ||
    theme === 'neutral' ||
    theme === 'base'
    ? theme
    : 'adaptive';
}

function defaultDocumentationExportUri(source: vscode.Uri): vscode.Uri | undefined {
  const fileName = fileNameOf(source);
  const extension = /\.[^.]+$/u.exec(fileName)?.[0] ?? '';
  const stem = extension ? fileName.slice(0, -extension.length) : fileName;
  const outputName = `${stem}.with-diagrams${extension}`;
  if (source.scheme !== 'untitled') return vscode.Uri.joinPath(source, '..', outputName);
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  return root ? vscode.Uri.joinPath(root, outputName) : undefined;
}

function documentationFilters(kind: DocumentationKind): Record<string, string[]> {
  if (kind === 'mdx') return { MDX: ['mdx'] };
  if (kind === 'asciidoc') return { AsciiDoc: ['adoc', 'asciidoc', 'asc'] };
  return { Markdown: ['md', 'markdown'] };
}

function activeTextTabUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputText ? input.uri : undefined;
}

function fileNameOf(uri: vscode.Uri): string {
  return decodeURIComponent(uri.path.split('/').pop() ?? uri.path);
}

function fileStem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/u, '') || 'document';
}

function safePathSegment(value: string): string {
  return (sanitizeFileName(value) || 'document').replace(/\s+/gu, '-');
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function mapWithConcurrency<Value, Result>(
  values: readonly Value[],
  maximumConcurrency: number,
  mapper: (value: Value, index: number) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(values.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index] as Value, index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(maximumConcurrency, values.length) }, worker),
  );
  return results;
}

function isDocumentationWebviewMessage(
  value: unknown,
): value is DocumentationWebviewToExtensionMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  const candidate = value as {
    artifacts?: unknown;
    blockId?: unknown;
    message?: unknown;
    requestId?: unknown;
    type?: unknown;
  };
  if (candidate.type === 'ready') return true;
  if (candidate.type === 'revealSource') return typeof candidate.blockId === 'string';
  if (candidate.type === 'documentationExportError') {
    return typeof candidate.requestId === 'string' && typeof candidate.message === 'string';
  }
  if (
    candidate.type !== 'documentationExportResult' ||
    typeof candidate.requestId !== 'string' ||
    !Array.isArray(candidate.artifacts)
  ) {
    return false;
  }
  let totalBase64Bytes = 0;
  return candidate.artifacts.every((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false;
    const artifactEntry = entry as { artifact?: unknown; blockId?: unknown };
    if (typeof artifactEntry.blockId !== 'string' || !isSerializedArtifact(artifactEntry.artifact)) {
      return false;
    }
    totalBase64Bytes += artifactEntry.artifact.dataBase64.length;
    return totalBase64Bytes <= MAX_DOCUMENTATION_EXPORT_BASE64_BYTES;
  });
}

function isSerializedArtifact(value: unknown): value is SerializedExportArtifact {
  if (!value || typeof value !== 'object') return false;
  const artifact = value as Partial<Record<keyof SerializedExportArtifact, unknown>>;
  return (
    typeof artifact.dataBase64 === 'string' &&
    artifact.dataBase64.length <= MAX_DOCUMENTATION_EXPORT_BASE64_BYTES &&
    typeof artifact.fileName === 'string' &&
    (artifact.format === 'svg' || artifact.format === 'png') &&
    typeof artifact.height === 'number' &&
    Number.isFinite(artifact.height) &&
    typeof artifact.mimeType === 'string' &&
    typeof artifact.width === 'number' &&
    Number.isFinite(artifact.width)
  );
}
