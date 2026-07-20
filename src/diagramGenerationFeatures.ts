import * as vscode from 'vscode';

import { MERMAID_PREVIEW_VIEW_TYPE } from './mermaidPreviewProvider';
import { generatePackageDependencyGraph } from './packageDependencyGenerator';
import { generateSqlErd } from './sqlErdGenerator';

export const GENERATE_ERD_FROM_SQL_COMMAND = 'mermaidPreviewOffline.generateErdFromSql';
export const GENERATE_PACKAGE_DEPENDENCIES_COMMAND =
  'mermaidPreviewOffline.generateDependencyGraphFromPackageJson';

const MAX_GENERATOR_INPUT_BYTES = 4 * 1024 * 1024;

export class MermaidDiagramGenerationFeatures {
  public async generateErdFromSql(): Promise<void> {
    const source = await selectSourceFile({
      filters: { SQL: ['sql'] },
      openLabel: 'Select SQL Schema',
      title: 'Generate Mermaid ERD from a local SQL schema',
    });
    if (!source) return;
    try {
      const sql = await readTextInput(source);
      await saveGeneratedDiagram(source, `${fileStem(source)}-erd.mmd`, generateSqlErd(sql), {
        success: 'Generated Mermaid ERD',
        title: 'Save generated Mermaid ERD',
      });
    } catch (error: unknown) {
      void vscode.window.showErrorMessage(
        `Could not generate an ERD from ${fileNameOf(source)}: ${errorMessageOf(error)}`,
      );
    }
  }

  public async generateDependencyGraphFromPackageJson(): Promise<void> {
    const source = await selectSourceFile({
      filters: { JSON: ['json'] },
      openLabel: 'Select package.json',
      title: 'Generate Mermaid dependency graph from a local package.json',
    });
    if (!source) return;
    try {
      const manifest = await readTextInput(source);
      await saveGeneratedDiagram(source, 'dependency-graph.mmd', generatePackageDependencyGraph(manifest), {
        success: 'Generated Mermaid dependency graph',
        title: 'Save generated Mermaid dependency graph',
      });
    } catch (error: unknown) {
      void vscode.window.showErrorMessage(
        `Could not generate a dependency graph from ${fileNameOf(source)}: ${errorMessageOf(error)}`,
      );
    }
  }
}

interface SourceFilePickerOptions {
  filters: Record<string, string[]>;
  openLabel: string;
  title: string;
}

async function selectSourceFile(options: SourceFilePickerOptions): Promise<vscode.Uri | undefined> {
  const selection = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
    filters: options.filters,
    openLabel: options.openLabel,
    title: options.title,
  });
  return selection?.[0];
}

async function readTextInput(uri: vscode.Uri): Promise<string> {
  const stat = await vscode.workspace.fs.stat(uri);
  if (stat.size > MAX_GENERATOR_INPUT_BYTES) {
    throw new Error('the selected input is larger than the 4 MB generation limit');
  }
  const bytes = await vscode.workspace.fs.readFile(uri);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('the selected input is not valid UTF-8');
  }
}

async function saveGeneratedDiagram(
  source: vscode.Uri,
  requestedFileName: string,
  mermaidSource: string,
  messages: { success: string; title: string },
): Promise<void> {
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(source, '..', sanitizeFileName(requestedFileName)),
    filters: { Mermaid: ['mmd', 'mermaid'] },
    saveLabel: 'Create Diagram',
    title: messages.title,
  });
  if (!target) return;
  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(mermaidSource));
  await vscode.commands.executeCommand('vscode.openWith', target, MERMAID_PREVIEW_VIEW_TYPE);
  void vscode.window.showInformationMessage(`${messages.success}: ${fileNameOf(target)}.`);
}

function sanitizeFileName(value: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\\/:*?"<>|]/gu, '-')
    .replace(/^\.+/u, '')
    .replace(/\s+/gu, '-')
    .slice(0, 180);
  return /\.(?:mmd|mermaid)$/iu.test(cleaned) ? cleaned : `${cleaned || 'diagram'}.mmd`;
}

function fileStem(uri: vscode.Uri): string {
  return fileNameOf(uri).replace(/\.[^.]+$/u, '') || 'schema';
}

function fileNameOf(uri: vscode.Uri): string {
  return decodeURIComponent(uri.path.split('/').pop() ?? uri.path);
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
