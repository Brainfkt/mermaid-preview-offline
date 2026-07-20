import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  replaceSvgAttributeIdReferences,
  replaceSvgStyleIdReferences,
} from '../src/svgIdReferences';

const ids = new Map([
  ['diagram', 'diagram-before-1'],
  ['fff', 'fff-before-1'],
  ['marker-end', 'marker-end-before-1'],
]);

void test('SVG style ID rewriting updates complete selectors and URL references', () => {
  const source = [
    '#diagram, svg#marker-end:hover { fill: #fff; stroke: url(#diagram); }',
    '@media (prefers-color-scheme: dark) { #diagram .node { color: #fff; } }',
    '/* #diagram remains a comment */',
  ].join('\n');

  assert.equal(
    replaceSvgStyleIdReferences(source, ids),
    [
      '#diagram-before-1, svg#marker-end-before-1:hover { fill: #fff; stroke: url(#diagram-before-1); }',
      '@media (prefers-color-scheme: dark) { #diagram-before-1 .node { color: #fff; } }',
      '/* #diagram remains a comment */',
    ].join('\n'),
  );
});

void test('SVG style ID rewriting never confuses hexadecimal colors with selectors', () => {
  assert.equal(
    replaceSvgStyleIdReferences(
      '#fff { fill: #fff; stroke: #fff; --fallback: #fff; filter: url( "#fff" ); }',
      ids,
    ),
    '#fff-before-1 { fill: #fff; stroke: #fff; --fallback: #fff; filter: url( "#fff-before-1" ); }',
  );
  assert.equal(
    replaceSvgStyleIdReferences('@media (color: #fff) { #diagram { fill: #fff; } }', ids),
    '@media (color: #fff) { #diagram-before-1 { fill: #fff; } }',
  );
});

void test('SVG attribute ID rewriting handles fragment, URL, ARIA, and SMIL references', () => {
  assert.equal(replaceSvgAttributeIdReferences('href', '#diagram', ids), '#diagram-before-1');
  assert.equal(
    replaceSvgAttributeIdReferences('clip-path', 'url(\'#diagram\')', ids),
    'url(\'#diagram-before-1\')',
  );
  assert.equal(
    replaceSvgAttributeIdReferences('aria-labelledby', 'diagram missing marker-end', ids),
    'diagram-before-1 missing marker-end-before-1',
  );
  assert.equal(
    replaceSvgAttributeIdReferences('begin', 'diagram.click; marker-end.end+1s', ids),
    'diagram-before-1.click; marker-end-before-1.end+1s',
  );
});

void test('SVG attribute ID rewriting preserves hash colors and external URLs', () => {
  assert.equal(replaceSvgAttributeIdReferences('fill', '#fff', ids), '#fff');
  assert.equal(
    replaceSvgAttributeIdReferences('fill', 'url(https://example.test/sprite.svg#diagram)', ids),
    'url(https://example.test/sprite.svg#diagram)',
  );
});
