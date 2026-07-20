const DIRECT_FRAGMENT_ATTRIBUTES = new Set(['href', 'xlink:href']);
const ID_REFERENCE_LIST_ATTRIBUTES = new Set([
  'aria-controls',
  'aria-describedby',
  'aria-details',
  'aria-errormessage',
  'aria-flowto',
  'aria-labelledby',
  'aria-owns',
  'for',
  'headers',
  'list',
]);
const URL_ID_REFERENCE = /url\(\s*(?:(["'])#([^"']+)\1|#([^\s)]+))\s*\)/giu;

type IdMap = ReadonlyMap<string, string>;

/**
 * Rewrites DOM-ID references in an SVG attribute without mistaking paint
 * values such as `fill="#fff"` for fragment references.
 */
export function replaceSvgAttributeIdReferences(
  attributeName: string,
  value: string,
  idMap: IdMap,
): string {
  const normalizedName = attributeName.toLocaleLowerCase();
  let result = replaceUrlIdReferences(value, idMap);

  if (DIRECT_FRAGMENT_ATTRIBUTES.has(normalizedName)) {
    const fragment = /^(\s*)#([^\s]+)(\s*)$/u.exec(result);
    const id = fragment?.[2];
    const replacement = id ? idMap.get(id) : undefined;
    if (fragment && replacement) return `${fragment[1]}#${replacement}${fragment[3]}`;
  }

  if (ID_REFERENCE_LIST_ATTRIBUTES.has(normalizedName)) {
    result = result.replace(/[^\t\n\f\r ]+/gu, (id) => idMap.get(id) ?? id);
  }

  if (normalizedName === 'begin' || normalizedName === 'end') {
    result = result.replace(
      /(^|[;\t\n\f\r ])([^.;\t\n\f\r ]+)(?=\.)/gu,
      (match, separator: string, id: string) => {
        const replacement = idMap.get(id);
        return replacement ? `${separator}${replacement}` : match;
      },
    );
  }

  return result;
}

/**
 * Rewrites `url(#id)` references and complete `#id` CSS selectors. Hash
 * colors remain untouched because selector hashes are only rewritten in rule
 * preludes, never in declaration values or at-rule conditions.
 */
export function replaceSvgStyleIdReferences(css: string, idMap: IdMap): string {
  let output = '';
  let segmentStart = 0;
  let quote: '"' | "'" | undefined;
  let inComment = false;
  let parentheses = 0;
  let brackets = 0;

  for (let index = 0; index < css.length; index += 1) {
    const character = css.charAt(index);
    const next = css[index + 1];

    if (inComment) {
      if (character === '*' && next === '/') {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === '\\') {
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '/' && next === '*') {
      inComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') {
      parentheses += 1;
      continue;
    }
    if (character === ')') {
      parentheses = Math.max(0, parentheses - 1);
      continue;
    }
    if (character === '[') {
      brackets += 1;
      continue;
    }
    if (character === ']') {
      brackets = Math.max(0, brackets - 1);
      continue;
    }
    if (parentheses !== 0 || brackets !== 0 || !'{;}'.includes(character)) continue;

    const segment = css.slice(segmentStart, index);
    const withUrls = replaceUrlIdReferences(segment, idMap);
    const isSelector = character === '{' && !isAtRulePrelude(segment);
    output += isSelector ? replaceCssSelectorHashes(withUrls, idMap) : withUrls;
    output += character;
    segmentStart = index + 1;
  }

  return output + replaceUrlIdReferences(css.slice(segmentStart), idMap);
}

function replaceUrlIdReferences(value: string, idMap: IdMap): string {
  return value.replace(
    URL_ID_REFERENCE,
    (match, _quote: string | undefined, quotedId: string | undefined, bareId: string | undefined) => {
      const id = quotedId ?? bareId;
      if (!id) return match;
      const replacement = idMap.get(id);
      return replacement ? match.replace(`#${id}`, `#${replacement}`) : match;
    },
  );
}

function isAtRulePrelude(value: string): boolean {
  return /^(?:(?:\s+)|(?:\/\*[\s\S]*?\*\/))*@/u.test(value);
}

function replaceCssSelectorHashes(selector: string, idMap: IdMap): string {
  let output = '';
  let quote: '"' | "'" | undefined;
  let inComment = false;

  for (let index = 0; index < selector.length; index += 1) {
    const character = selector.charAt(index);
    const next = selector[index + 1];
    output += character;

    if (inComment) {
      if (character === '*' && next === '/') {
        output += next;
        index += 1;
        inComment = false;
      }
      continue;
    }
    if (quote) {
      if (character === '\\' && next !== undefined) {
        output += next;
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '/' && next === '*') {
      output += next;
      index += 1;
      inComment = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character !== '#') continue;

    const match = mappedIdAt(selector, index + 1, idMap);
    if (!match) continue;
    output += match.replacement;
    index += match.id.length;
  }

  return output;
}

function mappedIdAt(
  value: string,
  start: number,
  idMap: IdMap,
): { id: string; replacement: string } | undefined {
  let best: { id: string; replacement: string } | undefined;
  for (const [id, replacement] of idMap) {
    if (!id || id.length <= (best?.id.length ?? 0) || !value.startsWith(id, start)) continue;
    const following = value[start + id.length];
    if (following !== undefined && /[\p{L}\p{N}_\\-]/u.test(following)) continue;
    best = { id, replacement };
  }
  return best;
}
