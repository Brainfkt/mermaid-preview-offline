import type { PreviewConfiguration } from './protocol';

const LARGE_FILE_MINIMUM_DELAY = 400;

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
