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
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>${title}</title>
  <link rel="stylesheet" href="${options.styleUri}">
</head>
<body>
  <header class="toolbar" aria-label="Commandes de l’aperçu Mermaid">
    <div class="toolbar__group toolbar__group--primary">
      <button class="button button--source" id="open-source" type="button" title="Ouvrir le texte à côté (E)">
        <span aria-hidden="true">&lt;/&gt;</span>
        <span>Source</span>
      </button>
      <span class="divider" aria-hidden="true"></span>
      <button class="button button--icon" id="zoom-out" type="button" title="Réduire (−)" aria-label="Réduire">−</button>
      <button class="button button--zoom" id="fit" type="button" title="Ajuster le diagramme (0)">Ajuster</button>
      <button class="button button--icon" id="zoom-in" type="button" title="Agrandir (+)" aria-label="Agrandir">+</button>
    </div>
    <div class="toolbar__group">
      <span class="offline-badge" title="Mermaid est embarqué dans l’extension ; aucune connexion n’est utilisée">
        <span class="offline-badge__dot" aria-hidden="true"></span>
        Local
      </span>
      <button class="button button--quiet" id="copy-svg" type="button" disabled>Copier SVG</button>
      <button class="button button--quiet" id="save-svg" type="button" disabled>Enregistrer SVG</button>
    </div>
  </header>

  <main id="viewport" class="viewport" tabindex="0" aria-label="Aperçu du diagramme Mermaid">
    <section id="empty-state" class="state-card">
      <div class="state-card__mark" aria-hidden="true">M</div>
      <h1>Diagramme vide</h1>
      <p>Ouvrez la source et commencez par <code>flowchart LR</code>.</p>
      <button class="button button--accent" id="empty-open-source" type="button">Ouvrir la source</button>
    </section>

    <section id="loading-state" class="state-card state-card--compact" hidden aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <span>Rendu local…</span>
    </section>

    <section id="error-state" class="error-card" hidden role="alert">
      <div class="error-card__heading">
        <span class="error-card__icon" aria-hidden="true">!</span>
        <div>
          <h1>Mermaid ne peut pas rendre ce fichier</h1>
          <p>Corrigez la source : l’aperçu se mettra à jour automatiquement.</p>
        </div>
      </div>
      <pre id="error-message"></pre>
      <button class="button button--accent" id="error-open-source" type="button">Corriger la source</button>
    </section>

    <div id="diagram" class="diagram" hidden></div>
  </main>

  <footer class="statusbar">
    <span id="file-name">Mermaid</span>
    <span class="statusbar__spacer"></span>
    <span id="render-status" role="status" aria-live="polite">Prêt</span>
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
