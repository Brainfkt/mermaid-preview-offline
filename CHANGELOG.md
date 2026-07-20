# Changelog

## 1.0.0

- added local SQL schema to Mermaid ERD generation, including quoted names,
  primary and foreign keys, composite constraints, comments, and focused input
  errors;
- added deterministic `package.json` dependency graph generation for runtime,
  development, peer, and optional dependencies;
- added a bilingual, one-time Marketplace review invitation after five
  successful preview sessions;
- split the four browser renderers into shared ES modules and lazy-loaded
  ZenUML, Mermaid diagram implementations, and the two offline icon packs;
- removed duplicate parse/render passes and duplicate visual-diff renders, and
  paused hidden file and documentation previews until they become visible;
- bounded large-source rendering, local image work, documentation exports,
  raster canvas memory, and worst-case visual/source diff algorithms;
- embedded a deterministic local font in optimized SVG, PNG, WebP, and PDF
  exports for stable text metrics across macOS, Windows, and Linux;
- completed and localized the user guide, documented every command and setting,
  and added a prioritized 36-shot README and user-guide capture plan;
- replaced Marketplace-relative README links with absolute GitHub and raw-file
  URLs so documentation and images resolve correctly from the extension page.

## 0.7.0

- added a focused preview for the Mermaid block under the cursor in Markdown,
  MDX, and AsciiDoc documents;
- added a live document view that renders every Mermaid block locally and
  updates as the source document changes;
- added direct navigation from each rendered diagram to its exact source block;
- added Markdown and MDX fenced-block support, including backtick, tilde, and
  attribute-style Mermaid fences;
- added AsciiDoc `[mermaid]` and `[source,mermaid]` listing-block support;
- added documentation export that replaces Mermaid source blocks with optimized
  SVG or configurable PNG images stored beside the exported document.

## 0.6.0

- added Diagram Studio, an offline template gallery for creating new Mermaid
  diagrams from eight customizable professional starting points;
- added a searchable visual explorer for all 43 bundled Mermaid examples;
- added live template fields, editable Mermaid source, file-name customization,
  and immediate local preview before creating a file;
- added visual Git comparison between any available revision and the working
  tree, with source-change statistics and synchronized zoom;
- added side-by-side and color-coded overlay modes for rendered Git revisions;
- added a visual preview command for the two sides of VS Code text diff editors.

## 0.5.0

- added a professional export dialog with a live result preview and reusable
  export profiles;
- added PNG, WebP, and single-page PDF output alongside original and optimized
  SVG export;
- added direct PNG clipboard copy, configurable DPI, scale, margin, transparent
  or colored backgrounds, and export themes independent from VS Code;
- added automatic SVG optimization and source metadata in SVG, PNG, WebP, and
  PDF outputs;
- added configurable file name templates with name, format, theme, scale, DPI,
  date, time, and source-extension tokens;
- added recursive folder export that preserves the source directory structure;
- added the `mermaidPreviewOffline.export` command and the `mermaid-export`
  VS Code task type;
- added the short `mpo` Node.js CLI, which renders locally through
  an installed Chrome, Chromium, or Edge browser.

## 0.4.0

- replaced the embedded source textarea with four workspace-persistent native
  VS Code layouts: Preview, Source, Beside, and Above;
- kept full Mermaid completion, formatting, snippets, refactors, and diagnostics
  available in Beside and Above through the real text editor;
- added the four layout actions to the Mermaid Explorer context menu and stored
  native split proportions per file;
- made Beside and Above follow the active Mermaid source tab, reuse the existing
  editor groups, and remove duplicate source or preview instances;
- made the final source/preview pair close together when either tab is closed;
- expanded the diagram canvas beneath the header and footer, with an always
  visible translucent glass toolbar over zoomed diagrams;
- added an optional bottom-right minimap for diagrams larger than the viewport,
  including click-and-drag navigation;
- added editor-group full screen;
- added exact UTF-8 file size and natural rendered diagram dimensions to the
  preview footer.
- recognized `flowchart-elk` and `info` in diagnostics, completion, hover help,
  formatting, refactors, and syntax highlighting.

## 0.3.0

- added native Mermaid diagnostics to VS Code Problems with editor underlines
  and quick fixes for common declaration, arrow, identifier, and block errors;
- added Mermaid keyword completion, contextual hover documentation, and 43
  diagram-family snippets;
- added document formatting, node/link insertion, missing-ID generation, and
  diagram-wide identifier renaming;
- added an editable source pane with preview-only, source-only, and split modes,
  horizontal or vertical placement, and a persistent draggable ratio;
- made `vX.Y.Z` tags automatically publish the matching version to both GitHub
  Releases and the VS Code Marketplace using the existing secretless Entra OIDC
  identity.
- kept Mermaid parsing inside the browser-backed webview so native diagnostics
  never invoke DOMPurify from the DOM-less VS Code extension host.

## 0.2.2

- compacted the preview toolbar and aligned its controls to the left in the
  Source, zoom, refresh, theme, and SVG action order;
- replaced the Source, Refresh, and Theme labels with accessible icons;
- simplified the footer to unframed monospace status text;
- changed Source so it opens as a text tab in the current editor group instead
  of splitting the editor;
- kept **Open Preview to the Side** available from the Mermaid file context
  menu for an explicit split-view workflow;
- made the selected diagram theme persistent and synchronized across every
  Mermaid preview in the workspace.

## 0.2.1

- refreshed the extension package with the same transparent icon displayed in
  the README.
- redesigned the Marketplace README with clearer feature, compatibility,
  security, and onboarding sections;
- added authentic VS Code screenshots for live preview and bundled icon packs.
- restored zoom, scroll position, diagram theme, and Source mode per preview;
- added preview-to-the-side and default-editor commands to the Explorer menu;
- added automatic and manual refresh modes with configurable debounce;
- added detailed syntax locations, source excerpts, and a Retry action;
- cancelled obsolete render requests and added adaptive handling for large files;
- added Adaptive, Default, Dark, Forest, Neutral, and Base diagram themes;
- refreshed the preview with a minimal glass interface and removed the redundant
  Local badge;
- added multi-root and remote-workspace safeguards;
- added cross-platform CI and 129 visual regression renders covering all 43
  examples in light, dark, and high-contrast themes.

## 0.2.0

- bundled the official ZenUML diagram plug-in for offline rendering;
- bundled the Iconify `logos` and `material-icon-theme` icon collections;
- embedded relative workspace images as data URIs in rendered and exported SVGs;
- added validated examples and an updated compatibility matrix for the new
  offline capabilities.
- made the local-image example self-contained and the icon-pack example visually
  explicit.
- removed ZenUML's unavailable absolute font URL from the offline webview bundle.

## 0.1.1

- added the official Mermaid logo and a matching Marketplace banner;
- rewrote the Marketplace listing in English with clearer installation, privacy,
  feature, and supported-diagram information;
- improved Marketplace categories and discovery keywords;
- translated all extension commands, preview controls, messages, and errors to
  English;
- added Mermaid logo attribution and third-party licensing information.

## 0.1.0

- opened `.mmd` and `.mermaid` files in the preview by default;
- bundled the Mermaid renderer for strictly local operation;
- added live updates, syntax errors, zoom, pan, SVG copy, and SVG export;
- added VS Code theme support, keyboard navigation, and Mermaid syntax highlighting.
