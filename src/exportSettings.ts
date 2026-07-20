import type { DiagramTheme } from './protocol';

export const EXPORT_FORMATS = ['svg', 'png', 'webp', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export type ExportBackground = 'transparent' | 'color';
export type ExportSvgVariant = 'optimized' | 'original';

export interface ExportSettings {
  background: ExportBackground;
  backgroundColor: string;
  dpi: number;
  fileNameTemplate: string;
  format: ExportFormat;
  includeMetadata: boolean;
  margin: number;
  optimizeSvg: boolean;
  scale: number;
  svgVariant: ExportSvgVariant;
  theme: DiagramTheme;
}

export interface ExportProfile {
  id: string;
  name: string;
  settings: ExportSettings;
}

export interface ExportSourceMetadata {
  exportedAt: string;
  fileName: string;
  sourceUri?: string;
}

export interface ExportNameContext {
  fileName: string;
  settings: ExportSettings;
  now?: Date;
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  background: 'transparent',
  backgroundColor: '#ffffff',
  dpi: 144,
  fileNameTemplate: '{name}-{theme}@{scale}x.{format}',
  format: 'png',
  includeMetadata: false,
  margin: 24,
  optimizeSvg: true,
  scale: 1,
  svgVariant: 'optimized',
  theme: 'default',
};

const DIAGRAM_THEMES = new Set<DiagramTheme>([
  'adaptive',
  'default',
  'dark',
  'forest',
  'neutral',
  'base',
]);

export function normalizeExportSettings(value: unknown): ExportSettings {
  const candidate = isRecord(value) ? value : {};
  const background = candidate.background === 'color' ? 'color' : 'transparent';
  const theme = isDiagramTheme(candidate.theme) ? candidate.theme : DEFAULT_EXPORT_SETTINGS.theme;
  const format = isExportFormat(candidate.format)
    ? candidate.format
    : DEFAULT_EXPORT_SETTINGS.format;
  const svgVariant = candidate.svgVariant === 'original' ? 'original' : 'optimized';

  return {
    background,
    backgroundColor:
      typeof candidate.backgroundColor === 'string' && isCssHexColor(candidate.backgroundColor)
        ? candidate.backgroundColor.toLowerCase()
        : DEFAULT_EXPORT_SETTINGS.backgroundColor,
    dpi: clampNumber(candidate.dpi, 72, 600, DEFAULT_EXPORT_SETTINGS.dpi),
    fileNameTemplate:
      typeof candidate.fileNameTemplate === 'string' && candidate.fileNameTemplate.trim()
        ? candidate.fileNameTemplate.trim().slice(0, 160)
        : DEFAULT_EXPORT_SETTINGS.fileNameTemplate,
    format,
    includeMetadata:
      typeof candidate.includeMetadata === 'boolean'
        ? candidate.includeMetadata
        : DEFAULT_EXPORT_SETTINGS.includeMetadata,
    margin: clampNumber(candidate.margin, 0, 512, DEFAULT_EXPORT_SETTINGS.margin),
    optimizeSvg:
      typeof candidate.optimizeSvg === 'boolean'
        ? candidate.optimizeSvg
        : DEFAULT_EXPORT_SETTINGS.optimizeSvg,
    scale: clampNumber(candidate.scale, 0.25, 8, DEFAULT_EXPORT_SETTINGS.scale),
    svgVariant,
    theme,
  };
}

export function normalizeExportProfiles(value: unknown): ExportProfile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids = new Set<string>();
  const profiles: ExportProfile[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      continue;
    }
    const id = entry.id.trim().slice(0, 80);
    const name = entry.name.trim().slice(0, 80);
    if (!id || !name || ids.has(id)) {
      continue;
    }
    ids.add(id);
    profiles.push({ id, name, settings: normalizeExportSettings(entry.settings) });
  }
  return profiles.slice(0, 40);
}

export function exportMimeType(format: ExportFormat): string {
  const mimeTypes: Record<ExportFormat, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    svg: 'image/svg+xml',
    webp: 'image/webp',
  };
  return mimeTypes[format];
}

export function createExportFileName(context: ExportNameContext): string {
  const settings = normalizeExportSettings(context.settings);
  const now = context.now ?? new Date();
  const sourceName = fileStem(context.fileName);
  const sourceExtension = fileExtension(context.fileName);
  const replacements: Record<string, string> = {
    date: localDate(now),
    dpi: String(settings.dpi),
    ext: sourceExtension,
    format: settings.format,
    name: sourceName,
    scale: formatScale(settings.scale),
    theme: settings.theme,
    time: localTime(now),
  };
  const expanded = settings.fileNameTemplate.replace(
    /\{(date|dpi|ext|format|name|scale|theme|time)\}/gu,
    (_match, token: string) => replacements[token] ?? '',
  );
  const safe = sanitizeFileName(expanded) || `${sanitizeFileName(sourceName)}.${settings.format}`;
  return safe.toLowerCase().endsWith(`.${settings.format}`)
    ? safe
    : `${safe}.${settings.format}`;
}

export function sanitizeFileName(value: string): string {
  return Array.from(value, (character) => (character.charCodeAt(0) < 32 ? '-' : character))
    .join('')
    .replace(/[<>:"/\\|?*]/gu, '-')
    .replace(/\s+/gu, ' ')
    .replace(/\.{2,}/gu, '.')
    .replace(/^[ .]+/gu, '')
    .replace(/[ .]+$/gu, '')
    .trim()
    .slice(0, 220);
}

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && EXPORT_FORMATS.some((format) => format === value);
}

function isDiagramTheme(value: unknown): value is DiagramTheme {
  return typeof value === 'string' && DIAGRAM_THEMES.has(value as DiagramTheme);
}

function isCssHexColor(value: string): boolean {
  return /^#[\da-f]{6}$/iu.test(value);
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, minimum), maximum);
}

function fileStem(fileName: string): string {
  const leaf = fileName.replaceAll('\\', '/').split('/').pop() ?? fileName;
  return leaf.replace(/\.(?:mmd|mermaid)$/iu, '') || 'diagram';
}

function fileExtension(fileName: string): string {
  const match = /\.([^.]+)$/u.exec(fileName);
  return match?.[1]?.toLowerCase() ?? '';
}

function localDate(value: Date): string {
  return [value.getFullYear(), value.getMonth() + 1, value.getDate()]
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0')))
    .join('-');
}

function localTime(value: Date): string {
  return [value.getHours(), value.getMinutes(), value.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
}

function formatScale(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', '_');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
