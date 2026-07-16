import * as vscode from 'vscode';

import { imageMimeType, inlineLocalImages, type LoadedLocalImage } from './localImages';
import type { WebviewToExtensionMessage } from './protocol';
import { createNonce, createWebviewHtml } from './webviewHtml';

export const MERMAID_PREVIEW_VIEW_TYPE = 'brainfkt.mermaidPreviewOffline';

export class MermaidPreviewProvider implements vscode.CustomTextEditorProvider {
  public constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): void {
    const webview = webviewPanel.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.css'));
    const nonce = createNonce();

    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.extensionUri, 'media'),
      ],
    };
    webviewPanel.webview.html = createWebviewHtml({
      cspSource: webview.cspSource,
      nonce,
      scriptUri: scriptUri.toString(),
      styleUri: styleUri.toString(),
      title: `Preview — ${fileNameOf(document.uri)}`,
    });

    const sendDocument = async (): Promise<void> => {
      const version = document.version;
      const source = await inlineLocalImages(document.getText(), (reference) =>
        this.loadLocalImage(document.uri, reference),
      );
      if (document.version !== version) {
        return;
      }
      await webview.postMessage({
        type: 'document',
        source,
        fileName: fileNameOf(document.uri),
        version,
      });
    };

    const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) {
        void sendDocument();
      }
    });

    const messageSubscription = webview.onDidReceiveMessage(async (message: unknown) => {
      if (!isWebviewMessage(message)) {
        return;
      }

      switch (message.type) {
        case 'ready':
          await sendDocument();
          break;
        case 'openSource':
          await vscode.window.showTextDocument(document, {
            preview: false,
            preserveFocus: false,
            viewColumn: vscode.ViewColumn.Beside,
          });
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
      changeSubscription.dispose();
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
      if (!isUriWithin(workspaceRoot, resourceUri)) {
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

function fileNameOf(uri: vscode.Uri): string {
  return decodeURIComponent(uri.path.split('/').pop() ?? uri.path);
}

function isUriWithin(root: vscode.Uri, candidate: vscode.Uri): boolean {
  if (root.scheme !== candidate.scheme || root.authority !== candidate.authority) {
    return false;
  }
  const rootPath = root.path.replace(/\/$/u, '');
  return candidate.path === rootPath || candidate.path.startsWith(`${rootPath}/`);
}

function isWebviewMessage(value: unknown): value is WebviewToExtensionMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false;
  }

  const candidate = value as { type?: unknown; svg?: unknown };
  if (candidate.type === 'ready' || candidate.type === 'openSource') {
    return true;
  }
  return (
    (candidate.type === 'copySvg' || candidate.type === 'saveSvg') &&
    typeof candidate.svg === 'string'
  );
}
