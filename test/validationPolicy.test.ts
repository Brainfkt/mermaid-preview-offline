import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mermaidValidationDelay } from '../src/validationPolicy';

void test('large Mermaid documents receive an adaptive validation debounce', () => {
  assert.equal(mermaidValidationDelay(100_000, 180), 180);
  assert.equal(mermaidValidationDelay(1024 * 1024, 0), 350);
  assert.equal(mermaidValidationDelay(5 * 1024 * 1024, 180), 600);
  assert.equal(mermaidValidationDelay(10 * 1024 * 1024, 800), 800);
});
