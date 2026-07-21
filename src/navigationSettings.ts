export const DIAGRAM_MOUSE_NAVIGATION_MODES = ['always', 'alt', 'never'] as const;
export type DiagramMouseNavigationMode = (typeof DIAGRAM_MOUSE_NAVIGATION_MODES)[number];

export const DIAGRAM_CONTROLS_VISIBILITY_MODES = [
  'never',
  'onHoverOrFocus',
  'always',
] as const;
export type DiagramControlsVisibility =
  (typeof DIAGRAM_CONTROLS_VISIBILITY_MODES)[number];

export interface DiagramNavigationConfiguration {
  controlsVisibility: DiagramControlsVisibility;
  mouseNavigation: DiagramMouseNavigationMode;
}

export const DEFAULT_DIAGRAM_NAVIGATION_CONFIGURATION: DiagramNavigationConfiguration = {
  controlsVisibility: 'always',
  mouseNavigation: 'always',
};

export function normalizeDiagramMouseNavigation(
  value: unknown,
): DiagramMouseNavigationMode {
  return value === 'alt' || value === 'never' ? value : 'always';
}

export function normalizeDiagramControlsVisibility(
  value: unknown,
): DiagramControlsVisibility {
  return value === 'never' || value === 'onHoverOrFocus' ? value : 'always';
}

export function normalizeDocumentationMaxHeight(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${clamp(value, 160, 10_000)}px`;
  }
  if (typeof value !== 'string') return '';
  const candidate = value.trim().toLowerCase();
  if (!candidate) return '';
  if (/^\d+(?:\.\d+)?$/u.test(candidate)) {
    return `${clamp(Number(candidate), 160, 10_000)}px`;
  }
  const match = /^(\d+(?:\.\d+)?)(px|vh|vw|rem|em|%)$/u.exec(candidate);
  if (!match) return '';
  const amount = Number(match[1]);
  const unit = match[2] ?? 'px';
  const maximum = unit === 'px' ? 10_000 : unit === 'rem' || unit === 'em' ? 500 : 1_000;
  return `${clamp(amount, unit === 'px' ? 160 : 1, maximum)}${unit}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
