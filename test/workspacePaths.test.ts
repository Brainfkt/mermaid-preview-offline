import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isFilePathWithin, isUriWithin } from '../src/workspacePaths';

void test('local assets stay inside the workspace folder containing the document', () => {
  const root = { authority: 'remote', path: '/workspaces/docs', scheme: 'vscode-remote' };
  assert.equal(
    isUriWithin(root, {
      authority: 'remote',
      path: '/workspaces/docs/assets/logo.svg',
      scheme: 'vscode-remote',
    }),
    true,
  );
  assert.equal(
    isUriWithin(root, {
      authority: 'remote',
      path: '/workspaces/application/secrets.svg',
      scheme: 'vscode-remote',
    }),
    false,
  );
});

void test('URI containment supports Windows casing and rejects another authority', () => {
  const root = { authority: '', path: '/C:/Workspace/Docs', scheme: 'file' };
  assert.equal(
    isUriWithin(root, { authority: '', path: '/c:/workspace/docs/image.png', scheme: 'file' }, false),
    true,
  );
  assert.equal(
    isUriWithin(root, { authority: 'server', path: '/C:/Workspace/Docs/image.png', scheme: 'file' }, false),
    false,
  );
});

void test('canonical file paths reject siblings and support case-insensitive platforms', () => {
  assert.equal(isFilePathWithin('/workspaces/docs', '/workspaces/docs/assets/logo.svg'), true);
  assert.equal(isFilePathWithin('/workspaces/docs', '/workspaces/other/logo.svg'), false);
  assert.equal(isFilePathWithin('/Workspaces/Docs', '/workspaces/docs/logo.svg', false), true);
});
