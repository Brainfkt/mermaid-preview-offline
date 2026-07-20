export interface FileUriParts {
  authority: string;
  path: string;
  scheme: string;
}

export interface OffsetRange {
  endOffset: number;
  startOffset: number;
}

export interface TextOffsetChange {
  rangeLength: number;
  rangeOffset: number;
  text: string;
}

/**
 * Returns whether two file URIs address the same path on the selected host OS.
 * The default platform follows the extension host, but remains injectable so
 * the platform-specific behavior can be covered by deterministic unit tests.
 */
export function fileUrisReferToSamePath(
  left: FileUriParts,
  right: FileUriParts,
  platform = process.platform,
): boolean {
  if (left.scheme !== 'file' || right.scheme !== 'file') return false;
  const caseSensitive = platform !== 'darwin' && platform !== 'win32';
  const normalize = (value: string): string =>
    caseSensitive ? value : value.toLowerCase();
  return (
    normalize(left.authority) === normalize(right.authority) &&
    normalize(left.path) === normalize(right.path)
  );
}

/**
 * Maps an offset from the document before a change event into the resulting
 * document. VS Code reports each range against the pre-change document; sort
 * them first so multi-cursor edits are handled independently of event order.
 */
export function transformTextOffset(
  offset: number,
  changes: readonly TextOffsetChange[],
): number {
  let transformed = Math.max(0, offset);
  let accumulatedDelta = 0;
  const ordered = [...changes].sort(
    (left, right) => left.rangeOffset - right.rangeOffset,
  );

  for (const change of ordered) {
    const start = Math.max(0, change.rangeOffset) + accumulatedDelta;
    const replacedLength = Math.max(0, change.rangeLength);
    const end = start + replacedLength;
    const insertedLength = change.text.length;

    if (transformed < start) break;
    if (transformed >= end) {
      transformed += insertedLength - replacedLength;
    } else {
      transformed = start + Math.min(transformed - start, insertedLength);
    }
    accumulatedDelta += insertedLength - replacedLength;
  }

  return Math.max(0, transformed);
}

export function rangeAtOffset<Range extends OffsetRange>(
  ranges: readonly Range[],
  offset: number,
): Range | undefined {
  return ranges.find(
    (range) => offset >= range.startOffset && offset <= range.endOffset,
  );
}
