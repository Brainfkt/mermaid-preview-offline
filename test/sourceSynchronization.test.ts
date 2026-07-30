import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SourceSynchronizer } from '../src/sourceSynchronization';

void test('source synchronization serializes edits and acknowledges applied versions', () => {
  const synchronizer = new SourceSynchronizer();
  assert.deepEqual(
    synchronizer.receive('flowchart LR\n  A --> B', 1, ''),
    {
      document: { source: 'flowchart LR\n  A --> B', version: 1 },
      status: 'Saved',
    },
  );
  const edit = synchronizer.beginEdit('flowchart LR\n  A --> C');
  assert.deepEqual(edit, {
    type: 'replaceDocument',
    requestId: 1,
    source: 'flowchart LR\n  A --> C',
    version: 1,
  });
  assert.equal(synchronizer.beginEdit('flowchart LR\n  A --> D'), undefined);
  assert.deepEqual(
    synchronizer.handleResult(
      { applied: true, requestId: 1, type: 'sourceEditResult', version: 2 },
      'flowchart LR\n  A --> D',
    ),
    { shouldFlush: true, status: 'Unsaved' },
  );
  assert.equal(synchronizer.beginEdit('flowchart LR\n  A --> D')?.requestId, 2);
});

void test('source synchronization preserves local edits when the file changes elsewhere', () => {
  const synchronizer = new SourceSynchronizer();
  synchronizer.receive('flowchart LR\n  A --> B', 1, '');
  const result = synchronizer.receive(
    'flowchart LR\n  A --> External',
    2,
    'flowchart LR\n  A --> Local',
  );
  assert.equal(result.status, 'File changed elsewhere');
  assert.equal(synchronizer.hasConflict, true);
  assert.deepEqual(synchronizer.reloadConflict(), {
    source: 'flowchart LR\n  A --> External',
    version: 2,
  });
  assert.equal(synchronizer.hasConflict, false);
});

void test('source synchronization exposes failed save diagnostics without losing conflict data', () => {
  const synchronizer = new SourceSynchronizer();
  synchronizer.receive('sequenceDiagram', 4, '');
  const edit = synchronizer.beginEdit('sequenceDiagram\n  A->>B: Hi');
  assert.ok(edit);
  assert.deepEqual(
    synchronizer.handleResult(
      {
        applied: false,
        documentSource: 'sequenceDiagram\n  A->>B: External',
        error: 'Version mismatch',
        requestId: edit.requestId,
        type: 'sourceEditResult',
        version: 5,
      },
      edit.source,
    ),
    { shouldFlush: false, status: 'Save failed: Version mismatch' },
  );
  assert.equal(synchronizer.hasConflict, true);
});
