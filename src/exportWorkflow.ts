import {
  DEFAULT_EXPORT_SETTINGS,
  normalizeExportSettings,
  type ExportSettings,
} from './exportSettings';
import type { SerializedExportArtifact } from './protocol';

export interface SerializableExportArtifact {
  bytes: Uint8Array;
  fileName: string;
  format: SerializedExportArtifact['format'];
  height: number;
  mimeType: string;
  width: number;
}

export class ExportWorkflow {
  private dialogRequested = false;
  private job = Promise.resolve();
  private previewGenerationValue = 0;
  private settingsValue: ExportSettings = { ...DEFAULT_EXPORT_SETTINGS };

  public get settings(): ExportSettings {
    return this.settingsValue;
  }

  public configure(settings: unknown): void {
    this.settingsValue = normalizeExportSettings(settings);
  }

  public consumeDialogRequest(ready: boolean): boolean {
    if (!ready || !this.dialogRequested) return false;
    this.dialogRequested = false;
    return true;
  }

  public enqueue(task: () => Promise<void>): Promise<void> {
    const queued = this.job.then(task, task);
    this.job = queued.then(() => undefined, () => undefined);
    return queued;
  }

  public invalidatePreview(): number {
    this.previewGenerationValue += 1;
    return this.previewGenerationValue;
  }

  public isCurrentPreview(generation: number): boolean {
    return generation === this.previewGenerationValue;
  }

  public requestDialog(ready: boolean): boolean {
    if (ready) {
      this.dialogRequested = false;
      return true;
    }
    this.dialogRequested = true;
    return false;
  }

  public setSettings(settings: ExportSettings): void {
    this.settingsValue = normalizeExportSettings(settings);
  }

  public startPreview(): number {
    return this.invalidatePreview();
  }
}

export function serializeExportArtifact(
  artifact: SerializableExportArtifact,
): SerializedExportArtifact {
  return {
    dataBase64: artifactBytesBase64(artifact.bytes),
    fileName: artifact.fileName,
    format: artifact.format,
    height: artifact.height,
    mimeType: artifact.mimeType,
    width: artifact.width,
  };
}

function artifactBytesBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
