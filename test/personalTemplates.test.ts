import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createPersonalTemplate,
  isPersonalTemplateMessage,
  MAX_TEMPLATE_SOURCE_BYTES,
  nextTemplateId,
  normalizeTemplateFavorites,
  parsePersonalTemplate,
  serializePersonalTemplate,
  templateIdFromTitle,
} from '../src/personalTemplates';
import {
  loadPersonalTemplateLibrary,
  savePersonalTemplate,
  type PersonalTemplateStorage,
} from '../src/personalTemplatesStore';

const source = 'flowchart LR\n  A["{{literal}}"] --> B["Équipe"]\n';
const template = createPersonalTemplate('Équipe de données', source, 'team.mmd');

void test('personal templates round-trip literal source, unicode and safe ids', () => {
  assert.equal(template.id, 'equipe-de-donnees');
  assert.equal(template.category, 'Flow');
  assert.deepEqual(parsePersonalTemplate(serializePersonalTemplate(template)), template);
  assert.equal(templateIdFromTitle('../../危険'), 'diagram');
  assert.equal(templateIdFromTitle('A'.repeat(200)).length, 64);
});

void test('template schema rejects unsupported versions, path traversal and invalid metadata', () => {
  for (const update of [
    { version: 2 }, { id: '../outside' }, { id: '' }, { title: '' }, { title: 'a\nb' },
    { title: 'x'.repeat(121) }, { category: '' }, { description: 'x'.repeat(501) },
    { fileName: '../outside.mmd' }, { fileName: '/tmp/diagram.mmd' }, { fileName: '.hidden.mmd' },
    { fileName: 'diagram.html' }, { source: '' }, { source: 'flowchart\0LR' },
  ]) {
    assert.throws(() => parsePersonalTemplate(new TextEncoder().encode(JSON.stringify({ ...template, ...update }))));
  }
  assert.throws(() => parsePersonalTemplate(Uint8Array.from([0xff])));
  assert.throws(() => createPersonalTemplate('Title\nInjected', source, 'valid.mmd'));
});

void test('template source limit is measured in UTF-8 bytes, not string length', () => {
  assert.throws(() => createPersonalTemplate('Too large', 'é'.repeat(MAX_TEMPLATE_SOURCE_BYTES / 2 + 1), 'large.mmd'));
  assert.doesNotThrow(() => createPersonalTemplate('Bounded', 'a'.repeat(MAX_TEMPLATE_SOURCE_BYTES), 'large.mmd'));
});

void test('saved templates cannot silently retain image references tied to another directory', () => {
  for (const image of [
    'A@{ img: "./logo.png" }',
    'A@{ img: "https://example.com/logo.png" }',
    'A["<img src=\'./logo.png\'>"]',
    'A["<img src=./logo.png>"]',
  ]) assert.throws(() => createPersonalTemplate('Image', `flowchart LR\n ${image}`, 'image.mmd'), /must be embedded/u);
  assert.doesNotThrow(() => createPersonalTemplate('Image', 'flowchart LR\n A@{ img: "data:image/png;base64,AA==" }', 'image.mmd'));
});

void test('webview messages validate content and favorites are bounded and deduplicated', () => {
  assert.equal(isPersonalTemplateMessage({ type: 'saveTemplate', source, title: 'Team', fileName: 'team.mmd' }), true);
  assert.equal(isPersonalTemplateMessage({ type: 'saveTemplate', source, title: 'Team', fileName: '../../team.mmd' }), false);
  assert.equal(isPersonalTemplateMessage({ type: 'setTemplateFavorite', key: 'personal:team', favorite: true }), true);
  assert.equal(isPersonalTemplateMessage({ type: 'setTemplateFavorite', key: 'command:run', favorite: true }), false);
  assert.equal(isPersonalTemplateMessage({ type: 'setTemplateFavorite', key: 'personal:team', favorite: 'true' }), false);
  assert.equal(isPersonalTemplateMessage({ type: 'saveActiveTemplate' }), true);
  assert.equal(isPersonalTemplateMessage({ type: 'refreshTemplates' }), true);
  assert.deepEqual(normalizeTemplateFavorites(['personal:team', 'personal:team', 'bad', null, 'project:file:///repo:team']), ['personal:team', 'project:file:///repo:team']);
});

void test('saving and reloading a library preserves source and never overwrites collisions', async () => {
  const storage = memoryStorage();
  await savePersonalTemplate(storage, template);
  const loaded = await loadPersonalTemplateLibrary(storage);
  assert.deepEqual(loaded.templates, [template]);
  assert.deepEqual(loaded.issues, []);
  await assert.rejects(savePersonalTemplate(storage, { ...template, source: 'flowchart LR\n X --> Y' }), /already exists/u);
  assert.equal((await loadPersonalTemplateLibrary(storage)).templates[0]?.source, source);
  const copyId = nextTemplateId(template.id, new Set([template.id, `${template.id}-2`]));
  assert.equal(copyId, `${template.id}-3`);
  await savePersonalTemplate(storage, { ...template, id: copyId });
  assert.equal((await loadPersonalTemplateLibrary(storage)).templates.length, 2);
});

void test('invalid files are reported individually without hiding valid templates', async () => {
  const storage = memoryStorage();
  await storage.createExclusive('broken.json', new TextEncoder().encode('{'));
  await storage.createExclusive('wrong-id.json', serializePersonalTemplate(template));
  await storage.createExclusive(`${template.id}.json`, serializePersonalTemplate(template));
  const loaded = await loadPersonalTemplateLibrary(storage);
  assert.deepEqual(loaded.templates, [template]);
  assert.equal(loaded.issues.length, 2);
  assert.match(loaded.issues[1] ?? '', /must match/u);
});

void test('storage races fail exclusively instead of replacing another saved template', async () => {
  const storage = memoryStorage();
  const results = await Promise.allSettled([
    savePersonalTemplate(storage, template),
    savePersonalTemplate(storage, { ...template, source: 'flowchart LR\n C --> D' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await loadPersonalTemplateLibrary(storage)).templates.length, 1);
});

void test('library limits bound loading and prevent saving beyond capacity', async () => {
  const storage = memoryStorage();
  for (let index = 0; index < 101; index += 1) {
    const saved = { ...template, id: `diagram-${index}` };
    await storage.createExclusive(`${saved.id}.json`, serializePersonalTemplate(saved));
  }
  const loaded = await loadPersonalTemplateLibrary(storage);
  assert.equal(loaded.templates.length, 100);
  assert.match(loaded.issues[0] ?? '', /first 100/u);
  await assert.rejects(savePersonalTemplate(storage, template), /at most 100/u);
});

function memoryStorage(): PersonalTemplateStorage {
  const files = new Map<string, Uint8Array>();
  return {
    list: () => Promise.resolve([...files.keys()]),
    read: (name) => {
      const bytes = files.get(name);
      return bytes ? Promise.resolve(bytes) : Promise.reject(new Error('Missing file'));
    },
    createExclusive: (name, bytes) => {
      if (files.has(name)) return Promise.reject(new Error('File already exists'));
      files.set(name, bytes);
      return Promise.resolve();
    },
  };
}
