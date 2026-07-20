import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertOfflineImageReferences,
  imageMimeType,
  inlineLocalImages,
  isRelativeLocalImage,
} from '../src/localImages';

void test('les images locales Mermaid sont intégrées sous forme de data URI', async () => {
  const source = 'flowchart LR\n  logo@{ img: "assets/logo.png", label: "Logo" }';
  const result = await inlineLocalImages(source, (reference) => {
    assert.equal(reference, 'assets/logo.png');
    return Promise.resolve({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' });
  });

  assert.match(result, /img: "data:image\/png;base64,AQID"/u);
  assert.doesNotMatch(result, /assets\/logo\.png/u);
});

void test('les ressources distantes et les data URI ne sont jamais relues', async () => {
  const references = [
    'https://example.com/logo.png',
    'data:image/png;base64,AQID',
    '/tmp/logo.png',
  ];
  for (const reference of references) {
    let called = false;
    const source = `flowchart LR\n  logo@{ img: "${reference}" }`;
    const result = await inlineLocalImages(source, () => {
      called = true;
      return Promise.resolve(undefined);
    });
    assert.equal(result, source);
    assert.equal(called, false);
  }
});

void test('les formats locaux courants sont reconnus', () => {
  assert.equal(imageMimeType('images/schema.svg?rev=2'), 'image/svg+xml');
  assert.equal(imageMimeType('images/photo.JPEG'), 'image/jpeg');
  assert.equal(imageMimeType('images/inconnu.txt'), undefined);
  assert.equal(isRelativeLocalImage('../assets/logo.webp'), true);
  assert.equal(isRelativeLocalImage('vscode-webview://source/logo.png'), false);
});

void test('les images locales uniques sont dédupliquées et chargées avec une concurrence bornée', async () => {
  const requested: string[] = [];
  let activeLoads = 0;
  let maximumActiveLoads = 0;
  const source = [
    'flowchart LR',
    '  a@{ img: "assets/a.png" }',
    '  b@{ img: "assets/b.png" }',
    '  c@{ img: "assets/a.png" }',
  ].join('\n');

  const result = await inlineLocalImages(source, async (reference) => {
    requested.push(reference);
    activeLoads += 1;
    maximumActiveLoads = Math.max(maximumActiveLoads, activeLoads);
    await new Promise((resolve) => setTimeout(resolve, 2));
    activeLoads -= 1;
    return { bytes: new Uint8Array([1]), mimeType: 'image/png' };
  });

  assert.deepEqual(requested.sort(), ['assets/a.png', 'assets/b.png']);
  assert.equal(maximumActiveLoads, 2);
  assert.equal(result.match(/data:image\/png;base64,AQ==/gu)?.length, 3);
});

void test('la concurrence des images locales reste bornée', async () => {
  let activeLoads = 0;
  let maximumActiveLoads = 0;
  const source = [
    'flowchart LR',
    ...Array.from({ length: 12 }, (_, index) => `  n${index}@{ img: "assets/${index}.png" }`),
  ].join('\n');

  await inlineLocalImages(source, async () => {
    activeLoads += 1;
    maximumActiveLoads = Math.max(maximumActiveLoads, activeLoads);
    await new Promise((resolve) => setTimeout(resolve, 2));
    activeLoads -= 1;
    return { bytes: new Uint8Array([1]), mimeType: 'image/png' };
  });

  assert.equal(maximumActiveLoads, 4);
});

void test('les budgets par image, agrégé et en nombre échouent avant l’encodage base64', async () => {
  const twoImages = 'flowchart LR\n  a@{ img: "a.png" }\n  b@{ img: "b.png" }';
  await assert.rejects(
    inlineLocalImages(twoImages, () => Promise.resolve({
      bytes: new Uint8Array(6),
      mimeType: 'image/png',
    }), {
      maxConcurrency: 1,
      maxImageBytes: 5,
      maxImages: 2,
      maxTotalBytes: 10,
    }),
    /per-image limit/u,
  );
  await assert.rejects(
    inlineLocalImages(twoImages, () => Promise.resolve({
      bytes: new Uint8Array(6),
      mimeType: 'image/png',
    }), {
      maxConcurrency: 1,
      maxImageBytes: 6,
      maxImages: 2,
      maxTotalBytes: 10,
    }),
    /aggregate preview limit/u,
  );
  await assert.rejects(
    inlineLocalImages(twoImages, () => Promise.resolve(undefined), {
      maxConcurrency: 1,
      maxImageBytes: 6,
      maxImages: 1,
      maxTotalBytes: 10,
    }),
    /offline preview limit/u,
  );
});

void test('la politique CLI rejette les images distantes et les images locales non intégrées', () => {
  assert.doesNotThrow(() => assertOfflineImageReferences(
    'flowchart LR\n  a@{ img: "data:image/png;base64,AQID" }',
  ));
  assert.doesNotThrow(() => assertOfflineImageReferences(
    'flowchart LR\n  a@{ img: "assets/a.png" }',
    { allowRelative: true },
  ));
  assert.throws(
    () => assertOfflineImageReferences('flowchart LR\n  a@{ img: "https://example.com/a.png" }'),
    /External image references are disabled/u,
  );
  assert.throws(
    () => assertOfflineImageReferences('flowchart LR\n  a@{ img: "assets/a.png" }'),
    /could not be embedded/u,
  );
});
