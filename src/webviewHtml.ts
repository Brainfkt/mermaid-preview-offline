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
      <button class="button button--icon button--source" id="open-source" type="button" title="Open source in this editor group (E)" aria-label="Open source in this editor group" aria-pressed="false">
        ${icon('code')}
      </button>
      <label class="button view-picker" id="view-picker" title="View mode: Preview only">
        <select id="view-mode" aria-label="Preview and source layout">
          <option value="preview">Preview only</option>
          <option value="split">Split source and preview</option>
          <option value="source">Source only</option>
        </select>
      </label>
      <button class="button button--icon" id="split-orientation" type="button" title="Place source beside preview" aria-label="Place source beside preview">
        ${icon('split')}
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
    </div>
  </header>

  <main id="workspace" class="workspace workspace--preview workspace--vertical">
    <section id="source-pane" class="source-pane" aria-label="Mermaid source editor">
      <textarea id="source-editor" aria-label="Mermaid source" autocomplete="off" autocapitalize="off" spellcheck="false" wrap="off"></textarea>
    </section>
    <div id="splitter" class="splitter" role="separator" aria-label="Resize source and preview" aria-valuemin="20" aria-valuemax="80" aria-valuenow="50" tabindex="0"></div>
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
  </main>

  <footer class="statusbar">
    <span id="file-name">Mermaid</span>
    <span class="statusbar__spacer"></span>
    <span id="render-status" role="status" aria-live="polite">Ready</span>
    <span id="zoom-status">100 %</span>
  </footer>

  <script nonce="${options.nonce}" src="${options.scriptUri}"></script>
</body>
</html>`;
}

function icon(name: 'code' | 'palette' | 'refresh' | 'split'): string {
  const paths: Record<typeof name, string> = {
    code: '<path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14"/>',
    palette:
      '<path d="M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a2 2 0 0 1 0-4h2.5A6.5 6.5 0 0 0 21 7.5C21 5 17 3 12 3Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="6.8" r="1"/><circle cx="14" cy="6.5" r="1"/><circle cx="17.2" cy="9" r="1"/>',
    refresh: '<path d="M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.4-2.6L20 9M4 15l2.5 2.6A7 7 0 0 0 17.9 15"/>',
    split: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M11 5v14"/>',
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
