import { createNonce } from './webviewHtml';

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
    <header class="documentation-header">
      <div class="documentation-identity">
        <span class="documentation-mark" aria-hidden="true">M</span>
        <div>
          <h1 id="documentation-title">Mermaid documentation</h1>
          <p id="documentation-summary">Looking for Mermaid blocks…</p>
        </div>
      </div>
      <span class="documentation-format" id="documentation-format">Markdown</span>
    </header>
    <main class="documentation-list" id="documentation-list" aria-live="polite"></main>
    <section class="documentation-empty" id="documentation-empty" hidden>
      <span aria-hidden="true">◇</span>
      <h2>No Mermaid blocks found</h2>
      <p>Place the cursor inside a Mermaid block or add a fenced Mermaid diagram to this document.</p>
    </section>
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
