import type { MermaidEditorMode } from './protocol';

const PREVIEW_MODE_CYCLE: readonly MermaidEditorMode[] = ['preview', 'beside', 'above'];

export function nextPreviewMode(mode: MermaidEditorMode): MermaidEditorMode {
  const index = PREVIEW_MODE_CYCLE.indexOf(mode);
  return PREVIEW_MODE_CYCLE[(index + 1) % PREVIEW_MODE_CYCLE.length] ?? 'preview';
}
