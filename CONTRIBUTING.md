# Contributing

Thank you for contributing to Mermaid Preview Offline.

## Development

```bash
npm ci
npm run verify
npm run test:visual
```

To debug the extension, open the repository in VS Code and launch
**Run Mermaid Preview Offline** with `F5`.

## Pull requests

- Keep each pull request focused on one coherent change.
- Add or update tests for behavior changes.
- Keep rendering local and independent from accounts or cloud services.
- Do not relax `securityLevel: strict` or `connect-src 'none'` without an
  explicit security review.
- Route every optional external image through the central policy and inlining
  layer; do not give a renderer direct filesystem or network access.
- Keep external-resource settings machine-scoped, trust-gated, allowlisted, and
  bounded by non-configurable internal ceilings.
- Run `npm run verify` before submitting the pull request.
- Run `npm run test:visual` when changing Mermaid, the preview UI, or rendering
  behavior. Review intentional changes before using `npm run test:visual:update`.
