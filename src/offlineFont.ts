import offlineFontDataUrl from 'katex/dist/fonts/KaTeX_SansSerif-Regular.woff2';

export const OFFLINE_FONT_FAMILY = 'Mermaid Offline Sans';
export const OFFLINE_FONT_STACK = `"${OFFLINE_FONT_FAMILY}", sans-serif`;

let fontReady: Promise<void> | undefined;

export function installOfflineFont(): Promise<void> {
  fontReady ??= loadOfflineFont();
  return fontReady;
}

export function offlineFontFaceCss(): string {
  return `@font-face{font-family:"${OFFLINE_FONT_FAMILY}";` +
    `src:url("${offlineFontDataUrl}") format("woff2");font-style:normal;font-weight:400;}`;
}

async function loadOfflineFont(): Promise<void> {
  if (!document.querySelector('style[data-mermaid-offline-font]')) {
    const style = document.createElement('style');
    style.dataset.mermaidOfflineFont = 'true';
    style.textContent = offlineFontFaceCss();
    document.head.append(style);
  }
  if ('fonts' in document) {
    await document.fonts.load(`16px "${OFFLINE_FONT_FAMILY}"`);
  }
}
