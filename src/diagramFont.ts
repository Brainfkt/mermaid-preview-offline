export const DIAGRAM_FONT_FAMILIES = ['vscode', 'noto-sans', 'inter'] as const;

export type DiagramFontFamily = (typeof DIAGRAM_FONT_FAMILIES)[number];

export const DEFAULT_DIAGRAM_FONT_FAMILY: DiagramFontFamily = 'vscode';
export const VSCODE_FONT_FALLBACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

const BUNDLED_FONT_STACKS: Record<Exclude<DiagramFontFamily, 'vscode'>, string> = {
  inter: '"Mermaid Offline Inter", sans-serif',
  'noto-sans': '"Mermaid Offline Noto Sans", sans-serif',
};

export function isDiagramFontFamily(value: unknown): value is DiagramFontFamily {
  return typeof value === 'string' &&
    DIAGRAM_FONT_FAMILIES.some((fontFamily) => fontFamily === value);
}

export function normalizeDiagramFontFamily(value: unknown): DiagramFontFamily {
  return isDiagramFontFamily(value) ? value : DEFAULT_DIAGRAM_FONT_FAMILY;
}

/** Resolve a Mermaid-compatible CSS stack without depending on browser globals. */
export function resolveDiagramFontStack(
  fontFamily: DiagramFontFamily,
  vscodeFontFamily?: string,
): string {
  if (fontFamily !== 'vscode') {
    return BUNDLED_FONT_STACKS[fontFamily];
  }
  return safeVsCodeFontStack(vscodeFontFamily) ?? VSCODE_FONT_FALLBACK;
}

function safeVsCodeFontStack(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 512 || /[;{}<>]/u.test(normalized)) {
    return undefined;
  }
  return normalized;
}
