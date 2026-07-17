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

export interface PreviewConfiguration {
  diagramTheme: DiagramTheme;
  largeFileThresholdBytes: number;
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
  | { type: 'viewState'; state: PersistedPreviewState }
  | { type: 'copySvg'; svg: string }
  | { type: 'saveSvg'; svg: string };
