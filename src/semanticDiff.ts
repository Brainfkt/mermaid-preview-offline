/** A conservative structural diff, not a replacement for Mermaid validation. */
export interface SemanticNode {
  id: string;
  label: string;
  shape: string;
  kind: 'node' | 'subgraph';
  parent?: string;
}

export interface SemanticEdge {
  /** Explicit edge IDs take precedence; otherwise the directed endpoint pair is the identity. */
  key: string;
  /** Renderer identity, excluded from structural equality because order may change it. */
  renderId: string;
  id?: string;
  from: string;
  to: string;
  label: string;
  operator: string;
}

export interface SemanticEntityDiff<T> {
  added: T[];
  removed: T[];
  modified: { before: T; after: T; fields: string[] }[];
  unchanged: T[];
}

export interface SupportedSemanticDiff {
  status: 'supported';
  nodes: SemanticEntityDiff<SemanticNode>;
  edges: SemanticEntityDiff<SemanticEdge>;
  summary: { added: number; removed: number; modified: number; unchanged: number };
  limitations: string[];
}

export interface UnsupportedSemanticDiff {
  status: 'unsupported';
  side: 'before' | 'after';
  reason: string;
  /** One-based line in the corresponding input. */
  line?: number;
  limitations: string[];
}

export type SemanticDiffResult = SupportedSemanticDiff | UnsupportedSemanticDiff;

const LIMITATIONS = [
  'Compares flowchart node IDs, labels, shapes, subgraph membership, and links. Comments, styling, layout directions, initialization configuration, and frontmatter are ignored.',
  'Supports classic node shapes and explicit subgraph IDs. Unsupported or ambiguous syntax disables the semantic comparison for the entire diagram.',
  'Parallel links need explicit edge IDs; a renamed node ID is reported as a removal and an addition.',
];
const MAX_SOURCE_LENGTH = 2_000_000;
const MAX_ENTITIES = 20_000;
const ID_CHARACTER = /[\p{L}\p{N}_.:-]/u;
const RESERVED_IDS = new Set(['end', 'subgraph', 'direction', 'flowchart', 'graph']);

interface Statement { text: string; line: number }
interface ParsedFlowchart { nodes: Map<string, SemanticNode>; edges: Map<string, SemanticEdge> }
interface NodeToken { id: string; label?: string; shape?: string; end: number }
interface EdgeToken { id?: string; label: string; operator: string; end: number }
interface Shape { open: string; close: string; name: string }

const SHAPES: readonly Shape[] = [
  { open: '(((', close: ')))', name: 'double-circle' },
  { open: '([', close: '])', name: 'stadium' },
  { open: '[(', close: ')]', name: 'cylinder' },
  { open: '[[', close: ']]', name: 'subroutine' },
  { open: '((', close: '))', name: 'circle' },
  { open: '{{', close: '}}', name: 'hexagon' },
  { open: '[/', close: '/]', name: 'parallelogram' },
  { open: '[\\', close: '\\]', name: 'parallelogram-alt' },
  { open: '[/', close: '\\]', name: 'trapezoid' },
  { open: '[\\', close: '/]', name: 'trapezoid-alt' },
  { open: '[', close: ']', name: 'rect' },
  { open: '(', close: ')', name: 'rounded' },
  { open: '{', close: '}', name: 'diamond' },
  { open: '>', close: ']', name: 'asymmetric' },
];

class UnsupportedSyntax extends Error {
  public constructor(message: string, public readonly line?: number) {
    super(message);
  }
}

/**
 * Returns only plain serializable values. No partial result is returned for an
 * unsupported input: callers should retain their ordinary before/after view.
 */
export function compareFlowcharts(before: string, after: string): SemanticDiffResult {
  let left: ParsedFlowchart;
  let right: ParsedFlowchart;
  try {
    left = parseFlowchart(before);
  } catch (error: unknown) {
    if (!(error instanceof UnsupportedSyntax)) throw error;
    return unsupported('before', error);
  }
  try {
    right = parseFlowchart(after);
  } catch (error: unknown) {
    if (!(error instanceof UnsupportedSyntax)) throw error;
    return unsupported('after', error);
  }
  const nodes = compareEntities(left.nodes, right.nodes, ['label', 'shape', 'kind', 'parent']);
  const edges = compareEntities(left.edges, right.edges, ['from', 'to', 'label', 'operator']);
  return {
    status: 'supported',
    nodes,
    edges,
    summary: {
      added: nodes.added.length + edges.added.length,
      removed: nodes.removed.length + edges.removed.length,
      modified: nodes.modified.length + edges.modified.length,
      unchanged: nodes.unchanged.length + edges.unchanged.length,
    },
    limitations: [...LIMITATIONS],
  };
}

function unsupported(side: 'before' | 'after', error: UnsupportedSyntax): UnsupportedSemanticDiff {
  return {
    status: 'unsupported', side, reason: error.message,
    ...(error.line !== undefined ? { line: error.line } : {}),
    limitations: [...LIMITATIONS],
  };
}

function compareEntities<T extends object>(
  before: ReadonlyMap<string, T>,
  after: ReadonlyMap<string, T>,
  fields: readonly (keyof T & string)[],
): SemanticEntityDiff<T> {
  const result: SemanticEntityDiff<T> = { added: [], removed: [], modified: [], unchanged: [] };
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  for (const key of keys) {
    const previous = before.get(key);
    const current = after.get(key);
    if (previous === undefined) {
      if (current !== undefined) result.added.push(current);
    } else if (current === undefined) {
      result.removed.push(previous);
    } else {
      const changed = fields.filter((field) => previous[field] !== current[field]);
      if (changed.length) result.modified.push({ before: previous, after: current, fields: changed });
      else result.unchanged.push(current);
    }
  }
  return result;
}

function parseFlowchart(source: string): ParsedFlowchart {
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new UnsupportedSyntax('Semantic comparison is limited to 2 million characters per diagram.');
  }
  const statements = splitStatements(source);
  const declaration = statements.shift();
  if (!declaration || !/^(?:flowchart(?:-elk)?|graph)\s+(?:TB|TD|BT|LR|RL)$/u.test(declaration.text)) {
    throw new UnsupportedSyntax('Semantic comparison supports flowcharts with a declared direction only.', declaration?.line);
  }
  const nodes = new Map<string, SemanticNode>();
  const edges = new Map<string, SemanticEdge>();
  const renderedEdgeIds = new Set<string>();
  const edgeOccurrences = new Map<string, number>();
  const explicitNodes = new Set<string>();
  const subgraphs = new Set<string>();
  const parents: string[] = [];

  function recordNode(token: NodeToken, line: number): SemanticNode {
    const parent = parents.at(-1);
    const existing = nodes.get(token.id);
    if (existing) {
      if (existing.kind === 'subgraph' && parent !== undefined && existing.parent !== parent) {
        throw new UnsupportedSyntax(`A link to subgraph "${token.id}" from inside another subgraph has ambiguous membership.`, line);
      }
      if (parent !== undefined && existing.parent !== undefined && existing.parent !== parent) {
        throw new UnsupportedSyntax(`Node "${token.id}" is referenced in different subgraphs.`, line);
      }
      if (token.label !== undefined) {
        if (existing.kind === 'subgraph') {
          throw new UnsupportedSyntax(`The subgraph ID "${token.id}" is also declared as a node.`, line);
        }
        if (explicitNodes.has(token.id) && (existing.label !== token.label || existing.shape !== token.shape)) {
          throw new UnsupportedSyntax(`Node "${token.id}" has conflicting declarations whose order changes its meaning.`, line);
        }
        existing.label = token.label;
        existing.shape = token.shape ?? 'rect';
        explicitNodes.add(token.id);
      }
      if (parent !== undefined && existing.kind !== 'subgraph') existing.parent = parent;
      return existing;
    }
    const node: SemanticNode = {
      id: token.id, label: token.label ?? token.id, shape: token.shape ?? 'rect', kind: 'node',
      ...(parent !== undefined ? { parent } : {}),
    };
    nodes.set(token.id, node);
    if (token.label !== undefined) explicitNodes.add(token.id);
    return node;
  }

  for (const statement of statements) {
    const { text, line } = statement;
    if (/^(?:classDef|class|style|linkStyle)\s/u.test(text)) continue;
    if (/^direction\s+(?:TB|TD|BT|LR|RL)$/u.test(text)) {
      if (!parents.length) throw new UnsupportedSyntax('A local direction needs a subgraph.', line);
      continue;
    }
    if (text === 'end') {
      if (!parents.pop()) throw new UnsupportedSyntax('Unexpected subgraph end.', line);
      continue;
    }
    if (/^subgraph\s/u.test(text)) {
      const token = readNode(text, skipSpace(text, 'subgraph'.length), line);
      if (skipSpace(text, token.end) !== text.length || (token.shape !== undefined && token.shape !== 'rect')) {
        throw new UnsupportedSyntax('Use an explicit subgraph ID with an optional [label].', line);
      }
      if (subgraphs.has(token.id) || explicitNodes.has(token.id)) {
        throw new UnsupportedSyntax(`Subgraph ID "${token.id}" is declared more than once or collides with a node.`, line);
      }
      const parent = parents.at(-1);
      const referenced = nodes.get(token.id);
      if (referenced?.parent !== undefined && referenced.parent !== parent) {
        throw new UnsupportedSyntax(`Subgraph "${token.id}" was referenced inside a different subgraph.`, line);
      }
      nodes.set(token.id, {
        id: token.id, label: token.label ?? token.id, shape: 'subgraph', kind: 'subgraph',
        ...(parent !== undefined ? { parent } : {}),
      });
      subgraphs.add(token.id);
      parents.push(token.id);
      if (nodes.size + edges.size > MAX_ENTITIES) {
        throw new UnsupportedSyntax('Semantic comparison is limited to 20,000 nodes and links.', line);
      }
      continue;
    }
    // Interaction/configuration directives have behavior outside this model.
    if (/^(?:click|accTitle|accDescr)\b/u.test(text) || text.includes('@{')) {
      throw new UnsupportedSyntax('Interaction, accessibility, and @{...} shape directives are not supported by semantic comparison.', line);
    }
    let token = readNode(text, 0, line);
    recordNode(token, line);
    let cursor = skipSpace(text, token.end);
    while (cursor < text.length) {
      const edge = readEdge(text, cursor, line);
      const target = readNode(text, skipSpace(text, edge.end), line);
      recordNode(target, line);
      const key = edge.id !== undefined ? `id:${edge.id}` : `endpoints:${JSON.stringify([token.id, target.id])}`;
      const endpoints = JSON.stringify([token.id, target.id]);
      const occurrences = edgeOccurrences.get(endpoints) ?? 0;
      const renderId = edge.id ?? `L_${token.id}_${target.id}_${occurrences === 0 ? 0 : occurrences + 1}`;
      if (renderedEdgeIds.has(renderId)) {
        throw new UnsupportedSyntax('Links generate the same rendered ID. Assign distinct explicit edge IDs.', line);
      }
      renderedEdgeIds.add(renderId);
      edgeOccurrences.set(endpoints, occurrences + 1);
      if (edges.has(key)) {
        throw new UnsupportedSyntax(
          edge.id !== undefined
            ? `Edge ID "${edge.id}" is used more than once.`
            : `Parallel links from "${token.id}" to "${target.id}" need explicit edge IDs.`,
          line,
        );
      }
      edges.set(key, {
        key, renderId, ...(edge.id !== undefined ? { id: edge.id } : {}),
        from: token.id, to: target.id, label: edge.label, operator: edge.operator,
      });
      token = target;
      cursor = skipSpace(text, target.end);
      if (nodes.size + edges.size > MAX_ENTITIES) {
        throw new UnsupportedSyntax('Semantic comparison is limited to 20,000 nodes and links.', line);
      }
    }
    if (nodes.size + edges.size > MAX_ENTITIES) {
      throw new UnsupportedSyntax('Semantic comparison is limited to 20,000 nodes and links.', line);
    }
  }
  if (parents.length) throw new UnsupportedSyntax('An unclosed subgraph prevents a reliable semantic comparison.');
  return { nodes, edges };
}

function readNode(text: string, start: number, line: number): NodeToken {
  const identifier = readIdentifier(text, start);
  if (!identifier || RESERVED_IDS.has(identifier.id)) {
    throw new UnsupportedSyntax('Expected an unambiguous node ID; grouped endpoints and special syntax are not supported.', line);
  }
  let cursor = skipSpace(text, identifier.end);
  let token: NodeToken = { ...identifier, end: cursor };
  const candidates = SHAPES.filter((shape) => text.startsWith(shape.open, cursor));
  if (candidates.length) {
    // Prefer the most specific opening delimiter. The two slash-delimited
    // shape variants share an opening and are distinguished by their close.
    const longestOpening = candidates[0]?.open.length ?? 0;
    const variants = candidates.filter((shape) => shape.open.length === longestOpening);
    const contentStart = cursor + longestOpening;
    const parsed = readShapeLabel(text, contentStart, variants, line);
    token = { id: identifier.id, label: parsed.label, shape: parsed.shape.name, end: parsed.end };
    cursor = skipSpace(text, parsed.end);
  }
  if (text.startsWith(':::', cursor)) {
    cursor += 3;
    while (true) {
      const className = readIdentifier(text, cursor);
      if (!className || !/^[\p{L}\p{N}_-]+$/u.test(className.id)) {
        throw new UnsupportedSyntax('Invalid inline class assignment.', line);
      }
      cursor = className.end;
      if (text[cursor] !== ',') break;
      cursor += 1;
    }
  }
  return { ...token, end: skipSpace(text, cursor) };
}

function readIdentifier(text: string, start: number): { id: string; end: number } | undefined {
  let cursor = start;
  while (cursor < text.length) {
    const character = text[cursor];
    if (!character || !ID_CHARACTER.test(character) || text.startsWith(':::', cursor)) break;
    if (text.startsWith('--', cursor) || text.startsWith('-.', cursor)) break;
    cursor += 1;
  }
  if (cursor === start) return undefined;
  const id = text.slice(start, cursor);
  // Dashes and dots are accepted inside IDs, but cannot begin an ID: those
  // prefixes overlap Mermaid's edge grammar.
  if (!/^[\p{L}\p{N}_]/u.test(id)) return undefined;
  return { id, end: cursor };
}

function readShapeLabel(
  text: string, start: number, variants: readonly Shape[], line: number,
): { label: string; shape: Shape; end: number } {
  let quoted = false;
  for (let cursor = start; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (character === '"') {
      if (text[cursor - 1] === '\\') throw new UnsupportedSyntax('Backslash-escaped quotes are ambiguous; use Mermaid entities.', line);
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    const shape = variants.find((candidate) => text.startsWith(candidate.close, cursor));
    if (shape) {
      const label = normalizeLabel(text.slice(start, cursor), line);
      return { label, shape, end: cursor + shape.close.length };
    }
    if (character && /[[\](){}]/u.test(character)) {
      throw new UnsupportedSyntax('Nested delimiters inside labels need double quotes.', line);
    }
  }
  throw new UnsupportedSyntax('A node label has an unsupported or unclosed shape delimiter.', line);
}

function normalizeLabel(raw: string, line: number): string {
  let label = raw.trim();
  if (label.startsWith('"') && label.endsWith('"')) label = label.slice(1, -1);
  if (label.includes('"') || label.includes('`')) {
    throw new UnsupportedSyntax('Mixed quoted text and Markdown labels are not supported by semantic comparison.', line);
  }
  return label;
}

function readEdge(text: string, start: number, line: number): EdgeToken {
  let cursor = start;
  let id: string | undefined;
  const identifier = readIdentifier(text, cursor);
  if (identifier && text[identifier.end] === '@') {
    id = identifier.id;
    cursor = identifier.end + 1;
  }
  const direct = /^(?:<[-=]+>|<[-.]?\.+->|[ox][-]{2,}[ox>]?|[-]{2,}[ox>]|[-]{3,}|={2,}>|={3,}|-\.{1,}->|-\.{1,}-|~{3,})/u.exec(text.slice(cursor));
  if (direct) {
    cursor += direct[0].length;
    const operator = normalizeOperator(direct[0], line);
    cursor = skipSpace(text, cursor);
    let label = '';
    if (text[cursor] === '|') {
      const labelResult = readPipeLabel(text, cursor + 1, line);
      label = labelResult.label;
      cursor = labelResult.end;
    }
    return { ...(id !== undefined ? { id } : {}), label, operator, end: cursor };
  }
  // The alternate Mermaid edge label form: A -- label --> B (and dotted/thick forms).
  const opening = /^(--|==|-\.)\s+/u.exec(text.slice(cursor));
  if (opening) {
    const labelStart = cursor + opening[0].length;
    const closing = opening[1] === '--' ? /\s+--+>/gu : opening[1] === '==' ? /\s+==+>/gu : /\s+\.-+>/gu;
    closing.lastIndex = labelStart;
    const match = closing.exec(text);
    if (match) {
      const label = normalizeLabel(text.slice(labelStart, match.index), line);
      if (!label || /[|[\]{}]/u.test(label)) {
        throw new UnsupportedSyntax('The edge label cannot be interpreted reliably.', line);
      }
      const operator = opening[1] === '--' ? '-->' : opening[1] === '==' ? '==>' : '-.->';
      return { ...(id !== undefined ? { id } : {}), label, operator, end: match.index + match[0].length };
    }
  }
  throw new UnsupportedSyntax('Unsupported link syntax; grouped endpoints, properties, and ambiguous links are not compared.', line);
}

function normalizeOperator(value: string, line: number): string {
  // Extra dashes/dots request minimum layout length, not a different relation.
  if (/^-{2,}>$/u.test(value)) return '-->';
  if (/^-{3,}$/u.test(value)) return '---';
  if (/^={2,}>$/u.test(value)) return '==>';
  if (/^={3,}$/u.test(value)) return '===';
  if (/^-\.+->$/u.test(value)) return '-.->';
  if (/^-\.+-$/u.test(value)) return '-.-';
  if (/^~{3,}$/u.test(value)) return '~~~';
  if (/^<-{2,}>$/u.test(value)) return '<-->';
  if (/^<={2,}>$/u.test(value)) return '<==>';
  if (/^<-\.+->$/u.test(value)) return '<-.->';
  if (/^[ox]?-{2,}[ox>]$/u.test(value)) return value.replace(/-{2,}/u, '--');
  throw new UnsupportedSyntax('This arrow type is not supported by semantic comparison.', line);
}

function readPipeLabel(text: string, start: number, line: number): { label: string; end: number } {
  let quoted = false;
  for (let cursor = start; cursor < text.length; cursor += 1) {
    if (text[cursor] === '"') quoted = !quoted;
    if (!quoted && text[cursor] === '|') {
      return { label: normalizeLabel(text.slice(start, cursor), line), end: cursor + 1 };
    }
  }
  throw new UnsupportedSyntax('An edge label has no closing pipe.', line);
}

function skipSpace(text: string, start: number): number {
  let cursor = start;
  while (cursor < text.length && /\s/u.test(text[cursor] ?? '')) cursor += 1;
  return cursor;
}

function splitStatements(source: string): Statement[] {
  const normalized = source.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n');
  const lines = normalized.split('\n');
  const first = lines.findIndex((line) => line.trim() !== '');
  if (first >= 0 && lines[first]?.trim() === '---') {
    const closing = lines.findIndex((line, index) => index > first && line.trim() === '---');
    if (closing < 0) throw new UnsupportedSyntax('Unclosed frontmatter.', first + 1);
    for (let index = first; index <= closing; index += 1) lines[index] = '';
  }
  const text = lines.join('\n');
  const statements: Statement[] = [];
  let buffer = '';
  let quoted = false;
  let square = 0;
  let round = 0;
  let curly = 0;
  let line = 1;
  let startLine = 1;
  let pipe = false;
  let hasContent = false;
  function flush(): void {
    if (buffer.trim()) statements.push({ text: buffer.trim(), line: startLine });
    buffer = '';
    hasContent = false;
  }
  for (let cursor = 0; cursor < text.length; cursor += 1) {
    const character = text[cursor] ?? '';
    const insideShape = square > 0 || round > 0 || curly > 0;
    if (!quoted && !insideShape && !pipe && text.startsWith('%%', cursor)) {
      if (text.startsWith('%%{', cursor)) {
        const end = text.indexOf('}%%', cursor + 3);
        if (end < 0) throw new UnsupportedSyntax('Unclosed Mermaid initialization directive.', line);
        line += text.slice(cursor, end + 3).split('\n').length - 1;
        cursor = end + 2;
      } else {
        const end = text.indexOf('\n', cursor);
        cursor = end < 0 ? text.length : end - 1;
      }
      continue;
    }
    if (!hasContent && !/\s/u.test(character)) {
      startLine = line;
      hasContent = true;
    }
    if (character === '"') quoted = !quoted;
    if (!quoted) {
      if (character === '|' && !insideShape) pipe = !pipe;
      if (!pipe) {
        if (character === '[') square += 1;
        if (character === ']') square = Math.max(0, square - 1);
        if (character === '(') round += 1;
        if (character === ')') round = Math.max(0, round - 1);
        if (character === '{') curly += 1;
        if (character === '}') curly = Math.max(0, curly - 1);
      }
    }
    if (!quoted && !pipe && square === 0 && round === 0 && curly === 0 && (character === ';' || character === '\n')) {
      flush();
    } else {
      buffer += character;
    }
    if (character === '\n') line += 1;
  }
  if (quoted || pipe || square || round || curly) {
    throw new UnsupportedSyntax('Unclosed quotes, label, or delimiters prevent a reliable semantic comparison.', startLine);
  }
  flush();
  return statements;
}
