import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

interface PublishingManifest {
  activationEvents: string[];
  bugs: { url: string };
  categories: string[];
  contributes: {
    commands: Array<{ title: string }>;
    customEditors: Array<{ displayName: string; viewType: string }>;
  };
  description: string;
  displayName: string;
  galleryBanner: { color: string; theme: string };
  homepage: string;
  icon: string;
  keywords: string[];
  pricing: string;
  publisher: string;
  version: string;
  repository: { type: string; url: string };
  scripts: Record<string, string>;
}

const root = resolve(__dirname, '../..');
const manifest = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
) as PublishingManifest;

void test('le manifeste pointe vers le dépôt autonome', () => {
  assert.equal(manifest.repository.type, 'git');
  assert.match(manifest.repository.url, /mermaid-preview-offline\.git$/u);
  assert.doesNotMatch(manifest.repository.url, /STOKAGE/iu);
  assert.match(manifest.homepage, /mermaid-preview-offline/iu);
  assert.match(manifest.bugs.url, /mermaid-preview-offline\/issues$/u);
});

void test('le publisher et les commandes de publication sont configurés', () => {
  assert.equal(manifest.version, '1.2.4');
  assert.match(manifest.publisher, /^[a-zA-Z0-9][a-zA-Z0-9-]{2,49}$/u);
  assert.match(manifest.scripts['package:vsix'] ?? '', /scripts\/package-vsix\.mjs/u);
  assert.match(manifest.scripts['publish:marketplace'] ?? '', /vsce publish/u);
  assert.match(manifest.scripts['publish:marketplace'] ?? '', /--azure-credential/u);
});

void test('Marketplace metadata is complete, searchable, and written in English', () => {
  assert.equal(manifest.displayName, 'Mermaid Preview — 100% Offline');
  assert.match(manifest.description, /Mermaid diagram preview/iu);
  assert.match(manifest.description, /offline/iu);
  assert.equal(manifest.pricing, 'Free');
  assert.deepEqual(manifest.categories, ['Visualization', 'Programming Languages']);
  assert.ok(manifest.keywords.length <= 30);
  assert.equal(new Set(manifest.keywords).size, manifest.keywords.length);
  for (const keyword of ['mermaid', 'diagram as code', 'flowchart', 'sequence diagram', 'offline']) {
    assert.ok(manifest.keywords.includes(keyword), `missing Marketplace keyword: ${keyword}`);
  }
  assert.equal(manifest.galleryBanner.color, '#ff3670');
  assert.equal(manifest.galleryBanner.theme, 'dark');

  const editor = manifest.contributes.customEditors[0];
  assert.ok(editor);
  assert.equal(manifest.activationEvents[0], `onCustomEditor:${editor.viewType}`);
  assert.equal(editor.displayName, 'Mermaid Preview (Offline)');
  assert.equal(manifest.contributes.commands[0]?.title, 'Mermaid Preview: Open Offline Preview');
});

void test('the Marketplace icon is a high-resolution PNG', () => {
  const icon = readFileSync(resolve(root, manifest.icon));
  assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(icon.readUInt32BE(16) >= 256);
  assert.ok(icon.readUInt32BE(20) >= 256);
});

void test('repository screenshots do not inflate the installed VSIX', () => {
  const ignore = readFileSync(resolve(root, '.vscodeignore'), 'utf8');
  assert.match(ignore, /^media\/screenshots\/\*\*$/mu);
  assert.doesNotMatch(ignore, /^media\/\*\*$/mu);
  assert.equal(existsSync(resolve(root, manifest.icon)), true);
});

void test('README and user-guide screenshot references resolve to publishable captures', () => {
  const documents = ['README.md', 'docs/USER_GUIDE.md', 'docs/USER_GUIDE.fr.md'];
  const referenced = new Set<string>();
  for (const document of documents) {
    const contents = readFileSync(resolve(root, document), 'utf8');
    for (const match of contents.matchAll(/media\/screenshots\/([a-z0-9-]+\.png)/giu)) {
      const fileName = match[1];
      assert.ok(fileName, `${document} contains an empty screenshot reference`);
      referenced.add(fileName);
      assert.equal(
        existsSync(resolve(root, 'media', 'screenshots', fileName)),
        true,
        `${document} references a missing screenshot: ${fileName}`,
      );
    }
  }

  assert.ok(referenced.size >= 16);
  for (const staleOrPrivate of [
    'CLI.png',
    'gallery-examples.png',
    'icon-packs.png',
    'icons-image-local.png',
    'mindmap-zoomed.png',
    'pie-with-source.png',
    'split-view.png',
  ]) {
    assert.equal(referenced.has(staleOrPrivate), false, `${staleOrPrivate} should not be published`);
  }
});

void test('workspace-local image examples stay literal on GitHub', () => {
  for (const guide of ['docs/USER_GUIDE.md', 'docs/USER_GUIDE.fr.md']) {
    const contents = readFileSync(resolve(root, guide), 'utf8');
    assert.match(contents, /```text\s+flowchart LR\s+logo@\{ img: "assets\/logo\.svg"/u);
    assert.doesNotMatch(
      contents,
      /```mermaid\s+flowchart LR\s+logo@\{ img: "assets\/logo\.svg"/u,
      `${guide} must not ask GitHub to render a workspace-local image`,
    );
  }
});

void test('les workflows CI, release et Marketplace sont présents', () => {
  for (const workflow of ['ci.yml', 'release.yml', 'publish-marketplace.yml']) {
    assert.equal(existsSync(resolve(root, '.github', 'workflows', workflow)), true);
  }
});

void test('GitHub workflows use the Node 24 generation of official setup actions', () => {
  for (const workflow of ['ci.yml', 'release.yml', 'publish-marketplace.yml']) {
    const contents = readFileSync(resolve(root, '.github', 'workflows', workflow), 'utf8');
    assert.match(contents, /actions\/checkout@v6/u);
    assert.match(contents, /actions\/setup-node@v6/u);
    assert.doesNotMatch(contents, /actions\/(?:checkout|setup-node)@v4/u);
  }
});

void test('Marketplace publishing uses secretless Microsoft Entra federation', () => {
  const workflow = readFileSync(
    resolve(root, '.github', 'workflows', 'publish-marketplace.yml'),
    'utf8',
  );
  assert.match(workflow, /environment: marketplace/u);
  assert.match(workflow, /id-token: write/u);
  assert.match(workflow, /azure\/login@v3/u);
  assert.match(workflow, /vars\.AZURE_CLIENT_ID/u);
  assert.match(workflow, /vars\.AZURE_TENANT_ID/u);
  assert.match(workflow, /allow-no-subscriptions: true/u);
  assert.match(workflow, /vsce verify-pat --azure-credential/u);
  assert.match(workflow, /Marketplace identity ID/u);
  assert.match(workflow, /inputs\.confirmation == 'VERIFY'/u);
  assert.match(workflow, /tags:\s*\n\s*- 'v\*\.\*\.\*'/u);
  assert.match(workflow, /github\.event_name == 'push'/u);
  assert.match(workflow, /PUBLISH_MODE/u);
  assert.match(workflow, /Verify tag and manifest versions/u);
  assert.doesNotMatch(workflow, /VSCE_PAT/u);
});

void test('a version tag creates both the GitHub release and Marketplace publication', () => {
  const releaseWorkflow = readFileSync(
    resolve(root, '.github', 'workflows', 'release.yml'),
    'utf8',
  );
  const marketplaceWorkflow = readFileSync(
    resolve(root, '.github', 'workflows', 'publish-marketplace.yml'),
    'utf8',
  );
  for (const workflow of [releaseWorkflow, marketplaceWorkflow]) {
    assert.match(workflow, /tags:\s*\n\s*- 'v\*\.\*\.\*'/u);
    assert.match(workflow, /require\('\.\/package\.json'\)\.version/u);
    assert.match(workflow, /GITHUB_REF_NAME/u);
  }
  assert.match(releaseWorkflow, /gh release create/u);
  assert.match(marketplaceWorkflow, /npm run publish:marketplace/u);
});

void test('CI verifies supported platforms and all visual fixtures', () => {
  const workflow = readFileSync(resolve(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  for (const operatingSystem of ['ubuntu-latest', 'windows-latest', 'macos-latest']) {
    assert.match(workflow, new RegExp(operatingSystem, 'u'));
  }
  assert.match(workflow, /npm run test:visual/u);
  assert.match(workflow, /Render 44 examples in 3 themes/u);
});

void test('Marketplace README links do not depend on the Marketplace document base URL', () => {
  const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
  const trackedFiles = new Set(
    execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean),
  );
  const htmlTargets = [...readme.matchAll(/\b(?:href|src)="([^"]+)"/gu)]
    .map((match) => match[1]);
  const markdownTargets = [...readme.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)]
    .map((match) => match[1]);
  const targets = [...htmlTargets, ...markdownTargets];
  assert.ok(targets.length > 0);
  for (const target of targets) {
    assert.match(target ?? '', /^https:\/\//u, `Marketplace-relative README target: ${target}`);
    const repositoryAsset = target?.match(
      /^https:\/\/(?:github\.com\/Brainfkt\/mermaid-preview-offline\/blob\/main|raw\.githubusercontent\.com\/Brainfkt\/mermaid-preview-offline\/main)\/([^#?]+)/u,
    );
    if (repositoryAsset?.[1]) {
      const repositoryPath = decodeURIComponent(repositoryAsset[1]);
      assert.equal(
        existsSync(resolve(root, repositoryPath)),
        true,
        `README target does not exist in the repository: ${target}`,
      );
      assert.equal(
        trackedFiles.has(repositoryPath),
        true,
        `README target is not tracked and would return 404 after publishing: ${target}`,
      );
    }
  }
  for (const required of [
    'docs/USER_GUIDE.md',
    'docs/USER_GUIDE.fr.md',
    'docs/PERFORMANCE.md',
    'examples/README.md',
    'examples/COMPATIBILITY.md',
    'roadmap.md',
  ]) {
    assert.match(
      readme,
      new RegExp(`https://github\\.com/Brainfkt/mermaid-preview-offline/blob/main/${required.replaceAll('.', '\\.')}`, 'u'),
    );
  }
  assert.doesNotMatch(readme, /(?:href|src)="(?:\.\/|\.\.\/|\/)/u);
});
