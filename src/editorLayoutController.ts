import * as vscode from 'vscode';

import { editorLayoutFor, editorLayoutMatches, readSourceRatio } from './editorLayout';
import type { MermaidEditorMode } from './protocol';

const MODE_STATE_KEY = 'mermaidPreviewOffline.editorMode';
const RATIO_STATE_KEY_PREFIX = 'mermaidPreviewOffline.splitRatio.';

type SplitMode = Extract<MermaidEditorMode, 'above' | 'beside'>;

interface ActiveSplit {
  mode: SplitMode;
  uri: vscode.Uri;
}

const MODE_ITEMS: ReadonlyArray<{
  description: string;
  label: string;
  mode: MermaidEditorMode;
}> = [
  {
    description: 'Show the rendered diagram only',
    label: '$(preview) Preview only',
    mode: 'preview',
  },
  {
    description: 'Open the native Mermaid text editor only',
    label: '$(code) Source only',
    mode: 'source',
  },
  {
    description: 'Place the native source editor beside the preview',
    label: '$(split-horizontal) Beside',
    mode: 'beside',
  },
  {
    description: 'Place the native source editor above the preview',
    label: '$(split-vertical) Above',
    mode: 'above',
  },
];

export class MermaidEditorLayoutController implements vscode.Disposable {
  private readonly modeEmitter = new vscode.EventEmitter<MermaidEditorMode>();
  private readonly panels = new Map<string, Set<vscode.WebviewPanel>>();
  private arrangement = Promise.resolve();
  private currentSplit: ActiveSplit | undefined;
  private layoutTransitioning = false;
  private pendingMode: MermaidEditorMode | undefined;

  public readonly onDidChangeMode = this.modeEmitter.event;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly viewType: string,
  ) {}

  public dispose(): void {
    this.modeEmitter.dispose();
    this.panels.clear();
  }

  public getMode(): MermaidEditorMode {
    if (this.pendingMode) {
      return this.pendingMode;
    }
    const stored = this.context.workspaceState.get<unknown>(MODE_STATE_KEY);
    return isEditorMode(stored) ? stored : 'preview';
  }

  public registerPanel(uri: vscode.Uri, panel: vscode.WebviewPanel): vscode.Disposable {
    const key = uri.toString();
    const entries = this.panels.get(key) ?? new Set<vscode.WebviewPanel>();
    entries.add(panel);
    this.panels.set(key, entries);
    return new vscode.Disposable(() => {
      const current = this.panels.get(key);
      current?.delete(panel);
      if (current?.size === 0) {
        this.panels.delete(key);
      }
    });
  }

  public async chooseMode(uri: vscode.Uri, preferredPanel?: vscode.WebviewPanel): Promise<void> {
    await this.saveCurrentRatio(uri);
    const currentMode = this.getMode();
    const selection = await vscode.window.showQuickPick(
      MODE_ITEMS.map((item) => ({ ...item, picked: item.mode === currentMode })),
      {
        placeHolder: 'Choose how Mermaid source and preview are displayed',
        title: 'Mermaid Preview: Editor Layout',
      },
    );
    if (selection) {
      await this.applyMode(uri, selection.mode, preferredPanel);
    }
  }

  public async applyMode(
    uri: vscode.Uri,
    mode: MermaidEditorMode,
    preferredPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    await this.enqueue(async () => {
      this.pendingMode = mode;
      try {
        await this.arrange(uri, mode, preferredPanel);
        await this.context.workspaceState.update(MODE_STATE_KEY, mode);
        this.modeEmitter.fire(mode);
      } finally {
        this.pendingMode = undefined;
      }
    });
  }

  public async restoreModeForPanel(
    uri: vscode.Uri,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    await this.enqueue(async () => {
      const mode = this.getMode();
      if (await this.isAlreadyArranged(uri, mode, panel)) {
        return;
      }
      await this.arrange(uri, mode, panel);
    });
  }

  public async saveCurrentRatio(uri: vscode.Uri, allowHidden = false): Promise<void> {
    if (this.layoutTransitioning) {
      return;
    }
    const split = this.currentSplit;
    if (!split || split.uri.toString() !== uri.toString()) {
      return;
    }
    if (
      !allowHidden &&
      ![...(this.panels.get(uri.toString()) ?? [])].some((panel) => panel.visible)
    ) {
      return;
    }
    await this.saveSplitRatio(split);
  }

  private async saveSplitRatio(split: ActiveSplit): Promise<void> {
    const layout = await vscode.commands.executeCommand<unknown>('vscode.getEditorLayout');
    const ratio = readSourceRatio(layout, split.mode);
    if (ratio !== undefined) {
      await this.context.workspaceState.update(this.ratioKey(split.uri), ratio);
    }
  }

  private async arrange(
    uri: vscode.Uri,
    mode: MermaidEditorMode,
    preferredPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    const splitMode = isSplitMode(mode) ? mode : undefined;
    const ownsCurrentSplit =
      splitMode !== undefined &&
      this.currentSplit?.mode === splitMode &&
      this.currentSplit.uri.toString() === uri.toString();
    if (this.currentSplit && !ownsCurrentSplit) {
      await this.saveSplitRatio(this.currentSplit);
    }

    this.layoutTransitioning = true;
    try {
      const ratio = this.context.workspaceState.get<number>(this.ratioKey(uri), 0.5);
      const currentLayout = await vscode.commands.executeCommand<unknown>('vscode.getEditorLayout');
      if (!editorLayoutMatches(currentLayout, mode) || (splitMode && !ownsCurrentSplit)) {
        await vscode.commands.executeCommand('vscode.setEditorLayout', editorLayoutFor(mode, ratio));
      }

      if (mode === 'source') {
        await this.openSourceOnly(uri);
        this.currentSplit = undefined;
        return;
      }
      if (mode === 'preview') {
        await this.openPreviewOnly(uri, preferredPanel);
        this.currentSplit = undefined;
        return;
      }

      await this.openSplit(uri, preferredPanel);
      this.currentSplit = { mode, uri };
    } finally {
      this.layoutTransitioning = false;
    }
  }

  private async isAlreadyArranged(
    uri: vscode.Uri,
    mode: MermaidEditorMode,
    panel: vscode.WebviewPanel,
  ): Promise<boolean> {
    if (mode === 'source') {
      return false;
    }
    const expectedColumn = isSplitMode(mode) ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
    if (panel.viewColumn !== expectedColumn) {
      return false;
    }
    const currentLayout = await vscode.commands.executeCommand<unknown>('vscode.getEditorLayout');
    if (!editorLayoutMatches(currentLayout, mode)) {
      return false;
    }
    if (isSplitMode(mode)) {
      if (
        this.currentSplit?.mode !== mode ||
        this.currentSplit.uri.toString() !== uri.toString()
      ) {
        return false;
      }
    }
    return true;
  }

  private async openSourceOnly(uri: vscode.Uri): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preserveFocus: false,
      preview: false,
      viewColumn: vscode.ViewColumn.One,
    });
    for (const panel of [...(this.panels.get(uri.toString()) ?? [])]) {
      panel.dispose();
    }
  }

  private async openPreviewOnly(
    uri: vscode.Uri,
    preferredPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    const panel = this.registeredPanel(uri, preferredPanel);
    if (panel) {
      panel.reveal(vscode.ViewColumn.One, false);
      this.disposeOtherPanels(uri, panel);
      await this.closeSourceTabs(uri);
      return;
    }
    await vscode.commands.executeCommand(
      'vscode.openWith',
      uri,
      this.viewType,
      vscode.ViewColumn.One,
    );
    await this.closeSourceTabs(uri);
  }

  private async openSplit(
    uri: vscode.Uri,
    preferredPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preserveFocus: true,
      preview: false,
      viewColumn: vscode.ViewColumn.One,
    });

    const panel = this.registeredPanel(uri, preferredPanel);
    if (panel) {
      panel.reveal(vscode.ViewColumn.Two, false);
      this.disposeOtherPanels(uri, panel);
      return;
    }
    await vscode.commands.executeCommand(
      'vscode.openWith',
      uri,
      this.viewType,
      vscode.ViewColumn.Two,
    );
  }

  private firstPanel(uri: vscode.Uri): vscode.WebviewPanel | undefined {
    return this.panels.get(uri.toString())?.values().next().value;
  }

  private registeredPanel(
    uri: vscode.Uri,
    preferredPanel?: vscode.WebviewPanel,
  ): vscode.WebviewPanel | undefined {
    const entries = this.panels.get(uri.toString());
    return preferredPanel && entries?.has(preferredPanel)
      ? preferredPanel
      : this.firstPanel(uri);
  }

  private disposeOtherPanels(uri: vscode.Uri, retained: vscode.WebviewPanel): void {
    for (const panel of [...(this.panels.get(uri.toString()) ?? [])]) {
      if (panel !== retained) {
        panel.dispose();
      }
    }
  }

  private async closeSourceTabs(uri: vscode.Uri): Promise<void> {
    const sourceTabs = vscode.window.tabGroups.all.flatMap((group) =>
      group.tabs.filter(
        (tab) =>
          tab.input instanceof vscode.TabInputText &&
          tab.input.uri.toString() === uri.toString(),
      ),
    );
    if (sourceTabs.length > 0) {
      await vscode.window.tabGroups.close(sourceTabs, true);
    }
  }

  private ratioKey(uri: vscode.Uri): string {
    return `${RATIO_STATE_KEY_PREFIX}${uri.toString()}`;
  }

  private async enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.arrangement.catch(() => undefined).then(operation);
    this.arrangement = next;
    await next;
  }
}

export function isEditorMode(value: unknown): value is MermaidEditorMode {
  return value === 'preview' || value === 'source' || value === 'beside' || value === 'above';
}

function isSplitMode(mode: MermaidEditorMode): mode is SplitMode {
  return mode === 'beside' || mode === 'above';
}
