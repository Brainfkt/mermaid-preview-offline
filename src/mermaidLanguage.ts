export interface MermaidKeyword {
  detail: string;
  documentation: string;
  label: string;
}

export interface GeneratedIdentifiers {
  count: number;
  text: string;
}

export interface MermaidDeclarationLocation {
  offset: number;
  word: string;
}

export const MERMAID_KEYWORDS: readonly MermaidKeyword[] = [
  keyword('flowchart', 'Flowchart declaration', 'Starts a flowchart. Add a direction such as `LR`, `TD`, `TB`, `RL`, or `BT`.'),
  keyword('flowchart-elk', 'Flowchart declaration', 'Starts a flowchart rendered with the ELK layout engine. Add a direction such as `TB` or `LR`.'),
  keyword('graph', 'Flowchart declaration', 'Alias for `flowchart`, followed by a layout direction.'),
  keyword('sequenceDiagram', 'Sequence diagram declaration', 'Starts a sequence diagram.'),
  keyword('classDiagram', 'Class diagram declaration', 'Starts a UML-style class diagram.'),
  keyword('stateDiagram-v2', 'State diagram declaration', 'Starts a state diagram using the current syntax.'),
  keyword('stateDiagram', 'State diagram declaration', 'Starts a state diagram using the classic syntax.'),
  keyword('erDiagram', 'Entity relationship declaration', 'Starts an entity relationship diagram.'),
  keyword('journey', 'User journey declaration', 'Starts a user journey diagram.'),
  keyword('gantt', 'Gantt declaration', 'Starts a Gantt chart.'),
  keyword('pie', 'Pie chart declaration', 'Starts a pie chart. Add `showData` to display values.'),
  keyword('quadrantChart', 'Quadrant chart declaration', 'Starts a quadrant chart.'),
  keyword('requirementDiagram', 'Requirement diagram declaration', 'Starts a requirement diagram.'),
  keyword('gitGraph', 'Git graph declaration', 'Starts a Git history diagram.'),
  keyword('mindmap', 'Mindmap declaration', 'Starts an indentation-sensitive mindmap.'),
  keyword('timeline', 'Timeline declaration', 'Starts a timeline diagram.'),
  keyword('sankey-beta', 'Sankey declaration', 'Starts a Sankey diagram using CSV-like rows.'),
  keyword('xychart-beta', 'XY chart declaration', 'Starts an XY chart.'),
  keyword('block-beta', 'Block diagram declaration', 'Starts a block diagram.'),
  keyword('packet-beta', 'Packet declaration', 'Starts a packet layout diagram.'),
  keyword('kanban', 'Kanban declaration', 'Starts a Kanban board.'),
  keyword('architecture-beta', 'Architecture declaration', 'Starts an architecture diagram.'),
  keyword('radar-beta', 'Radar chart declaration', 'Starts a radar chart.'),
  keyword('treemap-beta', 'Treemap declaration', 'Starts a treemap.'),
  keyword('zenuml', 'ZenUML declaration', 'Starts a ZenUML diagram using the bundled offline plug-in.'),
  keyword('C4Context', 'C4 context declaration', 'Starts a C4 system context diagram.'),
  keyword('C4Container', 'C4 container declaration', 'Starts a C4 container diagram.'),
  keyword('C4Component', 'C4 component declaration', 'Starts a C4 component diagram.'),
  keyword('C4Dynamic', 'C4 dynamic declaration', 'Starts a C4 dynamic diagram.'),
  keyword('C4Deployment', 'C4 deployment declaration', 'Starts a C4 deployment diagram.'),
  keyword('swimlane-beta', 'Swimlane declaration', 'Starts a swimlane diagram.'),
  keyword('eventmodeling', 'Event modeling declaration', 'Starts an event modeling diagram.'),
  keyword('venn-beta', 'Venn declaration', 'Starts a Venn diagram.'),
  keyword('ishikawa-beta', 'Ishikawa declaration', 'Starts an indentation-sensitive cause-and-effect diagram.'),
  keyword('wardley-beta', 'Wardley map declaration', 'Starts a Wardley map.'),
  keyword('cynefin-beta', 'Cynefin declaration', 'Starts a Cynefin decision diagram.'),
  keyword('treeView-beta', 'Tree view declaration', 'Starts an indentation-sensitive tree view.'),
  keyword('railroad-beta', 'Railroad declaration', 'Starts a railroad grammar diagram.'),
  keyword('railroad-ebnf-beta', 'EBNF railroad declaration', 'Starts a railroad diagram from EBNF rules.'),
  keyword('railroad-abnf-beta', 'ABNF railroad declaration', 'Starts a railroad diagram from ABNF rules.'),
  keyword('railroad-peg-beta', 'PEG railroad declaration', 'Starts a railroad diagram from PEG rules.'),
  keyword('info', 'Info declaration', 'Displays Mermaid renderer version information.'),
  keyword('subgraph', 'Flowchart block', 'Starts a named flowchart subgraph. Close it with `end`.'),
  keyword('end', 'Block terminator', 'Closes a `subgraph` or sequence control block.'),
  keyword('direction', 'Layout direction', 'Overrides layout direction inside a flowchart subgraph.'),
  keyword('participant', 'Sequence participant', 'Declares a sequence participant. Use `as` for a display label.'),
  keyword('actor', 'Sequence actor', 'Declares a sequence actor.'),
  keyword('activate', 'Sequence activation', 'Starts an activation bar for a participant.'),
  keyword('deactivate', 'Sequence activation', 'Ends an activation bar for a participant.'),
  keyword('loop', 'Sequence block', 'Starts a repeating sequence block. Close it with `end`.'),
  keyword('alt', 'Sequence block', 'Starts an alternative sequence branch. Close it with `end`.'),
  keyword('else', 'Sequence branch', 'Starts the next branch of an `alt` block.'),
  keyword('opt', 'Sequence block', 'Starts an optional sequence block. Close it with `end`.'),
  keyword('par', 'Sequence block', 'Starts a parallel sequence block. Use `and` for another branch.'),
  keyword('and', 'Sequence branch', 'Starts another branch of a `par` block.'),
  keyword('rect', 'Sequence highlight block', 'Highlights messages in a colored rectangular region.'),
  keyword('critical', 'Sequence block', 'Starts a critical sequence region.'),
  keyword('break', 'Sequence block', 'Starts a break sequence region.'),
  keyword('classDef', 'Class style declaration', 'Defines a reusable style for flowchart nodes.'),
  keyword('class', 'Class assignment', 'Assigns a flowchart node to one or more classes.'),
  keyword('style', 'Inline node style', 'Applies CSS-like styles to a flowchart node.'),
  keyword('linkStyle', 'Link style', 'Applies styles to one or more flowchart links.'),
  keyword('click', 'Node interaction', 'Associates a link or callback with a node. Links remain subject to preview security.'),
  keyword('title', 'Diagram title', 'Adds a title in diagram metadata or supported diagram bodies.'),
  keyword('section', 'Section declaration', 'Starts a named section in Gantt, journey, timeline, and related diagrams.'),
  keyword('accTitle', 'Accessible title', 'Defines the accessible title for the diagram.'),
  keyword('accDescr', 'Accessible description', 'Defines the accessible description for the diagram.'),
  keyword('note', 'Annotation', 'Adds a note in diagram families that support annotations.'),
  keyword('autonumber', 'Sequence numbering', 'Automatically numbers sequence messages.'),
];

export const DIAGRAM_DECLARATIONS = new Set(
  MERMAID_KEYWORDS.filter(({ detail }) => /declaration$/iu.test(detail)).map(({ label }) =>
    label.toLowerCase(),
  ),
);

const RESERVED_IDENTIFIERS = new Set(
  MERMAID_KEYWORDS.map(({ label }) => label.toLowerCase()).concat([
    'as',
    'bt',
    'false',
    'lr',
    'rl',
    'tb',
    'td',
    'true',
  ]),
);

const BLOCK_START = /^(?:subgraph|loop|alt|opt|par|rect|critical|break)\b/iu;
const FLOWCHART_BLOCK_START = /^subgraph\b/iu;
const SEQUENCE_BLOCK_START = /^(?:loop|alt|opt|par|rect|critical|break)\b/iu;
const BRANCH = /^(?:else|and)(?:\b|$)/iu;
const BLOCK_END = /^end(?:\b|$)/iu;
const BRACE_BRANCH = /^\}\s*else\b.*\{\s*$/iu;
const BRACE_END = /^\}/u;
const BRACE_START = /\{\s*$/u;
const INDENTATION_SENSITIVE = /^(?:mindmap|timeline|journey|sankey-beta|packet-beta|kanban|architecture-beta|treemap-beta|swimlane-beta|eventmodeling|venn-beta|ishikawa-beta|wardley-beta|cynefin-beta|treeView-beta|railroad(?:-(?:ebnf|abnf|peg))?-beta)\b/iu;

export function formatMermaid(source: string, indentation: string): string {
  const hasFinalNewline = /\r?\n$/u.test(source);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const rawLines = source.split(/\r?\n/u);
  if (hasFinalNewline) {
    rawLines.pop();
  }

  const frontmatterEnd =
    rawLines[0]?.trim() === '---'
      ? rawLines.findIndex((line, index) => index > 0 && line.trim() === '---')
      : -1;
  const frontmatter =
    frontmatterEnd > 0
      ? rawLines.slice(0, frontmatterEnd + 1).map((line) => line.replace(/[ \t]+$/u, ''))
      : [];
  const bodyLines = frontmatterEnd > 0 ? rawLines.slice(frontmatterEnd + 1) : rawLines;
  const firstCodeLine = bodyLines.find((line) => /\S/u.test(line) && !/^\s*%%/u.test(line));
  if (firstCodeLine && INDENTATION_SENSITIVE.test(firstCodeLine.trim())) {
    const formatted = [...frontmatter, ...bodyLines.map((line) => line.replace(/[ \t]+$/u, ''))].join(newline);
    return `${formatted}${hasFinalNewline ? newline : ''}`;
  }

  let depth = 0;
  let seenDeclaration = false;
  const formattedBody = bodyLines.map((rawLine) => {
    const trimmedEnd = rawLine.replace(/[ \t]+$/u, '');
    const content = trimmedEnd.trimStart();
    if (!content) {
      return '';
    }

    if (!seenDeclaration && isDiagramDeclaration(content)) {
      seenDeclaration = true;
      depth = 1;
      return content;
    }

    if (
      BLOCK_END.test(content) ||
      BRANCH.test(content) ||
      BRACE_END.test(content)
    ) {
      depth = Math.max(depth - 1, seenDeclaration ? 1 : 0);
    }
    const result = `${indentation.repeat(depth)}${content}`;
    if (
      BLOCK_START.test(content) ||
      BRANCH.test(content) ||
      BRACE_START.test(content) ||
      BRACE_BRANCH.test(content)
    ) {
      depth += 1;
    }
    return result;
  });

  return `${[...frontmatter, ...formattedBody].join(newline)}${hasFinalNewline ? newline : ''}`;
}

export function generateMissingIdentifiers(source: string): GeneratedIdentifiers {
  const flowchartDeclaration = source
    .split(/\r?\n/u)
    .find((line) => /^\s*(?:flowchart(?:-elk)?|graph)\b/iu.test(line));
  if (!flowchartDeclaration) {
    return { count: 0, text: source };
  }
  const used = new Set<string>();
  for (const match of source.matchAll(/\b([A-Za-z_][\w-]*)\s*(?=\[|\(|\{)/gu)) {
    const identifier = match[1];
    if (identifier) {
      used.add(identifier);
    }
  }

  let count = 0;
  const text = source
    .split(/(?<=\n)/u)
    .map((line) =>
      line.replace(
        /(^\s*|(?:-->|---|-\.->|==>|-->>|->>|--x|--o|<-->|<->)\s*)(\[\[?|\(\(?|\{\{?)([^\]\n)}]+)(\]\]?|\)\)?|\}\}?)/gu,
        (match, prefix: string, opener: string, rawLabel: string, closer: string) => {
          if (!isMatchingShape(opener, closer)) {
            return match;
          }
          const label = rawLabel.replace(/^['"]|['"]$/gu, '').trim();
          const base = slugIdentifier(label) || 'node';
          const identifier = uniqueIdentifier(base, used);
          used.add(identifier);
          count += 1;
          return `${prefix}${identifier}${opener}${rawLabel}${closer}`;
        },
      ),
    )
    .join('');

  return { count, text };
}

export function identifierAt(source: string, offset: number): { end: number; name: string; start: number } | undefined {
  const masked = maskNonCode(source);
  const safeOffset = Math.min(Math.max(offset, 0), masked.length);
  let start = safeOffset;
  let end = safeOffset;
  while (start > 0 && /[\w-]/u.test(masked[start - 1] ?? '')) start -= 1;
  while (end < masked.length && /[\w-]/u.test(masked[end] ?? '')) end += 1;
  const name = source.slice(start, end);
  if (!/^[A-Za-z_][\w-]*$/u.test(name) || RESERVED_IDENTIFIERS.has(name.toLowerCase())) {
    return undefined;
  }
  return { end, name, start };
}

export function identifierOffsets(source: string, identifier: string): number[] {
  if (!/^[A-Za-z_][\w-]*$/u.test(identifier)) {
    return [];
  }
  const masked = maskNonCode(source);
  const expression = new RegExp(`(?<![\\w-])${escapeRegExp(identifier)}(?![\\w-])`, 'gu');
  return [...masked.matchAll(expression)]
    .map((match) => match.index)
    .filter((offset): offset is number => offset !== undefined);
}

export function nearestDiagramDeclaration(value: string): string | undefined {
  const normalized = value.toLowerCase();
  let nearest: { distance: number; value: string } | undefined;
  for (const declaration of DIAGRAM_DECLARATIONS) {
    const distance = levenshtein(normalized, declaration);
    if (distance <= 2 && (!nearest || distance < nearest.distance)) {
      const canonical = MERMAID_KEYWORDS.find(({ label }) => label.toLowerCase() === declaration)?.label;
      if (canonical) nearest = { distance, value: canonical };
    }
  }
  return nearest?.value;
}

export function unclosedBlockCount(source: string, declaration?: string): number {
  const normalizedDeclaration = (
    declaration ?? mermaidDeclarationLocation(source)?.word
  )?.toLowerCase();
  const blockStart =
    normalizedDeclaration === 'flowchart' ||
    normalizedDeclaration === 'flowchart-elk' ||
    normalizedDeclaration === 'graph'
      ? FLOWCHART_BLOCK_START
      : normalizedDeclaration === 'sequencediagram'
        ? SEQUENCE_BLOCK_START
        : undefined;
  if (!blockStart) return 0;

  let depth = 0;
  visitSourceLines(source, (line) => {
    const content = line.trim();
    if (BLOCK_END.test(content)) depth = Math.max(depth - 1, 0);
    if (blockStart.test(content)) depth += 1;
  });
  return depth;
}

export function mermaidDeclarationLocation(
  source: string,
): MermaidDeclarationLocation | undefined {
  let inFrontmatter = false;
  let frontmatterClosed = false;
  let declaration: MermaidDeclarationLocation | undefined;
  visitSourceLines(source, (line, offset) => {
    const trimmed = line.trim();
    if (!frontmatterClosed && trimmed === '---') {
      if (inFrontmatter) {
        inFrontmatter = false;
        frontmatterClosed = true;
      } else if (offset === 0 || !source.slice(0, offset).trim()) {
        inFrontmatter = true;
      }
      return;
    }
    if (inFrontmatter || !trimmed || trimmed.startsWith('%%')) {
      return;
    }
    const word = /^\s*([A-Za-z][\w-]*)/u.exec(line)?.[1];
    if (word) declaration = { offset: offset + line.indexOf(word), word };
    return false;
  });
  return declaration;
}

function visitSourceLines(
  source: string,
  visitor: (line: string, offset: number) => false | void,
): void {
  let offset = 0;
  while (offset <= source.length) {
    const newline = source.indexOf('\n', offset);
    const rawEnd = newline < 0 ? source.length : newline;
    const contentEnd = rawEnd > offset && source.charCodeAt(rawEnd - 1) === 13
      ? rawEnd - 1
      : rawEnd;
    if (visitor(source.slice(offset, contentEnd), offset) === false || newline < 0) return;
    offset = newline + 1;
  }
}

function maskNonCode(source: string): string {
  const characters = [...source];
  let comment = false;
  let quote: '"' | "'" | undefined;
  let bracketDepth = 0;
  let pipeLabel = false;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] ?? '';
    const next = characters[index + 1] ?? '';
    if (character === '\n') {
      comment = false;
      quote = undefined;
      bracketDepth = 0;
      pipeLabel = false;
      continue;
    }
    if (!comment && !quote && bracketDepth === 0 && character === '%' && next === '%') {
      comment = true;
    }
    if (comment) {
      characters[index] = ' ';
      continue;
    }
    if (quote) {
      characters[index] = ' ';
      if (character === quote && characters[index - 1] !== '\\') quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      characters[index] = ' ';
      continue;
    }
    if (character === '(' && isC4Call(source, index)) {
      characters[index] = ' ';
      continue;
    }
    if (character === '[' || character === '(' || character === '{') {
      bracketDepth += 1;
      characters[index] = ' ';
      continue;
    }
    if (character === ']' || character === ')' || character === '}') {
      bracketDepth = Math.max(bracketDepth - 1, 0);
      characters[index] = ' ';
      continue;
    }
    if (character === '|' && bracketDepth === 0) {
      pipeLabel = !pipeLabel;
      characters[index] = ' ';
      continue;
    }
    if (bracketDepth > 0 || pipeLabel) {
      characters[index] = ' ';
    }
  }
  return characters.join('');
}

function isC4Call(source: string, offset: number): boolean {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  const prefix = source.slice(lineStart, offset);
  return /\b(?:Person(?:_Ext)?|System(?:Db|Queue|_Ext)?|Container(?:Db|Queue|_Ext)?|Component(?:Db|Queue|_Ext)?|Deployment_Node|Enterprise_Boundary|System_Boundary|Container_Boundary|Boundary|Rel(?:_[A-Za-z]+)?)\s*$/u.test(
    prefix,
  );
}

function isMatchingShape(opener: string, closer: string): boolean {
  return (
    (opener.startsWith('[') && closer.startsWith(']')) ||
    (opener.startsWith('(') && closer.startsWith(')')) ||
    (opener.startsWith('{') && closer.startsWith('}'))
  );
}

function isDiagramDeclaration(value: string): boolean {
  const declaration = /^[A-Za-z][\w-]*/u.exec(value)?.[0];
  return declaration ? DIAGRAM_DECLARATIONS.has(declaration.toLowerCase()) : false;
}

function slugIdentifier(value: string): string {
  const words = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .match(/[A-Za-z0-9]+/gu);
  if (!words?.length) return '';
  const [first = '', ...rest] = words;
  const candidate = `${first.toLowerCase()}${rest.map(capitalize).join('')}`;
  return /^\d/u.test(candidate) ? `node${capitalize(candidate)}` : candidate;
}

function uniqueIdentifier(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}

function capitalize(value: string): string {
  return value ? `${value[0]?.toUpperCase() ?? ''}${value.slice(1).toLowerCase()}` : '';
}

function keyword(label: string, detail: string, documentation: string): MermaidKeyword {
  return { detail, documentation, label };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? right.length;
}
