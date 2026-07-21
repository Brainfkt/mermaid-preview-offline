import type { ExportSettings } from './exportSettings';
import type { DocumentationKind } from './documentationBlocks';
import type { DiagramFontFamily } from './diagramFont';
import type { DiagramNavigationConfiguration } from './navigationSettings';
import type {
  DiagramDensity,
  DiagramSurfaceConfiguration,
  DiagramTheme,
  SerializedExportArtifact,
} from './protocol';

export type DocumentationPreviewMode = 'all' | 'cursor';

export interface DocumentationPreviewBlock {
  endLine: number;
  id: string;
  index: number;
  source: string;
  startLine: number;
}

export type ExtensionToDocumentationWebviewMessage =
  | {
      blocks: DocumentationPreviewBlock[];
      density: DiagramDensity;
      surface: DiagramSurfaceConfiguration;
      fileName: string;
      fontFamily: DiagramFontFamily;
      kind: DocumentationKind;
      maxHeight: string;
      mode: DocumentationPreviewMode;
      navigation: DiagramNavigationConfiguration;
      resizable: boolean;
      theme: DiagramTheme;
      totalBlocks: number;
      type: 'documentationData';
    }
  | {
      blocks: Array<{ fileName: string; id: string; source: string }>;
      fontFamily: DiagramFontFamily;
      requestId: string;
      settings: ExportSettings;
      sourceUri: string;
      type: 'renderDocumentationExport';
    };

export type DocumentationWebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'openInNewWindow' }
  | { blockId: string; type: 'revealSource' }
  | {
      artifacts: Array<{ artifact: SerializedExportArtifact; blockId: string }>;
      requestId: string;
      type: 'documentationExportResult';
    }
  | { message: string; requestId: string; type: 'documentationExportError' };
