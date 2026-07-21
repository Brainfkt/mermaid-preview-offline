import type { ExportProfile, ExportSettings } from './exportSettings';
import type { DiagramFontFamily } from './diagramFont';
import type { DiagramNavigationConfiguration } from './navigationSettings';

export const DIAGRAM_THEMES = [
  'adaptive',
  'default',
  'dark',
  'forest',
  'neutral',
  'base',
  'neo',
  'neo-dark',
  'redux-color',
  'redux-dark-color',
  'sketch',
] as const;

export type DiagramTheme = (typeof DIAGRAM_THEMES)[number];
export const DIAGRAM_DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export type DiagramDensity = (typeof DIAGRAM_DENSITIES)[number];
export const DIAGRAM_SURFACE_PRESETS = [
  'editor',
  'white',
  'paper',
  'soft-gray',
  'soft-blue',
  'soft-rose',
  'slate',
  'midnight',
  'custom',
] as const;
export type DiagramSurfacePreset = (typeof DIAGRAM_SURFACE_PRESETS)[number];
export const DIAGRAM_SURFACE_PATTERNS = ['none', 'dots', 'grid'] as const;
export type DiagramSurfacePattern = (typeof DIAGRAM_SURFACE_PATTERNS)[number];
export interface DiagramSurfaceConfiguration {
  customColor: string;
  pattern: DiagramSurfacePattern;
  preset: DiagramSurfacePreset;
}
export type RefreshMode = 'automatic' | 'manual';
export type MermaidEditorMode = 'preview' | 'source' | 'beside' | 'above';

export interface PreviewConfiguration {
  diagramDensity: DiagramDensity;
  diagramFontFamily: DiagramFontFamily;
  diagramSurface: DiagramSurfaceConfiguration;
  diagramTheme: DiagramTheme;
  largeFileThresholdBytes: number;
  minimapEnabled: boolean;
  navigation: DiagramNavigationConfiguration;
  refreshDelay: number;
  refreshMode: RefreshMode;
}

export interface PersistedPreviewState {
  autoFit: boolean;
  scrollLeft: number;
  scrollTop: number;
  zoom: number;
}

export type ExtensionToWebviewMessage =
  | {
      type: 'configuration';
      configuration: PreviewConfiguration;
    }
  | {
      type: 'document';
      source: string;
      fileName: string;
      sourceUri: string;
      version: number;
      byteLength: number;
      isLargeFile: boolean;
      renderBlockedReason?: string;
    }
  | {
      type: 'documentChanged';
      fileName: string;
      version: number;
      byteLength: number;
    }
  | {
      type: 'restoreViewState';
      state: PersistedPreviewState;
    }
  | { type: 'editorMode'; mode: MermaidEditorMode }
  | { type: 'exportConfiguration'; profiles: ExportProfile[]; settings: ExportSettings }
  | { type: 'showExportDialog' }
  | {
      type: 'batchExportFile';
      batchId: string;
      fileId: string;
      fileName: string;
      relativeDirectory: string;
      settings: ExportSettings;
      source: string;
      sourceUri: string;
    };

export interface SerializedExportArtifact {
  dataBase64: string;
  fileName: string;
  format: 'svg' | 'png' | 'webp' | 'pdf';
  height: number;
  mimeType: string;
  width: number;
}

export type WebviewToExtensionMessage =
  | { type: 'ready'; hasPersistedState: boolean }
  | { type: 'chooseEditorMode' }
  | { type: 'cycleEditorMode' }
  | { type: 'setEditorMode'; mode: MermaidEditorMode }
  | { type: 'toggleFullscreen' }
  | { type: 'openInNewWindow' }
  | { type: 'requestDocument' }
  | { type: 'revealSourceLine'; line: number }
  | { type: 'setDiagramDensity'; density: DiagramDensity }
  | { type: 'setDiagramSurface'; surface: DiagramSurfaceConfiguration }
  | { type: 'setDiagramTheme'; theme: DiagramTheme }
  | {
      type: 'diagnostic';
      version: number;
      message: string;
      line?: number;
      column?: number;
    }
  | { type: 'clearDiagnostic'; version: number; rendered: boolean }
  | { type: 'viewState'; state: PersistedPreviewState }
  | { type: 'copySvg'; svg: string }
  | { type: 'saveSvg'; svg: string }
  | { type: 'saveExport'; artifact: SerializedExportArtifact }
  | { type: 'saveExportProfiles'; profiles: ExportProfile[] }
  | { type: 'exportFolder'; settings: ExportSettings }
  | {
      type: 'batchExportResult';
      artifact: SerializedExportArtifact;
      batchId: string;
      fileId: string;
      relativeDirectory: string;
    }
  | { type: 'batchExportError'; batchId: string; fileId: string; message: string };
