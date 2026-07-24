import { randomBytes } from 'node:crypto';

export interface WebviewHtmlOptions {
  cspSource: string;
  nonce: string;
  scriptUri: string;
  styleUri: string;
  title: string;
}

export function createNonce(): string {
  return randomBytes(18).toString('base64url');
}

export function createWebviewHtml(options: WebviewHtmlOptions): string {
  const title = escapeHtml(options.title);
  const csp = [
    "default-src 'none'",
    `img-src ${options.cspSource} data: blob:`,
    `style-src ${options.cspSource} 'unsafe-inline'`,
    'font-src data:',
    `script-src ${options.cspSource} 'nonce-${options.nonce}'`,
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
  <title>${title}</title>
  <link rel="stylesheet" href="${options.styleUri}">
</head>
<body>
  <header class="toolbar glass-surface" aria-label="Mermaid preview controls">
    <div class="toolbar__group">
      <button class="button button--layout button--collapse-second" id="editor-layout" type="button" title="Editor layout: Preview only" aria-label="Choose editor layout">
        ${icon('layout')}
        <span class="button__label" id="editor-layout-label">Preview</span>
      </button>
      <span class="divider" aria-hidden="true"></span>
      <div class="toolbar__group toolbar__navigation" id="diagram-navigation-controls">
        <button class="button button--icon button--zoom-step" id="zoom-out" type="button" title="Zoom out (−)" aria-label="Zoom out">−</button>
        <button class="button button--zoom button--labeled-icon button--collapse-third" id="fit" type="button" title="Fit diagram (0)" aria-label="Fit diagram">
          ${icon('fit')}
          <span class="button__label">Fit</span>
        </button>
        <button class="button button--icon button--zoom-step" id="zoom-in" type="button" title="Zoom in (+)" aria-label="Zoom in">+</button>
      </div>
      <span class="divider" aria-hidden="true"></span>
      <button class="button button--icon button--refresh" id="refresh" type="button" title="Refresh diagram (R)" aria-label="Refresh diagram">
        ${icon('refresh')}
      </button>
      <button class="button appearance-picker button--collapse-second" id="theme-picker" type="button" title="Diagram appearance: Adaptive" aria-label="Choose diagram appearance" aria-expanded="false">
        ${icon('palette')}
        <span class="button__label" id="appearance-label">Adaptive</span>
      </button>
      <button class="button button--icon" id="search-open" type="button" title="Find in diagram (/ or Ctrl/Cmd+F)" aria-label="Find in diagram">
        ${icon('search')}
      </button>
      <span class="divider" aria-hidden="true"></span>
      <button class="button button--quiet button--labeled-icon button--collapse-first" id="copy-svg" type="button" title="Copy original SVG" aria-label="Copy original SVG" disabled>
        ${icon('copy')}
        <span class="button__label">Copy SVG</span>
      </button>
      <button class="button button--quiet button--labeled-icon button--collapse-first" id="save-svg" type="button" title="Save original SVG" aria-label="Save original SVG" disabled>
        ${icon('save')}
        <span class="button__label">Save SVG</span>
      </button>
      <button class="button button--accent button--export button--collapse-second" id="export-open" type="button" title="Export diagram" aria-label="Export diagram" disabled>
        ${icon('export')}
        <span class="button__label">Export</span>
      </button>
      <span class="metadata-chip" id="large-file-label" hidden></span>
      <span class="divider" aria-hidden="true"></span>
      <button class="button button--icon" id="open-new-window" type="button" title="Open preview in a new window" aria-label="Open preview in a new window">
        ${icon('newWindow')}
      </button>
    </div>
  </header>

  <section class="appearance-popover glass-surface" id="appearance-popover" aria-label="Diagram appearance" hidden>
    <header class="appearance-popover__header">
      <div><strong>Appearance</strong><span>Shared by previews in this workspace</span></div>
      <button class="button button--icon" id="appearance-close" type="button" aria-label="Close appearance picker">×</button>
    </header>
    <p class="appearance-section-label">Diagram style</p>
    <div class="theme-gallery" id="theme-gallery">
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
        <div class="segmented-control" id="density-picker">
          <button type="button" data-density="compact">Compact</button>
          <button type="button" data-density="comfortable">Comfortable</button>
          <button type="button" data-density="spacious">Spacious</button>
        </div>
      </div>
      <div>
        <p class="appearance-section-label">Pattern</p>
        <div class="segmented-control" id="pattern-picker">
          <button type="button" data-pattern="none">None</button>
          <button type="button" data-pattern="dots">Dots</button>
          <button type="button" data-pattern="grid">Grid</button>
        </div>
      </div>
    </div>
    <p class="appearance-section-label">Canvas background</p>
    <div class="surface-picker" id="surface-picker">
      ${surfaceSwatch('editor', '', 'Follow VS Code')}
      ${surfaceSwatch('white', '#ffffff', 'White')}
      ${surfaceSwatch('paper', '#faf9f6', 'Paper')}
      ${surfaceSwatch('soft-gray', '#f3f4f6', 'Soft gray')}
      ${surfaceSwatch('soft-blue', '#eff6ff', 'Soft blue')}
      ${surfaceSwatch('soft-rose', '#fdf2f8', 'Soft rose')}
      ${surfaceSwatch('slate', '#1e293b', 'Slate')}
      ${surfaceSwatch('midnight', '#0f172a', 'Midnight')}
      <label class="surface-swatch surface-swatch--custom" title="Custom color">
        <input id="surface-custom-color" type="color" value="#ffffff" aria-label="Custom canvas color">
        <span>Custom</span>
      </label>
    </div>
  </section>

  <main id="workspace" class="workspace">
    <div class="diagram-search glass-surface" id="diagram-search" hidden>
      ${icon('search')}
      <input id="diagram-search-input" type="search" placeholder="Find a node or label" autocomplete="off" aria-label="Find in diagram">
      <span id="diagram-search-count" aria-live="polite"></span>
      <button class="button button--icon" id="diagram-search-previous" type="button" title="Previous match">↑</button>
      <button class="button button--icon" id="diagram-search-next" type="button" title="Next match">↓</button>
      <button class="button button--icon" id="diagram-search-close" type="button" title="Close search">×</button>
    </div>
    <section id="viewport" class="viewport" tabindex="0" aria-label="Mermaid diagram preview">
      <section id="empty-state" class="state-card glass-surface">
        <h1>Empty diagram</h1>
        <p>This Mermaid diagram is empty.</p>
        <div class="state-card__actions">
          <button class="button button--accent" id="empty-open-source" type="button">Open source</button>
          <button class="button" id="empty-open-gallery" type="button">Browse templates &amp; examples</button>
        </div>
      </section>

      <section id="loading-state" class="state-card state-card--compact glass-surface" hidden aria-live="polite">
        <span class="spinner" aria-hidden="true"></span>
        <span>Rendering…</span>
      </section>

      <section id="error-state" class="error-card glass-surface" hidden role="alert">
        <div class="error-card__heading">
          <span class="error-card__icon" aria-hidden="true">!</span>
          <div>
            <h1>Mermaid could not render this file</h1>
            <p id="error-help">Fix the source and refresh the preview.</p>
          </div>
        </div>
        <p class="error-card__location" id="error-location" hidden></p>
        <pre id="error-excerpt" hidden></pre>
        <details class="error-card__details">
          <summary>Technical details</summary>
          <pre id="error-message"></pre>
        </details>
        <div class="error-card__actions">
          <button class="button button--accent" id="error-open-source" type="button">Fix source</button>
          <button class="button" id="error-retry" type="button">Retry</button>
        </div>
      </section>

      <div id="diagram" class="diagram" hidden></div>
    </section>
    <aside id="minimap" class="minimap glass-surface" aria-label="Diagram minimap" title="Drag to navigate the diagram" hidden>
      <div id="minimap-diagram" class="minimap__diagram" aria-hidden="true"></div>
      <div id="minimap-window" class="minimap__window" aria-hidden="true"></div>
    </aside>
  </main>

  <dialog class="export-dialog glass-surface" id="export-dialog" aria-labelledby="export-title">
    <form class="export-panel" id="export-form" method="dialog">
      <header class="export-panel__header">
        <div>
          <h1 id="export-title">Professional export</h1>
          <p>Preview and export the current diagram with a reusable profile.</p>
        </div>
        <button class="button button--icon" id="export-close" type="button" aria-label="Close export dialog">×</button>
      </header>

      <div class="export-panel__body">
        <section class="export-preview" aria-label="Export preview">
          <div class="export-preview__canvas" id="export-preview-canvas">
            <img id="export-preview-image" alt="Preview of the exported Mermaid diagram">
            <span class="spinner" id="export-preview-spinner" aria-hidden="true"></span>
          </div>
          <p class="export-preview__metrics" id="export-preview-metrics">Preparing preview…</p>
          <p class="export-preview__error" id="export-preview-error" hidden></p>
        </section>

        <section class="export-controls" aria-label="Export settings">
          <div class="profile-row">
            <select id="export-profile" aria-label="Saved export profile">
              <option value="">Custom settings</option>
            </select>
            <input id="export-profile-name" type="text" maxlength="80" placeholder="Profile name" aria-label="Export profile name">
            <button class="button" id="export-profile-save" type="button">Save</button>
            <button class="button button--danger" id="export-profile-delete" type="button" disabled>Delete</button>
          </div>

          <div class="export-fields">
            <label class="field">
              <span>Format</span>
              <select id="export-format">
                <option value="png">PNG</option>
                <option value="webp">WebP</option>
                <option value="pdf">PDF</option>
                <option value="svg">SVG</option>
              </select>
            </label>
            <label class="field">
              <span>Export theme</span>
              <select id="export-theme">
                <option value="adaptive">Adaptive</option>
                <option value="default">Default</option>
                <option value="dark">Dark</option>
                <option value="forest">Forest</option>
                <option value="neutral">Neutral</option>
                <option value="base">Base</option>
                <option value="neo">Neo</option>
                <option value="neo-dark">Neo Dark</option>
                <option value="redux-color">Vibrant</option>
                <option value="redux-dark-color">Vibrant Dark</option>
                <option value="sketch">Sketch</option>
              </select>
            </label>
            <label class="field">
              <span>Scale factor</span>
              <input id="export-scale" type="number" min="0.25" max="8" step="0.25">
            </label>
            <label class="field">
              <span>Resolution (DPI)</span>
              <input id="export-dpi" type="number" min="72" max="600" step="1">
            </label>
            <label class="field">
              <span>Margin (px)</span>
              <input id="export-margin" type="number" min="0" max="512" step="1">
            </label>
            <label class="field">
              <span>Background</span>
              <select id="export-background">
                <option value="transparent">Transparent</option>
                <option value="color">Color</option>
                <option value="preview">Preview canvas</option>
              </select>
            </label>
            <label class="field field--color">
              <span>Background color</span>
              <input id="export-background-color" type="color" value="#ffffff">
            </label>
            <label class="field field--wide">
              <span>File name template</span>
              <input id="export-name-template" type="text" spellcheck="false" value="{name}-{theme}@{scale}x.{format}">
              <small>{name}, {format}, {theme}, {scale}, {dpi}, {date}, {time}, {ext}</small>
            </label>
          </div>

          <div class="export-options">
            <label><input id="export-optimize" type="checkbox" checked> Optimize SVG automatically</label>
            <label><input id="export-metadata" type="checkbox" checked> Include source metadata</label>
            <label><input id="export-svg-original" type="checkbox"> Export the original SVG unchanged</label>
          </div>
        </section>
      </div>

      <footer class="export-panel__footer">
        <div class="export-panel__copy-actions">
          <button class="button" id="export-copy-svg-original" type="button">Copy original SVG</button>
          <button class="button" id="export-copy-svg-optimized" type="button">Copy optimized SVG</button>
          <button class="button" id="export-copy-png" type="button">Copy PNG</button>
        </div>
        <div class="export-panel__save-actions">
          <button class="button" id="export-folder" type="button">Export folder…</button>
          <button class="button button--accent" id="export-save" type="button">Save export…</button>
        </div>
      </footer>
    </form>
  </dialog>

  <footer class="statusbar">
    <span id="file-name">Mermaid</span>
    <span id="file-size">0 B</span>
    <span id="diagram-size">—</span>
    <span class="statusbar__spacer"></span>
    <span id="render-status" role="status" aria-live="polite">Ready</span>
    <span id="zoom-status">100 %</span>
  </footer>

  <script type="module" nonce="${options.nonce}" src="${options.scriptUri}"></script>
</body>
</html>`;
}

function themeCard(value: string, label: string, variant: string): string {
  return `<button class="theme-card theme-card--${variant}" type="button" data-theme="${value}" aria-pressed="false"><span class="theme-card__preview"><i></i><i></i><i></i></span><span>${label}</span></button>`;
}

function surfaceSwatch(value: string, color: string, label: string): string {
  const style = color ? ` style="--swatch-color:${color}"` : '';
  return `<button class="surface-swatch surface-swatch--${value}" type="button" data-surface="${value}" title="${label}"${style}><i></i><span>${label}</span></button>`;
}

function icon(
  name: 'copy' | 'export' | 'fit' | 'layout' | 'newWindow' | 'palette' | 'refresh' | 'save' | 'search',
): string {
  const paths: Record<typeof name, string> = {
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    export: '<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M5 19h14"/>',
    fit: '<path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4"/>',
    layout: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 10h17M11 10v10"/>',
    palette:
      '<path d="M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a2 2 0 0 1 0-4h2.5A6.5 6.5 0 0 0 21 7.5C21 5 17 3 12 3Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="6.8" r="1"/><circle cx="14" cy="6.5" r="1"/><circle cx="17.2" cy="9" r="1"/>',
    refresh: '<path d="M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.4-2.6L20 9M4 15l2.5 2.6A7 7 0 0 0 17.9 15"/>',
    save: '<path d="M5 4h11l3 3v13H5Z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    newWindow: '<rect x="4" y="7" width="12" height="12" rx="2"/><path d="M12 4h8v8M20 4l-9 9"/>',
  };
  return `<svg class="button__icon" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">${paths[name]}</g></svg>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character] ?? character;
  });
}
