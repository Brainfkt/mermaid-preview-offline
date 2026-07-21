import mermaid from 'mermaid';

import { DEFAULT_DIAGRAM_SURFACE, diagramSpacing, resolveDiagramAppearance } from './appearance';
import { normalizeDiagramFontFamily, type DiagramFontFamily } from './diagramFont';
import { resolvedDiagramFontStack } from './diagramFontAssets';
import { normalizeExportSettings, type ExportSettings } from './exportSettings';
import { artifactDataBase64, renderExportArtifact } from './exportRenderer';
import { prepareMermaidExtensions, registerOfflineIconPacks } from './mermaidExtensions';
import type { SerializedExportArtifact } from './protocol';

export interface CliRenderRequest {
  fileName: string;
  fontFamily: DiagramFontFamily;
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
    const fontFamily = normalizeDiagramFontFamily(request.fontFamily);
    const renderId = `mermaid-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const appearance = resolveDiagramAppearance(
      settings.theme,
      'light',
      DEFAULT_DIAGRAM_SURFACE,
      settings.density,
    );
    const spacing = diagramSpacing(appearance.density);
    try {
      await prepareMermaidExtensions(request.source, fontFamily);
      mermaid.initialize({
        deterministicIds: true,
        deterministicIDSeed: 'mermaid-preview-offline-cli',
        startOnLoad: false,
        securityLevel: 'strict',
        theme: appearance.theme,
        look: appearance.look,
        handDrawnSeed: appearance.handDrawnSeed,
        fontFamily: resolvedDiagramFontStack(fontFamily),
        flowchart: { htmlLabels: false, useMaxWidth: false, ...spacing.flowchart },
        sequence: { useMaxWidth: false, ...spacing.sequence },
      });
      const { svg } = await mermaid.render(renderId, request.source);
      const artifact = await renderExportArtifact({
        fileName: request.fileName,
        fontFamily,
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
