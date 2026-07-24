import type { MermaidEditorMode } from './protocol';

const PREVIEW_MODE_CYCLE: readonly MermaidEditorMode[] = ['preview', 'beside', 'above'];

export type SplitEditorTabKind = 'other' | 'preview' | 'source';

export function nextPreviewMode(mode: MermaidEditorMode): MermaidEditorMode {
  const index = PREVIEW_MODE_CYCLE.indexOf(mode);
  return PREVIEW_MODE_CYCLE[(index + 1) % PREVIEW_MODE_CYCLE.length] ?? 'preview';
}

export function editorModeAfterSplitClose(
  closedTabs: readonly SplitEditorTabKind[],
  remainingTabs: readonly SplitEditorTabKind[],
): Extract<MermaidEditorMode, 'preview' | 'source'> | undefined {
  const hasPreview = remainingTabs.includes('preview');
  const hasSource = remainingTabs.includes('source');
  if (closedTabs.includes('source') && hasPreview && !hasSource) {
    return 'preview';
  }
  if (closedTabs.includes('preview') && hasSource && !hasPreview) {
    return 'source';
  }
  return undefined;
}
