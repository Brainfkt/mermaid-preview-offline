import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractMermaidBlocks } from '../src/documentationBlocks';
import {
  fileUrisReferToSamePath,
  rangeAtOffset,
  transformTextOffset,
} from '../src/documentationTracking';

void test('file target comparison follows host file-system case semantics', () => {
  const source = {
    authority: '',
    path: '/Users/Ada/Docs/Guide.md',
    scheme: 'file',
  };
  const differentlyCased = {
    authority: '',
    path: '/users/ada/docs/guide.md',
    scheme: 'file',
  };

  assert.equal(fileUrisReferToSamePath(source, differentlyCased, 'darwin'), true);
  assert.equal(fileUrisReferToSamePath(source, differentlyCased, 'win32'), true);
  assert.equal(fileUrisReferToSamePath(source, differentlyCased, 'linux'), false);
  assert.equal(
    fileUrisReferToSamePath(
      { authority: 'SERVER', path: '/Share/Guide.md', scheme: 'file' },
      { authority: 'server', path: '/share/guide.md', scheme: 'file' },
      'win32',
    ),
    true,
  );
  assert.equal(
    fileUrisReferToSamePath(source, { ...source, scheme: 'vscode-remote' }, 'darwin'),
    false,
  );
});

void test('cursor preview anchor follows its block when blocks above are inserted and removed', () => {
  const original = [
    '# Existing',
    '',
    '```mermaid',
    'flowchart LR',
    '  A --> B',
    '```',
    '',
    '## Target',
    '',
    '```mermaid',
    'sequenceDiagram',
    '  Client->>API: Keep tracking me',
    '```',
    '',
  ].join('\n');
  const targetSource = 'sequenceDiagram\n  Client->>API: Keep tracking me\n';
  const target = extractMermaidBlocks(original, 'markdown')[1];
  assert.ok(target);
  let anchor = target.sourceStartOffset + 'sequenceDiagram'.length;

  const inserted = [
    '# Inserted',
    '',
    '```mermaid',
    'flowchart TD',
    '  New --> Block',
    '```',
    '',
  ].join('\n');
  let updated = `${inserted}${original}`;
  anchor = transformTextOffset(anchor, [{
    rangeLength: 0,
    rangeOffset: 0,
    text: inserted,
  }]);
  let selected = rangeAtOffset(extractMermaidBlocks(updated, 'markdown'), anchor);
  assert.equal(selected?.source, targetSource);
  assert.equal(selected?.index, 2);

  const targetHeadingOffset = updated.indexOf('## Target');
  assert.ok(targetHeadingOffset > 0);
  updated = updated.slice(targetHeadingOffset);
  anchor = transformTextOffset(anchor, [{
    rangeLength: targetHeadingOffset,
    rangeOffset: 0,
    text: '',
  }]);
  selected = rangeAtOffset(extractMermaidBlocks(updated, 'markdown'), anchor);
  assert.equal(selected?.source, targetSource);
  assert.equal(selected?.index, 0);
});

void test('offset transformation handles unsorted multi-cursor edits', () => {
  assert.equal(
    transformTextOffset(20, [
      { rangeLength: 2, rangeOffset: 12, text: '' },
      { rangeLength: 0, rangeOffset: 2, text: '1234' },
    ]),
    22,
  );
});
