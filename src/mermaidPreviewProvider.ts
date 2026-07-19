import { Buffer } from 'node:buffer';
import process from 'node:process';

import * as vscode from 'vscode';

import { isEditorMode } from './editorLayoutController';
import type { MermaidEditorLayoutController } from './editorLayoutController';
import {
  DEFAULT_EXPORT_SETTINGS,
  normalizeExportProfiles,
  normalizeExportSettings,
  sanitizeFileName,
  type ExportProfile,
  type ExportSettings,
} from './exportSettings';
import { imageMimeType, inlineLocalImages, type LoadedLocalImage } from './localImages';
import type { MermaidDiagnosticStore } from './languageFeatures';
import { isDiagramTheme, normalizePreviewState } from './previewState';
import type {
  PersistedPreviewState,
  PreviewConfiguration,
  SerializedExportArtifact,
  WebviewToExtensionMessage,
} from './protocol';
import { effectiveRefreshDelay } from './renderPolicy';
import { createNonce, createWebviewHtml } from './webviewHtml';
import { isUriWithin } from './workspacePaths';

export const MERMAID_PREVIEW_VIEW_TYPE = 'brainfkt.mermaidPreviewOffline';

const VIEW_STATE_KEY_PREFIX = 'mermaidPreviewOffline.viewState.';
const EXPORT_PROFILES_KEY = 'mermaidPreviewOffline.exportProfiles';

interface BatchFile {
  fileId: string;
  fileName: string;
  relativeDirectory: string;
  uri: vscode.Uri;
}

interface BatchSession {
  completed: number;
  failures: string[];
  files: BatchFile[];
  outputDirectory: vscode.Uri;
  settings: ExportSettings;
  total: number;
  webview: vscode.Webview;
}

export class MermaidPreviewProvider implements vscode.CustomTextEditorProvider {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private readonly readyPanels = new Set<string>();
  private readonly pendingExportDialogs = new Set<string>();
  private readonly batchSessions = new Map<string, BatchSession>();

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly diagnostics: MermaidDiagnosticStore,
    private readonly layoutController: MermaidEditorLayoutController,
  ) {}

  public async showExportDialog(documentUri: vscode.Uri): Promise<void> {
    const key = documentUri.toString();
    const panel = this.panels.get(key);
    if (panel && this.readyPanels.has(key)) {
      panel.reveal(panel.viewColumn, true);
      await panel.webview.postMessage({ type: 'showExportDialog' });
      return;
    }
    this.pendingExportDialogs.add(key);
    if (!panel) {
      await vscode.commands.executeCommand('vscode.openWith', documentUri, MERMAID_PREVIEW_VIEW_TYPE);
    }
  }

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): void {
    const webview = webviewPanel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'preview.css'),
    );
    const nonce = createNonce();
    const stateKey = `${VIEW_STATE_KEY_PREFIX}${document.uri.toString()}`;
    let disposed = false;
    let documentGeneration = 0;
    let documentTimer: NodeJS.Timeout | undefined;
    let stateTimer: NodeJS.Timeout | undefined;
    let pendingState: PersistedPreviewState | undefined;
    const panelRegistration = this.layoutController.registerPanel(document.uri, webviewPanel);
    const panelKey = document.uri.toString();
    this.panels.set(panelKey, webviewPanel);

    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      ],
    };
    webview.html = createWebviewHtml({
      cspSource: webview.cspSource,
      nonce,
      scriptUri: scriptUri.toString(),
      styleUri: styleUri.toString(),
      title: `Preview — ${fileNameOf(document.uri)}`,
    });

    const configuration = (): PreviewConfiguration => readConfiguration(document.uri);

    const postConfiguration = async (): Promise<void> => {
      await webview.postMessage({ type: 'configuration', configuration: configuration() });
      await webview.postMessage({
        type: 'exportConfiguration',
        profiles: this.exportProfiles(),
        settings: readExportConfiguration(document.uri),
      });
    };

    const sendDocument = async (generation: number): Promise<void> => {
      if (disposed || generation !== documentGeneration) {
        return;
      }

      const version = document.version;
      const documentSource = document.getText();
      const byteLength = Buffer.byteLength(documentSource, 'utf8');
      const source = await inlineLocalImages(documentSource, (reference) =>
        this.loadLocalImage(document.uri, reference),
      );
      if (
        disposed ||
        generation !== documentGeneration ||
        document.version !== version
      ) {
        return;
      }

      const currentConfiguration = configuration();
      await webview.postMessage({
        type: 'document',
        source,
        fileName: fileNameOf(document.uri),
        sourceUri: document.uri.toString(),
        version,
        byteLength,
        isLargeFile: byteLength >= currentConfiguration.largeFileThresholdBytes,
      });
    };

    const queueDocument = (delay?: number): void => {
      documentGeneration += 1;
      const generation = documentGeneration;
      if (documentTimer) {
        clearTimeout(documentTimer);
      }
      const currentConfiguration = configuration();
      const byteLength = Buffer.byteLength(document.getText(), 'utf8');
      const timeout = delay ?? effectiveRefreshDelay(byteLength, currentConfiguration);
      documentTimer = setTimeout(() => {
        documentTimer = undefined;
        void sendDocument(generation);
      }, timeout);
    };

    const persistViewState = (state: PersistedPreviewState): void => {
      pendingState = normalizePreviewState(state);
      if (stateTimer) {
        clearTimeout(stateTimer);
      }
      stateTimer = setTimeout(() => {
        stateTimer = undefined;
        if (pendingState) {
          void this.context.workspaceState.update(stateKey, pendingState);
        }
      }, 200);
    };

    const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) {
        return;
      }

      const currentConfiguration = configuration();
      if (currentConfiguration.refreshMode === 'manual') {
        documentGeneration += 1;
        if (documentTimer) {
          clearTimeout(documentTimer);
          documentTimer = undefined;
        }
        void webview.postMessage({
          type: 'documentChanged',
          fileName: fileNameOf(document.uri),
          version: document.version,
          byteLength: Buffer.byteLength(document.getText(), 'utf8'),
        });
      } else {
        queueDocument();
      }
    });

    const configurationSubscription = vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('mermaidPreviewOffline', document.uri)) {
        return;
      }
      void postConfiguration();
      if (configuration().refreshMode === 'automatic') {
        queueDocument(0);
      }
    });

    const modeSubscription = this.layoutController.onDidChangeMode((mode) => {
      void webview.postMessage({ type: 'editorMode', mode });
    });

    const panelStateSubscription = webviewPanel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) {
        void this.layoutController.restoreModeForPanel(document.uri, webviewPanel);
      } else {
        void this.layoutController.saveCurrentRatio(document.uri, true);
      }
    });

    const messageSubscription = webview.onDidReceiveMessage(async (message: unknown) => {
      if (!isWebviewMessage(message)) {
        return;
      }

      switch (message.type) {
        case 'ready': {
          this.readyPanels.add(panelKey);
          await postConfiguration();
          if (!message.hasPersistedState) {
            const fallback = this.context.workspaceState.get<PersistedPreviewState>(stateKey);
            if (fallback) {
              await webview.postMessage({
                type: 'restoreViewState',
                state: normalizePreviewState(fallback),
              });
            }
          }
          await webview.postMessage({
            type: 'editorMode',
            mode: this.layoutController.getMode(),
          });
          queueDocument(0);
          await this.layoutController.restoreModeForPanel(document.uri, webviewPanel);
          if (this.pendingExportDialogs.delete(panelKey)) {
            await webview.postMessage({ type: 'showExportDialog' });
          }
          break;
        }
        case 'chooseEditorMode':
          await this.layoutController.chooseMode(document.uri, webviewPanel);
          break;
        case 'setEditorMode':
          await this.layoutController.applyMode(document.uri, message.mode, webviewPanel);
          break;
        case 'toggleFullscreen':
          await vscode.commands.executeCommand('workbench.action.toggleMaximizeEditorGroup');
          break;
        case 'requestDocument':
          queueDocument(0);
          break;
        case 'setDiagramTheme':
          await updateDiagramTheme(message.theme);
          break;
        case 'diagnostic':
          if (message.version === document.version) {
            this.setDiagnostic(document, message);
          }
          break;
        case 'clearDiagnostic':
          if (message.version === document.version) {
            this.diagnostics.clearRender(document.uri);
          }
          break;
        case 'viewState':
          persistViewState(message.state);
          break;
        case 'copySvg':
          await vscode.env.clipboard.writeText(message.svg);
          void vscode.window.showInformationMessage('Mermaid SVG copied to the clipboard.');
          break;
        case 'saveSvg':
          await this.saveSvg(document.uri, message.svg);
          break;
        case 'saveExport':
          await this.saveExport(document.uri, message.artifact);
          break;
        case 'saveExportProfiles':
          await this.context.globalState.update(
            EXPORT_PROFILES_KEY,
            normalizeExportProfiles(message.profiles),
          );
          await this.broadcastExportConfiguration();
          break;
        case 'exportFolder':
          await this.startBatchExport(document.uri, webview, message.settings);
          break;
        case 'batchExportResult':
          await this.handleBatchResult(message);
          break;
        case 'batchExportError':
          await this.handleBatchError(message.batchId, message.fileId, message.message);
          break;
      }
    });

    webviewPanel.onDidDispose(() => {
      disposed = true;
      this.panels.delete(panelKey);
      this.readyPanels.delete(panelKey);
      this.pendingExportDialogs.delete(panelKey);
      void this.layoutController.saveCurrentRatio(document.uri, true);
      if (documentTimer) clearTimeout(documentTimer);
      if (stateTimer) clearTimeout(stateTimer);
      if (pendingState) void this.context.workspaceState.update(stateKey, pendingState);
      changeSubscription.dispose();
      configurationSubscription.dispose();
      modeSubscription.dispose();
      panelStateSubscription.dispose();
      messageSubscription.dispose();
      panelRegistration.dispose();
    });

    void this.layoutController.restoreModeForPanel(document.uri, webviewPanel);
  }

  private exportProfiles(): ExportProfile[] {
    return normalizeExportProfiles(this.context.globalState.get(EXPORT_PROFILES_KEY));
  }

  private async broadcastExportConfiguration(): Promise<void> {
    const profiles = this.exportProfiles();
    await Promise.all(
      [...this.panels.entries()].map(async ([key, panel]) => {
        if (!this.readyPanels.has(key)) {
          return;
        }
        await panel.webview.postMessage({
          type: 'exportConfiguration',
          profiles,
          settings: readExportConfiguration(vscode.Uri.parse(key)),
        });
      }),
    );
  }

  private async saveExport(
    documentUri: vscode.Uri,
    artifact: SerializedExportArtifact,
  ): Promise<void> {
    const fileName = sanitizeFileName(artifact.fileName);
    if (!fileName) {
      throw new Error('The export did not provide a valid file name.');
    }
    const defaultUri = vscode.Uri.joinPath(documentUri, '..', fileName);
    const labels: Record<SerializedExportArtifact['format'], string> = {
      pdf: 'PDF',
      png: 'PNG',
      svg: 'SVG',
      webp: 'WebP',
    };
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { [labels[artifact.format]]: [artifact.format] },
      saveLabel: `Save ${labels[artifact.format]}`,
      title: `Save ${artifact.width.toLocaleString()} × ${artifact.height.toLocaleString()} Mermaid export`,
    });
    if (!target) {
      return;
    }
    await vscode.workspace.fs.writeFile(target, decodeBase64(artifact.dataBase64));
    void vscode.window.showInformationMessage(`Diagram exported to ${target.fsPath}.`);
  }

  private async startBatchExport(
    documentUri: vscode.Uri,
    webview: vscode.Webview,
    rawSettings: ExportSettings,
  ): Promise<void> {
    const defaultDirectory = vscode.Uri.joinPath(documentUri, '..');
    const sourceSelection = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: defaultDirectory,
      openLabel: 'Select Mermaid source folder',
      title: 'Export all Mermaid files from a folder',
    });
    const sourceDirectory = sourceSelection?.[0];
    if (!sourceDirectory) {
      return;
    }
    const files = await this.collectMermaidFiles(sourceDirectory);
    if (files.length === 0) {
      void vscode.window.showWarningMessage('No .mmd or .mermaid files were found in that folder.');
      return;
    }
    const outputSelection = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: sourceDirectory,
      openLabel: 'Select export destination',
      title: `Choose a destination for ${files.length} Mermaid exports`,
    });
    const outputDirectory = outputSelection?.[0];
    if (!outputDirectory) {
      return;
    }

    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.batchSessions.set(batchId, {
      completed: 0,
      failures: [],
      files,
      outputDirectory,
      settings: normalizeExportSettings(rawSettings),
      total: files.length,
      webview,
    });
    void vscode.window.showInformationMessage(`Exporting ${files.length} Mermaid diagrams…`);
    await this.sendNextBatchFile(batchId);
  }

  private async collectMermaidFiles(
    root: vscode.Uri,
    directory = root,
    relativeSegments: string[] = [],
  ): Promise<BatchFile[]> {
    const files: BatchFile[] = [];
    const entries = await vscode.workspace.fs.readDirectory(directory);
    entries.sort(([left], [right]) => left.localeCompare(right));
    for (const [name, type] of entries) {
      const uri = vscode.Uri.joinPath(directory, name);
      if ((type & vscode.FileType.SymbolicLink) !== 0) {
        continue;
      }
      if ((type & vscode.FileType.Directory) !== 0) {
        files.push(...await this.collectMermaidFiles(root, uri, [...relativeSegments, name]));
      } else if ((type & vscode.FileType.File) !== 0 && /\.(?:mmd|mermaid)$/iu.test(name)) {
        files.push({
          fileId: uri.toString(),
          fileName: name,
          relativeDirectory: relativeSegments.join('/'),
          uri,
        });
      }
    }
    return files;
  }

  private async sendNextBatchFile(batchId: string): Promise<void> {
    const session = this.batchSessions.get(batchId);
    if (!session) {
      return;
    }
    const file = session.files.shift();
    if (!file) {
      this.finishBatchExport(batchId, session);
      return;
    }
    try {
      const sourceText = new TextDecoder().decode(await vscode.workspace.fs.readFile(file.uri));
      const source = await inlineLocalImages(sourceText, (reference) =>
        this.loadLocalImage(file.uri, reference),
      );
      const delivered = await session.webview.postMessage({
        type: 'batchExportFile',
        batchId,
        fileId: file.fileId,
        fileName: file.fileName,
        relativeDirectory: file.relativeDirectory,
        settings: session.settings,
        source,
        sourceUri: file.uri.toString(),
      });
      if (!delivered) {
        throw new Error('The export renderer is no longer available.');
      }
    } catch (error: unknown) {
      session.failures.push(`${file.fileName}: ${errorMessageOf(error)}`);
      session.completed += 1;
      await this.sendNextBatchFile(batchId);
    }
  }

  private async handleBatchResult(
    message: Extract<WebviewToExtensionMessage, { type: 'batchExportResult' }>,
  ): Promise<void> {
    const session = this.batchSessions.get(message.batchId);
    if (!session) {
      return;
    }
    try {
      const directory = message.relativeDirectory
        ? vscode.Uri.joinPath(session.outputDirectory, ...message.relativeDirectory.split('/'))
        : session.outputDirectory;
      await vscode.workspace.fs.createDirectory(directory);
      const fileName = sanitizeFileName(message.artifact.fileName);
      if (!fileName) {
        throw new Error('Invalid generated file name.');
      }
      const target = await nonConflictingUri(directory, fileName);
      await vscode.workspace.fs.writeFile(target, decodeBase64(message.artifact.dataBase64));
    } catch (error: unknown) {
      session.failures.push(`${message.fileId}: ${errorMessageOf(error)}`);
    }
    session.completed += 1;
    await this.sendNextBatchFile(message.batchId);
  }

  private async handleBatchError(
    batchId: string,
    fileId: string,
    message: string,
  ): Promise<void> {
    const session = this.batchSessions.get(batchId);
    if (!session) {
      return;
    }
    session.failures.push(`${fileId}: ${message}`);
    session.completed += 1;
    await this.sendNextBatchFile(batchId);
  }

  private finishBatchExport(batchId: string, session: BatchSession): void {
    this.batchSessions.delete(batchId);
    const succeeded = session.total - session.failures.length;
    if (session.failures.length === 0) {
      void vscode.window.showInformationMessage(
        `${succeeded} Mermaid diagrams exported to ${session.outputDirectory.fsPath}.`,
      );
      return;
    }
    const firstFailure = session.failures[0] ?? 'Unknown export error';
    void vscode.window.showWarningMessage(
      `${succeeded}/${session.total} diagrams exported. ${session.failures.length} failed: ${firstFailure}`,
    );
  }

  private async saveSvg(documentUri: vscode.Uri, svg: string): Promise<void> {
    const defaultUri = documentUri.with({
      path: documentUri.path.replace(/\.(?:mmd|mermaid)$/iu, '.svg'),
    });
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { SVG: ['svg'] },
      saveLabel: 'Save SVG',
      title: 'Save rendered Mermaid diagram',
    });

    if (!target) {
      return;
    }

    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(svg));
    void vscode.window.showInformationMessage(`Diagram saved to ${target.fsPath}.`);
  }

  private setDiagnostic(
    document: vscode.TextDocument,
    details: Extract<WebviewToExtensionMessage, { type: 'diagnostic' }>,
  ): void {
    const line = Math.min(Math.max((details.line ?? 1) - 1, 0), document.lineCount - 1);
    const lineText = document.lineAt(line);
    const startCharacter = Math.min(
      Math.max((details.column ?? 1) - 1, 0),
      lineText.range.end.character,
    );
    const range = new vscode.Range(
      line,
      startCharacter,
      line,
      Math.min(startCharacter + 1, lineText.range.end.character),
    );
    const diagnostic = new vscode.Diagnostic(
      range,
      details.message.split(/\r?\n/u, 1)[0]?.slice(0, 500) ?? 'Invalid Mermaid syntax',
      vscode.DiagnosticSeverity.Error,
    );
    diagnostic.source = 'Mermaid';
    diagnostic.code = 'syntax';
    this.diagnostics.setRender(document.uri, diagnostic);
  }

  private async loadLocalImage(
    documentUri: vscode.Uri,
    reference: string,
  ): Promise<LoadedLocalImage | undefined> {
    const mimeType = imageMimeType(reference);
    const relativePath = reference.split(/[?#]/u, 1)[0];
    if (!mimeType || !relativePath) {
      return undefined;
    }

    try {
      const segments = relativePath
        .replaceAll('\\', '/')
        .split('/')
        .map((segment) => decodeURIComponent(segment));
      const documentDirectory = vscode.Uri.joinPath(documentUri, '..');
      const resourceUri = vscode.Uri.joinPath(documentDirectory, ...segments);
      const workspaceRoot =
        vscode.workspace.getWorkspaceFolder(documentUri)?.uri ?? documentDirectory;
      if (!isUriWithin(workspaceRoot, resourceUri, process.platform !== 'win32')) {
        return undefined;
      }

      return {
        bytes: await vscode.workspace.fs.readFile(resourceUri),
        mimeType,
      };
    } catch {
      return undefined;
    }
  }
}

function readConfiguration(resource: vscode.Uri): PreviewConfiguration {
  const configuration = vscode.workspace.getConfiguration('mermaidPreviewOffline', resource);
  const configuredTheme = vscode.workspace
    .getConfiguration('mermaidPreviewOffline')
    .get<unknown>('diagramTheme', 'adaptive');
  const refreshMode = configuration.get<unknown>('refreshMode', 'automatic');
  const refreshDelay = configuration.get<number>('refreshDelay', 140);
  const largeFileThresholdKb = configuration.get<number>('largeFileThresholdKb', 512);
  const minimapEnabled = configuration.get<boolean>('minimap.enabled', true);

  return {
    diagramTheme: isDiagramTheme(configuredTheme) ? configuredTheme : 'adaptive',
    largeFileThresholdBytes: clampInteger(largeFileThresholdKb, 64, 10_240) * 1024,
    minimapEnabled,
    refreshDelay: clampInteger(refreshDelay, 0, 2_000),
    refreshMode: refreshMode === 'manual' ? 'manual' : 'automatic',
  };
}

function readExportConfiguration(resource: vscode.Uri): ExportSettings {
  const configuration = vscode.workspace.getConfiguration('mermaidPreviewOffline.export', resource);
  return normalizeExportSettings({
    background: configuration.get<unknown>('background', DEFAULT_EXPORT_SETTINGS.background),
    backgroundColor: configuration.get<unknown>(
      'backgroundColor',
      DEFAULT_EXPORT_SETTINGS.backgroundColor,
    ),
    dpi: configuration.get<unknown>('dpi', DEFAULT_EXPORT_SETTINGS.dpi),
    fileNameTemplate: configuration.get<unknown>(
      'fileNameTemplate',
      DEFAULT_EXPORT_SETTINGS.fileNameTemplate,
    ),
    format: configuration.get<unknown>('format', DEFAULT_EXPORT_SETTINGS.format),
    includeMetadata: configuration.get<unknown>(
      'includeMetadata',
      DEFAULT_EXPORT_SETTINGS.includeMetadata,
    ),
    margin: configuration.get<unknown>('margin', DEFAULT_EXPORT_SETTINGS.margin),
    optimizeSvg: configuration.get<unknown>(
      'optimizeSvg',
      DEFAULT_EXPORT_SETTINGS.optimizeSvg,
    ),
    scale: configuration.get<unknown>('scale', DEFAULT_EXPORT_SETTINGS.scale),
    svgVariant: DEFAULT_EXPORT_SETTINGS.svgVariant,
    theme: configuration.get<unknown>('theme', DEFAULT_EXPORT_SETTINGS.theme),
  });
}

async function updateDiagramTheme(theme: PreviewConfiguration['diagramTheme']): Promise<void> {
  const target =
    vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  await vscode.workspace
    .getConfiguration('mermaidPreviewOffline')
    .update('diagramTheme', theme, target);
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(Math.round(value), minimum), maximum);
}

function fileNameOf(uri: vscode.Uri): string {
  return decodeURIComponent(uri.path.split('/').pop() ?? uri.path);
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function nonConflictingUri(directory: vscode.Uri, fileName: string): Promise<vscode.Uri> {
  const extensionMatch = /\.[^.]+$/u.exec(fileName);
  const extension = extensionMatch?.[0] ?? '';
  const stem = extension ? fileName.slice(0, -extension.length) : fileName;
  for (let index = 1; index <= 10_000; index += 1) {
    const candidateName = index === 1 ? fileName : `${stem}-${index}${extension}`;
    const candidate = vscode.Uri.joinPath(directory, candidateName);
    try {
      await vscode.workspace.fs.stat(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error(`Could not find an available output name for ${fileName}.`);
}

function isWebviewMessage(value: unknown): value is WebviewToExtensionMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false;
  }

  const candidate = value as {
    artifact?: unknown;
    batchId?: unknown;
    fileId?: unknown;
    hasPersistedState?: unknown;
    column?: unknown;
    line?: unknown;
    message?: unknown;
    mode?: unknown;
    profiles?: unknown;
    relativeDirectory?: unknown;
    settings?: unknown;
    state?: unknown;
    svg?: unknown;
    theme?: unknown;
    type?: unknown;
    version?: unknown;
  };
  if (
    candidate.type === 'requestDocument' ||
    candidate.type === 'chooseEditorMode' ||
    candidate.type === 'toggleFullscreen'
  ) {
    return true;
  }
  if (candidate.type === 'ready') {
    return typeof candidate.hasPersistedState === 'boolean';
  }
  if (candidate.type === 'setEditorMode') {
    return isEditorMode(candidate.mode);
  }
  if (candidate.type === 'viewState') {
    return typeof candidate.state === 'object' && candidate.state !== null;
  }
  if (candidate.type === 'setDiagramTheme') {
    return isDiagramTheme(candidate.theme);
  }
  if (candidate.type === 'clearDiagnostic') {
    return typeof candidate.version === 'number';
  }
  if (candidate.type === 'diagnostic') {
    return (
      typeof candidate.version === 'number' &&
      typeof candidate.message === 'string' &&
      (candidate.line === undefined || typeof candidate.line === 'number') &&
      (candidate.column === undefined || typeof candidate.column === 'number')
    );
  }
  if (candidate.type === 'copySvg' || candidate.type === 'saveSvg') {
    return typeof candidate.svg === 'string';
  }
  if (candidate.type === 'saveExportProfiles') {
    return Array.isArray(candidate.profiles);
  }
  if (candidate.type === 'exportFolder') {
    return typeof candidate.settings === 'object' && candidate.settings !== null;
  }
  if (candidate.type === 'saveExport') {
    return isSerializedExportArtifact(candidate.artifact);
  }
  if (candidate.type === 'batchExportResult') {
    return (
      typeof candidate.batchId === 'string' &&
      typeof candidate.fileId === 'string' &&
      typeof candidate.relativeDirectory === 'string' &&
      isSerializedExportArtifact(candidate.artifact)
    );
  }
  return (
    candidate.type === 'batchExportError' &&
    typeof candidate.batchId === 'string' &&
    typeof candidate.fileId === 'string' &&
    typeof candidate.message === 'string'
  );
}

function isSerializedExportArtifact(value: unknown): value is SerializedExportArtifact {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const artifact = value as Partial<Record<keyof SerializedExportArtifact, unknown>>;
  return (
    typeof artifact.dataBase64 === 'string' &&
    artifact.dataBase64.length <= 800_000_000 &&
    typeof artifact.fileName === 'string' &&
    (artifact.format === 'svg' ||
      artifact.format === 'png' ||
      artifact.format === 'webp' ||
      artifact.format === 'pdf') &&
    typeof artifact.height === 'number' &&
    Number.isFinite(artifact.height) &&
    typeof artifact.mimeType === 'string' &&
    typeof artifact.width === 'number' &&
    Number.isFinite(artifact.width)
  );
}
