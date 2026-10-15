import { DIAGRAM_DECLARATIONS, MERMAID_KEYWORDS, mermaidDeclarationLocation } from './mermaidLanguage';

export const SOURCE_HIGHLIGHT_LIMIT = 150_000;
const keywords = new Set(MERMAID_KEYWORDS.map(({ label }) => label.toLowerCase()));
const directions = new Set(['LR', 'RL', 'TB', 'TD', 'BT']);

export interface SourceToken {
  kind: 'comment' | 'string' | 'keyword' | 'operator' | 'number' | 'identifier';
  start: number;
  text: string;
}

export interface SourceEdit {
  start: number;
  end: number;
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface SourceCompletion {
  label: string;
  detail: string;
  kind: 'keyword' | 'identifier';
}

export interface SourceCompletions {
  start: number;
  end: number;
  items: SourceCompletion[];
}

/** A deliberately small lexical highlighter; Mermaid remains the syntax authority. */
export function sourceTokens(source: string): SourceToken[] {
  const expression = /%%[^\n]*|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|\[[^\]\n]*\]|\|[^|\n]*\||(?:<[-.=]+>|[-.=]+(?:>>?|\|)|<[-.=]+|:::+)|\b\d+(?:\.\d+)?\b|[A-Za-z_][\w]*(?:-[\w]+)*/gu;
  const tokens: SourceToken[] = [];
  for (const match of source.matchAll(expression)) {
    const text = match[0];
    const kind = text.startsWith('%%') ? 'comment'
      : /^["'[|]/u.test(text) ? 'string'
        : /^\d/u.test(text) ? 'number'
          : /^[<\-.:=]/u.test(text) ? 'operator'
            : keywords.has(text.toLowerCase()) || directions.has(text) ? 'keyword'
              : 'identifier';
    tokens.push({ kind, start: match.index, text });
  }
  return tokens;
}

export function highlightedSource(source: string, errorLine?: number): string {
  const tokens = sourceTokens(source);
  let cursor = 0;
  let html = '';
  for (const token of tokens) {
    html += escapeHtml(source.slice(cursor, token.start));
    html += `<span class="source-token--${token.kind}">${escapeHtml(token.text)}</span>`;
    cursor = token.start + token.text.length;
  }
  html += escapeHtml(source.slice(cursor));
  // Tokens never cross a newline, so wrapping lines keeps both markup and offsets intact.
  return html.split('\n').map((line, index) =>
    `<span class="source-editor__code-line${index + 1 === errorLine ? ' source-editor__code-line--error' : ''}">${line || ' '}</span>`,
  ).join('\n');
}

export function sourceCompletions(source: string, offset: number, explicit = false): SourceCompletions {
  const position = Math.max(0, Math.min(offset, source.length));
  const before = source.slice(0, position);
  const prefix = /[A-Za-z_][\w-]*$/u.exec(before)?.[0] ?? '';
  const start = position - prefix.length;
  const tail = /^[\w-]*/u.exec(source.slice(position))?.[0] ?? '';
  const result: SourceCompletions = { start, end: position + tail.length, items: [] };
  if ((!prefix && !explicit) || source.length > SOURCE_HIGHLIGHT_LIMIT) return result;
  const tokens = sourceTokens(source);
  if (tokens.some((token) => (token.kind === 'string' || token.kind === 'comment') &&
      position > token.start && position <= token.start + token.text.length)) return result;
  // An unclosed quoted/bracket label is also prose, not an identifier prefix.
  const currentLine = before.slice(before.lastIndexOf('\n') + 1);
  if (/(?:\[[^\]]*|\|[^|]*)$/u.test(currentLine)) return result;
  const identifiers = new Set(tokens.filter((token) => token.kind === 'identifier' &&
    (token.start < start || token.start >= result.end)).map(({ text }) => text));
  const candidates: SourceCompletion[] = [
    ...[...identifiers].sort().map((label) => ({ label, detail: 'Identifier in this diagram', kind: 'identifier' as const })),
    ...MERMAID_KEYWORDS.map(({ label, detail }) => ({ label, detail, kind: 'keyword' as const })),
  ];
  const lowerPrefix = prefix.toLowerCase();
  const currentWord = source.slice(start, result.end);
  result.items = candidates.filter(({ label }) => label.toLowerCase().startsWith(lowerPrefix) &&
    label !== currentWord).slice(0, 12);
  return result;
}

export function indentSource(source: string, start: number, end: number, outdent = false): SourceEdit {
  if (start === end && !outdent) return replacement(start, end, '  ');
  const firstLine = (start === 0 ? 0 : source.lastIndexOf('\n', start - 1) + 1);
  const lastLine = end > start && source[end - 1] === '\n' ? end - 1 : end;
  const nextBreak = source.indexOf('\n', lastLine);
  const lastEnd = nextBreak < 0 ? source.length : nextBreak;
  const block = source.slice(firstLine, lastEnd);
  const lines = block.split('\n');
  let selectionStart = start;
  let selectionEnd = end;
  let lineOffset = firstLine;
  const text = lines.map((line) => {
    const removed = outdent ? (/^(?: {1,2}|\t)/u.exec(line)?.[0].length ?? 0) : 0;
    const delta = outdent ? -removed : 2;
    if (lineOffset <= start) selectionStart += outdent ? -Math.min(removed, start - lineOffset) : delta;
    if (lineOffset < end || (start === end && lineOffset <= end)) {
      selectionEnd += outdent ? -Math.min(removed, end - lineOffset) : delta;
    }
    lineOffset += line.length + 1;
    return outdent ? line.slice(removed) : `  ${line}`;
  }).join('\n');
  return { start: firstLine, end: lastEnd, text, selectionStart, selectionEnd };
}

export function newlineSource(source: string, start: number, end: number): SourceEdit {
  const lineStart = (start === 0 ? 0 : source.lastIndexOf('\n', start - 1) + 1);
  const before = source.slice(lineStart, start);
  const indent = /^[\t ]*/u.exec(before)?.[0] ?? '';
  const content = before.trim();
  const declarationLocation = mermaidDeclarationLocation(source);
  const declaration = declarationLocation?.word.toLowerCase();
  const flowchart = declaration === 'flowchart' || declaration === 'flowchart-elk' || declaration === 'graph';
  const sequence = declaration === 'sequencediagram';
  const opensBlock = (flowchart && /^subgraph\b/iu.test(content)) ||
    (sequence && /^(?:loop|alt|else|opt|par|and|rect|critical|break)\b/iu.test(content)) ||
    (declaration === 'classdiagram' && /\{\s*$/u.test(content)) ||
    ((declaration === 'statediagram' || declaration === 'statediagram-v2') && /\{\s*$/u.test(content));
  const firstWord = /^[\w-]+/u.exec(content)?.[0]?.toLowerCase() ?? '';
  const isDeclaration = declarationLocation?.offset === lineStart + indent.length && DIAGRAM_DECLARATIONS.has(firstWord);
  const extra = opensBlock || isDeclaration ? '  ' : '';
  return replacement(start, end, `\n${indent}${extra}`);
}

function replacement(start: number, end: number, text: string): SourceEdit {
  return { start, end, text, selectionStart: start + text.length, selectionEnd: start + text.length };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}
