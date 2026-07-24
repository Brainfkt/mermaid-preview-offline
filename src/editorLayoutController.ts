import * as vscode from 'vscode';

import { nextPreviewMode } from './editorLayout';
import type { MermaidEditorMode } from './protocol';

const MODE_STATE_KEY = 'mermaidPreviewOffline.editorMode';
const DETACHED_COPY_TIMEOUT_MS = 30_000;

interface ModeChange {
  mode: MermaidEditorMode;
  panel?: vscode.WebviewPanel;
  uri?: vscode.Uri;
}

interface PendingDetachedCopy {
  mode: MermaidEditorMode;
  timer?: NodeJS.Timeout;
}

const MODE_ITEMS: ReadonlyArray<{
  description: string;
  label: string;
  mode: MermaidEditorMode;
}> = [
  {
    description: 'Show only the rendered diagram in the Mermaid editor',
    label: '$(preview) Preview only',
    mode: 'preview',
  },
  {
    description: 'Open the full VS Code Mermaid text editor',
    label: '$(code) Source only',
    mode: 'source',
  },
  {
    description: 'Show source and preview side by side inside one editor tab',
    label: '$(split-horizontal) Beside',
    mode: 'beside',
  },
  {
    description: 'Show source above preview inside one editor tab',
    label: '$(split-vertical) Above',
    mode: 'above',
  },
];

/**
 * Stores one preview layout for the workspace so Explorer navigation preserves
 * Preview, Beside, or Above across Mermaid files. Detached panels keep their own
 * layout. Source only hands the document to VS Code's full text editor.
 */
export class MermaidEditorLayoutController implements vscode.Disposable {
  private readonly modeEmitter = new vscode.EventEmitter<ModeChange>();
  private readonly panels = new Map<string, Set<vscode.WebviewPanel>>();
  private readonly detachedPanels = new Set<vscode.WebviewPanel>();
  private readonly detachedPanelModes = new WeakMap<vscode.WebviewPanel, MermaidEditorMode>();
  private readonly pendingDetachedCopies = new Map<string, Set<PendingDetachedCopy>>();
  private readonly unavailablePanels = new WeakSet<vscode.WebviewPanel>();
  private pendingSharedMode: MermaidEditorMode | undefined;
  private arrangement = Promise.resolve();

  public readonly onDidChangeMode = this.modeEmitter.event;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly viewType: string,
  ) {}

  public dispose(): void {
    this.modeEmitter.dispose();
    for (const pending of this.pendingDetachedCopies.values()) {
      for (const token of pending) {
        if (token.timer) clearTimeout(token.timer);
      }
    }
    this.panels.clear();
    this.detachedPanels.clear();
    this.pendingDetachedCopies.clear();
  }

  public getMode(uri: vscode.Uri): MermaidEditorMode {
    void uri;
    if (this.pendingSharedMode) return this.pendingSharedMode;
    const stored = this.context.workspaceState.get<unknown>(MODE_STATE_KEY);
    return isEditorMode(stored) && stored !== 'source' ? stored : 'preview';
  }

  public isDetachedPanel(panel: vscode.WebviewPanel): boolean {
    return this.detachedPanels.has(panel);
  }

  public modeForPanel(
    uri: vscode.Uri,
    panel: vscode.WebviewPanel,
  ): MermaidEditorMode {
    const detachedMode = this.detachedPanelModes.get(panel);
    return detachedMode && detachedMode !== 'source' ? detachedMode : this.getMode(uri);
  }

  public registerPanel(uri: vscode.Uri, panel: vscode.WebviewPanel): vscode.Disposable {
    const key = uri.toString();
    const detachedMode = this.consumePendingDetachedCopy(key);
    if (detachedMode) {
      this.detachedPanels.add(panel);
      this.detachedPanelModes.set(panel, detachedMode);
    }
    const entries = this.panels.get(key) ?? new Set<vscode.WebviewPanel>();
    entries.add(panel);
    this.panels.set(key, entries);

    return new vscode.Disposable(() => {
      this.unavailablePanels.add(panel);
      this.detachedPanels.delete(panel);
      this.detachedPanelModes.delete(panel);
      const current = this.panels.get(key);
      current?.delete(panel);
      if (current?.size === 0) {
        this.panels.delete(key);
      }
    });
  }

  public async copyPreviewToNewWindow(
    uri: vscode.Uri,
    preferredPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    let panel = this.panelForCopy(uri, preferredPanel);
    if (!panel) {
      await this.applyMode(uri, 'preview');
      panel = this.panelForCopy(uri);
    }
    if (!panel) return;

    panel.reveal(panel.viewColumn ?? vscode.ViewColumn.Active, false);
    const token = this.createPendingDetachedCopy(
      uri.toString(),
      this.modeForPanel(uri, panel),
    );
    try {
      await vscode.commands.executeCommand('workbench.action.copyEditorToNewWindow');
    } catch (error: unknown) {
      this.cancelPendingDetachedCopy(uri.toString(), token);
      throw error;
    }
  }

  public async chooseMode(uri: vscode.Uri, preferredPanel?: vscode.WebviewPanel): Promise<void> {
    const currentMode = preferredPanel
      ? this.modeForPanel(uri, preferredPanel)
      : this.getMode(uri);
    const selection = await vscode.window.showQuickPick(
      MODE_ITEMS.map((item) => ({ ...item, picked: item.mode === currentMode })),
      {
        placeHolder: 'Choose the layout inside this Mermaid editor',
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
    if (mode === 'source') {
      await this.enqueue(async () => {
        await this.openFullSourceEditor(uri, preferredPanel);
      });
      return;
    }
    if (preferredPanel && this.isDetachedPanel(preferredPanel)) {
      this.detachedPanelModes.set(preferredPanel, mode);
      this.modeEmitter.fire({ mode, panel: preferredPanel, uri });
      return;
    }
    await this.enqueue(async () => {
      await this.applyModeNow(uri, mode, preferredPanel);
    });
  }

  public async cyclePreviewMode(
    uri: vscode.Uri,
    preferredPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    const currentMode = preferredPanel
      ? this.modeForPanel(uri, preferredPanel)
      : this.getMode(uri);
    await this.applyMode(uri, nextPreviewMode(currentMode), preferredPanel);
  }

  private async applyModeNow(
    uri: vscode.Uri,
    mode: MermaidEditorMode,
    preferredPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    this.pendingSharedMode = mode;
    try {
      const panel = this.registeredPanel(uri, preferredPanel);
      if (panel) {
        panel.reveal(panel.viewColumn ?? vscode.ViewColumn.Active, false);
      } else {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          uri,
          this.viewType,
          vscode.ViewColumn.Active,
        );
      }
      await this.storeMode(mode);
    } finally {
      this.pendingSharedMode = undefined;
    }
  }

  private async openFullSourceEditor(
    uri: vscode.Uri,
    preferredPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    const panel = this.registeredPanel(uri, preferredPanel);
    const viewColumn = panel?.viewColumn ?? vscode.ViewColumn.Active;
    panel?.reveal(viewColumn, false);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preserveFocus: false,
      preview: false,
      viewColumn,
    });
  }

  private registeredPanel(
    uri: vscode.Uri,
    preferredPanel?: vscode.WebviewPanel,
  ): vscode.WebviewPanel | undefined {
    const entries = this.panels.get(uri.toString());
    if (
      preferredPanel &&
      entries?.has(preferredPanel) &&
      !this.unavailablePanels.has(preferredPanel)
    ) {
      return preferredPanel;
    }
    const panels = [...(entries ?? [])].filter(
      (panel) =>
        !this.detachedPanels.has(panel) &&
        !this.unavailablePanels.has(panel),
    );
    return (
      panels.find((panel) => panel.active) ??
      panels.find((panel) => panel.visible) ??
      panels[0]
    );
  }

  private panelForCopy(
    uri: vscode.Uri,
    preferredPanel?: vscode.WebviewPanel,
  ): vscode.WebviewPanel | undefined {
    const panels = [...(this.panels.get(uri.toString()) ?? [])].filter(
      (panel) => !this.unavailablePanels.has(panel),
    );
    if (preferredPanel && panels.includes(preferredPanel)) return preferredPanel;
    return (
      panels.find((panel) => panel.active) ??
      panels.find((panel) => panel.visible) ??
      panels[0]
    );
  }

  private async storeMode(mode: MermaidEditorMode): Promise<void> {
    await this.context.workspaceState.update(MODE_STATE_KEY, mode);
    this.modeEmitter.fire({ mode });
  }

  private createPendingDetachedCopy(
    uriKey: string,
    mode: MermaidEditorMode,
  ): PendingDetachedCopy {
    const token: PendingDetachedCopy = { mode };
    const pending = this.pendingDetachedCopies.get(uriKey) ?? new Set<PendingDetachedCopy>();
    pending.add(token);
    this.pendingDetachedCopies.set(uriKey, pending);
    token.timer = setTimeout(() => {
      this.cancelPendingDetachedCopy(uriKey, token);
    }, DETACHED_COPY_TIMEOUT_MS);
    return token;
  }

  private cancelPendingDetachedCopy(uriKey: string, token: PendingDetachedCopy): void {
    if (token.timer) {
      clearTimeout(token.timer);
      token.timer = undefined;
    }
    const pending = this.pendingDetachedCopies.get(uriKey);
    pending?.delete(token);
    if (pending?.size === 0) {
      this.pendingDetachedCopies.delete(uriKey);
    }
  }

  private consumePendingDetachedCopy(uriKey: string): MermaidEditorMode | undefined {
    const pending = this.pendingDetachedCopies.get(uriKey);
    const token = pending?.values().next().value;
    if (!token) return undefined;
    this.cancelPendingDetachedCopy(uriKey, token);
    return token.mode;
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
