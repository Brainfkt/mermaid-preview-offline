import type { PreviewConfiguration } from './protocol';
import { DEFAULT_MAX_SOURCE_BYTES } from './resourcePolicy';

const LARGE_FILE_MINIMUM_DELAY = 400;
export const MAX_RENDER_SOURCE_BYTES = DEFAULT_MAX_SOURCE_BYTES;

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

export function renderBlockReason(
  byteLength: number,
  maximumBytes = MAX_RENDER_SOURCE_BYTES,
): string | undefined {
  if (byteLength <= maximumBytes) return undefined;
  return (
    `Automatic rendering is paused because this source is ${formatByteLength(byteLength)}. ` +
    `The configured safety limit is ${formatByteLength(maximumBytes)}.`
  );
}
