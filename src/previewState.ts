import {
  DIAGRAM_THEMES,
  type DiagramTheme,
  type PersistedPreviewState,
} from './protocol';

export const DEFAULT_PREVIEW_STATE: PersistedPreviewState = {
  autoFit: true,
  diagramTheme: 'adaptive',
  scrollLeft: 0,
  scrollTop: 0,
  sourceVisible: false,
  zoom: 1,
};

export function normalizePreviewState(value: unknown): PersistedPreviewState {
  if (!isRecord(value)) {
    return { ...DEFAULT_PREVIEW_STATE };
  }

  return {
    autoFit: typeof value.autoFit === 'boolean' ? value.autoFit : true,
    diagramTheme: isDiagramTheme(value.diagramTheme) ? value.diagramTheme : 'adaptive',
    scrollLeft: finiteNonNegative(value.scrollLeft),
    scrollTop: finiteNonNegative(value.scrollTop),
    sourceVisible: typeof value.sourceVisible === 'boolean' ? value.sourceVisible : false,
    zoom: clamp(finiteNumber(value.zoom, 1), 0.15, 4),
  };
}

export function isDiagramTheme(value: unknown): value is DiagramTheme {
  return typeof value === 'string' && DIAGRAM_THEMES.some((theme) => theme === value);
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function finiteNonNegative(value: unknown): number {
  return Math.max(finiteNumber(value, 0), 0);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
