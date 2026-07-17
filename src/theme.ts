import type { DiagramTheme } from './protocol';

export type PreviewColorScheme = 'dark' | 'highContrastDark' | 'highContrastLight' | 'light';

export function resolveDiagramTheme(
  selectedTheme: DiagramTheme,
  colorScheme: PreviewColorScheme,
): Exclude<DiagramTheme, 'adaptive'> {
  if (selectedTheme !== 'adaptive') {
    return selectedTheme;
  }
  return colorScheme === 'dark' || colorScheme === 'highContrastDark' ? 'dark' : 'default';
}
