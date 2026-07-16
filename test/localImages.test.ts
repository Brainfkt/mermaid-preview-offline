import assert from 'node:assert/strict';
import { test } from 'node:test';

import { imageMimeType, inlineLocalImages, isRelativeLocalImage } from '../src/localImages';

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
