import {
  createNonce,
  customSurfaceSwatch,
  surfaceSwatch,
  themeCard,
} from './webviewHtml';

export interface DocumentationWebviewHtmlOptions {
  cspSource: string;
  nonce?: string;
  scriptUri: string;
  styleUri: string;
  title: string;
}

export function createDocumentationWebviewHtml(
  options: DocumentationWebviewHtmlOptions,
): string {
  const nonce = options.nonce ?? createNonce();
  const csp = [
    "default-src 'none'",
    `img-src ${options.cspSource} data: blob:`,
    `style-src ${options.cspSource} 'unsafe-inline'`,
    'font-src data:',
    `script-src ${options.cspSource} 'nonce-${nonce}'`,
    "connect-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
  ].join('; ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>${escapeHtml(options.title)}</title>
  <link rel="stylesheet" href="${options.styleUri}">
</head>
<body>
  <div class="documentation-preview" id="documentation-preview">
    <main class="documentation-list" id="documentation-list" aria-live="polite"></main>
    <section class="documentation-empty" id="documentation-empty" hidden>
      <span aria-hidden="true">◇</span>
      <h2>No Mermaid blocks found</h2>
      <p>Place the cursor inside a Mermaid block or add a fenced Mermaid diagram to this document.</p>
    </section>
    <button class="documentation-present" id="documentation-present" type="button" title="Present diagrams" aria-label="Present diagrams" hidden>
      ${presentationIcon()}
      <span>Present</span>
    </button>
    <div class="presentation-theme-control" id="presentation-theme-control" hidden>
      <button class="presentation-theme-button" id="presentation-theme" type="button" title="Choose diagram appearance" aria-label="Choose diagram appearance" aria-expanded="false">
        ${paletteIcon()}
      </button>
      <section class="presentation-theme-menu glass-surface" id="presentation-theme-menu" aria-label="Diagram appearance" hidden>
        <header class="appearance-popover__header">
          <div><strong>Appearance</strong><span>Shared by previews in this workspace</span></div>
          <button class="presentation-appearance-close" id="presentation-appearance-close" type="button" aria-label="Close appearance picker">×</button>
        </header>
        <p class="appearance-section-label">Diagram style</p>
        <div class="theme-gallery" id="presentation-theme-grid">
          ${themeCard('adaptive', 'Adaptive', 'adaptive')}
          ${themeCard('default', 'Default', 'default')}
          ${themeCard('dark', 'Dark', 'dark')}
          ${themeCard('forest', 'Forest', 'forest')}
          ${themeCard('neutral', 'Neutral', 'neutral')}
          ${themeCard('base', 'Base', 'base')}
          ${themeCard('neo', 'Neo', 'neo')}
          ${themeCard('neo-dark', 'Neo Dark', 'neo-dark')}
          ${themeCard('redux-color', 'Vibrant', 'redux-color')}
          ${themeCard('redux-dark-color', 'Vibrant Dark', 'redux-dark-color')}
          ${themeCard('sketch', 'Sketch', 'sketch')}
        </div>
        <div class="appearance-row">
          <div>
            <p class="appearance-section-label">Density</p>
            <div class="segmented-control" id="presentation-density-picker">
              <button type="button" data-density="compact">Compact</button>
              <button type="button" data-density="comfortable">Comfortable</button>
              <button type="button" data-density="spacious">Spacious</button>
            </div>
          </div>
          <div>
            <p class="appearance-section-label">Pattern</p>
            <div class="segmented-control" id="presentation-pattern-picker">
              <button type="button" data-pattern="none">None</button>
              <button type="button" data-pattern="dots">Dots</button>
              <button type="button" data-pattern="grid">Grid</button>
            </div>
          </div>
        </div>
        <p class="appearance-section-label">Canvas background</p>
        <div class="surface-picker" id="presentation-surface-picker">
          ${surfaceSwatch('editor', '', 'Follow VS Code')}
          ${surfaceSwatch('white', '#ffffff', 'White')}
          ${surfaceSwatch('paper', '#faf9f6', 'Paper')}
          ${surfaceSwatch('soft-gray', '#f3f4f6', 'Soft gray')}
          ${surfaceSwatch('soft-blue', '#eff6ff', 'Soft blue')}
          ${surfaceSwatch('soft-rose', '#fdf2f8', 'Soft rose')}
          ${surfaceSwatch('slate', '#1e293b', 'Slate')}
          ${surfaceSwatch('midnight', '#0f172a', 'Midnight')}
          ${customSurfaceSwatch('presentation-surface-custom-color')}
        </div>
      </section>
    </div>
    <div class="presentation-controls" id="presentation-controls" hidden>
      <span id="presentation-counter">1 / 1</span>
      <button id="presentation-previous" type="button" title="Previous diagram" aria-label="Previous diagram">←</button>
      <button id="presentation-next" type="button" title="Next diagram" aria-label="Next diagram">→</button>
      <button id="presentation-exit" type="button" title="Exit presentation">Esc</button>
    </div>
  </div>
  <script type="module" nonce="${nonce}" src="${options.scriptUri}"></script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/gu, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] ?? character);
}

function presentationIcon(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 4.75h16v11.5H4zM8.5 20l3.5-3.75L15.5 20M2.75 4.75h18.5"/>
  </svg>`;
}

function paletteIcon(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3.25a8.75 8.75 0 1 0 0 17.5h1.25a1.75 1.75 0 0 0 0-3.5h-.5a1.5 1.5 0 0 1 0-3H15A5.75 5.75 0 0 0 15 3.25z"/>
    <circle cx="7.5" cy="10" r=".8"/><circle cx="9.5" cy="6.8" r=".8"/><circle cx="13.2" cy="6.3" r=".8"/>
  </svg>`;
}
