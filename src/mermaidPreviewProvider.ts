import { Buffer } from 'node:buffer';
import process from 'node:process';

import * as vscode from 'vscode';

import { imageMimeType, inlineLocalImages, type LoadedLocalImage } from './localImages';
import type { MermaidDiagnosticStore } from './languageFeatures';
import { isDiagramTheme, normalizePreviewState } from './previewState';
import type {
  PersistedPreviewState,
  PreviewConfiguration,
  WebviewToExtensionMessage,
} from './protocol';
import { effectiveRefreshDelay } from './renderPolicy';
import { createNonce, createWebviewHtml } from './webviewHtml';
import { isUriWithin } from './workspacePaths';

export const MERMAID_PREVIEW_VIEW_TYPE = 'brainfkt.mermaidPreviewOffline';

const VIEW_STATE_KEY_PREFIX = 'mermaidPreviewOffline.viewState.';

export class MermaidPreviewProvider implements vscode.CustomTextEditorProvider {
  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly diagnostics: MermaidDiagnosticStore,
  ) {}

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
    let lastSourceSentToWebview = document.getText();

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
    };

    const postSourceVisibility = async (): Promise<void> => {
      const visible = vscode.window.visibleTextEditors.some(
        (editor) => editor.document.uri.toString() === document.uri.toString(),
      );
      await webview.postMessage({ type: 'sourceVisibility', visible });
    };

    const sendDocument = async (generation: number): Promise<void> => {
      if (disposed || generation !== documentGeneration) {
        return;
      }

      const version = document.version;
      const originalSource = document.getText();
      const byteLength = Buffer.byteLength(originalSource, 'utf8');
      const source = await inlineLocalImages(originalSource, (reference) =>
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
      lastSourceSentToWebview = originalSource;
      await webview.postMessage({
        type: 'document',
        source,
        originalSource,
        fileName: fileNameOf(document.uri),
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
          originalSource: document.getText(),
          version: document.version,
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

    const visibilitySubscription = vscode.window.onDidChangeVisibleTextEditors(() => {
      void postSourceVisibility();
    });

    const messageSubscription = webview.onDidReceiveMessage(async (message: unknown) => {
      if (!isWebviewMessage(message)) {
        return;
      }

      switch (message.type) {
        case 'ready': {
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
          await postSourceVisibility();
          queueDocument(0);
          break;
        }
        case 'openSource':
          await vscode.window.showTextDocument(document, {
            preview: false,
            preserveFocus: message.preserveFocus ?? false,
            viewColumn: webviewPanel.viewColumn,
          });
          break;
        case 'requestDocument':
          queueDocument(0);
          break;
        case 'setDiagramTheme':
          await updateDiagramTheme(message.theme);
          break;
        case 'sourceEdit': {
          const currentSource = document.getText();
          if (
            document.version !== message.baseVersion &&
            currentSource !== lastSourceSentToWebview
          ) {
            queueDocument(0);
            break;
          }
          if (currentSource === message.source) break;
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode.Range(document.positionAt(0), document.positionAt(currentSource.length)),
            message.source,
          );
          if (await vscode.workspace.applyEdit(edit)) {
            lastSourceSentToWebview = message.source;
          } else {
            queueDocument(0);
          }
          break;
        }
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
      }
    });

    webviewPanel.onDidDispose(() => {
      disposed = true;
      if (documentTimer) clearTimeout(documentTimer);
      if (stateTimer) clearTimeout(stateTimer);
      if (pendingState) void this.context.workspaceState.update(stateKey, pendingState);
      changeSubscription.dispose();
      configurationSubscription.dispose();
      visibilitySubscription.dispose();
      messageSubscription.dispose();
    });
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

  return {
    diagramTheme: isDiagramTheme(configuredTheme) ? configuredTheme : 'adaptive',
    largeFileThresholdBytes: clampInteger(largeFileThresholdKb, 64, 10_240) * 1024,
    refreshDelay: clampInteger(refreshDelay, 0, 2_000),
    refreshMode: refreshMode === 'manual' ? 'manual' : 'automatic',
  };
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

function isWebviewMessage(value: unknown): value is WebviewToExtensionMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false;
  }

  const candidate = value as {
    hasPersistedState?: unknown;
    preserveFocus?: unknown;
    baseVersion?: unknown;
    column?: unknown;
    line?: unknown;
    message?: unknown;
    source?: unknown;
    state?: unknown;
    svg?: unknown;
    theme?: unknown;
    type?: unknown;
    version?: unknown;
  };
  if (candidate.type === 'requestDocument') {
    return true;
  }
  if (candidate.type === 'ready') {
    return typeof candidate.hasPersistedState === 'boolean';
  }
  if (candidate.type === 'openSource') {
    return candidate.preserveFocus === undefined || typeof candidate.preserveFocus === 'boolean';
  }
  if (candidate.type === 'viewState') {
    return typeof candidate.state === 'object' && candidate.state !== null;
  }
  if (candidate.type === 'setDiagramTheme') {
    return isDiagramTheme(candidate.theme);
  }
  if (candidate.type === 'sourceEdit') {
    return typeof candidate.source === 'string' && typeof candidate.baseVersion === 'number';
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
  return (
    (candidate.type === 'copySvg' || candidate.type === 'saveSvg') &&
    typeof candidate.svg === 'string'
  );
}
