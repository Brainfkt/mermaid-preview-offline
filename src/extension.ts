import * as vscode from 'vscode';

import {
  MERMAID_PREVIEW_VIEW_TYPE,
  MermaidPreviewProvider,
} from './mermaidPreviewProvider';

const OPEN_PREVIEW_COMMAND = 'mermaidPreviewOffline.openPreview';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new MermaidPreviewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(MERMAID_PREVIEW_VIEW_TYPE, provider, {
      supportsMultipleEditorsPerDocument: true,
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand(OPEN_PREVIEW_COMMAND, async (resource?: vscode.Uri) => {
      const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
      if (!uri || !isMermaidDocument(uri)) {
        void vscode.window.showWarningMessage('Ouvrez d’abord un fichier .mmd ou .mermaid.');
        return;
      }

      await vscode.commands.executeCommand('vscode.openWith', uri, MERMAID_PREVIEW_VIEW_TYPE);
    }),
  );
}

export function deactivate(): void {}

function isMermaidDocument(uri: vscode.Uri): boolean {
  return /\.(?:mmd|mermaid)$/iu.test(uri.path);
}
