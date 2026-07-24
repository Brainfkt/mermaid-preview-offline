import * as vscode from 'vscode';

import {
  editorModeAfterSplitClose,
  nextPreviewMode,
} from './editorLayout';
import type { SplitEditorTabKind } from './editorLayout';
import type { MermaidEditorMode } from './protocol';

const MODE_STATE_KEY_PREFIX = 'mermaidPreviewOffline.editorMode.';
const DETACHED_COPY_TIMEOUT_MS = 30_000;

type SplitMode = Extract<MermaidEditorMode, 'above' | 'beside'>;

interface ClosedTabIdentity {
  kind: 'other' | 'preview' | 'source';
  uri?: string;
}

interface ModeChange {
  mode: MermaidEditorMode;
  uri: vscode.Uri;
}

interface PendingDetachedCopy {
  timer?: NodeJS.Timeout;
}

interface SplitSession {
  mode: SplitMode;
  panel?: vscode.WebviewPanel;
  uri: vscode.Uri;
}

const MODE_ITEMS: ReadonlyArray<{
  description: string;
  label: string;
  mode: MermaidEditorMode;
}> = [
  {
    description: 'Show the rendered diagram in the current editor group',
    label: '$(preview) Preview only',
    mode: 'preview',
  },
  {
    description: 'Open the native Mermaid text editor',
    label: '$(code) Source only',
    mode: 'source',
  },
  {
    description: 'Open the preview in the group beside the source',
    label: '$(split-horizontal) Beside',
    mode: 'beside',
  },
  {
    description: 'Open the preview in a group below the source',
    label: '$(split-vertical) Above',
    mode: 'above',
  },
];

/**
 * Coordinates explicit source/preview commands without taking ownership of the
 * user's complete editor layout. VS Code remains responsible for restoring,
 * moving, and closing editor groups.
 */
export class MermaidEditorLayoutController implements vscode.Disposable {
  private readonly modeEmitter = new vscode.EventEmitter<ModeChange>();
  private readonly panels = new Map<string, Set<vscode.WebviewPanel>>();
  private readonly pendingModes = new Map<string, MermaidEditorMode>();
  private readonly detachedPanels = new Set<vscode.WebviewPanel>();
  private readonly pendingDetachedCopies = new Map<string, Set<PendingDetachedCopy>>();
  private readonly splitSessions = new Map<string, SplitSession>();
  private readonly unavailablePanels = new WeakSet<vscode.WebviewPanel>();
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
    this.pendingModes.clear();
    this.detachedPanels.clear();
    this.pendingDetachedCopies.clear();
    this.splitSessions.clear();
  }

  public getMode(uri: vscode.Uri): MermaidEditorMode {
    const key = uri.toString();
    const pending = this.pendingModes.get(key);
    if (pending) return pending;
    const stored = this.context.workspaceState.get<unknown>(this.modeKey(uri));
    return isEditorMode(stored) ? stored : 'preview';
  }

  public isDetachedPanel(panel: vscode.WebviewPanel): boolean {
    return this.detachedPanels.has(panel);
  }

  public modeForPanel(
    uri: vscode.Uri,
    panel: vscode.WebviewPanel,
  ): MermaidEditorMode {
    if (this.isDetachedPanel(panel)) return 'preview';
    const session = this.splitSessions.get(uri.toString());
    return session && (!session.panel || session.panel === panel)
      ? session.mode
      : 'preview';
  }

  public sourceColumnFor(uri: vscode.Uri): vscode.ViewColumn | undefined {
    return vscode.window.visibleTextEditors.find(
      (editor) => editor.document.uri.toString() === uri.toString(),
    )?.viewColumn;
  }

  public registerPanel(uri: vscode.Uri, panel: vscode.WebviewPanel): vscode.Disposable {
    const key = uri.toString();
    if (this.consumePendingDetachedCopy(key)) {
      this.detachedPanels.add(panel);
    }
    const entries = this.panels.get(key) ?? new Set<vscode.WebviewPanel>();
    entries.add(panel);
    this.panels.set(key, entries);

    return new vscode.Disposable(() => {
      this.unavailablePanels.add(panel);
      const wasDetached = this.detachedPanels.delete(panel);
      const current = this.panels.get(key);
      current?.delete(panel);
      if (current?.size === 0) {
        this.panels.delete(key);
      }
      const session = this.splitSessions.get(key);
      if (!wasDetached && session && (!session.panel || session.panel === panel)) {
        void this.handleManagedPreviewClosed(uri);
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
    const token = this.createPendingDetachedCopy(uri.toString());
    try {
      await vscode.commands.executeCommand('workbench.action.copyEditorToNewWindow');
    } catch (error: unknown) {
      this.cancelPendingDetachedCopy(uri.toString(), token);
      throw error;
    }
  }

  public async chooseMode(uri: vscode.Uri, preferredPanel?: vscode.WebviewPanel): Promise<void> {
    if (preferredPanel && this.isDetachedPanel(preferredPanel)) return;
    const currentMode = preferredPanel
      ? this.modeForPanel(uri, preferredPanel)
      : this.getMode(uri);
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
    if (preferredPanel && this.isDetachedPanel(preferredPanel)) {
      if (mode === 'source' || mode === 'beside') {
        await this.openSourceBesideDetached(uri, preferredPanel);
      }
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
    if (preferredPanel && this.isDetachedPanel(preferredPanel)) return;
    const currentMode = preferredPanel
      ? this.modeForPanel(uri, preferredPanel)
      : this.getMode(uri);
    await this.applyMode(uri, nextPreviewMode(currentMode), preferredPanel);
  }

  public async handleTabsChanged(event: vscode.TabChangeEvent): Promise<void> {
    const closedTabs = event.closed.map((tab) => this.closedTabIdentity(tab));
    const affectedUris = new Set(
      closedTabs.flatMap((tab) => tab.uri ? [tab.uri] : []),
    );
    if (affectedUris.size === 0) return;

    await this.enqueue(async () => {
      for (const uriKey of affectedUris) {
        const session = this.splitSessions.get(uriKey);
        if (!session || !isSplitMode(this.getMode(session.uri))) continue;
        const relevantClosedKinds = closedTabs
          .filter((tab) => tab.uri === uriKey)
          .map((tab) => tab.kind);
        await this.transitionFromClosedSplitHalf(relevantClosedKinds, session);
      }
    });
  }

  private async arrange(
    uri: vscode.Uri,
    mode: MermaidEditorMode,
    preferredPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    if (mode === 'source') {
      await this.openSourceOnly(uri, preferredPanel);
      return;
    }
    if (mode === 'preview') {
      await this.openPreviewOnly(uri, preferredPanel);
      return;
    }
    await this.openSplit(uri, mode, preferredPanel);
  }

  private async openSourceOnly(
    uri: vscode.Uri,
    preferredPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    const key = uri.toString();
    const panel = this.registeredPanel(uri, preferredPanel);
    const viewColumn =
      panel?.viewColumn ??
      this.sourceColumnFor(uri) ??
      vscode.ViewColumn.Active;
    this.splitSessions.delete(key);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preserveFocus: false,
      preview: false,
      viewColumn,
    });
    if (panel) this.disposePanel(panel);
  }

  private async openPreviewOnly(
    uri: vscode.Uri,
    preferredPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    const panel = this.registeredPanel(uri, preferredPanel);
    const viewColumn =
      this.sourceColumnFor(uri) ??
      panel?.viewColumn ??
      vscode.ViewColumn.Active;
    this.splitSessions.delete(uri.toString());
    if (panel) {
      panel.reveal(viewColumn, false);
      return;
    }
    await vscode.commands.executeCommand(
      'vscode.openWith',
      uri,
      this.viewType,
      viewColumn,
    );
  }

  private async openSplit(
    uri: vscode.Uri,
    mode: SplitMode,
    preferredPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    const key = uri.toString();
    const panel = this.registeredPanel(uri, preferredPanel);
    const previousSession = this.splitSessions.get(key);
    const document = await vscode.workspace.openTextDocument(uri);
    const source = await vscode.window.showTextDocument(document, {
      preserveFocus: false,
      preview: false,
      viewColumn:
        this.sourceColumnFor(uri) ??
        panel?.viewColumn ??
        vscode.ViewColumn.Active,
    });

    let previewColumn: vscode.ViewColumn;
    if (
      mode === 'above' &&
      previousSession?.mode === 'above' &&
      panel &&
      panel.viewColumn !== source.viewColumn
    ) {
      previewColumn = panel.viewColumn ?? vscode.ViewColumn.Beside;
    } else if (mode === 'above') {
      await vscode.commands.executeCommand('workbench.action.newGroupBelow');
      previewColumn = vscode.window.tabGroups.activeTabGroup.viewColumn;
    } else {
      previewColumn = vscode.ViewColumn.Beside;
    }

    if (panel) {
      panel.reveal(previewColumn, false);
    } else {
      await vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        this.viewType,
        previewColumn,
      );
    }
    this.splitSessions.set(key, {
      mode,
      panel: panel ?? this.registeredPanel(uri),
      uri,
    });
  }

  private async openSourceBesideDetached(
    uri: vscode.Uri,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    panel.reveal(panel.viewColumn ?? vscode.ViewColumn.Active, false);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preserveFocus: false,
      preview: false,
      viewColumn: vscode.ViewColumn.Beside,
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
      this.isManagedPanel(preferredPanel)
    ) {
      return preferredPanel;
    }
    const panels = this.managedPanels(uri);
    const activeColumn = vscode.window.tabGroups.activeTabGroup.viewColumn;
    return (
      panels.find((panel) => panel.active) ??
      panels.find((panel) => panel.visible && panel.viewColumn === activeColumn) ??
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

  private async transitionFromClosedSplitHalf(
    closedKinds: readonly SplitEditorTabKind[],
    session: SplitSession,
  ): Promise<void> {
    const remainingKinds = this.remainingSplitKinds(session.uri);
    const mode = editorModeAfterSplitClose(closedKinds, remainingKinds);
    if (mode) {
      this.splitSessions.delete(session.uri.toString());
      await this.storeMode(session.uri, mode);
      return;
    }
    if (closedKinds.includes('source') && closedKinds.includes('preview')) {
      this.splitSessions.delete(session.uri.toString());
    }
  }

  private closedTabIdentity(tab: vscode.Tab): ClosedTabIdentity {
    if (tab.input instanceof vscode.TabInputText) {
      return { kind: 'source', uri: tab.input.uri.toString() };
    }
    if (
      tab.input instanceof vscode.TabInputCustom &&
      tab.input.viewType === this.viewType
    ) {
      return { kind: 'preview', uri: tab.input.uri.toString() };
    }
    return { kind: 'other' };
  }

  private async applyModeNow(
    uri: vscode.Uri,
    mode: MermaidEditorMode,
    preferredPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    const key = uri.toString();
    this.pendingModes.set(key, mode);
    try {
      await this.arrange(uri, mode, preferredPanel);
      await this.storeMode(uri, mode);
    } finally {
      this.pendingModes.delete(key);
    }
  }

  private async storeMode(uri: vscode.Uri, mode: MermaidEditorMode): Promise<void> {
    await this.context.workspaceState.update(this.modeKey(uri), mode);
    this.modeEmitter.fire({ mode, uri });
  }

  private async handleManagedPreviewClosed(uri: vscode.Uri): Promise<void> {
    await this.enqueue(async () => {
      const session = this.splitSessions.get(uri.toString());
      if (!session || !isSplitMode(this.getMode(uri))) return;
      await this.transitionFromClosedSplitHalf(['preview'], session);
    });
  }

  private managedPanels(uri: vscode.Uri): vscode.WebviewPanel[] {
    return [...(this.panels.get(uri.toString()) ?? [])].filter(
      (panel) => this.isManagedPanel(panel),
    );
  }

  private isManagedPanel(panel: vscode.WebviewPanel): boolean {
    return !this.detachedPanels.has(panel) && !this.unavailablePanels.has(panel);
  }

  private disposePanel(panel: vscode.WebviewPanel): void {
    this.unavailablePanels.add(panel);
    panel.dispose();
  }

  private createPendingDetachedCopy(uriKey: string): PendingDetachedCopy {
    const token: PendingDetachedCopy = {};
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

  private consumePendingDetachedCopy(uriKey: string): boolean {
    const pending = this.pendingDetachedCopies.get(uriKey);
    const token = pending?.values().next().value;
    if (!token) return false;
    this.cancelPendingDetachedCopy(uriKey, token);
    return true;
  }

  private remainingSplitKinds(uri: vscode.Uri): SplitEditorTabKind[] {
    const uriKey = uri.toString();
    const kinds: SplitEditorTabKind[] = [];
    const hasSource = vscode.window.tabGroups.all.some((group) =>
      group.tabs.some(
        (tab) =>
          tab.input instanceof vscode.TabInputText &&
          tab.input.uri.toString() === uriKey,
      ),
    );
    if (hasSource) kinds.push('source');
    if (this.managedPanels(uri).length > 0) kinds.push('preview');
    return kinds;
  }

  private modeKey(uri: vscode.Uri): string {
    return `${MODE_STATE_KEY_PREFIX}${uri.toString()}`;
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
