import { icons as logosIcons } from '@iconify-json/logos';
import { icons as materialIconThemeIcons } from '@iconify-json/material-icon-theme';
import zenuml from '@mermaid-js/mermaid-zenuml';
import mermaid from 'mermaid';

import { normalizeExportSettings, type ExportSettings } from './exportSettings';
import { artifactDataBase64, renderExportArtifact } from './exportRenderer';
import type { SerializedExportArtifact } from './protocol';

export interface CliRenderRequest {
  fileName: string;
  settings: ExportSettings;
  source: string;
  sourceUri: string;
}

declare global {
  interface Window {
    mermaidOfflineCli: {
      render(request: CliRenderRequest): Promise<SerializedExportArtifact>;
    };
  }
}

mermaid.registerIconPacks([
  { name: logosIcons.prefix, icons: logosIcons },
  { name: materialIconThemeIcons.prefix, icons: materialIconThemeIcons },
]);
const mermaidExtensionsReady = mermaid.registerExternalDiagrams([zenuml]);

window.mermaidOfflineCli = {
  async render(request: CliRenderRequest): Promise<SerializedExportArtifact> {
    const settings = normalizeExportSettings(request.settings);
    const renderId = `mermaid-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await mermaidExtensionsReady;
      mermaid.initialize({
        deterministicIds: true,
        deterministicIDSeed: 'mermaid-preview-offline-cli',
        startOnLoad: false,
        securityLevel: 'strict',
        theme: settings.theme === 'adaptive' ? 'default' : settings.theme,
        fontFamily: 'Arial, Helvetica, sans-serif',
        flowchart: { htmlLabels: false, useMaxWidth: false },
        sequence: { useMaxWidth: false },
      });
      await mermaid.parse(request.source);
      const { svg } = await mermaid.render(renderId, request.source);
      const artifact = await renderExportArtifact({
        fileName: request.fileName,
        metadata: {
          exportedAt: new Date().toISOString(),
          fileName: request.fileName,
          sourceUri: request.sourceUri,
        },
        settings,
        svg,
      });
      return {
        dataBase64: artifactDataBase64(artifact),
        fileName: artifact.fileName,
        format: artifact.format,
        height: artifact.height,
        mimeType: artifact.mimeType,
        width: artifact.width,
      };
    } finally {
      document.getElementById(renderId)?.remove();
      document.getElementById(`d${renderId}`)?.remove();
    }
  },
};
