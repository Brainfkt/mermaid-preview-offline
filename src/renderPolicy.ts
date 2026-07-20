import type { PreviewConfiguration } from './protocol';

const LARGE_FILE_MINIMUM_DELAY = 400;
export const MAX_RENDER_SOURCE_BYTES = 10 * 1024 * 1024;

export function effectiveRefreshDelay(
  byteLength: number,
  configuration: PreviewConfiguration,
): number {
  return byteLength >= configuration.largeFileThresholdBytes
    ? Math.max(configuration.refreshDelay, LARGE_FILE_MINIMUM_DELAY)
    : configuration.refreshDelay;
}

export function formatByteLength(byteLength: number): string {
  if (byteLength < 1024) {
    return `${byteLength} B`;
  }
  if (byteLength < 1024 * 1024) {
    return `${Math.round(byteLength / 1024)} KB`;
  }
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}

export function renderBlockReason(byteLength: number): string | undefined {
  if (byteLength <= MAX_RENDER_SOURCE_BYTES) return undefined;
  return (
    `Automatic rendering is paused because this source is ${formatByteLength(byteLength)}. ` +
    `The v1.0 safety limit is ${formatByteLength(MAX_RENDER_SOURCE_BYTES)}.`
  );
}
