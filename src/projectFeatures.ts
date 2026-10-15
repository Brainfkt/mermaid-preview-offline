import { relative } from 'node:path';
import { randomUUID } from 'node:crypto';

import * as vscode from 'vscode';

import { normalizeDiagramDensity, normalizeDiagramSurface } from './appearance';
import {
  DIAGRAM_TEMPLATES,
  inferDiagramCategory,
  titleFromFileName,
  type DiagramExample,
} from './diagramTemplates';
import {
  normalizeDiagramFontFamily,
  type DiagramFontFamily,
} from './diagramFont';
import { imageMimeType, inlineLocalImages } from './localImages';
import { MERMAID_PREVIEW_VIEW_TYPE } from './mermaidPreviewProvider';
import { isDiagramTheme } from './previewState';
import {
  createGalleryWebviewHtml,
  createVisualDiffWebviewHtml,
} from './projectWebviewHtml';
import { summarizeLineDiff, isMermaidPath, type LineDiffSummary } from './visualDiff';
import { isUriWithin } from './workspacePaths';
import { isProjectWebviewMessage } from './webviewMessageValidation';
import {
  createPersonalTemplate,
  isPersonalTemplateMessage,
  isTemplateSource,
  MAX_TEMPLATE_FILE_BYTES,
  nextTemplateId,
  normalizeTemplateFavorites,
  templateTitleError,
  type SavedDiagramTemplate,
} from './personalTemplates';
import {
  loadPersonalTemplateLibrary,
  savePersonalTemplate,
  type PersonalTemplateStorage,
} from './personalTemplatesStore';
import { readResourcePolicy } from './resourceSettings';
import { inlineWorkspaceImages } from './workspaceImages';

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

export class MermaidProjectFeatures implements vscode.Disposable {
  private readonly configurationSubscription: vscode.Disposable;
  private galleryPanel: vscode.WebviewPanel | undefined;
  private galleryTab: GalleryInitialTab = 'templates';
  private galleryTargetUri: vscode.Uri | undefined;
  private gallerySourceUri: vscode.Uri | undefined;
  private readonly galleryFavoriteKeys = new Set<string>();
  private templateWritePending = false;
  private favoriteQueue = Promise.resolve();
  private visualDiffPanel: vscode.WebviewPanel | undefined;
  private visualComparison: VisualComparison | undefined;
  private examplesPromise: Promise<DiagramExample[]> | undefined;

  public constructor(private readonly context: vscode.ExtensionContext) {
    this.configurationSubscription = vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('mermaidPreviewOffline.diagramFontFamily') &&
          !event.affectsConfiguration('mermaidPreviewOffline.diagramTheme') &&
          !event.affectsConfiguration('mermaidPreviewOffline.diagramDensity') &&
          !event.affectsConfiguration('mermaidPreviewOffline.canvas')) return;
      void this.postGalleryData();
      void this.postVisualComparison();
    });
  }

  public dispose(): void {
    this.configurationSubscription.dispose();
    this.galleryPanel?.dispose();
    this.visualDiffPanel?.dispose();
  }

  public async showGallery(
    initialTab: GalleryInitialTab = 'templates',
    targetUri?: vscode.Uri,
  ): Promise<void> {
    this.galleryTab = initialTab;
    this.galleryTargetUri = targetUri;
    const activeUri = targetUri ?? activeMermaidUri();
    if (activeUri) this.gallerySourceUri = isMermaidPath(activeUri.path) ? activeUri : undefined;
    if (this.galleryPanel) {
      this.galleryPanel.title = initialTab === 'templates' ? 'Diagram Studio' : 'Mermaid Examples';
      this.galleryPanel.reveal(vscode.ViewColumn.Active, true);
      await this.postGalleryData(true);
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

  public async saveAsTemplate(resource?: vscode.Uri): Promise<void> {
    const uri = resource ?? activeMermaidUri() ?? this.gallerySourceUri;
    if (!uri || !isMermaidPath(uri.path)) {
      void vscode.window.showWarningMessage('Select a .mmd or .mermaid file to save as a template.');
      return;
    }
    try {
      await this.saveTemplate(await readTextDocument(uri), titleFromFileName(fileNameOf(uri)), fileNameOf(uri), uri);
    } catch (error: unknown) {
      void vscode.window.showErrorMessage(`Could not save template: ${errorMessageOf(error)}`);
    }
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
    if (isPersonalTemplateMessage(message)) {
      if (message.type === 'setTemplateFavorite') {
        if (!this.galleryFavoriteKeys.has(message.key)) return;
        this.favoriteQueue = this.favoriteQueue.then(async () => {
          const favorites = new Set(normalizeTemplateFavorites(this.context.globalState.get('templateFavorites')));
          if (message.favorite) favorites.add(message.key);
          else favorites.delete(message.key);
          await this.context.globalState.update('templateFavorites', [...favorites]);
          await this.galleryPanel?.webview.postMessage({ type: 'templateFavorites', favorites: [...favorites] });
        }).catch((error: unknown) => {
          void vscode.window.showErrorMessage(`Could not save favorite: ${errorMessageOf(error)}`);
        });
        await this.favoriteQueue;
      } else if (message.type === 'saveTemplate') {
        await this.saveTemplate(message.source, message.title, message.fileName, this.gallerySourceUri);
      } else if (message.type === 'saveActiveTemplate') {
        await this.saveAsTemplate(this.gallerySourceUri);
      } else {
        await this.postGalleryData();
      }
      return;
    }
    if (!isProjectWebviewMessage(message)) return;
    if (message.type === 'ready') {
      await this.postGalleryData();
      return;
    }
    await this.createDiagram(message.fileName, message.source);
  }

  private async postGalleryData(resetSelection = false): Promise<void> {
    const panel = this.galleryPanel;
    if (!panel) return;
    const [examples, saved] = await Promise.all([this.examples(), this.loadSavedTemplates()]);
    if (this.galleryPanel !== panel) return;
    this.galleryFavoriteKeys.clear();
    for (const key of [
      ...DIAGRAM_TEMPLATES.map((template) => `template:${template.id}`),
      ...examples.map((example) => `example:${example.id}`),
      ...saved.templates.map((template) => template.key),
    ]) this.galleryFavoriteKeys.add(key);
    await panel.webview.postMessage({
      canSaveActive: Boolean(this.gallerySourceUri),
      examples,
      favorites: normalizeTemplateFavorites(this.context.globalState.get('templateFavorites')),
      savedTemplates: saved.templates,
      resetSelection,
      templateNotice: saved.notice,
      fontFamily: configuredDiagramFontFamily(),
      ...configuredDiagramAppearance(),
      initialTab: this.galleryTab,
      suggestedFileName: this.galleryTargetUri ? fileNameOf(this.galleryTargetUri) : undefined,
      templates: DIAGRAM_TEMPLATES,
      type: 'galleryData',
    });
  }

  private async loadSavedTemplates(): Promise<{ templates: SavedDiagramTemplate[]; notice: string }> {
    const templates: SavedDiagramTemplate[] = [];
    const issues: string[] = [];
    const libraries: Array<{ root: vscode.Uri; origin: 'personal' | 'project'; projectName?: string }> = [
      { root: vscode.Uri.joinPath(this.context.globalStorageUri, 'templates'), origin: 'personal' },
    ];
    if (vscode.workspace.isTrusted) {
      for (const folder of vscode.workspace.workspaceFolders ?? []) {
        libraries.push({ root: vscode.Uri.joinPath(folder.uri, '.mermaid-templates'), origin: 'project', projectName: folder.name });
      }
    } else if (vscode.workspace.workspaceFolders?.length) {
      issues.push('Trust this workspace to load and save project templates. Personal templates remain available.');
    }
    for (const library of libraries) {
      try {
        const loaded = await loadPersonalTemplateLibrary(templateStorage(library.root));
        for (const template of loaded.templates) templates.push({
          ...template,
          origin: library.origin,
          projectName: library.projectName,
          key: library.origin === 'personal' ? `personal:${template.id}` : `project:${library.root.toString()}:${template.id}`,
        });
        if (loaded.issues.length) issues.push(`${library.projectName ?? 'Personal library'}: ${loaded.issues.length} template issue(s). ${loaded.issues[0]}`);
      } catch (error: unknown) {
        issues.push(`${library.projectName ?? 'Personal library'}: ${errorMessageOf(error)}`);
      }
    }
    return { templates, notice: issues.join(' ') };
  }

  private async saveTemplate(source: string, suggestedTitle: string, requestedFileName: string, sourceUri?: vscode.Uri): Promise<void> {
    if (this.templateWritePending) return;
    this.templateWritePending = true;
    try {
      const fileName = sanitizeMermaidFileName(requestedFileName);
      // Validate the source before opening any save prompts.
      if (!isTemplateSource(source)) throw new Error('Template source must contain 1–1,000,000 UTF-8 bytes and no null characters.');
      if (sourceUri) {
        source = await inlineWorkspaceImages(source, sourceUri, {
          ...readResourcePolicy(sourceUri), allowRemoteImages: false,
        });
      }
      createPersonalTemplate('Diagram', source, fileName);
      const title = await vscode.window.showInputBox({
        title: 'Save Mermaid template', prompt: 'Template title',
        value: suggestedTitle.slice(0, 120), validateInput: templateTitleError,
      });
      if (title === undefined) return;
      const destinations = [{
        label: 'Personal library', description: 'Available locally in every workspace',
        root: vscode.Uri.joinPath(this.context.globalStorageUri, 'templates'), project: false,
      }];
      if (vscode.workspace.isTrusted) {
        const folders = [...vscode.workspace.workspaceFolders ?? []];
        const sourceFolder = sourceUri ? vscode.workspace.getWorkspaceFolder(sourceUri) : undefined;
        folders.sort((left, right) => Number(right === sourceFolder) - Number(left === sourceFolder));
        for (const folder of folders) destinations.push({
          label: `Project · ${folder.name}`, description: '.mermaid-templates/ · share through version control',
          root: vscode.Uri.joinPath(folder.uri, '.mermaid-templates'), project: true,
        });
      }
      const destination = await vscode.window.showQuickPick(destinations, { title: 'Save template to…', placeHolder: 'Choose the library for this template' });
      if (!destination) return;
      if (destination.project && !vscode.workspace.isTrusted) throw new Error('Trust the workspace before saving project templates.');
      const storage = templateStorage(destination.root);
      const existing = new Set((await storage.list()).map((name) => name.replace(/\.json$/u, '')));
      const template = createPersonalTemplate(title, source, fileName);
      if (existing.has(template.id)) {
        const copyId = nextTemplateId(template.id, existing);
        const choice = await vscode.window.showWarningMessage(
          `A template named “${template.id}” already exists. Save a separate copy as “${copyId}”?`,
          { modal: true }, 'Save copy',
        );
        if (choice !== 'Save copy') return;
        template.id = copyId;
      }
      await savePersonalTemplate(storage, template);
      await this.postGalleryData();
      void vscode.window.showInformationMessage(`Saved “${template.title}” to ${destination.label}.`);
    } catch (error: unknown) {
      void vscode.window.showErrorMessage(`Could not save template: ${errorMessageOf(error)}`);
    } finally {
      this.templateWritePending = false;
    }
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
    const defaultDirectory = this.galleryTargetUri
      ? vscode.Uri.joinPath(this.galleryTargetUri, '..')
      : workspaceRoot;
    const defaultUri = defaultDirectory ? vscode.Uri.joinPath(defaultDirectory, fileName) : undefined;
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
      fontFamily: configuredDiagramFontFamily(),
      ...configuredDiagramAppearance(),
      type: 'visualDiffData',
    });
  }
}

function configuredDiagramFontFamily(): DiagramFontFamily {
  const fontFamily = vscode.workspace
    .getConfiguration('mermaidPreviewOffline')
    .get<unknown>('diagramFontFamily', 'vscode');
  return normalizeDiagramFontFamily(fontFamily);
}

function configuredDiagramAppearance() {
  const configuration = vscode.workspace.getConfiguration('mermaidPreviewOffline');
  const canvas = vscode.workspace.getConfiguration('mermaidPreviewOffline.canvas');
  const theme = configuration.get<unknown>('diagramTheme', 'adaptive');
  return {
    density: normalizeDiagramDensity(configuration.get('diagramDensity')),
    surface: normalizeDiagramSurface({
      customColor: canvas.get('customColor'),
      pattern: canvas.get('pattern'),
      preset: canvas.get('background'),
    }),
    theme: isDiagramTheme(theme) ? theme : 'adaptive',
  };
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

function templateStorage(root: vscode.Uri): PersonalTemplateStorage {
  const assertDirectory = async (): Promise<boolean> => {
    try {
      const stat = await vscode.workspace.fs.stat(root);
      if ((stat.type & vscode.FileType.SymbolicLink) !== 0 || (stat.type & vscode.FileType.Directory) === 0) {
        throw new Error('The template library must be a directory, not a symbolic link.');
      }
      return true;
    } catch (error: unknown) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') return false;
      throw error;
    }
  };
  return {
    list: async () => {
      if (!await assertDirectory()) return [];
      return (await vscode.workspace.fs.readDirectory(root))
        .filter(([name, type]) => name.endsWith('.json') && (type & vscode.FileType.File) !== 0 && (type & vscode.FileType.SymbolicLink) === 0)
        .map(([name]) => name);
    },
    read: async (fileName) => {
      const uri = vscode.Uri.joinPath(root, fileName);
      const stat = await vscode.workspace.fs.stat(uri);
      if ((stat.type & vscode.FileType.SymbolicLink) !== 0 || (stat.type & vscode.FileType.File) === 0) throw new Error('Only regular template files can be loaded.');
      if (stat.size > MAX_TEMPLATE_FILE_BYTES) throw new Error('Template file exceeds 1.1 MB.');
      return vscode.workspace.fs.readFile(uri);
    },
    createExclusive: async (fileName, bytes) => {
      await assertDirectory();
      await vscode.workspace.fs.createDirectory(root);
      const target = vscode.Uri.joinPath(root, fileName);
      const temporary = vscode.Uri.joinPath(root, `.template-${randomUUID()}.tmp`);
      try {
        await vscode.workspace.fs.writeFile(temporary, bytes);
        await vscode.workspace.fs.rename(temporary, target, { overwrite: false });
      } finally {
        try {
          await vscode.workspace.fs.delete(temporary);
        } catch {
          // Renaming normally consumed the temporary file; leave the saved file intact.
        }
      }
    },
  };
}
