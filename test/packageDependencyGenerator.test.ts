import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  generatePackageDependencyGraph,
  PackageManifestParseError,
  parsePackageDependencyManifest,
} from '../src/packageDependencyGenerator';

void test('all package dependency groups produce deterministic labelled and styled edges', () => {
  const source = JSON.stringify({
    name: '@acme/app',
    version: '1.0.0',
    dependencies: { react: '^19.0.0', zod: '^4.0.0' },
    devDependencies: { typescript: '^5.9.0' },
    peerDependencies: { react: '>=18' },
    optionalDependencies: { sharp: '^0.34.0' },
  });
  const manifest = parsePackageDependencyManifest(source);
  assert.equal(manifest.dependencies.length, 5);
  assert.deepEqual(manifest.dependencies.map((dependency) => dependency.group), [
    'dependencies',
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]);

  const graph = generatePackageDependencyGraph(source);
  assert.match(graph, /^flowchart LR\n/u);
  assert.match(graph, /package_root\["@acme\/app@1\.0\.0"\]/u);
  assert.equal(graph.match(/\["react"\]/gu)?.length, 1, 'a repeated package has one node');
  assert.match(graph, /dependencies · \^19\.0\.0/u);
  assert.match(graph, /devDependencies · \^5\.9\.0/u);
  assert.match(graph, /peerDependencies · &gt;=18/u);
  assert.match(graph, /optionalDependencies · \^0\.34\.0/u);
  assert.match(graph, /classDef runtime/u);
  assert.match(graph, /classDef development/u);
  assert.match(graph, /classDef peer/u);
  assert.match(graph, /classDef optional/u);
  assert.equal((graph.match(/linkStyle/gu) ?? []).length, 5);
});

void test('package dependency output is stable across JSON property ordering', () => {
  const left = generatePackageDependencyGraph(JSON.stringify({
    name: 'demo',
    dependencies: { zeta: '1', alpha: '2' },
    devDependencies: { test: '3' },
  }));
  const right = generatePackageDependencyGraph(JSON.stringify({
    devDependencies: { test: '3' },
    dependencies: { alpha: '2', zeta: '1' },
    name: 'demo',
  }));
  assert.equal(left, right);
});

void test('package labels are escaped and malformed manifests are rejected', () => {
  const graph = generatePackageDependencyGraph(JSON.stringify({
    name: 'demo" --> injected',
    dependencies: { 'safe"] --> bad': '<script>' },
  }));
  assert.doesNotMatch(graph, /demo" --> injected/u);
  assert.match(graph, /demo&quot; --&gt; injected/u);
  assert.match(graph, /&lt;script&gt;/u);

  assert.throws(
    () => parsePackageDependencyManifest('{ broken'),
    (error: unknown) => error instanceof PackageManifestParseError && /Invalid package\.json JSON/u.test(error.message),
  );
  assert.throws(
    () => parsePackageDependencyManifest('{"dependencies":[]}'),
    /field "dependencies" must be an object/u,
  );
  assert.throws(
    () => parsePackageDependencyManifest('{"dependencies":{"react":42}}'),
    /must have a non-empty string version/u,
  );
});
