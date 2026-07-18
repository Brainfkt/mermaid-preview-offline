# Changelog

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
