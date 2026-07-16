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
