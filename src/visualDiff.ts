export interface LineDiffSummary {
  added: number;
  changed: number;
  removed: number;
  unchanged: number;
}

export function summarizeLineDiff(before: string, after: string): LineDiffSummary {
  const left = normalizedLines(before);
  const right = normalizedLines(after);
  const common = longestCommonSubsequenceLength(left, right);
  const removed = left.length - common;
  const added = right.length - common;
  const changed = Math.min(removed, added);
  return {
    added: added - changed,
    changed,
    removed: removed - changed,
    unchanged: common,
  };
}

export function isMermaidPath(path: string): boolean {
  return /\.(?:mmd|mermaid)$/iu.test(path);
}

function normalizedLines(source: string): string[] {
  const lines = source.replace(/\r\n?/gu, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function longestCommonSubsequenceLength(left: string[], right: string[]): number {
  let previous = new Uint32Array(right.length + 1);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = new Uint32Array(right.length + 1);
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? (previous[rightIndex - 1] ?? 0) + 1
        : Math.max(previous[rightIndex] ?? 0, current[rightIndex - 1] ?? 0);
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}
