export interface LineDiffSummary {
  added: number;
  changed: number;
  removed: number;
  unchanged: number;
}

// Exact algorithms are only used while their input-dependent work remains
// below these ceilings. Both bounds count primitive match/diagonal operations,
// not elapsed time, so the selected path is deterministic across machines.
const MAX_EXACT_MATCH_PAIRS = 1_000_000;
const MAX_MYERS_WORK = 2_000_000;

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
  let prefixLength = 0;
  const shortestLength = Math.min(left.length, right.length);
  while (
    prefixLength < shortestLength &&
    left[prefixLength] === right[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < shortestLength - prefixLength &&
    left[left.length - 1 - suffixLength] === right[right.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const leftMiddle = left.slice(prefixLength, left.length - suffixLength);
  const rightMiddle = right.slice(prefixLength, right.length - suffixLength);
  if (leftMiddle.length === 0 || rightMiddle.length === 0) {
    return prefixLength + suffixLength;
  }

  const rightPositions = positionsByLine(rightMiddle);
  const matchingPairs = countMatchingPairs(leftMiddle, rightPositions);
  if (matchingPairs <= MAX_EXACT_MATCH_PAIRS) {
    return prefixLength + suffixLength + huntSzymanskiLength(leftMiddle, rightPositions);
  }

  // Repeated lines can make the match-pair representation quadratic. Myers is
  // exact for nearby versions and is stopped after a deterministic work budget.
  const myersLength = boundedMyersLength(leftMiddle, rightMiddle, MAX_MYERS_WORK);
  if (myersLength !== undefined) {
    return prefixLength + suffixLength + myersLength;
  }

  // Pathological inputs (large, highly repetitive, and far apart) use a
  // deterministic linearithmic lower bound. Every result is the length of a
  // real common subsequence, so summaries remain internally consistent without
  // allowing unbounded O(N*M) work. The exact paths above cover normal diffs.
  return prefixLength + suffixLength + boundedCommonSubsequenceLength(
    leftMiddle,
    rightMiddle,
    rightPositions,
  );
}

function positionsByLine(lines: readonly string[]): Map<string, number[]> {
  const result = new Map<string, number[]>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    const positions = result.get(line);
    if (positions) positions.push(index);
    else result.set(line, [index]);
  }
  return result;
}

function countMatchingPairs(
  left: readonly string[],
  rightPositions: ReadonlyMap<string, readonly number[]>,
): number {
  let total = 0;
  for (const line of left) {
    total += rightPositions.get(line)?.length ?? 0;
    if (total > MAX_EXACT_MATCH_PAIRS) return total;
  }
  return total;
}

/** Exact Hunt-Szymanski LCS length; only called with a bounded match count. */
function huntSzymanskiLength(
  left: readonly string[],
  rightPositions: ReadonlyMap<string, readonly number[]>,
): number {
  const tails: number[] = [];
  for (const line of left) {
    const positions = rightPositions.get(line);
    if (!positions) continue;
    // Reverse order prevents one left line from matching several right lines.
    for (let index = positions.length - 1; index >= 0; index -= 1) {
      const position = positions[index];
      if (position === undefined) continue;
      const insertion = lowerBound(tails, position);
      if (insertion === tails.length) tails.push(position);
      else tails[insertion] = position;
    }
  }
  return tails.length;
}

/** Exact Myers edit-distance traversal, aborted at a deterministic work limit. */
function boundedMyersLength(
  left: readonly string[],
  right: readonly string[],
  maximumWork: number,
): number | undefined {
  const maximumDistance = left.length + right.length;
  const offset = maximumDistance + 1;
  const furthest = new Int32Array((maximumDistance * 2) + 3);
  furthest.fill(-1);
  furthest[offset + 1] = 0;
  let work = 0;

  for (let distance = 0; distance <= maximumDistance; distance += 1) {
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      work += 1;
      if (work > maximumWork) return undefined;

      const diagonalIndex = offset + diagonal;
      let leftIndex: number;
      if (
        diagonal === -distance ||
        (diagonal !== distance &&
          (furthest[diagonalIndex - 1] ?? -1) < (furthest[diagonalIndex + 1] ?? -1))
      ) {
        leftIndex = furthest[diagonalIndex + 1] ?? -1;
      } else {
        leftIndex = (furthest[diagonalIndex - 1] ?? -1) + 1;
      }
      let rightIndex = leftIndex - diagonal;

      while (
        leftIndex < left.length &&
        rightIndex < right.length &&
        left[leftIndex] === right[rightIndex]
      ) {
        leftIndex += 1;
        rightIndex += 1;
        work += 1;
        if (work > maximumWork) return undefined;
      }
      furthest[diagonalIndex] = leftIndex;

      if (leftIndex >= left.length && rightIndex >= right.length) {
        return (left.length + right.length - distance) / 2;
      }
    }
  }
  return undefined;
}

function boundedCommonSubsequenceLength(
  left: readonly string[],
  right: readonly string[],
  rightPositions: ReadonlyMap<string, readonly number[]>,
): number {
  return Math.max(
    greedyForwardLength(left, rightPositions),
    greedyReverseLength(left, right.length, rightPositions),
    uniqueAnchorLength(left, rightPositions),
  );
}

function greedyForwardLength(
  left: readonly string[],
  rightPositions: ReadonlyMap<string, readonly number[]>,
): number {
  let previousPosition = -1;
  let length = 0;
  for (const line of left) {
    const positions = rightPositions.get(line);
    if (!positions) continue;
    const nextIndex = upperBound(positions, previousPosition);
    const nextPosition = positions[nextIndex];
    if (nextPosition === undefined) continue;
    previousPosition = nextPosition;
    length += 1;
  }
  return length;
}

function greedyReverseLength(
  left: readonly string[],
  rightLength: number,
  rightPositions: ReadonlyMap<string, readonly number[]>,
): number {
  let nextPosition = rightLength;
  let length = 0;
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    const line = left[leftIndex];
    if (line === undefined) continue;
    const positions = rightPositions.get(line);
    if (!positions) continue;
    const previousIndex = lowerBound(positions, nextPosition) - 1;
    const previousPosition = positions[previousIndex];
    if (previousPosition === undefined) continue;
    nextPosition = previousPosition;
    length += 1;
  }
  return length;
}

function uniqueAnchorLength(
  left: readonly string[],
  rightPositions: ReadonlyMap<string, readonly number[]>,
): number {
  const leftCounts = new Map<string, number>();
  for (const line of left) leftCounts.set(line, (leftCounts.get(line) ?? 0) + 1);

  const tails: number[] = [];
  for (const line of left) {
    const positions = rightPositions.get(line);
    if (leftCounts.get(line) !== 1 || positions?.length !== 1) continue;
    const position = positions[0];
    if (position === undefined) continue;
    const insertion = lowerBound(tails, position);
    if (insertion === tails.length) tails.push(position);
    else tails[insertion] = position;
  }
  return tails.length;
}

function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if ((values[middle] ?? target) < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if ((values[middle] ?? target) <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}
