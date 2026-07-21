import * as vscode from 'vscode';

import {
  MERMAID_PREVIEW_VIEW_TYPE,
  MermaidPreviewProvider,
} from './mermaidPreviewProvider';
import { MermaidEditorLayoutController } from './editorLayoutController';
import { MermaidDocumentationFeatures } from './documentationFeatures';
import {
  GENERATE_ERD_FROM_SQL_COMMAND,
  GENERATE_PACKAGE_DEPENDENCIES_COMMAND,
  MermaidDiagramGenerationFeatures,
} from './diagramGenerationFeatures';
import { MERMAID_EXPORT_TASK_TYPE, MermaidExportTaskProvider } from './exportTaskProvider';
import { registerMermaidLanguageFeatures } from './languageFeatures';
import { MermaidProjectFeatures } from './projectFeatures';
import type { MermaidEditorMode } from './protocol';

const OPEN_PREVIEW_COMMAND = 'mermaidPreviewOffline.openPreview';
const OPEN_PREVIEW_TO_SIDE_COMMAND = 'mermaidPreviewOffline.openPreviewToSide';
const OPEN_PREVIEW_NEW_WINDOW_COMMAND = 'mermaidPreviewOffline.openPreviewNewWindow';
const CONFIGURE_DEFAULT_EDITOR_COMMAND = 'mermaidPreviewOffline.configureDefaultEditor';
const CHOOSE_LAYOUT_COMMAND = 'mermaidPreviewOffline.chooseEditorLayout';
const CYCLE_LAYOUT_COMMAND = 'mermaidPreviewOffline.cycleEditorLayout';
const EXPORT_COMMAND = 'mermaidPreviewOffline.export';
const NEW_DIAGRAM_COMMAND = 'mermaidPreviewOffline.newDiagram';
const BROWSE_EXAMPLES_COMMAND = 'mermaidPreviewOffline.browseExamples';
const GENERATE_FROM_TEMPLATE_COMMAND = 'mermaidPreviewOffline.generateFromTemplate';
const COMPARE_GIT_VERSIONS_COMMAND = 'mermaidPreviewOffline.compareGitVersions';
const PREVIEW_VISUAL_DIFF_COMMAND = 'mermaidPreviewOffline.previewVisualDiff';
const PREVIEW_DOCUMENTATION_BLOCK_COMMAND = 'mermaidPreviewOffline.previewDocumentationBlock';
const PREVIEW_DOCUMENTATION_COMMAND = 'mermaidPreviewOffline.previewDocumentation';
const EXPORT_DOCUMENTATION_COMMAND = 'mermaidPreviewOffline.exportDocumentation';
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
  const exportTaskProvider = new MermaidExportTaskProvider(context);
  const projectFeatures = new MermaidProjectFeatures(context);
  const documentationFeatures = new MermaidDocumentationFeatures(context);
  const diagramGenerationFeatures = new MermaidDiagramGenerationFeatures();

  context.subscriptions.push(
    layoutController,
    projectFeatures,
    documentationFeatures,
    vscode.window.registerCustomEditorProvider(MERMAID_PREVIEW_VIEW_TYPE, provider, {
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.tasks.registerTaskProvider(MERMAID_EXPORT_TASK_TYPE, exportTaskProvider),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      const uri = editor?.document.uri;
      if (uri && isMermaidDocument(uri)) {
        void layoutController.syncPreviewForSource(uri);
      }
    }),
    vscode.window.tabGroups.onDidChangeTabs((event) => {
      void layoutController.handleTabsChanged(event);
    }),
    vscode.commands.registerCommand(OPEN_PREVIEW_COMMAND, async (resource?: vscode.Uri) => {
      await applyEditorMode(layoutController, 'preview', resource);
    }),
    vscode.commands.registerCommand(OPEN_PREVIEW_TO_SIDE_COMMAND, async (resource?: vscode.Uri) => {
      await applyEditorMode(layoutController, 'beside', resource);
    }),
    vscode.commands.registerCommand(OPEN_PREVIEW_NEW_WINDOW_COMMAND, async (resource?: vscode.Uri) => {
      const uri = mermaidUri(resource);
      if (!uri) return;
      await layoutController.applyMode(uri, 'preview');
      await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
    }),
    vscode.commands.registerCommand(CHOOSE_LAYOUT_COMMAND, async (resource?: vscode.Uri) => {
      const uri = mermaidUri(resource);
      if (uri) {
        await layoutController.chooseMode(uri);
      }
    }),
    vscode.commands.registerCommand(CYCLE_LAYOUT_COMMAND, async (resource?: vscode.Uri) => {
      const uri = mermaidUri(resource);
      if (uri) {
        await layoutController.cyclePreviewMode(uri);
      }
    }),
    vscode.commands.registerCommand(EXPORT_COMMAND, async (resource?: vscode.Uri) => {
      const uri = mermaidUri(resource);
      if (!uri) {
        return;
      }
      await layoutController.applyMode(uri, 'preview');
      await provider.showExportDialog(uri);
    }),
    vscode.commands.registerCommand(NEW_DIAGRAM_COMMAND, async () => {
      await projectFeatures.showGallery('templates');
    }),
    vscode.commands.registerCommand(BROWSE_EXAMPLES_COMMAND, async () => {
      await projectFeatures.showGallery('examples');
    }),
    vscode.commands.registerCommand(GENERATE_FROM_TEMPLATE_COMMAND, async () => {
      await projectFeatures.showGallery('templates');
    }),
    vscode.commands.registerCommand(GENERATE_ERD_FROM_SQL_COMMAND, async () => {
      await diagramGenerationFeatures.generateErdFromSql();
    }),
    vscode.commands.registerCommand(GENERATE_PACKAGE_DEPENDENCIES_COMMAND, async () => {
      await diagramGenerationFeatures.generateDependencyGraphFromPackageJson();
    }),
    vscode.commands.registerCommand(COMPARE_GIT_VERSIONS_COMMAND, async (resource?: vscode.Uri) => {
      await projectFeatures.compareGitVersions(resource);
    }),
    vscode.commands.registerCommand(PREVIEW_VISUAL_DIFF_COMMAND, async () => {
      await projectFeatures.previewActiveEditorDiff();
    }),
    vscode.commands.registerCommand(
      PREVIEW_DOCUMENTATION_BLOCK_COMMAND,
      async (resource?: vscode.Uri) => {
        await documentationFeatures.previewBlockUnderCursor(resource);
      },
    ),
    vscode.commands.registerCommand(
      PREVIEW_DOCUMENTATION_COMMAND,
      async (resource?: vscode.Uri) => {
        await documentationFeatures.previewAllBlocks(resource);
      },
    ),
    vscode.commands.registerCommand(
      EXPORT_DOCUMENTATION_COMMAND,
      async (resource?: vscode.Uri) => {
        await documentationFeatures.exportDocument(resource);
      },
    ),
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
