import interLatinExtDataUrl from './font-assets/inter-latin-ext-400-normal.woff2';
import interLatinDataUrl from './font-assets/inter-latin-400-normal.woff2';
import notoSansLatinExtDataUrl from './font-assets/noto-sans-latin-ext-400-normal.woff2';
import notoSansLatinDataUrl from './font-assets/noto-sans-latin-400-normal.woff2';

import {
  normalizeDiagramFontFamily,
  resolveDiagramFontStack,
  type DiagramFontFamily,
} from './diagramFont';

const LATIN_UNICODE_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,' +
  'U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,' +
  'U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT_UNICODE_RANGE =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,' +
  'U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,' +
  'U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

interface BundledFontDefinition {
  family: string;
  latin: string;
  latinExt: string;
}

const BUNDLED_FONTS: Record<Exclude<DiagramFontFamily, 'vscode'>, BundledFontDefinition> = {
  inter: {
    family: 'Mermaid Offline Inter',
    latin: interLatinDataUrl,
    latinExt: interLatinExtDataUrl,
  },
  'noto-sans': {
    family: 'Mermaid Offline Noto Sans',
    latin: notoSansLatinDataUrl,
    latinExt: notoSansLatinExtDataUrl,
  },
};

export function diagramFontFaceCss(value: unknown): string {
  const fontFamily = normalizeDiagramFontFamily(value);
  if (fontFamily === 'vscode') {
    return '';
  }
  const definition = BUNDLED_FONTS[fontFamily];
  return [
    fontFaceRule(definition.family, definition.latinExt, LATIN_EXT_UNICODE_RANGE),
    fontFaceRule(definition.family, definition.latin, LATIN_UNICODE_RANGE),
  ].join('');
}

export function resolvedDiagramFontStack(value: unknown): string {
  const fontFamily = normalizeDiagramFontFamily(value);
  return resolveDiagramFontStack(fontFamily, resolvedVsCodeFontFamily());
}

export async function installDiagramFont(value: unknown): Promise<void> {
  const fontFamily = normalizeDiagramFontFamily(value);
  let style = document.querySelector<HTMLStyleElement>('style[data-mermaid-diagram-font]');
  if (!style) {
    style = document.createElement('style');
    style.dataset.mermaidDiagramFont = 'true';
    document.head.append(style);
  }
  const stack = resolvedDiagramFontStack(fontFamily);
  style.textContent = `${diagramFontFaceCss(fontFamily)}` +
    `svg text,svg tspan,svg foreignObject,svg foreignObject *{` +
    `font-family:${stack}!important;}`;

  if (fontFamily === 'vscode' || !('fonts' in document)) {
    return;
  }
  const definition = BUNDLED_FONTS[fontFamily];
  await document.fonts.load(
    `400 16px "${definition.family}"`,
    'Échéance · coût · façade · cœur · Œuvre · Łódź',
  );
}

function resolvedVsCodeFontFamily(): string | undefined {
  const candidates = [document.body, document.documentElement];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const configured = getComputedStyle(candidate)
      .getPropertyValue('--vscode-font-family')
      .trim();
    if (configured) return configured;
  }
  return undefined;
}

function fontFaceRule(family: string, dataUrl: string, unicodeRange: string): string {
  return `@font-face{font-family:"${family}";src:url("${dataUrl}") format("woff2");` +
    `font-style:normal;font-weight:400;font-display:block;unicode-range:${unicodeRange};}`;
}
