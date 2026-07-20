import mermaid from 'mermaid';

import { normalizeExportSettings, type ExportSettings } from './exportSettings';
import { artifactDataBase64, renderExportArtifact } from './exportRenderer';
import { prepareMermaidExtensions, registerOfflineIconPacks } from './mermaidExtensions';
import { OFFLINE_FONT_STACK } from './offlineFont';
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

registerOfflineIconPacks();

window.mermaidOfflineCli = {
  async render(request: CliRenderRequest): Promise<SerializedExportArtifact> {
    const settings = normalizeExportSettings(request.settings);
    const renderId = `mermaid-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await prepareMermaidExtensions(request.source);
      mermaid.initialize({
        deterministicIds: true,
        deterministicIDSeed: 'mermaid-preview-offline-cli',
        startOnLoad: false,
        securityLevel: 'strict',
        theme: settings.theme === 'adaptive' ? 'default' : settings.theme,
        fontFamily: OFFLINE_FONT_STACK,
        flowchart: { htmlLabels: false, useMaxWidth: false },
        sequence: { useMaxWidth: false },
      });
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
