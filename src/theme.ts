import { DEFAULT_DIAGRAM_SURFACE, resolveDiagramAppearance } from './appearance';
import type { DiagramTheme } from './protocol';

export type PreviewColorScheme = 'dark' | 'highContrastDark' | 'highContrastLight' | 'light';

export function resolveDiagramTheme(
  selectedTheme: DiagramTheme,
  colorScheme: PreviewColorScheme,
): ReturnType<typeof resolveDiagramAppearance>['theme'] {
  return resolveDiagramAppearance(
    selectedTheme,
    colorScheme,
    DEFAULT_DIAGRAM_SURFACE,
    'comfortable',
  ).theme;
}
