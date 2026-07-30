import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_EXPORT_SETTINGS } from '../src/exportSettings';
import { ExportProfileStore } from '../src/exportProfileStore';
import {
  ExportWorkflow,
  serializeExportArtifact,
} from '../src/exportWorkflow';

void test('export profile storage creates, updates, and deletes normalized profiles', () => {
  const profiles = new ExportProfileStore();
  const created = profiles.save(
    {
      name: '',
      settings: { ...DEFAULT_EXPORT_SETTINGS, dpi: 300, format: 'pdf' },
    },
    () => 'profile-1',
  );
  assert.equal(created.name, 'Export profile 1');
  assert.equal(created.settings.dpi, 300);
  assert.equal(profiles.find('profile-1')?.settings.format, 'pdf');

  profiles.save(
    {
      id: 'profile-1',
      name: 'Press',
      settings: { ...DEFAULT_EXPORT_SETTINGS, format: 'svg' },
    },
    () => 'unused',
  );
  assert.equal(profiles.profiles.length, 1);
  assert.equal(profiles.find('profile-1')?.name, 'Press');
  assert.equal(profiles.delete('profile-1'), true);
  assert.equal(profiles.delete('missing'), false);
});

void test('export workflow owns dialog, preview generation, settings, and ordered jobs', async () => {
  const workflow = new ExportWorkflow();
  assert.equal(workflow.requestDialog(false), false);
  assert.equal(workflow.consumeDialogRequest(false), false);
  assert.equal(workflow.consumeDialogRequest(true), true);

  const firstGeneration = workflow.startPreview();
  assert.equal(workflow.isCurrentPreview(firstGeneration), true);
  workflow.invalidatePreview();
  assert.equal(workflow.isCurrentPreview(firstGeneration), false);

  workflow.setSettings({ ...DEFAULT_EXPORT_SETTINGS, dpi: 300 });
  assert.equal(workflow.settings.dpi, 300);

  const order: number[] = [];
  const first = workflow.enqueue(async () => {
    await Promise.resolve();
    order.push(1);
  });
  const second = workflow.enqueue(async () => {
    await Promise.resolve();
    order.push(2);
  });
  await Promise.all([first, second]);
  assert.deepEqual(order, [1, 2]);
});

void test('export artifacts serialize bytes without leaking renderer-specific objects', () => {
  assert.deepEqual(
    serializeExportArtifact({
      bytes: new Uint8Array([65, 66, 67]),
      fileName: 'diagram.svg',
      format: 'svg',
      height: 240,
      mimeType: 'image/svg+xml',
      width: 320,
    }),
    {
      dataBase64: 'QUJD',
      fileName: 'diagram.svg',
      format: 'svg',
      height: 240,
      mimeType: 'image/svg+xml',
      width: 320,
    },
  );
});
