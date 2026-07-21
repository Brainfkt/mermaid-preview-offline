import * as vscode from 'vscode';

import {
  DIAGRAM_DECLARATIONS,
  formatMermaid,
  generateMissingIdentifiers,
  identifierAt,
  identifierOffsets,
  MERMAID_KEYWORDS,
  mermaidDeclarationLocation,
  nearestDiagramDeclaration,
  unclosedBlockCount,
} from './mermaidLanguage';
import { mermaidValidationDelay } from './validationPolicy';

const FORMAT_COMMAND = 'mermaidPreviewOffline.formatDocument';
const INSERT_COMMAND = 'mermaidPreviewOffline.insertElement';
const GENERATE_IDS_COMMAND = 'mermaidPreviewOffline.generateMissingIds';
const RENAME_COMMAND = 'mermaidPreviewOffline.renameIdentifier';
const MERMAID_SELECTOR: vscode.DocumentSelector = [{ language: 'mermaid' }];
const DIAGNOSTIC_SOURCE = 'Mermaid';

export function registerMermaidLanguageFeatures(
  context: vscode.ExtensionContext,
): MermaidDiagnosticStore {
  const diagnostics = new MermaidDiagnosticStore();
  const validator = new MermaidValidator(diagnostics);

  context.subscriptions.push(
    diagnostics,
    validator,
    vscode.languages.registerCompletionItemProvider(
      MERMAID_SELECTOR,
      new MermaidCompletionProvider(),
    ),
    vscode.languages.registerHoverProvider(MERMAID_SELECTOR, new MermaidHoverProvider()),
    vscode.languages.registerDocumentFormattingEditProvider(
      MERMAID_SELECTOR,
      new MermaidFormattingProvider(),
    ),
    vscode.languages.registerRenameProvider(MERMAID_SELECTOR, new MermaidRenameProvider()),
    vscode.languages.registerCodeActionsProvider(
      MERMAID_SELECTOR,
      new MermaidCodeActionProvider(),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
    vscode.commands.registerCommand(FORMAT_COMMAND, async () => {
      await vscode.commands.executeCommand('editor.action.formatDocument');
    }),
    vscode.commands.registerCommand(INSERT_COMMAND, insertElement),
    vscode.commands.registerCommand(GENERATE_IDS_COMMAND, generateIds),
    vscode.commands.registerCommand(RENAME_COMMAND, async () => {
      await vscode.commands.executeCommand('editor.action.rename');
    }),
  );

  return diagnostics;
}

export class MermaidDiagnosticStore implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('mermaid');
  private readonly hostDiagnostics = new Map<string, vscode.Diagnostic>();
  private readonly renderDiagnostics = new Map<string, vscode.Diagnostic>();
  private readonly uris = new Map<string, vscode.Uri>();

  public dispose(): void {
    this.collection.dispose();
  }

  public setHost(uri: vscode.Uri, diagnostic: vscode.Diagnostic): void {
    this.set(this.hostDiagnostics, uri, diagnostic);
  }

  public clearHost(uri: vscode.Uri): void {
    this.clear(this.hostDiagnostics, uri);
  }

  public setRender(uri: vscode.Uri, diagnostic: vscode.Diagnostic): void {
    this.set(this.renderDiagnostics, uri, diagnostic);
  }

  public clearRender(uri: vscode.Uri): void {
    this.clear(this.renderDiagnostics, uri);
  }

  public deleteDocument(uri: vscode.Uri): void {
    const key = uri.toString();
    this.hostDiagnostics.delete(key);
    this.renderDiagnostics.delete(key);
    this.uris.delete(key);
    this.collection.delete(uri);
  }

  private set(
    diagnostics: Map<string, vscode.Diagnostic>,
    uri: vscode.Uri,
    diagnostic: vscode.Diagnostic,
  ): void {
    const key = uri.toString();
    diagnostics.set(key, diagnostic);
    this.uris.set(key, uri);
    this.update(key);
  }

  private clear(diagnostics: Map<string, vscode.Diagnostic>, uri: vscode.Uri): void {
    const key = uri.toString();
    diagnostics.delete(key);
    this.update(key);
  }

  private update(key: string): void {
    const uri = this.uris.get(key);
    if (!uri) return;
    const diagnostic = this.renderDiagnostics.get(key) ?? this.hostDiagnostics.get(key);
    if (diagnostic) {
      this.collection.set(uri, [diagnostic]);
    } else {
      this.collection.delete(uri);
      this.uris.delete(key);
    }
  }
}

class MermaidValidator implements vscode.Disposable {
  private readonly generation = new Map<string, number>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly subscriptions: vscode.Disposable[];

  public constructor(private readonly diagnostics: MermaidDiagnosticStore) {
    this.subscriptions = [
      vscode.workspace.onDidOpenTextDocument((document) => this.queue(document, 0)),
      vscode.workspace.onDidChangeTextDocument(({ document }) => this.queue(document, 180)),
      vscode.workspace.onDidCloseTextDocument((document) => this.clear(document)),
    ];
    for (const document of vscode.workspace.textDocuments) {
      this.queue(document, 0);
    }
  }

  public dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    for (const subscription of this.subscriptions) subscription.dispose();
  }

  private queue(document: vscode.TextDocument, delay: number): void {
    if (!isMermaidDocument(document)) return;
    const key = document.uri.toString();
    const nextGeneration = (this.generation.get(key) ?? 0) + 1;
    this.generation.set(key, nextGeneration);
    const previousTimer = this.timers.get(key);
    if (previousTimer) clearTimeout(previousTimer);
    const lastLine = document.lineAt(Math.max(0, document.lineCount - 1));
    const characterCount = document.offsetAt(lastLine.range.end);
    const validationDelay = mermaidValidationDelay(characterCount, delay);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.validate(document, nextGeneration);
      }, validationDelay),
    );
  }

  private clear(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
    this.generation.delete(key);
    this.diagnostics.deleteDocument(document.uri);
  }

  private validate(document: vscode.TextDocument, generation: number): void {
    const key = document.uri.toString();
    const version = document.version;
    const source = document.getText();
    if (!/\S/u.test(source)) {
      this.diagnostics.clearHost(document.uri);
      return;
    }

    if (!this.isCurrent(document, key, generation, version)) return;
    const issue = staticMermaidIssue(document, source);
    if (!issue) {
      this.diagnostics.clearHost(document.uri);
      return;
    }
    const diagnostic = new vscode.Diagnostic(
      issue.range,
      issue.message,
      vscode.DiagnosticSeverity.Error,
    );
    diagnostic.source = DIAGNOSTIC_SOURCE;
    diagnostic.code = issue.code;
    this.diagnostics.setHost(document.uri, diagnostic);
  }

  private isCurrent(
    document: vscode.TextDocument,
    key: string,
    generation: number,
    version: number,
  ): boolean {
    return (
      !document.isClosed &&
      document.version === version &&
      this.generation.get(key) === generation
    );
  }
}

class MermaidCompletionProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(): vscode.CompletionItem[] {
    return MERMAID_KEYWORDS.map((keyword, index) => {
      const item = new vscode.CompletionItem(keyword.label, vscode.CompletionItemKind.Keyword);
      item.detail = keyword.detail;
      item.documentation = new vscode.MarkdownString(keyword.documentation);
      item.insertText = keyword.label;
      item.sortText = `1-${String(index).padStart(3, '0')}`;
      return item;
    });
  }
}

class MermaidHoverProvider implements vscode.HoverProvider {
  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    const range = document.getWordRangeAtPosition(position, /[A-Za-z][\w-]*/u);
    if (!range) return undefined;
    const value = document.getText(range);
    const keyword = MERMAID_KEYWORDS.find(
      ({ label }) => label.toLowerCase() === value.toLowerCase(),
    );
    if (!keyword) return undefined;
    const contents = new vscode.MarkdownString();
    contents.appendCodeblock(keyword.label, 'mermaid');
    contents.appendMarkdown(`**${keyword.detail}**\n\n${keyword.documentation}`);
    return new vscode.Hover(contents, range);
  }
}

class MermaidFormattingProvider implements vscode.DocumentFormattingEditProvider {
  public provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
  ): vscode.TextEdit[] {
    const indentation = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
    const formatted = formatMermaid(document.getText(), indentation);
    if (formatted === document.getText()) return [];
    return [vscode.TextEdit.replace(fullDocumentRange(document), formatted)];
  }
}

class MermaidRenameProvider implements vscode.RenameProvider {
  public prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Range | { placeholder: string; range: vscode.Range } {
    const identifier = identifierAt(document.getText(), document.offsetAt(position));
    if (!identifier) {
      throw new Error('Place the cursor on a Mermaid identifier to rename it.');
    }
    return {
      placeholder: identifier.name,
      range: new vscode.Range(
        document.positionAt(identifier.start),
        document.positionAt(identifier.end),
      ),
    };
  }

  public provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
  ): vscode.WorkspaceEdit {
    if (!/^[A-Za-z_][\w-]*$/u.test(newName)) {
      throw new Error('Mermaid identifiers must start with a letter or underscore.');
    }
    const source = document.getText();
    const identifier = identifierAt(source, document.offsetAt(position));
    if (!identifier) throw new Error('No Mermaid identifier was found at the cursor.');
    const edit = new vscode.WorkspaceEdit();
    for (const offset of identifierOffsets(source, identifier.name)) {
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(offset), document.positionAt(offset + identifier.name.length)),
        newName,
      );
    }
    return edit;
  }
}

class MermaidCodeActionProvider implements vscode.CodeActionProvider {
  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const source = document.getText();
    const actions: vscode.CodeAction[] = [];
    const diagnostic = context.diagnostics.find(({ source: value }) => value === DIAGNOSTIC_SOURCE);
    if (!diagnostic) return actions;

    const firstCodeLine = source.split(/\r?\n/u).findIndex((line) => /\S/u.test(line) && !/^\s*%%/u.test(line));
    if (firstCodeLine >= 0) {
      const line = document.lineAt(firstCodeLine);
      const word = /^\s*([A-Za-z][\w-]*)/u.exec(line.text)?.[1];
      if (word && !DIAGRAM_DECLARATIONS.has(word.toLowerCase())) {
        const replacement = nearestDiagramDeclaration(word);
        if (replacement && replacement !== word) {
          const action = quickFix(`Replace “${word}” with “${replacement}”`, diagnostic);
          action.edit = new vscode.WorkspaceEdit();
          const start = line.text.indexOf(word);
          action.edit.replace(
            document.uri,
            new vscode.Range(firstCodeLine, start, firstCodeLine, start + word.length),
            replacement,
          );
          actions.push(action);
        } else {
          const action = quickFix('Add a flowchart declaration', diagnostic);
          action.edit = new vscode.WorkspaceEdit();
          action.edit.insert(document.uri, new vscode.Position(firstCodeLine, 0), 'flowchart LR\n');
          actions.push(action);
        }
      }
    }

    if (source.includes('→')) {
      const action = quickFix('Replace Unicode arrows with Mermaid links', diagnostic);
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(document.uri, fullDocumentRange(document), source.replaceAll('→', '-->'));
      actions.push(action);
    }

    const missingEnds = unclosedBlockCount(source);
    if (missingEnds > 0) {
      const action = quickFix(`Insert ${missingEnds} missing “end”${missingEnds === 1 ? '' : ' blocks'}`, diagnostic);
      action.edit = new vscode.WorkspaceEdit();
      const prefix = source.endsWith('\n') ? '' : '\n';
      action.edit.insert(
        document.uri,
        document.positionAt(source.length),
        `${prefix}${'end\n'.repeat(missingEnds)}`,
      );
      actions.push(action);
    }

    if (generateMissingIdentifiers(source).count > 0) {
      const action = quickFix('Generate missing node identifiers', diagnostic);
      action.command = { command: GENERATE_IDS_COMMAND, title: action.title };
      actions.push(action);
    }

    return actions.filter((action) => action.edit || action.command || range.contains(action.diagnostics?.[0]?.range ?? range));
  }
}

async function insertElement(): Promise<void> {
  const editor = activeMermaidEditor();
  if (!editor) return;
  const kind = await vscode.window.showQuickPick(
    [
      { description: 'Insert an identified flowchart node', label: 'Node' },
      { description: 'Connect two existing identifiers', label: 'Link' },
    ],
    { placeHolder: 'Choose what to insert', title: 'Mermaid: Insert Node or Link' },
  );
  if (!kind) return;

  if (kind.label === 'Node') {
    const id = await vscode.window.showInputBox({
      prompt: 'Node identifier',
      validateInput: validateIdentifier,
      value: nextNodeIdentifier(editor.document.getText()),
    });
    if (!id) return;
    const label = await vscode.window.showInputBox({ prompt: 'Node label', value: id });
    if (label === undefined) return;
    await insertAtCursorOrEnd(editor, `${id}["${label.replaceAll('"', '#quot;')}"]`);
    return;
  }

  const from = await vscode.window.showInputBox({ prompt: 'Source identifier', validateInput: validateIdentifier });
  if (!from) return;
  const to = await vscode.window.showInputBox({ prompt: 'Target identifier', validateInput: validateIdentifier });
  if (!to) return;
  const label = await vscode.window.showInputBox({ prompt: 'Optional link label' });
  if (label === undefined) return;
  await insertAtCursorOrEnd(editor, label.trim() ? `${from} -->|${label.trim()}| ${to}` : `${from} --> ${to}`);
}

async function generateIds(): Promise<void> {
  const editor = activeMermaidEditor();
  if (!editor) return;
  const generated = generateMissingIdentifiers(editor.document.getText());
  if (generated.count === 0) {
    void vscode.window.showInformationMessage('No missing Mermaid node identifiers were found.');
    return;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(editor.document.uri, fullDocumentRange(editor.document), generated.text);
  await vscode.workspace.applyEdit(edit);
  void vscode.window.showInformationMessage(
    `Generated ${generated.count} Mermaid identifier${generated.count === 1 ? '' : 's'}.`,
  );
}

async function insertAtCursorOrEnd(editor: vscode.TextEditor, value: string): Promise<void> {
  const document = editor.document;
  const activeLine = editor.selection.active.line;
  const position = document.lineAt(activeLine).range.end;
  const prefix = document.lineAt(activeLine).text.trim() ? '\n' : '';
  await editor.edit((builder) => builder.insert(position, `${prefix}${value}`));
}

function activeMermaidEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isMermaidDocument(editor.document)) {
    void vscode.window.showWarningMessage('Open a .mmd or .mermaid file in the text editor first.');
    return undefined;
  }
  return editor;
}

function isMermaidDocument(document: vscode.TextDocument): boolean {
  return document.languageId === 'mermaid' || /\.(?:mmd|mermaid)$/iu.test(document.uri.path);
}

function fullDocumentRange(document: vscode.TextDocument): vscode.Range {
  return new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
}

function quickFix(title: string, diagnostic: vscode.Diagnostic): vscode.CodeAction {
  const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.isPreferred = false;
  return action;
}

function validateIdentifier(value: string): string | undefined {
  return /^[A-Za-z_][\w-]*$/u.test(value)
    ? undefined
    : 'Use letters, digits, underscores, or hyphens; start with a letter or underscore.';
}

function nextNodeIdentifier(source: string): string {
  let index = 1;
  while (new RegExp(`(?<![\\w-])node${index}(?![\\w-])`, 'u').test(source)) index += 1;
  return `node${index}`;
}

function staticMermaidIssue(
  document: vscode.TextDocument,
  source: string,
): { code: string; message: string; range: vscode.Range } | undefined {
  const declaration = mermaidDeclarationLocation(source);
  if (declaration && !DIAGRAM_DECLARATIONS.has(declaration.word.toLowerCase())) {
    return {
      code: 'declaration',
      message: `Unknown Mermaid diagram declaration “${declaration.word}”.`,
      range: new vscode.Range(
        document.positionAt(declaration.offset),
        document.positionAt(declaration.offset + declaration.word.length),
      ),
    };
  }

  const unicodeArrow = source.indexOf('→');
  if (unicodeArrow >= 0) {
    return {
      code: 'unicode-arrow',
      message: 'Use a Mermaid link such as --> instead of a Unicode arrow.',
      range: new vscode.Range(
        document.positionAt(unicodeArrow),
        document.positionAt(unicodeArrow + 1),
      ),
    };
  }

  const missingEnds = unclosedBlockCount(source, declaration?.word);
  if (missingEnds > 0) {
    const lastLine = document.lineAt(document.lineCount - 1);
    return {
      code: 'missing-end',
      message: `${missingEnds} Mermaid block${missingEnds === 1 ? '' : 's'} missing an “end”.`,
      range: lastLine.range,
    };
  }
  return undefined;
}
