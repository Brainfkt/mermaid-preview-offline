import * as vscode from 'vscode';

import {
  MERMAID_PREVIEW_VIEW_TYPE,
  MermaidPreviewProvider,
} from './mermaidPreviewProvider';
import { MermaidEditorLayoutController } from './editorLayoutController';
import { registerMermaidLanguageFeatures } from './languageFeatures';
import type { MermaidEditorMode } from './protocol';

const OPEN_PREVIEW_COMMAND = 'mermaidPreviewOffline.openPreview';
const OPEN_PREVIEW_TO_SIDE_COMMAND = 'mermaidPreviewOffline.openPreviewToSide';
const CONFIGURE_DEFAULT_EDITOR_COMMAND = 'mermaidPreviewOffline.configureDefaultEditor';
const CHOOSE_LAYOUT_COMMAND = 'mermaidPreviewOffline.chooseEditorLayout';
const MODE_COMMANDS: ReadonlyArray<[string, MermaidEditorMode]> = [
  ['mermaidPreviewOffline.openPreviewOnly', 'preview'],
  ['mermaidPreviewOffline.openSourceOnly', 'source'],
  ['mermaidPreviewOffline.openBeside', 'beside'],
  ['mermaidPreviewOffline.openAbove', 'above'],
];

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = registerMermaidLanguageFeatures(context);
  const layoutController = new MermaidEditorLayoutController(
    context,
    MERMAID_PREVIEW_VIEW_TYPE,
  );
  const provider = new MermaidPreviewProvider(context, diagnostics, layoutController);

  context.subscriptions.push(
    layoutController,
    vscode.window.registerCustomEditorProvider(MERMAID_PREVIEW_VIEW_TYPE, provider, {
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      const uri = editor?.document.uri;
      if (uri && isMermaidDocument(uri)) {
        void layoutController.syncPreviewForSource(uri);
      }
    }),
    vscode.commands.registerCommand(OPEN_PREVIEW_COMMAND, async (resource?: vscode.Uri) => {
      await applyEditorMode(layoutController, 'preview', resource);
    }),
    vscode.commands.registerCommand(OPEN_PREVIEW_TO_SIDE_COMMAND, async (resource?: vscode.Uri) => {
      await applyEditorMode(layoutController, 'beside', resource);
    }),
    vscode.commands.registerCommand(CHOOSE_LAYOUT_COMMAND, async (resource?: vscode.Uri) => {
      const uri = mermaidUri(resource);
      if (uri) {
        await layoutController.chooseMode(uri);
      }
    }),
    ...MODE_COMMANDS.map(([command, mode]) =>
      vscode.commands.registerCommand(command, async (resource?: vscode.Uri) => {
        await applyEditorMode(layoutController, mode, resource);
      }),
    ),
    vscode.commands.registerCommand(
      CONFIGURE_DEFAULT_EDITOR_COMMAND,
      async (resource?: vscode.Uri) => {
        await configureDefaultEditor(resource);
      },
    ),
  );

  const activeSourceUri = vscode.window.activeTextEditor?.document.uri;
  if (activeSourceUri && isMermaidDocument(activeSourceUri)) {
    void layoutController.syncPreviewForSource(activeSourceUri);
  }
}

export function deactivate(): void {}

async function applyEditorMode(
  controller: MermaidEditorLayoutController,
  mode: MermaidEditorMode,
  resource?: vscode.Uri,
): Promise<void> {
  const uri = mermaidUri(resource);
  if (uri) {
    await controller.applyMode(uri, mode);
  }
}

async function configureDefaultEditor(resource?: vscode.Uri): Promise<void> {
  const uri = mermaidUri(resource, 'Select a .mmd or .mermaid file first.');
  if (!uri) {
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

function mermaidUri(
  resource?: vscode.Uri,
  warning = 'Open a .mmd or .mermaid file first.',
): vscode.Uri | undefined {
  const uri = resource ?? activeEditorUri();
  if (!uri || !isMermaidDocument(uri)) {
    void vscode.window.showWarningMessage(warning);
    return undefined;
  }
  return uri;
}

function activeEditorUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom) {
    return input.uri;
  }
  return vscode.window.activeTextEditor?.document.uri;
}
