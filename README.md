<p align="center">
  <img src="media/icon.png" alt="Mermaid Preview Offline logo" width="128">
</p>

<h1 align="center">Mermaid Preview — 100% Offline</h1>

<p align="center">
  Preview Mermaid diagrams instantly inside VS Code. No account, no cloud, no telemetry.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=brainfkt.mermaid-preview-offline"><img src="https://img.shields.io/visual-studio-marketplace/v/brainfkt.mermaid-preview-offline?style=flat-square&label=Marketplace" alt="Marketplace version"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=brainfkt.mermaid-preview-offline"><img src="https://img.shields.io/visual-studio-marketplace/i/brainfkt.mermaid-preview-offline?style=flat-square&label=Installs" alt="Marketplace installs"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=brainfkt.mermaid-preview-offline"><img src="https://img.shields.io/visual-studio-marketplace/r/brainfkt.mermaid-preview-offline?style=flat-square&label=Rating" alt="Marketplace rating"></a>
  <a href="https://github.com/Brainfkt/mermaid-preview-offline/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Brainfkt/mermaid-preview-offline/ci.yml?branch=main&style=flat-square&label=Build" alt="Build status"></a>
</p>

Open any `.mmd` or `.mermaid` file and get a polished diagram preview directly
in your editor. The complete Mermaid renderer is bundled with the extension, so
your diagrams stay private and remain available without an internet connection.

## Why install it?

- **Zero configuration** — click a Mermaid file and the preview opens by default.
- **Fast live preview** — changes render automatically while you edit the source.
- **100% offline and private** — no CDN, server, sign-in, upload, or telemetry.
- **Easy navigation** — zoom, fit, and drag to explore large diagrams.
- **Useful errors** — readable syntax errors link you straight back to the source.
- **SVG workflow** — copy the rendered SVG or save it as a file.
- **Native VS Code experience** — light, dark, and high-contrast themes included.
- **Mermaid language support** — syntax highlighting for `.mmd` and `.mermaid` files.

## Supported Mermaid diagrams

The bundled Mermaid 11 renderer supports flowcharts, sequence diagrams, class
diagrams, state diagrams, entity relationship diagrams, Gantt charts, mindmaps,
timelines, pie charts, Git graphs, user journeys, requirement diagrams,
architecture diagrams, and more.

## Get started

1. Install **Mermaid Preview — 100% Offline** from the
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=brainfkt.mermaid-preview-offline).
2. Open a `.mmd` or `.mermaid` file from the Explorer.
3. Select **Source** to edit the text beside the live preview.

To temporarily use the text editor only, open the Command Palette and choose
**Reopen Editor With...** → **Text Editor**.

## Keyboard and mouse controls

| Control | Action |
|---|---|
| `E` | Open the source beside the preview |
| `Ctrl/Cmd + 0` | Fit the diagram to the viewport |
| `+` / `-` | Zoom in or out |
| `Ctrl/Cmd + mouse wheel` | Fine zoom control |
| Drag | Pan across the canvas |

## Privacy and security

Diagram source is never uploaded. The preview webview blocks network connections
with `connect-src 'none'`, loads resources only from the installed VSIX, and runs
Mermaid with `securityLevel: strict`. The extension contains no telemetry.

The extension writes outside the current document only when you explicitly use
**Save SVG**.

## Install from a VSIX

1. Download the latest `.vsix` from
   [GitHub Releases](https://github.com/Brainfkt/mermaid-preview-offline/releases/latest).
2. In VS Code, open **Extensions**.
3. Choose `...` → **Install from VSIX...**.

## Development

Requires Node.js 22 and npm.

```bash
npm ci
npm run verify
npm run package:vsix
```

The package is generated in `artifacts/`. To debug the extension, open the
repository in VS Code and launch **Run Mermaid Preview Offline** with `F5`.

## Support

Found a bug or have an idea? Open a
[GitHub issue](https://github.com/Brainfkt/mermaid-preview-offline/issues).

## License and attribution

This extension is released under the [MIT License](LICENSE). Mermaid and the
Mermaid logo are used from the
[mermaid-js/mermaid](https://github.com/mermaid-js/mermaid) project under its MIT
license; see [third-party notices](THIRD_PARTY_NOTICES.md).

This is an independent community extension and is not affiliated with or
endorsed by Mermaid Chart.
