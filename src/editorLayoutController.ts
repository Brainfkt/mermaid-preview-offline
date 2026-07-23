import * as vscode from 'vscode';

import {
  editorModeAfterSplitClose,
  editorLayoutFor,
  editorLayoutMatches,
  nextPreviewMode,
  readSourceRatio,
  shouldApplyEditorLayout,
} from './editorLayout';
import type { SplitEditorTabKind } from './editorLayout';
import type { MermaidEditorMode } from './protocol';

const MODE_STATE_KEY = 'mermaidPreviewOffline.editorMode';
const RATIO_STATE_KEY_PREFIX = 'mermaidPreviewOffline.splitRatio.';

type SplitMode = Extract<MermaidEditorMode, 'above' | 'beside'>;

interface ActiveSplit {
  mode: SplitMode;
  uri: vscode.Uri;
}

interface ClosedTabIdentity {
  kind: 'other' | 'preview' | 'source';
  uri?: string;
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
  private requestedSourceKey: string | undefined;
  private readonly detachedPanels = new Set<vscode.WebviewPanel>();
  private readonly pendingDetachedCopies = new Map<string, Set<object>>();
  private readonly unavailablePanels = new WeakSet<vscode.WebviewPanel>();

  public readonly onDidChangeMode = this.modeEmitter.event;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly viewType: string,
  ) {}

  public dispose(): void {
    this.modeEmitter.dispose();
    this.panels.clear();
    this.detachedPanels.clear();
    this.pendingDetachedCopies.clear();
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
    if (entries.size > 0 && this.consumePendingDetachedCopy(key)) {
      this.detachedPanels.add(panel);
    }
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
      if (!wasDetached) {
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
    if (!panel) {
      return;
    }
    panel.reveal(panel.viewColumn, false);
    const key = uri.toString();
    const copyToken = {};
    const pending = this.pendingDetachedCopies.get(key) ?? new Set<object>();
    pending.add(copyToken);
    this.pendingDetachedCopies.set(key, pending);
    try {
      await vscode.commands.executeCommand('workbench.action.copyEditorToNewWindow');
    } finally {
      const current = this.pendingDetachedCopies.get(key);
      current?.delete(copyToken);
      if (current?.size === 0) {
        this.pendingDetachedCopies.delete(key);
      }
    }
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
      await this.applyModeNow(uri, mode, preferredPanel);
    });
  }

  public async cyclePreviewMode(
    uri: vscode.Uri,
    preferredPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    await this.applyMode(uri, nextPreviewMode(this.getMode()), preferredPanel);
  }

  public async restoreModeForPanel(
    uri: vscode.Uri,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    await this.enqueue(async () => {
      // Auxiliary editor windows are not represented reliably by ViewColumn.
      // Reapplying the main-window layout here would reveal the copied panel in
      // the original window before its webview can receive the document.
      if (
        this.detachedPanels.has(panel) ||
        this.unavailablePanels.has(panel) ||
        !this.panels.get(uri.toString())?.has(panel)
      ) {
        return;
      }
      const mode = this.getMode();
      if (await this.isAlreadyArranged(uri, mode, panel)) {
        if (isSplitMode(mode)) {
          await this.reconcileSplitTabs(uri, panel);
        } else {
          this.disposeOtherPanels(uri, panel);
        }
        return;
      }
      await this.arrange(uri, mode, panel);
    });
  }

  public async syncPreviewForSource(uri: vscode.Uri): Promise<void> {
    const requestedSourceKey = uri.toString();
    this.requestedSourceKey = requestedSourceKey;
    await this.enqueue(async () => {
      if (this.requestedSourceKey !== requestedSourceKey) {
        return;
      }
      const mode = this.getMode();
      if (!isSplitMode(mode)) {
        return;
      }
      const panel = this.firstPanel(uri);
      if (panel && (await this.isAlreadyArranged(uri, mode, panel))) {
        await this.reconcileSplitTabs(uri, panel);
        return;
      }
      await this.arrange(uri, mode, panel, true);
    });
  }

  public async handleTabsChanged(event: vscode.TabChangeEvent): Promise<void> {
    const closedTabs = event.closed.map((tab) => this.closedTabIdentity(tab));
    await this.enqueue(async () => {
      const split = this.currentSplit;
      if (!split || !isSplitMode(this.getMode())) {
        return;
      }
      const uriKey = split.uri.toString();
      const relevantClosedKinds = closedTabs
        .filter((tab) => tab.uri === uriKey)
        .map((tab) => tab.kind);
      if (relevantClosedKinds.includes('source')) {
        const replacementSource = this.activeMermaidSourceUri();
        if (replacementSource && replacementSource.toString() !== uriKey) {
          await this.arrange(replacementSource, split.mode, undefined, true);
          this.currentSplit = { mode: split.mode, uri: replacementSource };
          return;
        }
      }
      if (await this.transitionFromClosedSplitHalf(relevantClosedKinds, split)) {
        return;
      }
      await this.reconcileSplitTabs(
        split.uri,
        this.panelInColumn(split.uri, vscode.ViewColumn.Two),
      );
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
      !this.managedPanels(uri).some((panel) => panel.visible)
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
    focusSource = false,
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
      const restoreSplitRatio = splitMode !== undefined && this.currentSplit === undefined;
      if (shouldApplyEditorLayout(currentLayout, mode, restoreSplitRatio)) {
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

      await this.openSplit(uri, preferredPanel, focusSource);
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
    for (const panel of this.managedPanels(uri)) {
      this.disposePanel(panel);
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
    focusSource = false,
  ): Promise<void> {
    const panel = this.registeredPanel(uri, preferredPanel);
    if (panel) {
      this.disposeOtherSplitPanels(panel);
      panel.reveal(vscode.ViewColumn.Two, focusSource);
    } else {
      this.disposeOtherSplitPanels();
      await vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        this.viewType,
        vscode.ViewColumn.Two,
      );
    }

    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preserveFocus: !focusSource,
      preview: false,
      viewColumn: vscode.ViewColumn.One,
    });
    await this.reconcileSplitTabs(uri, panel);
  }

  private firstPanel(uri: vscode.Uri): vscode.WebviewPanel | undefined {
    return this.managedPanels(uri)[0];
  }

  private registeredPanel(
    uri: vscode.Uri,
    preferredPanel?: vscode.WebviewPanel,
  ): vscode.WebviewPanel | undefined {
    const entries = this.panels.get(uri.toString());
    return preferredPanel &&
      entries?.has(preferredPanel) &&
      !this.detachedPanels.has(preferredPanel) &&
      !this.unavailablePanels.has(preferredPanel)
      ? preferredPanel
      : this.panelInColumn(uri, vscode.ViewColumn.Two) ?? this.firstPanel(uri);
  }

  private panelForCopy(
    uri: vscode.Uri,
    preferredPanel?: vscode.WebviewPanel,
  ): vscode.WebviewPanel | undefined {
    const entries = this.panels.get(uri.toString());
    return preferredPanel &&
      entries?.has(preferredPanel) &&
      !this.unavailablePanels.has(preferredPanel)
      ? preferredPanel
      : this.registeredPanel(uri);
  }

  private panelInColumn(
    uri: vscode.Uri,
    viewColumn: vscode.ViewColumn,
  ): vscode.WebviewPanel | undefined {
    return this.managedPanels(uri).find(
      (panel) => panel.viewColumn === viewColumn,
    );
  }

  private disposeOtherPanels(uri: vscode.Uri, retained: vscode.WebviewPanel): void {
    for (const panel of this.managedPanels(uri)) {
      if (panel !== retained) {
        this.disposePanel(panel);
      }
    }
  }

  private disposeOtherSplitPanels(retained?: vscode.WebviewPanel): void {
    for (const entries of [...this.panels.values()]) {
      for (const panel of [...entries]) {
        if (
          panel !== retained &&
          !this.detachedPanels.has(panel) &&
          !this.unavailablePanels.has(panel)
        ) {
          this.disposePanel(panel);
        }
      }
    }
  }

  private async reconcileSplitTabs(
    uri: vscode.Uri,
    retainedPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    if (retainedPanel) {
      this.disposeOtherSplitPanels(retainedPanel);
    }
    await this.closeDuplicateSourceTabs(uri);
  }

  private async transitionFromClosedSplitHalf(
    closedKinds: readonly SplitEditorTabKind[],
    split: ActiveSplit,
  ): Promise<boolean> {
    const remainingKinds = this.remainingSplitKinds(split.uri);
    const mode = editorModeAfterSplitClose(closedKinds, remainingKinds);
    if (!mode) {
      if (closedKinds.includes('source') && closedKinds.includes('preview')) {
        this.currentSplit = undefined;
      }
      return false;
    }

    await this.saveSplitRatio(split);
    await this.applyModeNow(split.uri, mode, this.firstPanel(split.uri));
    return true;
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

  private async closeDuplicateSourceTabs(uri: vscode.Uri): Promise<void> {
    const duplicateTabs = vscode.window.tabGroups.all.flatMap((group) =>
      group.viewColumn === vscode.ViewColumn.One
        ? []
        : group.tabs.filter(
            (tab) =>
              tab.input instanceof vscode.TabInputText &&
              tab.input.uri.toString() === uri.toString(),
          ),
    );
    if (duplicateTabs.length > 0) {
      await vscode.window.tabGroups.close(duplicateTabs, true);
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

  private async applyModeNow(
    uri: vscode.Uri,
    mode: MermaidEditorMode,
    preferredPanel?: vscode.WebviewPanel,
  ): Promise<void> {
    this.pendingMode = mode;
    try {
      await this.arrange(uri, mode, preferredPanel);
      await this.context.workspaceState.update(MODE_STATE_KEY, mode);
      this.modeEmitter.fire(mode);
    } finally {
      this.pendingMode = undefined;
    }
  }

  private async handleManagedPreviewClosed(uri: vscode.Uri): Promise<void> {
    await this.enqueue(async () => {
      const split = this.currentSplit;
      if (
        !split ||
        split.uri.toString() !== uri.toString() ||
        !isSplitMode(this.getMode()) ||
        this.firstPanel(uri)
      ) {
        return;
      }
      await this.transitionFromClosedSplitHalf(['preview'], split);
    });
  }

  private managedPanels(uri: vscode.Uri): vscode.WebviewPanel[] {
    return [...(this.panels.get(uri.toString()) ?? [])].filter(
      (panel) =>
        !this.detachedPanels.has(panel) &&
        !this.unavailablePanels.has(panel),
    );
  }

  private disposePanel(panel: vscode.WebviewPanel): void {
    this.unavailablePanels.add(panel);
    panel.dispose();
  }

  private consumePendingDetachedCopy(uriKey: string): boolean {
    const pending = this.pendingDetachedCopies.get(uriKey);
    const copyToken = pending?.values().next().value;
    if (!copyToken) {
      return false;
    }
    pending?.delete(copyToken);
    if (pending?.size === 0) {
      this.pendingDetachedCopies.delete(uriKey);
    }
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
    if (hasSource) {
      kinds.push('source');
    }
    if (this.firstPanel(uri)) {
      kinds.push('preview');
    }
    return kinds;
  }

  private activeMermaidSourceUri(): vscode.Uri | undefined {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    return input instanceof vscode.TabInputText && isMermaidUri(input.uri)
      ? input.uri
      : undefined;
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

function isMermaidUri(uri: vscode.Uri): boolean {
  return /\.(?:mmd|mermaid)$/iu.test(uri.path);
}
