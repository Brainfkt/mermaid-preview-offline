import type {
  DiagramDensity,
  DiagramSurfaceConfiguration,
  DiagramSurfacePattern,
  DiagramSurfacePreset,
  DiagramTheme,
} from './protocol';
import type { PreviewColorScheme } from './theme';

export type MermaidTheme =
  | 'base'
  | 'dark'
  | 'default'
  | 'forest'
  | 'neo'
  | 'neo-dark'
  | 'neutral'
  | 'redux-color'
  | 'redux-dark-color';

export type MermaidLook = 'classic' | 'handDrawn' | 'neo';

export interface DiagramAppearance {
  dark: boolean;
  density: DiagramDensity;
  handDrawnSeed?: number;
  look: MermaidLook;
  theme: MermaidTheme;
}

export interface DiagramSpacing {
  flowchart: { nodeSpacing: number; padding: number; rankSpacing: number };
  sequence: { actorMargin: number; boxMargin: number };
}

export const DEFAULT_DIAGRAM_SURFACE: DiagramSurfaceConfiguration = {
  customColor: '#ffffff',
  pattern: 'dots',
  preset: 'editor',
};

export const SURFACE_COLORS: Readonly<Record<Exclude<DiagramSurfacePreset, 'custom' | 'editor'>, string>> = {
  midnight: '#0f172a',
  paper: '#faf9f6',
  slate: '#1e293b',
  'soft-blue': '#eff6ff',
  'soft-gray': '#f3f4f6',
  'soft-rose': '#fdf2f8',
  white: '#ffffff',
};

const DARK_THEMES = new Set<DiagramTheme>(['dark', 'neo-dark', 'redux-dark-color']);

export function resolveDiagramAppearance(
  theme: DiagramTheme,
  colorScheme: PreviewColorScheme,
  surface: DiagramSurfaceConfiguration,
  density: DiagramDensity,
): DiagramAppearance {
  const surfaceDark = diagramSurfaceIsDark(surface);
  const adaptiveDark = surfaceDark ?? isDarkColorScheme(colorScheme);
  if (theme === 'adaptive') {
    return {
      dark: adaptiveDark,
      density,
      look: 'classic',
      theme: adaptiveDark ? 'dark' : 'default',
    };
  }
  if (theme === 'sketch') {
    return {
      dark: adaptiveDark,
      density,
      handDrawnSeed: 42,
      look: 'handDrawn',
      theme: adaptiveDark ? 'dark' : 'default',
    };
  }
  return {
    dark: DARK_THEMES.has(theme),
    density,
    look: theme === 'neo' || theme === 'neo-dark' ? 'neo' : 'classic',
    theme,
  };
}

export function diagramSpacing(density: DiagramDensity): DiagramSpacing {
  if (density === 'compact') {
    return {
      flowchart: { nodeSpacing: 35, padding: 8, rankSpacing: 40 },
      sequence: { actorMargin: 45, boxMargin: 8 },
    };
  }
  if (density === 'spacious') {
    return {
      flowchart: { nodeSpacing: 70, padding: 20, rankSpacing: 75 },
      sequence: { actorMargin: 80, boxMargin: 16 },
    };
  }
  return {
    flowchart: { nodeSpacing: 50, padding: 15, rankSpacing: 50 },
    sequence: { actorMargin: 50, boxMargin: 10 },
  };
}

export function normalizeDiagramDensity(value: unknown): DiagramDensity {
  return value === 'compact' || value === 'spacious' ? value : 'comfortable';
}

export function isDiagramDensity(value: unknown): value is DiagramDensity {
  return value === 'compact' || value === 'comfortable' || value === 'spacious';
}

export function normalizeDiagramSurface(value: unknown): DiagramSurfaceConfiguration {
  const candidate = isRecord(value) ? value : {};
  return {
    customColor: normalizeCssHexColor(candidate.customColor, DEFAULT_DIAGRAM_SURFACE.customColor),
    pattern: normalizeDiagramSurfacePattern(candidate.pattern),
    preset: normalizeDiagramSurfacePreset(candidate.preset),
  };
}

export function isDiagramSurfaceConfiguration(
  value: unknown,
): value is DiagramSurfaceConfiguration {
  if (!isRecord(value)) return false;
  return normalizeDiagramSurface(value).preset === value.preset &&
    normalizeDiagramSurface(value).pattern === value.pattern &&
    normalizeDiagramSurface(value).customColor === value.customColor;
}

export function normalizeDiagramSurfacePattern(value: unknown): DiagramSurfacePattern {
  return value === 'none' || value === 'grid' ? value : 'dots';
}

export function normalizeDiagramSurfacePreset(value: unknown): DiagramSurfacePreset {
  return value === 'white' ||
    value === 'paper' ||
    value === 'soft-gray' ||
    value === 'soft-blue' ||
    value === 'soft-rose' ||
    value === 'slate' ||
    value === 'midnight' ||
    value === 'custom'
    ? value
    : 'editor';
}

export function diagramSurfaceColor(
  surface: DiagramSurfaceConfiguration,
  editorColor?: string,
): string | undefined {
  if (surface.preset === 'editor') return editorColor;
  if (surface.preset === 'custom') return surface.customColor;
  return SURFACE_COLORS[surface.preset];
}

export function diagramSurfaceIsDark(surface: DiagramSurfaceConfiguration): boolean | undefined {
  const color = diagramSurfaceColor(surface);
  return color ? isDarkHexColor(color) : undefined;
}

export function isDarkHexColor(color: string): boolean {
  const match = /^#([\da-f]{6})$/iu.exec(color);
  if (!match) return false;
  const value = Number.parseInt(match[1] ?? '000000', 16);
  const components = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
    .map((component) => component / 255)
    .map((component) => component <= 0.04045
      ? component / 12.92
      : ((component + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * (components[0] ?? 0) +
    0.7152 * (components[1] ?? 0) +
    0.0722 * (components[2] ?? 0);
  return luminance < 0.179;
}

export function normalizeCssHexColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[\da-f]{6}$/iu.test(value)
    ? value.toLowerCase()
    : fallback;
}

function isDarkColorScheme(colorScheme: PreviewColorScheme): boolean {
  return colorScheme === 'dark' || colorScheme === 'highContrastDark';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
