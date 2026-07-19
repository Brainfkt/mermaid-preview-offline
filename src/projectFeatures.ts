import { relative } from 'node:path';

import * as vscode from 'vscode';

import {
  DIAGRAM_TEMPLATES,
  inferDiagramCategory,
  titleFromFileName,
  type DiagramExample,
} from './diagramTemplates';
import { imageMimeType, inlineLocalImages } from './localImages';
import { MERMAID_PREVIEW_VIEW_TYPE } from './mermaidPreviewProvider';
import {
  createGalleryWebviewHtml,
  createVisualDiffWebviewHtml,
} from './projectWebviewHtml';
import { summarizeLineDiff, isMermaidPath, type LineDiffSummary } from './visualDiff';
import { isUriWithin } from './workspacePaths';

export type GalleryInitialTab = 'examples' | 'templates';

interface GitRef {
  commit?: string;
  name?: string;
  type?: number;
}

interface GitRepository {
  rootUri: vscode.Uri;
  show(ref: string, path: string): Promise<Uint8Array>;
  state: {
    HEAD?: GitRef;
    refs: readonly GitRef[];
  };
}

interface GitApi {
  repositories: readonly GitRepository[];
}

interface GitExtension {
  enabled: boolean;
  getAPI(version: 1): GitApi;
}

interface RevisionChoice extends vscode.QuickPickItem {
  ref: string | undefined;
}

interface VisualRevision {
  label: string;
  source: string;
}

interface VisualComparison {
  after: VisualRevision;
  before: VisualRevision;
  summary: LineDiffSummary;
  title: string;
}

type ProjectWebviewMessage =
  | { type: 'ready' }
  | { fileName: string; source: string; type: 'createDiagram' };

export class MermaidProjectFeatures implements vscode.Disposable {
  private galleryPanel: vscode.WebviewPanel | undefined;
  private galleryTab: GalleryInitialTab = 'templates';
  private visualDiffPanel: vscode.WebviewPanel | undefined;
  private visualComparison: VisualComparison | undefined;
  private examplesPromise: Promise<DiagramExample[]> | undefined;

  public constructor(private readonly context: vscode.ExtensionContext) {}

  public dispose(): void {
    this.galleryPanel?.dispose();
    this.visualDiffPanel?.dispose();
  }

  public async showGallery(initialTab: GalleryInitialTab = 'templates'): Promise<void> {
    this.galleryTab = initialTab;
    if (this.galleryPanel) {
      this.galleryPanel.title = initialTab === 'templates' ? 'Diagram Studio' : 'Mermaid Examples';
      this.galleryPanel.reveal(vscode.ViewColumn.Active, true);
      await this.postGalleryData();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'mermaidPreviewOffline.diagramStudio',
      initialTab === 'templates' ? 'Diagram Studio' : 'Mermaid Examples',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
          vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        ],
        retainContextWhenHidden: true,
      },
    );
    this.galleryPanel = panel;
    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'project-webview.js'),
    );
    const styleUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'project.css'),
    );
    panel.webview.html = createGalleryWebviewHtml({
      cspSource: panel.webview.cspSource,
      scriptUri: scriptUri.toString(),
      styleUri: styleUri.toString(),
      title: 'Diagram Studio',
    });
    const messageSubscription = panel.webview.onDidReceiveMessage(
      async (message: unknown) => this.handleGalleryMessage(message),
    );
    panel.onDidDispose(() => {
      messageSubscription.dispose();
      if (this.galleryPanel === panel) this.galleryPanel = undefined;
    });
  }

  public async compareGitVersions(resource?: vscode.Uri): Promise<void> {
    const uri = resource ?? activeMermaidUri();
    if (!uri || !isMermaidPath(uri.path)) {
      void vscode.window.showWarningMessage('Select a .mmd or .mermaid file to compare.');
      return;
    }
    const repository = await this.repositoryFor(uri);
    if (!repository) return;
    const choices = revisionChoices(repository);
    const before = await vscode.window.showQuickPick(choices.filter((choice) => choice.ref), {
      placeHolder: 'Select the before revision',
      title: `Visual Git diff · ${fileNameOf(uri)}`,
    });
    if (!before) return;
    const after = await vscode.window.showQuickPick(
      choices.filter((choice) => choice.ref !== before.ref),
      {
        placeHolder: 'Select the after revision',
        title: `Compare ${before.label} with…`,
      },
    );
    if (!after) return;
    try {
      const [beforeSource, afterSource] = await Promise.all([
        this.sourceAtRevision(repository, uri, before.ref),
        this.sourceAtRevision(repository, uri, after.ref),
      ]);
      await this.showVisualComparison({
        after: { label: after.label, source: afterSource },
        before: { label: before.label, source: beforeSource },
        summary: summarizeLineDiff(beforeSource, afterSource),
        title: `Visual diff · ${fileNameOf(uri)}`,
      });
    } catch (error: unknown) {
      void vscode.window.showErrorMessage(`Could not compare Git revisions: ${errorMessageOf(error)}`);
    }
  }

  public async previewActiveEditorDiff(): Promise<void> {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    if (!(input instanceof vscode.TabInputTextDiff)) {
      void vscode.window.showWarningMessage('Open a Mermaid text diff before requesting its visual preview.');
      return;
    }
    if (!isMermaidPath(input.original.path) || !isMermaidPath(input.modified.path)) {
      void vscode.window.showWarningMessage('The active diff does not compare Mermaid files.');
      return;
    }
    try {
      const [beforeSource, afterSource] = await Promise.all([
        readTextDocument(input.original),
        readTextDocument(input.modified),
      ]);
      await this.showVisualComparison({
        after: { label: revisionLabel(input.modified, 'After'), source: afterSource },
        before: { label: revisionLabel(input.original, 'Before'), source: beforeSource },
        summary: summarizeLineDiff(beforeSource, afterSource),
        title: `Visual diff · ${fileNameOf(input.modified)}`,
      });
    } catch (error: unknown) {
      void vscode.window.showErrorMessage(`Could not preview the active diff: ${errorMessageOf(error)}`);
    }
  }

  private async handleGalleryMessage(message: unknown): Promise<void> {
    if (!isProjectWebviewMessage(message)) return;
    if (message.type === 'ready') {
      await this.postGalleryData();
      return;
    }
    await this.createDiagram(message.fileName, message.source);
  }

  private async postGalleryData(): Promise<void> {
    if (!this.galleryPanel) return;
    await this.galleryPanel.webview.postMessage({
      examples: await this.examples(),
      initialTab: this.galleryTab,
      templates: DIAGRAM_TEMPLATES,
      type: 'galleryData',
    });
  }

  private async examples(): Promise<DiagramExample[]> {
    this.examplesPromise ??= this.loadExamples();
    return this.examplesPromise;
  }

  private async loadExamples(): Promise<DiagramExample[]> {
    const root = vscode.Uri.joinPath(this.context.extensionUri, 'examples');
    const entries = await vscode.workspace.fs.readDirectory(root);
    const examples: DiagramExample[] = [];
    for (const [fileName, type] of entries.sort(([left], [right]) => left.localeCompare(right))) {
      if ((type & vscode.FileType.File) === 0 || !isMermaidPath(fileName)) continue;
      const uri = vscode.Uri.joinPath(root, fileName);
      const rawSource = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
      const source = await inlineLocalImages(rawSource, async (reference) => {
        const mimeType = imageMimeType(reference);
        const relativePath = reference.split(/[?#]/u, 1)[0];
        if (!mimeType || !relativePath) return undefined;
        const resource = vscode.Uri.joinPath(root, ...relativePath.replaceAll('\\', '/').split('/'));
        if (!isUriWithin(root, resource, process.platform !== 'win32')) return undefined;
        try {
          return { bytes: await vscode.workspace.fs.readFile(resource), mimeType };
        } catch {
          return undefined;
        }
      });
      examples.push({
        category: inferDiagramCategory(source),
        fileName,
        id: fileName.replace(/\.(?:mmd|mermaid)$/iu, ''),
        source,
        title: titleFromFileName(fileName),
      });
    }
    return examples;
  }

  private async createDiagram(requestedFileName: string, source: string): Promise<void> {
    if (!source.trim() || source.length > 2_000_000) {
      void vscode.window.showErrorMessage('The generated Mermaid source is empty or too large.');
      return;
    }
    const fileName = sanitizeMermaidFileName(requestedFileName);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    const defaultUri = workspaceRoot ? vscode.Uri.joinPath(workspaceRoot, fileName) : undefined;
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { Mermaid: ['mmd', 'mermaid'] },
      saveLabel: 'Create Diagram',
      title: 'Create Mermaid diagram from template',
    });
    if (!target) return;
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(ensureFinalNewline(source)));
    await vscode.commands.executeCommand('vscode.openWith', target, MERMAID_PREVIEW_VIEW_TYPE);
    void vscode.window.showInformationMessage(`Created ${fileNameOf(target)} from Diagram Studio.`);
  }

  private async repositoryFor(uri: vscode.Uri): Promise<GitRepository | undefined> {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!extension) {
      void vscode.window.showWarningMessage('The built-in VS Code Git extension is unavailable.');
      return undefined;
    }
    const exports = extension.isActive ? extension.exports : await extension.activate();
    if (!exports.enabled) {
      void vscode.window.showWarningMessage('Enable the built-in VS Code Git extension to compare revisions.');
      return undefined;
    }
    const repositories = exports.getAPI(1).repositories;
    const matches = repositories
      .filter((repository) => isUriWithin(repository.rootUri, uri, process.platform !== 'win32'))
      .sort((left, right) => right.rootUri.path.length - left.rootUri.path.length);
    const repository = matches[0];
    if (!repository) {
      void vscode.window.showWarningMessage('The selected Mermaid file is not inside an open Git repository.');
    }
    return repository;
  }

  private async sourceAtRevision(
    repository: GitRepository,
    uri: vscode.Uri,
    ref: string | undefined,
  ): Promise<string> {
    if (!ref) return readTextDocument(uri);
    const repositoryPath = relative(repository.rootUri.fsPath, uri.fsPath).replaceAll('\\', '/');
    return new TextDecoder().decode(await repository.show(ref, repositoryPath));
  }

  private async showVisualComparison(comparison: VisualComparison): Promise<void> {
    this.visualComparison = comparison;
    if (this.visualDiffPanel) {
      this.visualDiffPanel.title = comparison.title;
      this.visualDiffPanel.reveal(vscode.ViewColumn.Active, true);
      await this.postVisualComparison();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'mermaidPreviewOffline.visualDiff',
      comparison.title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
          vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        ],
        retainContextWhenHidden: true,
      },
    );
    this.visualDiffPanel = panel;
    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'project-webview.js'),
    );
    const styleUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'project.css'),
    );
    panel.webview.html = createVisualDiffWebviewHtml({
      cspSource: panel.webview.cspSource,
      scriptUri: scriptUri.toString(),
      styleUri: styleUri.toString(),
      title: comparison.title,
    });
    const messageSubscription = panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (isProjectWebviewMessage(message) && message.type === 'ready') {
        await this.postVisualComparison();
      }
    });
    panel.onDidDispose(() => {
      messageSubscription.dispose();
      if (this.visualDiffPanel === panel) this.visualDiffPanel = undefined;
    });
  }

  private async postVisualComparison(): Promise<void> {
    if (!this.visualDiffPanel || !this.visualComparison) return;
    await this.visualDiffPanel.webview.postMessage({
      ...this.visualComparison,
      type: 'visualDiffData',
    });
  }
}

function revisionChoices(repository: GitRepository): RevisionChoice[] {
  const headName = repository.state.HEAD?.name;
  const choices: RevisionChoice[] = [
    { description: 'Unsaved and working tree changes', label: 'Working tree', ref: undefined },
    { description: headName ? `Current ${headName}` : 'Current commit', label: 'HEAD', ref: 'HEAD' },
  ];
  const seen = new Set(['HEAD']);
  for (const ref of repository.state.refs) {
    const name = ref.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    choices.push({
      description: ref.commit?.slice(0, 8),
      label: name,
      ref: name,
    });
  }
  return choices.slice(0, 202);
}

async function readTextDocument(uri: vscode.Uri): Promise<string> {
  const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
  if (open) return open.getText();
  return (await vscode.workspace.openTextDocument(uri)).getText();
}

function revisionLabel(uri: vscode.Uri, fallback: string): string {
  if (!uri.query) return fileNameOf(uri) || fallback;
  try {
    const query = JSON.parse(uri.query) as { ref?: unknown };
    if (typeof query.ref === 'string' && query.ref) return query.ref;
  } catch {
    // Non-Git URI query.
  }
  return fileNameOf(uri) || fallback;
}

function activeMermaidUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom) return input.uri;
  return vscode.window.activeTextEditor?.document.uri;
}

function sanitizeMermaidFileName(value: string): string {
  const printable = Array.from(value, (character) =>
    character.codePointAt(0) !== undefined && (character.codePointAt(0) ?? 0) < 32 ? '-' : character,
  ).join('');
  const cleaned = printable
    .trim()
    .replace(/[\\/:*?"<>|]/gu, '-')
    .replace(/^\.+/u, '')
    .replace(/\s+/gu, '-')
    .slice(0, 180);
  const fileName = cleaned || 'diagram.mmd';
  return isMermaidPath(fileName) ? fileName : `${fileName}.mmd`;
}

function ensureFinalNewline(source: string): string {
  return `${source.trimEnd()}\n`;
}

function fileNameOf(uri: vscode.Uri): string {
  return decodeURIComponent(uri.path.split('/').pop() ?? uri.path);
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isProjectWebviewMessage(value: unknown): value is ProjectWebviewMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  const candidate = value as { fileName?: unknown; source?: unknown; type?: unknown };
  if (candidate.type === 'ready') return true;
  return candidate.type === 'createDiagram' &&
    typeof candidate.fileName === 'string' &&
    typeof candidate.source === 'string';
}
