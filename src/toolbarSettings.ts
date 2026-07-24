export const TOOLBAR_CONTROLS = [
  'layout',
  'zoom',
  'refresh',
  'search',
  'appearance',
  'copySvg',
  'saveSvg',
  'export',
  'newWindow',
] as const;

export type ToolbarControl = (typeof TOOLBAR_CONTROLS)[number];
export type ToolbarLabelMode = 'responsive' | 'icons' | 'always';

export interface ToolbarConfiguration {
  controls: ToolbarControl[];
  labelMode: ToolbarLabelMode;
  visible: boolean;
}

export const DEFAULT_TOOLBAR_CONFIGURATION: ToolbarConfiguration = {
  controls: [...TOOLBAR_CONTROLS],
  labelMode: 'icons',
  visible: true,
};

export function normalizeToolbarLabelMode(value: unknown): ToolbarLabelMode {
  return value === 'responsive' || value === 'always' ? value : 'icons';
}

export function normalizeToolbarControls(value: unknown): ToolbarControl[] {
  if (!Array.isArray(value)) {
    return [...TOOLBAR_CONTROLS];
  }
  const selected = new Set(value.filter(isToolbarControl));
  return TOOLBAR_CONTROLS.filter((control) => selected.has(control));
}

function isToolbarControl(value: unknown): value is ToolbarControl {
  return typeof value === 'string' &&
    (TOOLBAR_CONTROLS as readonly string[]).includes(value);
}
