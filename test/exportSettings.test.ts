import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_EXPORT_SETTINGS,
  createExportFileName,
  normalizeExportProfiles,
  normalizeExportSettings,
  sanitizeFileName,
} from '../src/exportSettings';

void test('export settings normalize unsafe or excessive values', () => {
  assert.deepEqual(
    normalizeExportSettings({
      background: 'color',
      backgroundColor: '#ABCDEF',
      dpi: 2000,
      fileNameTemplate: '  {name}.{format}  ',
      format: 'webp',
      includeMetadata: false,
      margin: -2,
      optimizeSvg: false,
      scale: 20,
      svgVariant: 'original',
      theme: 'forest',
    }),
    {
      background: 'color',
      backgroundColor: '#abcdef',
      dpi: 600,
      fileNameTemplate: '{name}.{format}',
      format: 'webp',
      includeMetadata: false,
      margin: 0,
      optimizeSvg: false,
      scale: 8,
      svgVariant: 'original',
      theme: 'forest',
    },
  );
  assert.deepEqual(normalizeExportSettings(undefined), DEFAULT_EXPORT_SETTINGS);
});

void test('file templates expand deterministically and cannot create paths', () => {
  const fileName = createExportFileName({
    fileName: 'architecture.mermaid',
    now: new Date(2026, 6, 19, 8, 5, 9),
    settings: normalizeExportSettings({
      ...DEFAULT_EXPORT_SETTINGS,
      fileNameTemplate: '../{name}-{theme}-{dpi}-{date}-{time}',
      format: 'pdf',
      theme: 'neutral',
    }),
  });
  assert.equal(fileName, '-architecture-neutral-144-2026-07-19-08-05-09.pdf');
  assert.equal(sanitizeFileName('folder\\bad:name?.png'), 'folder-bad-name-.png');
});

void test('saved profiles are normalized, deduplicated, and bounded', () => {
  const profiles = normalizeExportProfiles([
    { id: 'press', name: 'Press', settings: { format: 'pdf', dpi: 300 } },
    { id: 'press', name: 'Duplicate', settings: { format: 'png' } },
    { id: '', name: 'Invalid', settings: {} },
  ]);
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0]?.id, 'press');
  assert.equal(profiles[0]?.settings.format, 'pdf');
  assert.equal(profiles[0]?.settings.dpi, 300);
});
