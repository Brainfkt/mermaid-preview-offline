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
    `img-src ${options.cspSource} data:`,
    `style-src ${options.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${options.nonce}'`,
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
      <button class="button button--layout" id="editor-layout" type="button" title="Editor layout: Preview only" aria-label="Choose editor layout">
        ${icon('layout')}
        <span id="editor-layout-label">Preview</span>
      </button>
      <span class="divider" aria-hidden="true"></span>
      <button class="button button--icon button--zoom-step" id="zoom-out" type="button" title="Zoom out (−)" aria-label="Zoom out">−</button>
      <button class="button button--zoom" id="fit" type="button" title="Fit diagram (0)">Fit</button>
      <button class="button button--icon button--zoom-step" id="zoom-in" type="button" title="Zoom in (+)" aria-label="Zoom in">+</button>
      <span class="divider" aria-hidden="true"></span>
      <button class="button button--icon button--refresh" id="refresh" type="button" title="Refresh diagram (R)" aria-label="Refresh diagram">
        ${icon('refresh')}
      </button>
      <label class="button button--icon theme-picker" id="theme-picker" title="Diagram theme: Adaptive" aria-label="Diagram theme: Adaptive">
        ${icon('palette')}
        <select id="diagram-theme" aria-label="Diagram color theme">
          <option value="adaptive">Adaptive</option>
          <option value="default">Default</option>
          <option value="dark">Dark</option>
          <option value="forest">Forest</option>
          <option value="neutral">Neutral</option>
          <option value="base">Base</option>
        </select>
      </label>
      <span class="divider" aria-hidden="true"></span>
      <button class="button button--quiet" id="copy-svg" type="button" disabled>Copy SVG</button>
      <button class="button button--quiet" id="save-svg" type="button" disabled>Save SVG</button>
      <span class="metadata-chip" id="large-file-label" hidden></span>
      <span class="divider" aria-hidden="true"></span>
      <button class="button button--icon" id="fullscreen" type="button" title="Toggle full screen" aria-label="Toggle full screen">
        ${icon('fullscreen')}
      </button>
    </div>
  </header>

  <main id="workspace" class="workspace">
    <section id="viewport" class="viewport" tabindex="0" aria-label="Mermaid diagram preview">
      <section id="empty-state" class="state-card glass-surface">
        <div class="state-card__mark" aria-hidden="true">M</div>
        <h1>Empty diagram</h1>
        <p>Open the source and start with <code>flowchart LR</code>.</p>
        <button class="button button--accent" id="empty-open-source" type="button">Open source</button>
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

  <footer class="statusbar">
    <span id="file-name">Mermaid</span>
    <span id="file-size">0 B</span>
    <span id="diagram-size">—</span>
    <span class="statusbar__spacer"></span>
    <span id="render-status" role="status" aria-live="polite">Ready</span>
    <span id="zoom-status">100 %</span>
  </footer>

  <script nonce="${options.nonce}" src="${options.scriptUri}"></script>
</body>
</html>`;
}

function icon(name: 'fullscreen' | 'layout' | 'palette' | 'refresh'): string {
  const paths: Record<typeof name, string> = {
    fullscreen: '<path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4"/>',
    layout: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 10h17M11 10v10"/>',
    palette:
      '<path d="M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a2 2 0 0 1 0-4h2.5A6.5 6.5 0 0 0 21 7.5C21 5 17 3 12 3Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="6.8" r="1"/><circle cx="14" cy="6.5" r="1"/><circle cx="17.2" cy="9" r="1"/>',
    refresh: '<path d="M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.4-2.6L20 9M4 15l2.5 2.6A7 7 0 0 0 17.9 15"/>',
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
