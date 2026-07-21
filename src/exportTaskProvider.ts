import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';

import * as vscode from 'vscode';

import {
  isDiagramFontFamily,
  normalizeDiagramFontFamily,
  type DiagramFontFamily,
} from './diagramFont';
import { isExportFormat, type ExportFormat } from './exportSettings';
import { isDiagramTheme } from './previewState';
import { isDiagramDensity } from './appearance';
import type { DiagramDensity, DiagramTheme } from './protocol';

export const MERMAID_EXPORT_TASK_TYPE = 'mermaid-export';

interface MermaidExportTaskDefinition extends vscode.TaskDefinition {
  background?: string;
  browser?: string;
  dpi?: number;
  density?: DiagramDensity;
  font?: DiagramFontFamily;
  format?: ExportFormat;
  includeMetadata?: boolean;
  margin?: number;
  nameTemplate?: string;
  optimizeSvg?: boolean;
  output?: string;
  scale?: number;
  source: string;
  theme?: DiagramTheme;
  type: typeof MERMAID_EXPORT_TASK_TYPE;
}

export class MermaidExportTaskProvider implements vscode.TaskProvider {
  public constructor(private readonly context: vscode.ExtensionContext) {}

  public provideTasks(): vscode.Task[] {
    return [];
  }

  public resolveTask(task: vscode.Task): vscode.Task | undefined {
    const definition = task.definition as Partial<MermaidExportTaskDefinition>;
    if (definition.type !== MERMAID_EXPORT_TASK_TYPE || typeof definition.source !== 'string') {
      return undefined;
    }
    const normalized: MermaidExportTaskDefinition = {
      type: MERMAID_EXPORT_TASK_TYPE,
      source: definition.source,
      ...(typeof definition.output === 'string' ? { output: definition.output } : {}),
      ...(isExportFormat(definition.format) ? { format: definition.format } : {}),
      ...(isDiagramFontFamily(definition.font) ? { font: definition.font } : {}),
      ...(isDiagramTheme(definition.theme) ? { theme: definition.theme } : {}),
      ...(typeof definition.scale === 'number' ? { scale: definition.scale } : {}),
      ...(typeof definition.dpi === 'number' ? { dpi: definition.dpi } : {}),
      ...(isDiagramDensity(definition.density) ? { density: definition.density } : {}),
      ...(typeof definition.margin === 'number' ? { margin: definition.margin } : {}),
      ...(typeof definition.background === 'string' ? { background: definition.background } : {}),
      ...(typeof definition.nameTemplate === 'string'
        ? { nameTemplate: definition.nameTemplate }
        : {}),
      ...(typeof definition.optimizeSvg === 'boolean'
        ? { optimizeSvg: definition.optimizeSvg }
        : {}),
      ...(typeof definition.includeMetadata === 'boolean'
        ? { includeMetadata: definition.includeMetadata }
        : {}),
      ...(typeof definition.browser === 'string' ? { browser: definition.browser } : {}),
    };
    const execution = new vscode.CustomExecution(
      () => Promise.resolve(new MermaidExportTaskTerminal(this.context, normalized)),
    );
    return new vscode.Task(
      normalized,
      task.scope ?? vscode.TaskScope.Workspace,
      task.name || 'Export Mermaid diagrams',
      'Mermaid Preview Offline',
      execution,
      [],
    );
  }
}

class MermaidExportTaskTerminal implements vscode.Pseudoterminal {
  private readonly closeEmitter = new vscode.EventEmitter<number>();
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private child: ChildProcess | undefined;

  public readonly onDidClose = this.closeEmitter.event;
  public readonly onDidWrite = this.writeEmitter.event;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly definition: MermaidExportTaskDefinition,
  ) {}

  public open(): void {
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    const workspaceFolder = activeUri
      ? vscode.workspace.getWorkspaceFolder(activeUri)
      : vscode.workspace.workspaceFolders?.[0];
    const workspacePath = workspaceFolder?.uri.fsPath ?? process.cwd();
    const font = this.definition.font ?? normalizeDiagramFontFamily(
      vscode.workspace
        .getConfiguration('mermaidPreviewOffline', activeUri ?? workspaceFolder?.uri)
        .get<unknown>('diagramFontFamily'),
    );
    const args = [
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'cli.js').fsPath,
      substituteVariables(this.definition.source, workspacePath, activeUri),
      ...taskArguments({ ...this.definition, font }, workspacePath, activeUri),
    ];
    this.writeEmitter.fire(`Mermaid export: ${args.slice(1).join(' ')}\r\n`);
    this.child = spawn(process.execPath, args, {
      cwd: workspacePath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child.stdout?.on('data', (chunk: Buffer) => {
      this.writeEmitter.fire(chunk.toString('utf8').replaceAll('\n', '\r\n'));
    });
    this.child.stderr?.on('data', (chunk: Buffer) => {
      this.writeEmitter.fire(chunk.toString('utf8').replaceAll('\n', '\r\n'));
    });
    this.child.once('error', (error) => {
      this.writeEmitter.fire(`${error.message}\r\n`);
      this.closeEmitter.fire(1);
    });
    this.child.once('exit', (code) => this.closeEmitter.fire(code ?? 1));
  }

  public close(): void {
    this.child?.kill('SIGTERM');
  }
}

function taskArguments(
  definition: MermaidExportTaskDefinition,
  workspacePath: string,
  activeUri: vscode.Uri | undefined,
): string[] {
  const args: string[] = [];
  const add = (flag: string, value: string | number | undefined): void => {
    if (value !== undefined) args.push(flag, String(value));
  };
  add('--output', definition.output
    ? substituteVariables(definition.output, workspacePath, activeUri)
    : undefined);
  add('--format', definition.format);
  add('--theme', definition.theme);
  add('--font', definition.font);
  add('--scale', definition.scale);
  add('--dpi', definition.dpi);
  add('--density', definition.density);
  add('--margin', definition.margin);
  add('--background', definition.background);
  add('--name-template', definition.nameTemplate);
  add('--browser', definition.browser
    ? substituteVariables(definition.browser, workspacePath, activeUri)
    : undefined);
  if (definition.optimizeSvg === false) args.push('--no-optimize');
  if (definition.includeMetadata === true) args.push('--metadata');
  if (definition.includeMetadata === false) args.push('--no-metadata');
  return args;
}

function substituteVariables(
  value: string,
  workspacePath: string,
  activeUri: vscode.Uri | undefined,
): string {
  return value
    .replaceAll('${workspaceFolder}', workspacePath)
    .replaceAll('${file}', activeUri?.fsPath ?? '')
    .replaceAll('${fileDirname}', activeUri ? vscode.Uri.joinPath(activeUri, '..').fsPath : '');
}
