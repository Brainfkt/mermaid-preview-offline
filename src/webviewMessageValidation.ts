import {
  isDiagramDensity,
  isDiagramSurfaceConfiguration,
} from './appearance';
import type { DocumentationWebviewToExtensionMessage } from './documentationProtocol';
import { isEditorMode } from './editorLayout';
import { isDiagramTheme } from './previewState';
import type {
  SerializedExportArtifact,
  WebviewToExtensionMessage,
} from './protocol';
import { MAX_RENDER_SOURCE_BYTES } from './renderPolicy';

export const MAX_SERIALIZED_EXPORT_BASE64_BYTES = 192_000_000;

export type ProjectWebviewMessage =
  | { type: 'ready' }
  | { fileName: string; source: string; type: 'createDiagram' };

export function isPreviewWebviewMessage(
  value: unknown,
): value is WebviewToExtensionMessage {
  if (!isMessage(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.type === 'requestDocument' ||
    candidate.type === 'chooseEditorMode' ||
    candidate.type === 'cycleEditorMode' ||
    candidate.type === 'openInNewWindow' ||
    candidate.type === 'openNativeSource' ||
    candidate.type === 'saveDocument' ||
    candidate.type === 'openDiagramGallery'
  ) {
    return true;
  }
  if (candidate.type === 'ready') {
    return typeof candidate.hasPersistedState === 'boolean';
  }
  if (candidate.type === 'setEditorMode') {
    return isEditorMode(candidate.mode);
  }
  if (candidate.type === 'viewState') {
    return isRecord(candidate.state);
  }
  if (candidate.type === 'setDiagramTheme') {
    return isDiagramTheme(candidate.theme);
  }
  if (candidate.type === 'setDiagramDensity') {
    return isDiagramDensity(candidate.density);
  }
  if (candidate.type === 'setDiagramSurface') {
    return isDiagramSurfaceConfiguration(candidate.surface);
  }
  if (candidate.type === 'replaceDocument') {
    return (
      isNonNegativeSafeInteger(candidate.requestId) &&
      isNonNegativeSafeInteger(candidate.version) &&
      typeof candidate.source === 'string' &&
      candidate.source.length <= MAX_RENDER_SOURCE_BYTES * 2
    );
  }
  if (candidate.type === 'clearDiagnostic') {
    return typeof candidate.version === 'number' && typeof candidate.rendered === 'boolean';
  }
  if (candidate.type === 'diagnostic') {
    return (
      typeof candidate.version === 'number' &&
      typeof candidate.message === 'string' &&
      (candidate.line === undefined || typeof candidate.line === 'number') &&
      (candidate.column === undefined || typeof candidate.column === 'number')
    );
  }
  if (candidate.type === 'copySvg' || candidate.type === 'saveSvg') {
    return typeof candidate.svg === 'string';
  }
  if (candidate.type === 'saveExportProfiles') {
    return Array.isArray(candidate.profiles);
  }
  if (candidate.type === 'exportFolder') {
    return isRecord(candidate.settings);
  }
  if (candidate.type === 'saveExport') {
    return isSerializedExportArtifact(candidate.artifact);
  }
  if (candidate.type === 'batchExportResult') {
    return (
      typeof candidate.batchId === 'string' &&
      typeof candidate.fileId === 'string' &&
      typeof candidate.relativeDirectory === 'string' &&
      isSerializedExportArtifact(candidate.artifact)
    );
  }
  return (
    candidate.type === 'batchExportError' &&
    typeof candidate.batchId === 'string' &&
    typeof candidate.fileId === 'string' &&
    typeof candidate.message === 'string'
  );
}

export function isDocumentationWebviewMessage(
  value: unknown,
): value is DocumentationWebviewToExtensionMessage {
  if (!isMessage(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === 'ready') return true;
  if (candidate.type === 'revealSource') return typeof candidate.blockId === 'string';
  if (candidate.type === 'setDiagramTheme') return isDiagramTheme(candidate.theme);
  if (candidate.type === 'setDiagramDensity') return isDiagramDensity(candidate.density);
  if (candidate.type === 'setDiagramSurface') {
    return isDiagramSurfaceConfiguration(candidate.surface);
  }
  if (candidate.type === 'documentationExportError') {
    return typeof candidate.requestId === 'string' && typeof candidate.message === 'string';
  }
  if (
    candidate.type !== 'documentationExportResult' ||
    typeof candidate.requestId !== 'string' ||
    !Array.isArray(candidate.artifacts)
  ) {
    return false;
  }
  let totalBase64Bytes = 0;
  return candidate.artifacts.every((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.blockId !== 'string') return false;
    if (!isSerializedExportArtifact(entry.artifact, ['png', 'svg'])) return false;
    totalBase64Bytes += entry.artifact.dataBase64.length;
    return totalBase64Bytes <= MAX_SERIALIZED_EXPORT_BASE64_BYTES;
  });
}

export function isProjectWebviewMessage(
  value: unknown,
): value is ProjectWebviewMessage {
  if (!isMessage(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === 'ready') return true;
  return candidate.type === 'createDiagram' &&
    typeof candidate.fileName === 'string' &&
    typeof candidate.source === 'string';
}

export function isSerializedExportArtifact(
  value: unknown,
  allowedFormats: readonly SerializedExportArtifact['format'][] = [
    'pdf',
    'png',
    'svg',
    'webp',
  ],
): value is SerializedExportArtifact {
  if (!isRecord(value)) return false;
  return (
    typeof value.dataBase64 === 'string' &&
    value.dataBase64.length <= MAX_SERIALIZED_EXPORT_BASE64_BYTES &&
    typeof value.fileName === 'string' &&
    allowedFormats.includes(value.format as SerializedExportArtifact['format']) &&
    typeof value.height === 'number' &&
    Number.isFinite(value.height) &&
    typeof value.mimeType === 'string' &&
    typeof value.width === 'number' &&
    Number.isFinite(value.width)
  );
}

function isMessage(value: unknown): value is Record<string, unknown> & { type: unknown } {
  return isRecord(value) && 'type' in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
