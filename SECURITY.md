# Security Policy

## Reporting a vulnerability

Do not disclose an exploitable vulnerability in a public issue. Use GitHub's
**Private vulnerability reporting** feature when it is enabled, or contact the
maintainer through a private channel listed on their profile.

Include the affected extension version, a minimal non-confidential diagram, the
impact, and reproducible steps.

## Security model

Mermaid is bundled inside the VSIX. The preview webview uses a Content Security
Policy with `connect-src 'none'`, nonce-protected scripts, and Mermaid's
`securityLevel: strict`. The extension does not collect telemetry.

Version 1.3.0 keeps workspace-relative images and standard resource limits as
the default. External resources and raised limits require machine-scoped user
settings and a trusted workspace; repository settings cannot grant those
permissions. Restricted Mode forces them off.

Additional local images are accepted only when their final canonical location
is inside the current workspace or an explicitly configured root. HTTPS images
must remain below an exact configured base URL after every redirect. URL
credentials are rejected, private and local addresses require a separate
opt-in, downloads are time- and size-bounded, and only inspected raster formats
are accepted. Remote SVG and AVIF are not loaded.

Network and filesystem access remains in the extension or CLI preprocessing
layer. Accepted images are converted to `data:` URIs before Mermaid receives the
source, so neither preview webviews nor the headless Chromium renderer gain
direct network authority. The CLI keeps its protocol-level network block even
when its preprocessing layer is explicitly allowed to fetch an image.

Custom source, image, and raster budgets are capped by internal hard limits.
Concurrency, dimensions, redirects, timeouts, webview message sizes, and export
serialization limits are not user-disableable.
