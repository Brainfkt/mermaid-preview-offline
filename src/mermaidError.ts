export interface MermaidErrorDetails {
  column?: number;
  excerpt?: string;
  line?: number;
  message: string;
}

export function describeMermaidError(error: unknown, source: string): MermaidErrorDetails {
  const raw = error instanceof Error ? error.message : String(error);
  const location = locationFromError(error) ?? locationFromMessage(raw);
  const message = raw
    .replace(/^Error:\s*/u, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();

  if (!location?.line) {
    return { message };
  }

  return {
    ...location,
    excerpt: sourceExcerpt(source, location.line, location.column),
    message,
  };
}

function locationFromError(error: unknown): { column?: number; line: number } | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const hash = isRecord(error.hash) ? error.hash : undefined;
  const location = hash && isRecord(hash.loc) ? hash.loc : undefined;
  const line = positiveInteger(location?.first_line) ?? positiveInteger(hash?.line);
  if (!line) {
    return undefined;
  }

  const zeroBasedColumn = nonNegativeInteger(location?.first_column);
  return {
    line,
    ...(zeroBasedColumn === undefined ? {} : { column: zeroBasedColumn + 1 }),
  };
}

function locationFromMessage(message: string): { column?: number; line: number } | undefined {
  const lineMatch = /(?:parse error on|at) line\s+(\d+)/iu.exec(message);
  const line = lineMatch?.[1] ? Number.parseInt(lineMatch[1], 10) : undefined;
  if (!line || line < 1) {
    return undefined;
  }

  const columnMatch = /(?:column|col)\s+(\d+)/iu.exec(message);
  const column = columnMatch?.[1] ? Number.parseInt(columnMatch[1], 10) : undefined;
  return { line, ...(column && column > 0 ? { column } : {}) };
}

function sourceExcerpt(source: string, line: number, column?: number): string {
  const lines = source.split(/\r?\n/u);
  const first = Math.max(line - 2, 1);
  const last = Math.min(line + 2, lines.length);
  const width = String(last).length;
  const excerpt: string[] = [];

  for (let current = first; current <= last; current += 1) {
    const marker = current === line ? '>' : ' ';
    const text = truncateLine(lines[current - 1] ?? '');
    excerpt.push(`${marker} ${String(current).padStart(width)} | ${text}`);
    if (current === line && column !== undefined) {
      excerpt.push(`  ${' '.repeat(width)} | ${' '.repeat(Math.max(column - 1, 0))}^`);
    }
  }
  return excerpt.join('\n');
}

function truncateLine(value: string): string {
  return value.length <= 240 ? value : `${value.slice(0, 237)}…`;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
