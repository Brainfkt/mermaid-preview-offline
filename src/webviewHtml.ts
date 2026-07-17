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
    <div class="toolbar__group toolbar__group--primary">
      <button class="button button--source" id="open-source" type="button" title="Open source to the side (E)" aria-pressed="false">
        <span aria-hidden="true">&lt;/&gt;</span>
        <span>Source</span>
      </button>
      <span class="divider" aria-hidden="true"></span>
      <button class="button button--icon" id="zoom-out" type="button" title="Zoom out (−)" aria-label="Zoom out">−</button>
      <button class="button button--zoom" id="fit" type="button" title="Fit diagram (0)">Fit</button>
      <button class="button button--icon" id="zoom-in" type="button" title="Zoom in (+)" aria-label="Zoom in">+</button>
    </div>
    <div class="toolbar__group">
      <span class="metadata-chip" id="large-file-label" hidden></span>
      <label class="theme-picker" title="Diagram color theme">
        <span class="theme-picker__label">Theme</span>
        <select id="diagram-theme" aria-label="Diagram color theme">
          <option value="adaptive">Adaptive</option>
          <option value="default">Default</option>
          <option value="dark">Dark</option>
          <option value="forest">Forest</option>
          <option value="neutral">Neutral</option>
          <option value="base">Base</option>
        </select>
      </label>
      <button class="button button--quiet button--refresh" id="refresh" type="button" title="Refresh diagram (R)">
        <span aria-hidden="true">↻</span>
        <span>Refresh</span>
      </button>
      <button class="button button--quiet" id="copy-svg" type="button" disabled>Copy SVG</button>
      <button class="button button--quiet" id="save-svg" type="button" disabled>Save SVG</button>
    </div>
  </header>

  <main id="viewport" class="viewport" tabindex="0" aria-label="Mermaid diagram preview">
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
  </main>

  <footer class="statusbar glass-surface">
    <span id="file-name">Mermaid</span>
    <span class="statusbar__spacer"></span>
    <span id="render-status" role="status" aria-live="polite">Ready</span>
    <span id="zoom-status">100 %</span>
  </footer>

  <script nonce="${options.nonce}" src="${options.scriptUri}"></script>
</body>
</html>`;
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
