export const DIAGRAM_THEMES = [
  'adaptive',
  'default',
  'dark',
  'forest',
  'neutral',
  'base',
] as const;

export type DiagramTheme = (typeof DIAGRAM_THEMES)[number];
export type RefreshMode = 'automatic' | 'manual';
export type MermaidEditorMode = 'preview' | 'source' | 'beside' | 'above';

export interface PreviewConfiguration {
  diagramTheme: DiagramTheme;
  largeFileThresholdBytes: number;
  minimapEnabled: boolean;
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
      version: number;
      byteLength: number;
      isLargeFile: boolean;
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
  | { type: 'editorMode'; mode: MermaidEditorMode };

export type WebviewToExtensionMessage =
  | { type: 'ready'; hasPersistedState: boolean }
  | { type: 'chooseEditorMode' }
  | { type: 'setEditorMode'; mode: MermaidEditorMode }
  | { type: 'toggleFullscreen' }
  | { type: 'requestDocument' }
  | { type: 'setDiagramTheme'; theme: DiagramTheme }
  | {
      type: 'diagnostic';
      version: number;
      message: string;
      line?: number;
      column?: number;
    }
  | { type: 'clearDiagnostic'; version: number }
  | { type: 'viewState'; state: PersistedPreviewState }
  | { type: 'copySvg'; svg: string }
  | { type: 'saveSvg'; svg: string };
