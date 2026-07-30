import type {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from './protocol';

export interface SourceDocumentState {
  source: string;
  version: number;
}

export interface SourceReceiveResult {
  document?: SourceDocumentState;
  status: SourceSynchronizationStatus;
}

export interface SourceEditResult {
  shouldFlush: boolean;
  status: string;
}

export type SourceSynchronizationStatus =
  | 'File changed elsewhere'
  | 'Saved'
  | 'Saving…'
  | 'Unsaved';

type SourceEditResultMessage = Extract<
  ExtensionToWebviewMessage,
  { type: 'sourceEditResult' }
>;
type ReplaceDocumentMessage = Extract<
  WebviewToExtensionMessage,
  { type: 'replaceDocument' }
>;

export class SourceSynchronizer {
  private acknowledgedSource = '';
  private conflictValue: SourceDocumentState | undefined;
  private editSequence = 0;
  private pendingEdit: { requestId: number; source: string } | undefined;
  private versionValue = -1;

  public get hasConflict(): boolean {
    return this.conflictValue !== undefined;
  }

  public receive(
    source: string,
    version: number,
    editorSource: string,
  ): SourceReceiveResult {
    if (this.versionValue < 0) {
      return this.acceptDocument(source, version);
    }
    if (this.pendingEdit?.source === source) {
      this.versionValue = version;
      this.acknowledgedSource = source;
      return { status: this.status(editorSource) };
    }
    if (!this.pendingEdit && editorSource === this.acknowledgedSource) {
      return this.acceptDocument(source, version);
    }
    if (source === this.acknowledgedSource) {
      this.versionValue = version;
      return { status: this.status(editorSource) };
    }
    this.conflictValue = { source, version };
    return { status: 'File changed elsewhere' };
  }

  public beginEdit(editorSource: string): ReplaceDocumentMessage | undefined {
    if (this.pendingEdit || this.versionValue < 0 || editorSource === this.acknowledgedSource) {
      return undefined;
    }
    this.editSequence += 1;
    this.pendingEdit = { requestId: this.editSequence, source: editorSource };
    return {
      type: 'replaceDocument',
      requestId: this.editSequence,
      source: editorSource,
      version: this.versionValue,
    };
  }

  public handleResult(
    message: SourceEditResultMessage,
    editorSource: string,
  ): SourceEditResult {
    const pending = this.pendingEdit;
    if (!pending || pending.requestId !== message.requestId) {
      return { shouldFlush: false, status: this.status(editorSource) };
    }
    this.pendingEdit = undefined;
    this.versionValue = message.version;
    if (message.applied) {
      this.acknowledgedSource = pending.source;
      this.conflictValue = undefined;
      return {
        shouldFlush: editorSource !== this.acknowledgedSource,
        status: this.status(editorSource),
      };
    }
    if (message.documentSource !== undefined) {
      this.conflictValue = {
        source: message.documentSource,
        version: message.version,
      };
    }
    return {
      shouldFlush: false,
      status: message.error ? `Save failed: ${message.error}` : 'File changed elsewhere',
    };
  }

  public reloadConflict(): SourceDocumentState | undefined {
    const conflict = this.conflictValue;
    if (!conflict) return undefined;
    this.acceptDocument(conflict.source, conflict.version);
    return conflict;
  }

  public status(editorSource: string): SourceSynchronizationStatus {
    if (this.conflictValue) return 'File changed elsewhere';
    if (this.pendingEdit) return 'Saving…';
    return editorSource === this.acknowledgedSource ? 'Saved' : 'Unsaved';
  }

  private acceptDocument(source: string, version: number): SourceReceiveResult {
    this.versionValue = version;
    this.acknowledgedSource = source;
    this.conflictValue = undefined;
    return {
      document: { source, version },
      status: 'Saved',
    };
  }
}
