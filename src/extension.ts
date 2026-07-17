import * as vscode from 'vscode';

import {
  MERMAID_PREVIEW_VIEW_TYPE,
  MermaidPreviewProvider,
} from './mermaidPreviewProvider';

const OPEN_PREVIEW_COMMAND = 'mermaidPreviewOffline.openPreview';
const OPEN_PREVIEW_TO_SIDE_COMMAND = 'mermaidPreviewOffline.openPreviewToSide';
const CONFIGURE_DEFAULT_EDITOR_COMMAND = 'mermaidPreviewOffline.configureDefaultEditor';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new MermaidPreviewProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(MERMAID_PREVIEW_VIEW_TYPE, provider, {
      supportsMultipleEditorsPerDocument: true,
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand(OPEN_PREVIEW_COMMAND, async (resource?: vscode.Uri) => {
      await openPreview(resource);
    }),
    vscode.commands.registerCommand(OPEN_PREVIEW_TO_SIDE_COMMAND, async (resource?: vscode.Uri) => {
      await openPreview(resource, vscode.ViewColumn.Beside);
    }),
    vscode.commands.registerCommand(
      CONFIGURE_DEFAULT_EDITOR_COMMAND,
      async (resource?: vscode.Uri) => {
        await configureDefaultEditor(resource);
      },
    ),
  );
}

export function deactivate(): void {}

async function openPreview(resource?: vscode.Uri, viewColumn?: vscode.ViewColumn): Promise<void> {
  const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
  if (!uri || !isMermaidDocument(uri)) {
    void vscode.window.showWarningMessage('Open a .mmd or .mermaid file first.');
    return;
  }

  await vscode.commands.executeCommand(
    'vscode.openWith',
    uri,
    MERMAID_PREVIEW_VIEW_TYPE,
    viewColumn,
  );
}

async function configureDefaultEditor(resource?: vscode.Uri): Promise<void> {
  const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
  if (!uri || !isMermaidDocument(uri)) {
    void vscode.window.showWarningMessage('Select a .mmd or .mermaid file first.');
    return;
  }

  const selection = await vscode.window.showQuickPick(
    [
      {
        description: 'Open Mermaid files directly in the offline preview',
        editorId: MERMAID_PREVIEW_VIEW_TYPE,
        label: 'Mermaid Preview (Offline)',
      },
      {
        description: 'Open Mermaid files as editable text',
        editorId: 'default',
        label: 'Text Editor',
      },
      {
        description: 'Remove the workspace-specific choice',
        editorId: undefined,
        label: 'Reset association',
      },
    ],
    {
      placeHolder: 'Choose the default editor for .mmd and .mermaid files',
      title: 'Mermaid Preview: Configure Default Editor',
    },
  );
  if (!selection) {
    return;
  }

  const configuration = vscode.workspace.getConfiguration('workbench');
  const current = configuration.get<Record<string, string>>('editorAssociations', {});
  const associations = { ...current };
  for (const pattern of ['*.mmd', '*.mermaid']) {
    if (selection.editorId) {
      associations[pattern] = selection.editorId;
    } else {
      delete associations[pattern];
    }
  }
  const target = vscode.workspace.workspaceFolders
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  await configuration.update('editorAssociations', associations, target);
  void vscode.window.showInformationMessage(
    selection.editorId
      ? `${selection.label} is now the default for Mermaid files.`
      : 'The Mermaid editor association has been reset.',
  );
}

function isMermaidDocument(uri: vscode.Uri): boolean {
  return /\.(?:mmd|mermaid)$/iu.test(uri.path);
}
