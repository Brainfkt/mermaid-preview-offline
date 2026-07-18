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
export type PreviewLayoutMode = 'preview' | 'source' | 'split';
export type SplitOrientation = 'horizontal' | 'vertical';

export interface PreviewConfiguration {
  diagramTheme: DiagramTheme;
  largeFileThresholdBytes: number;
  refreshDelay: number;
  refreshMode: RefreshMode;
}

export interface PersistedPreviewState {
  autoFit: boolean;
  layoutMode: PreviewLayoutMode;
  scrollLeft: number;
  scrollTop: number;
  splitOrientation: SplitOrientation;
  splitRatio: number;
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
      originalSource: string;
      fileName: string;
      version: number;
      byteLength: number;
      isLargeFile: boolean;
    }
  | {
      type: 'documentChanged';
      fileName: string;
      originalSource: string;
      version: number;
    }
  | {
      type: 'restoreViewState';
      state: PersistedPreviewState;
    }
  | {
      type: 'sourceVisibility';
      visible: boolean;
    };

export type WebviewToExtensionMessage =
  | { type: 'ready'; hasPersistedState: boolean }
  | { type: 'openSource'; preserveFocus?: boolean }
  | { type: 'requestDocument' }
  | { type: 'setDiagramTheme'; theme: DiagramTheme }
  | { type: 'sourceEdit'; source: string; baseVersion: number }
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
