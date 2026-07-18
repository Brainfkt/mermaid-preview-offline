import type { MermaidEditorMode } from './protocol';

export interface EditorLayoutGroup {
  groups?: EditorLayoutGroup[];
  orientation?: number;
  size?: number;
}

export interface EditorLayout {
  groups: EditorLayoutGroup[];
  orientation?: number;
}

export const BESIDE_ORIENTATION = 0;
export const ABOVE_ORIENTATION = 1;

export function editorLayoutFor(mode: MermaidEditorMode, ratio: number): EditorLayout {
  if (mode === 'preview' || mode === 'source') {
    return { groups: [{}] };
  }

  const sourceRatio = clampRatio(ratio);
  const previewRatio = Math.round((1 - sourceRatio) * 1_000_000) / 1_000_000;
  return {
    orientation: mode === 'beside' ? BESIDE_ORIENTATION : ABOVE_ORIENTATION,
    groups: [{ size: sourceRatio }, { size: previewRatio }],
  };
}

export function editorLayoutMatches(value: unknown, mode: MermaidEditorMode): boolean {
  if (!isRecord(value) || !Array.isArray(value.groups)) {
    return false;
  }

  const groups = value.groups as unknown[];
  if (mode === 'preview' || mode === 'source') {
    return groups.length === 1 && isLeafGroup(groups[0]);
  }

  const expectedOrientation = mode === 'beside' ? BESIDE_ORIENTATION : ABOVE_ORIENTATION;
  return (
    value.orientation === expectedOrientation &&
    groups.length === 2 &&
    groups.every(isLeafGroup)
  );
}

export function shouldApplyEditorLayout(
  value: unknown,
  mode: MermaidEditorMode,
  restoreSplitRatio = false,
): boolean {
  return (
    !editorLayoutMatches(value, mode) ||
    (restoreSplitRatio && (mode === 'beside' || mode === 'above'))
  );
}

export function readSourceRatio(
  value: unknown,
  mode: Extract<MermaidEditorMode, 'above' | 'beside'>,
): number | undefined {
  if (!editorLayoutMatches(value, mode) || !isRecord(value) || !Array.isArray(value.groups)) {
    return undefined;
  }
  const groups = value.groups as unknown[];
  const first = groups[0];
  const second = groups[1];
  if (!isRecord(first) || !isRecord(second)) {
    return undefined;
  }
  const firstSize = finitePositive(first.size);
  const secondSize = finitePositive(second.size);
  if (firstSize === undefined || secondSize === undefined) {
    return undefined;
  }
  return clampRatio(firstSize / (firstSize + secondSize));
}

export function clampRatio(value: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0.5, 0.2), 0.8);
}

function finitePositive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLeafGroup(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.groups === undefined || (Array.isArray(value.groups) && value.groups.length === 0))
  );
}
