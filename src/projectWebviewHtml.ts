import { createNonce } from './webviewHtml';

export interface ProjectWebviewHtmlOptions {
  cspSource: string;
  nonce?: string;
  scriptUri: string;
  styleUri: string;
  title: string;
}

export function createGalleryWebviewHtml(options: ProjectWebviewHtmlOptions): string {
  const nonce = options.nonce ?? createNonce();
  return page(options, nonce, `
    <div class="studio" id="project-gallery">
      <header class="studio__header">
        <div class="studio__identity">
          <span class="studio__mark" aria-hidden="true">M</span>
          <div>
            <h1>Diagram Studio</h1>
            <p>Start from a local template or explore every bundled Mermaid example.</p>
          </div>
        </div>
        <nav class="segmented" aria-label="Diagram Studio sections">
          <button class="segmented__button is-active" id="templates-tab" type="button">Templates</button>
          <button class="segmented__button" id="examples-tab" type="button">Examples</button>
        </nav>
      </header>

      <main class="studio__main">
        <section class="catalog" aria-label="Diagram catalog">
          <div class="catalog__tools">
            <label class="search-field">
              <span class="search-field__icon" aria-hidden="true">⌕</span>
              <input id="catalog-search" type="search" placeholder="Search templates" autocomplete="off">
            </label>
            <span class="catalog__count" id="catalog-count">0 items</span>
          </div>
          <div class="category-filter" id="category-filter" aria-label="Categories"></div>
          <div class="catalog__grid" id="catalog-grid" aria-live="polite"></div>
          <section class="catalog-empty" id="catalog-empty" hidden>
            <h2>No matching diagrams</h2>
            <p>Try another name or category.</p>
          </section>
        </section>

        <aside class="inspector" id="template-inspector" aria-label="Selected diagram">
          <div class="inspector__heading">
            <div>
              <span class="inspector__category" id="inspector-category">Template</span>
              <h2 id="inspector-title">Choose a starting point</h2>
              <p id="inspector-description">Select a card to customize it and create a Mermaid file.</p>
            </div>
            <button class="button button--subtle" id="reset-template" type="button" hidden>Reset</button>
          </div>

          <div class="inspector-preview" id="inspector-preview" aria-label="Live Mermaid preview">
            <div class="preview-placeholder" id="preview-placeholder">Select a diagram</div>
            <div class="mermaid-surface" id="inspector-diagram" hidden></div>
            <div class="render-error" id="inspector-error" hidden></div>
          </div>

          <form class="customizer" id="template-form">
            <div class="customizer__fields" id="template-fields"></div>
            <div class="create-row">
              <label class="field file-field">
                <span>File name</span>
                <input id="template-file-name" type="text" value="diagram.mmd" disabled>
              </label>
              <button class="button button--primary" id="create-diagram" type="submit" disabled>Create diagram…</button>
            </div>
            <label class="field field--wide source-field">
              <span>Mermaid source</span>
              <textarea id="template-source" rows="7" spellcheck="false" disabled></textarea>
            </label>
          </form>
        </aside>
      </main>
    </div>`);
}

export function createVisualDiffWebviewHtml(options: ProjectWebviewHtmlOptions): string {
  const nonce = options.nonce ?? createNonce();
  return page(options, nonce, `
    <div class="visual-diff" id="visual-diff">
      <header class="diff-header">
        <div>
          <h1 id="diff-title">Visual Git diff</h1>
          <p id="diff-subtitle">Compare rendered Mermaid diagrams, not only source lines.</p>
        </div>
        <div class="segmented" aria-label="Visual comparison mode">
          <button class="segmented__button is-active" id="side-by-side-mode" type="button">Side by side</button>
          <button class="segmented__button" id="overlay-mode" type="button">Overlay</button>
        </div>
      </header>

      <section class="diff-summary" aria-label="Source change summary">
        <span class="diff-summary__item diff-summary__item--added"><strong id="diff-added">0</strong> added</span>
        <span class="diff-summary__item diff-summary__item--changed"><strong id="diff-changed">0</strong> changed</span>
        <span class="diff-summary__item diff-summary__item--removed"><strong id="diff-removed">0</strong> removed</span>
        <span class="diff-summary__spacer"></span>
        <label class="zoom-control">Zoom <input id="diff-zoom" type="range" min="50" max="180" value="100"><span id="diff-zoom-value">100%</span></label>
      </section>

      <main class="diff-workspace">
        <section class="diff-grid" id="diff-grid">
          <article class="diff-pane">
            <header class="diff-pane__header">
              <span class="revision-dot revision-dot--before" aria-hidden="true"></span>
              <div><strong>Before</strong><span id="before-label">Previous version</span></div>
            </header>
            <div class="diff-canvas" id="before-canvas"><div class="mermaid-surface" id="before-diagram"></div><div class="render-error" id="before-error" hidden></div></div>
          </article>
          <article class="diff-pane">
            <header class="diff-pane__header">
              <span class="revision-dot revision-dot--after" aria-hidden="true"></span>
              <div><strong>After</strong><span id="after-label">Current version</span></div>
            </header>
            <div class="diff-canvas" id="after-canvas"><div class="mermaid-surface" id="after-diagram"></div><div class="render-error" id="after-error" hidden></div></div>
          </article>
        </section>

        <section class="overlay-view" id="overlay-view" hidden>
          <div class="overlay-canvas">
            <div class="mermaid-surface overlay-layer overlay-layer--before" id="overlay-before"></div>
            <div class="mermaid-surface overlay-layer overlay-layer--after" id="overlay-after"></div>
          </div>
          <label class="opacity-control">After visibility <input id="overlay-opacity" type="range" min="0" max="100" value="55"><span id="overlay-opacity-value">55%</span></label>
        </section>
      </main>
    </div>`);
}

function page(options: ProjectWebviewHtmlOptions, nonce: string, body: string): string {
  const csp = [
    "default-src 'none'",
    `img-src ${options.cspSource} data: blob:`,
    `style-src ${options.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
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
<body>${body}<script nonce="${nonce}" src="${options.scriptUri}"></script></body>
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
