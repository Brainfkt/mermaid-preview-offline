import * as vscode from 'vscode';

import type { WebviewToExtensionMessage } from './protocol';
import { createNonce, createWebviewHtml } from './webviewHtml';

export const MERMAID_PREVIEW_VIEW_TYPE = 'stokage-tools.mermaidPreview';

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
      title: `Aperçu — ${fileNameOf(document.uri)}`,
    });

    const sendDocument = async (): Promise<void> => {
      await webview.postMessage({
        type: 'document',
        source: document.getText(),
        fileName: fileNameOf(document.uri),
        version: document.version,
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
          void vscode.window.showInformationMessage('SVG Mermaid copié dans le presse-papiers.');
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
      saveLabel: 'Enregistrer le SVG',
      title: 'Enregistrer le diagramme rendu',
    });

    if (!target) {
      return;
    }

    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(svg));
    void vscode.window.showInformationMessage(`Diagramme enregistré dans ${target.fsPath}.`);
  }
}

function fileNameOf(uri: vscode.Uri): string {
  return decodeURIComponent(uri.path.split('/').pop() ?? uri.path);
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
