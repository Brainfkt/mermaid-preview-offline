import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isDocumentationWebviewMessage,
  isPreviewWebviewMessage,
  isProjectWebviewMessage,
  isSerializedExportArtifact,
} from '../src/webviewMessageValidation';

const svgArtifact = {
  dataBase64: 'PHN2Zy8+',
  fileName: 'diagram.svg',
  format: 'svg',
  height: 240,
  mimeType: 'image/svg+xml',
  width: 320,
};

void test('preview message validation accepts protocol messages and rejects malformed writes', () => {
  assert.equal(isPreviewWebviewMessage({ hasPersistedState: true, type: 'ready' }), true);
  assert.equal(
    isPreviewWebviewMessage({
      requestId: 1,
      source: 'flowchart LR\n  A --> B',
      type: 'replaceDocument',
      version: 2,
    }),
    true,
  );
  assert.equal(
    isPreviewWebviewMessage({
      requestId: -1,
      source: 'flowchart LR',
      type: 'replaceDocument',
      version: 2,
    }),
    false,
  );
  assert.equal(isPreviewWebviewMessage({ artifact: svgArtifact, type: 'saveExport' }), true);
});

void test('documentation and project validators enforce their narrower protocols', () => {
  assert.equal(
    isDocumentationWebviewMessage({
      artifacts: [{ artifact: svgArtifact, blockId: 'block-1' }],
      requestId: 'export-1',
      type: 'documentationExportResult',
    }),
    true,
  );
  assert.equal(
    isDocumentationWebviewMessage({
      artifacts: [{ artifact: { ...svgArtifact, format: 'pdf' }, blockId: 'block-1' }],
      requestId: 'export-1',
      type: 'documentationExportResult',
    }),
    false,
  );
  assert.equal(
    isProjectWebviewMessage({
      fileName: 'diagram.mmd',
      source: 'flowchart LR',
      type: 'createDiagram',
    }),
    true,
  );
  assert.equal(isProjectWebviewMessage({ source: 'flowchart LR', type: 'createDiagram' }), false);
});

void test('serialized artifact validation rejects unsupported formats and invalid dimensions', () => {
  assert.equal(isSerializedExportArtifact(svgArtifact), true);
  assert.equal(isSerializedExportArtifact({ ...svgArtifact, format: 'html' }), false);
  assert.equal(isSerializedExportArtifact({ ...svgArtifact, width: Number.NaN }), false);
});
