export interface SqlColumn {
  foreignKey: boolean;
  name: string;
  notNull: boolean;
  primaryKey: boolean;
  type: string;
}

export interface SqlForeignKey {
  columns: string[];
  referencedColumns: string[];
  referencedTable: string;
}

export interface SqlTable {
  columns: SqlColumn[];
  foreignKeys: SqlForeignKey[];
  name: string;
}

export interface SqlSchema {
  tables: SqlTable[];
}

interface ParsedIdentifier {
  end: number;
  name: string;
  parts: number;
}

interface PendingTableDefinition {
  foreignKeys: SqlForeignKey[];
  primaryKeys: string[];
}

const COLUMN_MODIFIERS = [
  ['PRIMARY', 'KEY'],
  ['FOREIGN', 'KEY'],
  ['REFERENCES'],
  ['NOT', 'NULL'],
  ['NULL'],
  ['DEFAULT'],
  ['CONSTRAINT'],
  ['UNIQUE'],
  ['CHECK'],
  ['COLLATE'],
  ['GENERATED'],
  ['IDENTITY'],
  ['AUTO_INCREMENT'],
] as const;

export class SqlSchemaParseError extends Error {
  public override readonly name = 'SqlSchemaParseError';
}

/**
 * Parses the common, declarative subset needed to turn CREATE TABLE statements
 * into an ER diagram. This deliberately is not a complete SQL grammar.
 */
export function parseSqlSchema(source: string): SqlSchema {
  const sql = stripSqlComments(source);
  const tables: SqlTable[] = [];
  let cursor = 0;

  while (true) {
    const create = findKeywordSequence(sql, ['CREATE', 'TABLE'], cursor);
    if (!create) break;
    let index = skipWhitespace(sql, create.end);
    const ifNotExists = consumeKeywordSequence(sql, ['IF', 'NOT', 'EXISTS'], index);
    if (ifNotExists !== undefined) index = ifNotExists;

    const identifier = readQualifiedIdentifier(sql, index);
    if (!identifier) {
      throw new SqlSchemaParseError('Expected a table name after CREATE TABLE.');
    }
    index = skipWhitespace(sql, identifier.end);
    if (sql[index] !== '(') {
      throw new SqlSchemaParseError(
        `Table ${identifier.name} has no parenthesized column definition.`,
      );
    }
    const close = matchingParenthesis(sql, index);
    if (close === undefined) {
      throw new SqlSchemaParseError(`Table ${identifier.name} has an unclosed column list.`);
    }

    tables.push(parseTable(identifier.name, sql.slice(index + 1, close)));
    cursor = close + 1;
  }

  if (tables.length === 0) {
    throw new SqlSchemaParseError('No supported CREATE TABLE statement was found.');
  }

  const tableNames = new Set<string>();
  for (const table of tables) {
    const key = sqlNameKey(table.name);
    if (tableNames.has(key)) {
      throw new SqlSchemaParseError(`Table ${table.name} is declared more than once.`);
    }
    tableNames.add(key);
  }
  return { tables };
}

export function generateSqlErd(source: string): string {
  const schema = parseSqlSchema(source);
  const declaredNames = schema.tables.map((table) => table.name);
  const referencedNames = schema.tables.flatMap((table) =>
    table.foreignKeys.map((foreignKey) => foreignKey.referencedTable),
  );
  const allNames = uniqueSqlNames([...declaredNames, ...referencedNames]);
  const entityIds = safeMermaidIds(allNames, 'entity');
  const tablesByName = new Map(schema.tables.map((table) => [sqlNameKey(table.name), table]));
  const lines = ['erDiagram'];

  for (const name of allNames) {
    const id = entityIds.get(sqlNameKey(name));
    if (!id) continue;
    const table = tablesByName.get(sqlNameKey(name));
    const alias = mermaidLabel(name);
    lines.push(`  ${id}["${alias}"] {`);
    if (table) {
      const columnIds = safeMermaidIds(table.columns.map((column) => column.name), 'column');
      for (const column of table.columns) {
        const keys = [column.primaryKey ? 'PK' : '', column.foreignKey ? 'FK' : '']
          .filter(Boolean)
          .join(', ');
        const type = mermaidAttributeToken(column.type, 'value');
        const columnId = columnIds.get(sqlNameKey(column.name)) ?? 'column';
        const originalName = columnId === column.name ? '' : ` "${mermaidLabel(column.name)}"`;
        lines.push(`    ${type} ${columnId}${keys ? ` ${keys}` : ''}${originalName}`);
      }
    }
    lines.push('  }');
  }

  const relationships = new Set<string>();
  for (const table of schema.tables) {
    const childId = entityIds.get(sqlNameKey(table.name));
    if (!childId) continue;
    for (const foreignKey of table.foreignKeys) {
      const parentId = entityIds.get(sqlNameKey(foreignKey.referencedTable));
      if (!parentId) continue;
      const childColumns = new Set(foreignKey.columns.map(sqlNameKey));
      const required = foreignKey.columns.length > 0 && table.columns
        .filter((column) => childColumns.has(sqlNameKey(column.name)))
        .every((column) => column.notNull);
      const pairs = foreignKey.columns.map((column, index) => {
        const referencedColumn = foreignKey.referencedColumns[index];
        return referencedColumn ? `${column} to ${referencedColumn}` : column;
      });
      const label = mermaidRelationshipLabel(pairs.join(', ') || 'references');
      const relationship = `  ${parentId} ${required ? '||' : 'o|'}--o{ ${childId} : "${label}"`;
      if (!relationships.has(relationship)) {
        relationships.add(relationship);
        lines.push(relationship);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

function parseTable(name: string, body: string): SqlTable {
  const columns: SqlColumn[] = [];
  const pending: PendingTableDefinition = { foreignKeys: [], primaryKeys: [] };

  for (const rawPart of splitTopLevel(body, ',')) {
    let part = rawPart.trim();
    if (!part) continue;
    part = removeLeadingConstraintName(part);

    const primaryKeyEnd = consumeKeywordSequence(part, ['PRIMARY', 'KEY'], 0);
    if (primaryKeyEnd !== undefined) {
      pending.primaryKeys.push(...identifierListAfter(part, primaryKeyEnd, 'PRIMARY KEY'));
      continue;
    }
    const foreignKeyEnd = consumeKeywordSequence(part, ['FOREIGN', 'KEY'], 0);
    if (foreignKeyEnd !== undefined) {
      pending.foreignKeys.push(parseTableForeignKey(part, foreignKeyEnd));
      continue;
    }
    if (
      consumeKeywordSequence(part, ['UNIQUE'], 0) !== undefined ||
      consumeKeywordSequence(part, ['CHECK'], 0) !== undefined ||
      consumeKeywordSequence(part, ['KEY'], 0) !== undefined ||
      consumeKeywordSequence(part, ['INDEX'], 0) !== undefined
    ) {
      continue;
    }

    const parsed = parseColumn(part, name);
    columns.push(parsed.column);
    if (parsed.foreignKey) pending.foreignKeys.push(parsed.foreignKey);
  }

  if (columns.length === 0) {
    throw new SqlSchemaParseError(`Table ${name} does not contain any supported column.`);
  }
  const columnsByName = new Map(columns.map((column) => [sqlNameKey(column.name), column]));
  if (columnsByName.size !== columns.length) {
    throw new SqlSchemaParseError(`Table ${name} declares a column more than once.`);
  }
  for (const primaryKey of pending.primaryKeys) {
    const column = columnsByName.get(sqlNameKey(primaryKey));
    if (!column) {
      throw new SqlSchemaParseError(
        `PRIMARY KEY in table ${name} refers to unknown column ${primaryKey}.`,
      );
    }
    column.primaryKey = true;
  }
  for (const foreignKey of pending.foreignKeys) {
    for (const foreignColumn of foreignKey.columns) {
      const column = columnsByName.get(sqlNameKey(foreignColumn));
      if (!column) {
        throw new SqlSchemaParseError(
          `FOREIGN KEY in table ${name} refers to unknown column ${foreignColumn}.`,
        );
      }
      column.foreignKey = true;
    }
  }

  return { columns, foreignKeys: deduplicateForeignKeys(pending.foreignKeys), name };
}

function parseColumn(
  source: string,
  tableName: string,
): { column: SqlColumn; foreignKey?: SqlForeignKey } {
  const identifier = readQualifiedIdentifier(source, 0);
  if (!identifier || identifier.parts !== 1) {
    throw new SqlSchemaParseError(`Could not read a column name in table ${tableName}.`);
  }
  const definition = source.slice(identifier.end);
  const modifierIndexes = COLUMN_MODIFIERS
    .map((words) => findKeywordSequence(definition, [...words], 0, true)?.start)
    .filter((index): index is number => index !== undefined);
  const typeEnd = modifierIndexes.length > 0 ? Math.min(...modifierIndexes) : definition.length;
  const type = definition.slice(0, typeEnd).trim();
  if (!type) {
    throw new SqlSchemaParseError(
      `Column ${identifier.name} in table ${tableName} has no supported SQL type.`,
    );
  }

  const primaryKey = findKeywordSequence(definition, ['PRIMARY', 'KEY'], 0, true) !== undefined;
  const notNull = primaryKey || findKeywordSequence(definition, ['NOT', 'NULL'], 0, true) !== undefined;
  const references = findKeywordSequence(definition, ['REFERENCES'], 0, true);
  let foreignKey: SqlForeignKey | undefined;
  if (references) {
    const referenced = readQualifiedIdentifier(definition, references.end);
    if (!referenced) {
      throw new SqlSchemaParseError(
        `REFERENCES on ${tableName}.${identifier.name} has no target table.`,
      );
    }
    const afterTable = skipWhitespace(definition, referenced.end);
    const referencedColumns = definition[afterTable] === '('
      ? identifierListAt(definition, afterTable, 'REFERENCES')
      : [];
    foreignKey = {
      columns: [identifier.name],
      referencedColumns,
      referencedTable: referenced.name,
    };
  }

  return {
    column: {
      foreignKey: foreignKey !== undefined,
      name: identifier.name,
      notNull,
      primaryKey,
      type,
    },
    foreignKey,
  };
}

function parseTableForeignKey(source: string, foreignKeyEnd: number): SqlForeignKey {
  const columns = identifierListAfter(source, foreignKeyEnd, 'FOREIGN KEY');
  const firstOpen = source.indexOf('(', foreignKeyEnd);
  const firstClose = firstOpen >= 0 ? matchingParenthesis(source, firstOpen) : undefined;
  const references = firstClose === undefined
    ? undefined
    : findKeywordSequence(source, ['REFERENCES'], firstClose + 1, true);
  if (!references) {
    throw new SqlSchemaParseError('A FOREIGN KEY constraint has no REFERENCES target.');
  }
  const referenced = readQualifiedIdentifier(source, references.end);
  if (!referenced) {
    throw new SqlSchemaParseError('A FOREIGN KEY REFERENCES clause has no target table.');
  }
  const afterTable = skipWhitespace(source, referenced.end);
  const referencedColumns = source[afterTable] === '('
    ? identifierListAt(source, afterTable, 'REFERENCES')
    : [];
  if (referencedColumns.length > 0 && referencedColumns.length !== columns.length) {
    throw new SqlSchemaParseError(
      `FOREIGN KEY column count does not match REFERENCES ${referenced.name}.`,
    );
  }
  return { columns, referencedColumns, referencedTable: referenced.name };
}

function removeLeadingConstraintName(source: string): string {
  const constraint = consumeKeywordSequence(source, ['CONSTRAINT'], 0);
  if (constraint === undefined) return source;
  const identifier = readQualifiedIdentifier(source, constraint);
  if (!identifier || identifier.parts !== 1) {
    throw new SqlSchemaParseError('CONSTRAINT must be followed by a constraint name.');
  }
  return source.slice(identifier.end).trimStart();
}

function identifierListAfter(source: string, index: number, context: string): string[] {
  const open = skipWhitespace(source, index);
  if (source[open] !== '(') {
    throw new SqlSchemaParseError(`${context} must be followed by a column list.`);
  }
  return identifierListAt(source, open, context);
}

function identifierListAt(source: string, open: number, context: string): string[] {
  const close = matchingParenthesis(source, open);
  if (close === undefined) {
    throw new SqlSchemaParseError(`${context} has an unclosed column list.`);
  }
  const identifiers = splitTopLevel(source.slice(open + 1, close), ',').map((part) => {
    const parsed = readQualifiedIdentifier(part, 0);
    if (!parsed) throw new SqlSchemaParseError(`${context} contains an invalid column name.`);
    return parsed.parts === 1 ? parsed.name : (parsed.name.split('.').at(-1) ?? parsed.name);
  });
  if (identifiers.length === 0 || identifiers.some((identifier) => !identifier)) {
    throw new SqlSchemaParseError(`${context} has an empty column list.`);
  }
  return identifiers;
}

function deduplicateForeignKeys(foreignKeys: SqlForeignKey[]): SqlForeignKey[] {
  const seen = new Set<string>();
  return foreignKeys.filter((foreignKey) => {
    const key = [
      foreignKey.columns.map(sqlNameKey).join(','),
      sqlNameKey(foreignKey.referencedTable),
      foreignKey.referencedColumns.map(sqlNameKey).join(','),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stripSqlComments(source: string): string {
  let result = '';
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (character === "'" || character === '"' || character === '`' || character === '[') {
      const end = quotedEnd(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }
    if ((character === '-' && next === '-') || character === '#') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        if (source[index] === '\n') result += '\n';
        else result += ' ';
        index += 1;
      }
      index = Math.min(index + 2, source.length);
      continue;
    }
    result += character;
    index += 1;
  }
  return result;
}

function splitTopLevel(source: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (character === "'" || character === '"' || character === '`' || character === '[') {
      index = quotedEnd(source, index);
      continue;
    }
    if (character === '(') depth += 1;
    else if (character === ')') depth = Math.max(0, depth - 1);
    else if (character === separator && depth === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
    index += 1;
  }
  parts.push(source.slice(start));
  return parts;
}

function findKeywordSequence(
  source: string,
  words: string[],
  from: number,
  topLevelOnly = false,
): { end: number; start: number } | undefined {
  let depth = 0;
  let index = Math.max(0, from);
  while (index < source.length) {
    const character = source[index];
    if (character === "'" || character === '"' || character === '`' || character === '[') {
      index = quotedEnd(source, index);
      continue;
    }
    if (character === '(') {
      depth += 1;
      index += 1;
      continue;
    }
    if (character === ')') {
      depth = Math.max(0, depth - 1);
      index += 1;
      continue;
    }
    if ((!topLevelOnly || depth === 0) && isWordStart(character)) {
      const start = index;
      while (index < source.length && isWordPart(source[index])) index += 1;
      if (source.slice(start, index).toUpperCase() === words[0]) {
        let end = index;
        let matches = true;
        for (const expected of words.slice(1)) {
          end = skipWhitespace(source, end);
          if (!isWordStart(source[end])) {
            matches = false;
            break;
          }
          const wordStart = end;
          while (end < source.length && isWordPart(source[end])) end += 1;
          if (source.slice(wordStart, end).toUpperCase() !== expected) {
            matches = false;
            break;
          }
        }
        if (matches) return { end, start };
      }
      continue;
    }
    index += 1;
  }
  return undefined;
}

function consumeKeywordSequence(source: string, words: string[], from: number): number | undefined {
  let index = skipWhitespace(source, from);
  for (const expected of words) {
    if (!isWordStart(source[index])) return undefined;
    const start = index;
    while (index < source.length && isWordPart(source[index])) index += 1;
    if (source.slice(start, index).toUpperCase() !== expected) return undefined;
    index = skipWhitespace(source, index);
  }
  return index;
}

function readQualifiedIdentifier(source: string, from: number): ParsedIdentifier | undefined {
  let index = skipWhitespace(source, from);
  const names: string[] = [];
  let requiresPart = false;
  while (true) {
    const part = readIdentifierPart(source, index);
    if (!part) {
      return names.length > 0 && !requiresPart
        ? { end: index, name: names.join('.'), parts: names.length }
        : undefined;
    }
    requiresPart = false;
    names.push(part.name);
    index = skipWhitespace(source, part.end);
    if (source[index] !== '.') break;
    requiresPart = true;
    index = skipWhitespace(source, index + 1);
  }
  return { end: index, name: names.join('.'), parts: names.length };
}

function readIdentifierPart(source: string, from: number): ParsedIdentifier | undefined {
  const index = skipWhitespace(source, from);
  const opener = source[index];
  if (opener === '"' || opener === '`' || opener === '[') {
    const end = quotedEnd(source, index);
    if (end <= index + 1 || end > source.length || (opener === '[' ? source[end - 1] !== ']' : source[end - 1] !== opener)) {
      return undefined;
    }
    const raw = source.slice(index + 1, end - 1);
    const name = opener === '[' ? raw.replaceAll(']]', ']') : raw.replaceAll(opener + opener, opener);
    return { end, name, parts: 1 };
  }
  if (!isIdentifierStart(opener)) return undefined;
  let end = index + 1;
  while (end < source.length && isIdentifierPart(source[end])) end += 1;
  return { end, name: source.slice(index, end), parts: 1 };
}

function quotedEnd(source: string, from: number): number {
  const opener = source[from];
  const closer = opener === '[' ? ']' : opener;
  let index = from + 1;
  while (index < source.length) {
    if (source[index] === '\\' && opener !== '[') {
      index = Math.min(index + 2, source.length);
      continue;
    }
    if (source[index] === closer) {
      if (source[index + 1] === closer) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  return source.length;
}

function matchingParenthesis(source: string, open: number): number | undefined {
  let depth = 0;
  let index = open;
  while (index < source.length) {
    const character = source[index];
    if (character === "'" || character === '"' || character === '`' || character === '[') {
      index = quotedEnd(source, index);
      continue;
    }
    if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  return undefined;
}

function safeMermaidIds(names: string[], prefix: string): Map<string, string> {
  const grouped = new Map<string, string[]>();
  for (const name of names) {
    const base = mermaidIdentifierToken(name.replaceAll('.', '_'), prefix).slice(0, 72);
    const entries = grouped.get(base) ?? [];
    entries.push(name);
    grouped.set(base, entries);
  }
  const result = new Map<string, string>();
  for (const [base, entries] of grouped) {
    const collision = entries.length > 1;
    for (const name of entries) {
      result.set(sqlNameKey(name), collision ? `${base}_${stableHash(name)}` : base);
    }
  }
  return result;
}

function mermaidIdentifierToken(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .replace(/[^A-Za-z0-9_]+/gu, '_')
    .replace(/_+/gu, '_')
    .replace(/^_+|_+$/gu, '');
  const token = normalized || fallback;
  return /^[A-Za-z_]/u.test(token) ? token : `${fallback}_${token}`;
}

function mermaidAttributeToken(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .replace(/[^A-Za-z0-9_()[\].,*-]+/gu, '_')
    .replace(/^[-.]+/u, '')
    .replace(/_+/gu, '_')
    .slice(0, 96);
  const token = normalized || fallback;
  return /^[A-Za-z_*]/u.test(token) ? token : `${fallback}_${token}`;
}

function mermaidLabel(value: string): string {
  return value.replace(/[\r\n]+/gu, ' ').replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function mermaidRelationshipLabel(value: string): string {
  return mermaidLabel(value).replaceAll(':', ' to ');
}

function uniqueSqlNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = sqlNameKey(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sqlNameKey(name: string): string {
  return name.toLocaleLowerCase('en-US');
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function skipWhitespace(source: string, from: number): number {
  let index = from;
  while (index < source.length && /\s/u.test(source[index] ?? '')) index += 1;
  return index;
}

function isWordStart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z_]/u.test(value);
}

function isWordPart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_]/u.test(value);
}

function isIdentifierStart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z_\u0080-\uFFFF]/u.test(value);
}

function isIdentifierPart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_$#@\-\u0080-\uFFFF]/u.test(value);
}
