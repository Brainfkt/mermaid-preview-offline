# Contributing

Thank you for contributing to Mermaid Preview Offline.

## Development

```bash
npm ci
npm run verify
```

To debug the extension, open the repository in VS Code and launch
**Run Mermaid Preview Offline** with `F5`.

## Pull requests

- Keep each pull request focused on one coherent change.
- Add or update tests for behavior changes.
- Keep rendering fully local.
- Do not relax `securityLevel: strict` or `connect-src 'none'` without an
  explicit security review.
- Run `npm run verify` before submitting the pull request.
