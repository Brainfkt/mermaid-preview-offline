export type ExtensionToWebviewMessage =
  | {
      type: 'document';
      source: string;
      fileName: string;
      version: number;
    };

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'openSource' }
  | { type: 'copySvg'; svg: string }
  | { type: 'saveSvg'; svg: string };
