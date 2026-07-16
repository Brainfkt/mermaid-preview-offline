import { readFileSync, writeFileSync } from 'node:fs';

const publisher = process.argv[2]?.trim();
if (!publisher || !/^[a-zA-Z0-9][a-zA-Z0-9-]{2,49}$/u.test(publisher)) {
  console.error('Usage: npm run configure:publisher -- <publisher-id>');
  console.error('L’identifiant doit contenir 3 à 50 lettres, chiffres ou tirets.');
  process.exitCode = 1;
} else {
  const manifestUrl = new URL('../package.json', import.meta.url);
  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
  manifest.publisher = publisher;
  writeFileSync(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Publisher configuré : ${publisher}`);
}
