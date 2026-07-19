export type DocumentationKind = 'asciidoc' | 'markdown' | 'mdx';

export interface MermaidDocumentationBlock {
  endLine: number;
  endOffset: number;
  id: string;
  indent: string;
  index: number;
  source: string;
  sourceEndLine: number;
  sourceEndOffset: number;
  sourceStartLine: number;
  sourceStartOffset: number;
  startLine: number;
  startOffset: number;
}

interface SourceLine {
  contentEnd: number;
  end: number;
  start: number;
  text: string;
}

export function documentationKind(
  languageId: string,
  path = '',
): DocumentationKind | undefined {
  const normalizedLanguage = languageId.toLowerCase();
  if (normalizedLanguage === 'mdx' || /\.mdx$/iu.test(path)) {
    return 'mdx';
  }
  if (
    normalizedLanguage === 'asciidoc' ||
    normalizedLanguage === 'adoc' ||
    /\.(?:adoc|asciidoc|asc)$/iu.test(path)
  ) {
    return 'asciidoc';
  }
  if (
    normalizedLanguage === 'markdown' ||
    normalizedLanguage === 'md' ||
    /\.(?:md|markdown)$/iu.test(path)
  ) {
    return 'markdown';
  }
  return undefined;
}

export function extractMermaidBlocks(
  text: string,
  kind: DocumentationKind,
): MermaidDocumentationBlock[] {
  const lines = sourceLines(text);
  return kind === 'asciidoc'
    ? extractAsciiDocBlocks(text, lines)
    : extractMarkdownBlocks(text, lines);
}

export function mermaidBlockAtLine(
  blocks: readonly MermaidDocumentationBlock[],
  line: number,
): MermaidDocumentationBlock | undefined {
  return blocks.find((block) => line >= block.startLine && line <= block.endLine);
}

export function replaceMermaidBlocks(
  text: string,
  blocks: readonly MermaidDocumentationBlock[],
  replacementFor: (block: MermaidDocumentationBlock) => string,
): string {
  let result = text;
  const ordered = [...blocks].sort((left, right) => right.startOffset - left.startOffset);
  for (const block of ordered) {
    result = `${result.slice(0, block.startOffset)}${replacementFor(block)}${result.slice(block.endOffset)}`;
  }
  return result;
}

export function documentationImageReference(
  kind: DocumentationKind,
  relativePath: string,
  label: string,
): string {
  const safeLabel = label.replaceAll(']', '\\]');
  return kind === 'asciidoc'
    ? `image::${relativePath}[${safeLabel}]`
    : `![${safeLabel}](${encodeDocumentationPath(relativePath)})`;
}

function extractMarkdownBlocks(
  text: string,
  lines: readonly SourceLine[],
): MermaidDocumentationBlock[] {
  const blocks: MermaidDocumentationBlock[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line) continue;
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line.text);
    const marker = opening?.[1];
    if (!marker || !isMermaidFenceInfo(opening?.[2] ?? '')) continue;

    let closingIndex = lineIndex + 1;
    while (closingIndex < lines.length) {
      const candidate = lines[closingIndex];
      if (candidate && isClosingFence(candidate.text, marker)) break;
      closingIndex += 1;
    }
    const hasClosingFence = closingIndex < lines.length;
    const sourceStartLine = lineIndex + 1;
    const sourceStartOffset = lines[sourceStartLine]?.start ?? line.end;
    const sourceEndOffset = hasClosingFence
      ? (lines[closingIndex]?.start ?? text.length)
      : text.length;
    const endLine = hasClosingFence ? closingIndex : Math.max(lineIndex, lines.length - 1);
    const endOffset = hasClosingFence
      ? (lines[closingIndex]?.contentEnd ?? text.length)
      : text.length;
    blocks.push(createBlock({
      endLine,
      endOffset,
      indent: /^\s*/u.exec(line.text)?.[0] ?? '',
      index: blocks.length,
      source: text.slice(sourceStartOffset, sourceEndOffset),
      sourceEndLine: Math.max(sourceStartLine, endLine - 1),
      sourceEndOffset,
      sourceStartLine,
      sourceStartOffset,
      startLine: lineIndex,
      startOffset: line.start,
    }));
    lineIndex = endLine;
  }
  return blocks;
}

function extractAsciiDocBlocks(
  text: string,
  lines: readonly SourceLine[],
): MermaidDocumentationBlock[] {
  const blocks: MermaidDocumentationBlock[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line) continue;
    const attributes = /^\s*\[([^\x5d]+)\]\s*$/u.exec(line.text)?.[1];
    if (!attributes || !isMermaidAsciiDocAttributes(attributes)) continue;

    let delimiterIndex = lineIndex + 1;
    while (delimiterIndex < lines.length && !lines[delimiterIndex]?.text.trim()) {
      delimiterIndex += 1;
    }
    const delimiter = lines[delimiterIndex]?.text.trim() ?? '';
    if (!/^(?:-{4,}|\.{4,})$/u.test(delimiter)) continue;

    let closingIndex = delimiterIndex + 1;
    while (closingIndex < lines.length && lines[closingIndex]?.text.trim() !== delimiter) {
      closingIndex += 1;
    }
    const hasClosingDelimiter = closingIndex < lines.length;
    const sourceStartLine = delimiterIndex + 1;
    const sourceStartOffset = lines[sourceStartLine]?.start ?? (lines[delimiterIndex]?.end ?? line.end);
    const sourceEndOffset = hasClosingDelimiter
      ? (lines[closingIndex]?.start ?? text.length)
      : text.length;
    const endLine = hasClosingDelimiter
      ? closingIndex
      : Math.max(delimiterIndex, lines.length - 1);
    const endOffset = hasClosingDelimiter
      ? (lines[closingIndex]?.contentEnd ?? text.length)
      : text.length;
    blocks.push(createBlock({
      endLine,
      endOffset,
      indent: /^\s*/u.exec(line.text)?.[0] ?? '',
      index: blocks.length,
      source: text.slice(sourceStartOffset, sourceEndOffset),
      sourceEndLine: Math.max(sourceStartLine, endLine - 1),
      sourceEndOffset,
      sourceStartLine,
      sourceStartOffset,
      startLine: lineIndex,
      startOffset: line.start,
    }));
    lineIndex = endLine;
  }
  return blocks;
}

function createBlock(
  block: Omit<MermaidDocumentationBlock, 'id'>,
): MermaidDocumentationBlock {
  return {
    ...block,
    id: `mermaid-block-${block.index + 1}-line-${block.startLine + 1}`,
  };
}

function isMermaidFenceInfo(value: string): boolean {
  const info = value.trim();
  if (!info) return false;
  if (info.startsWith('{')) {
    const closing = info.indexOf('}');
    const attributes = info.slice(1, closing >= 0 ? closing : undefined);
    return /(?:^|[\s,])\.?mermaid(?:$|[\s,])/iu.test(attributes);
  }
  return /^mermaid(?:\s|$)/iu.test(info);
}

function isClosingFence(value: string, marker: string): boolean {
  const candidate = value.replace(/^ {0,3}/u, '').trimEnd();
  const character = marker[0];
  return (
    character !== undefined &&
    candidate.length >= marker.length &&
    [...candidate].every((entry) => entry === character)
  );
}

function isMermaidAsciiDocAttributes(value: string): boolean {
  return value
    .split(',')
    .map((attribute) => attribute.trim().split(/[=\s]/u, 1)[0]?.toLowerCase())
    .some((attribute) => attribute === 'mermaid');
}

function encodeDocumentationPath(value: string): string {
  return value
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function sourceLines(text: string): SourceLine[] {
  if (!text) return [];
  const lines: SourceLine[] = [];
  let start = 0;
  while (start < text.length) {
    let contentEnd = start;
    while (contentEnd < text.length && text[contentEnd] !== '\n' && text[contentEnd] !== '\r') {
      contentEnd += 1;
    }
    let end = contentEnd;
    if (text[end] === '\r') end += 1;
    if (text[end] === '\n') end += 1;
    lines.push({
      contentEnd,
      end,
      start,
      text: text.slice(start, contentEnd),
    });
    start = end;
  }
  return lines;
}
