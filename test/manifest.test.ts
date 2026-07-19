import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

interface ExtensionManifest {
  activationEvents: string[];
  bin: Record<string, string>;
  contributes: {
    commands: Array<{ command: string; title: string }>;
    configuration: {
      properties: Record<
        string,
        {
          default?: unknown;
          enum?: unknown[];
          maximum?: number;
          minimum?: number;
          scope?: string;
        }
      >;
    };
    customEditors: Array<{
      priority: string;
      selector: Array<{ filenamePattern: string }>;
      viewType: string;
    }>;
    snippets: Array<{ language: string; path: string }>;
    taskDefinitions: Array<{
      properties: Record<string, unknown>;
      required: string[];
      type: string;
    }>;
    menus: Record<string, Array<{ command: string; when: string }>>;
  };
  dependencies: Record<string, string>;
  extensionKind: string[];
}

const manifestPath = resolve(__dirname, '../../package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ExtensionManifest;

void test('le clic sur les deux extensions Mermaid utilise l’aperçu par défaut', () => {
  const editor = manifest.contributes.customEditors[0];
  assert.ok(editor);
  assert.equal(editor.priority, 'default');
  assert.equal(editor.viewType, 'brainfkt.mermaidPreviewOffline');
  assert.deepEqual(
    editor.selector.map((entry) => entry.filenamePattern),
    ['*.mmd', '*.mermaid'],
  );
});

void test('Mermaid est une dépendance locale épinglée', () => {
  assert.equal(manifest.dependencies.mermaid, '11.16.0');
  assert.equal(manifest.dependencies['@mermaid-js/mermaid-zenuml'], '0.2.3');
  assert.match(manifest.dependencies['@iconify-json/logos'] ?? '', /^1\./u);
  assert.match(manifest.dependencies['@iconify-json/material-icon-theme'] ?? '', /^1\./u);
});

void test('preview commands expose all four native editor layouts', () => {
  const commands = manifest.contributes.commands.map((entry) => entry.command);
  const layoutCommands = [
    'mermaidPreviewOffline.openPreviewOnly',
    'mermaidPreviewOffline.openSourceOnly',
    'mermaidPreviewOffline.openBeside',
    'mermaidPreviewOffline.openAbove',
  ];
  for (const command of [
    'mermaidPreviewOffline.openPreview',
    'mermaidPreviewOffline.openPreviewToSide',
    'mermaidPreviewOffline.chooseEditorLayout',
    ...layoutCommands,
    'mermaidPreviewOffline.configureDefaultEditor',
    'mermaidPreviewOffline.export',
    'mermaidPreviewOffline.newDiagram',
    'mermaidPreviewOffline.browseExamples',
    'mermaidPreviewOffline.generateFromTemplate',
    'mermaidPreviewOffline.compareGitVersions',
    'mermaidPreviewOffline.previewVisualDiff',
    'mermaidPreviewOffline.previewDocumentationBlock',
    'mermaidPreviewOffline.previewDocumentation',
    'mermaidPreviewOffline.exportDocumentation',
  ]) {
    assert.ok(commands.includes(command));
    assert.ok(manifest.activationEvents.includes(`onCommand:${command}`));
  }
  for (const command of [
    'mermaidPreviewOffline.formatDocument',
    'mermaidPreviewOffline.insertElement',
    'mermaidPreviewOffline.generateMissingIds',
    'mermaidPreviewOffline.renameIdentifier',
  ]) {
    assert.ok(commands.includes(command));
    assert.ok(manifest.activationEvents.includes(`onCommand:${command}`));
  }
  assert.ok(manifest.activationEvents.includes('onLanguage:mermaid'));
  assert.ok(manifest.activationEvents.includes('onTaskType:mermaid-export'));
  const explorerCommands = (manifest.contributes.menus['explorer/context'] ?? []).map(
    (entry) => entry.command,
  );
  assert.deepEqual(explorerCommands.slice(0, 4), layoutCommands);
  assert.ok(explorerCommands.includes('mermaidPreviewOffline.configureDefaultEditor'));
  const titleCommands = manifest.contributes.menus['editor/title'] ?? [];
  assert.equal(titleCommands[0]?.command, 'mermaidPreviewOffline.chooseEditorLayout');
  assert.match(titleCommands[0]?.when ?? '', /activeCustomEditorId/u);
});

void test('v0.6 project workflows expose Diagram Studio and visual Git diff commands', () => {
  const commands = manifest.contributes.commands.map((entry) => entry.command);
  const projectCommands = [
    'mermaidPreviewOffline.newDiagram',
    'mermaidPreviewOffline.browseExamples',
    'mermaidPreviewOffline.generateFromTemplate',
    'mermaidPreviewOffline.compareGitVersions',
    'mermaidPreviewOffline.previewVisualDiff',
  ];
  for (const command of projectCommands) {
    assert.ok(commands.includes(command));
    assert.ok(manifest.activationEvents.includes(`onCommand:${command}`));
  }
  const explorerCommands = manifest.contributes.menus['explorer/context'] ?? [];
  assert.ok(explorerCommands.some((entry) => entry.command === 'mermaidPreviewOffline.compareGitVersions'));
  const titleCommands = manifest.contributes.menus['editor/title'] ?? [];
  const visualDiff = titleCommands.find((entry) => entry.command === 'mermaidPreviewOffline.previewVisualDiff');
  assert.match(visualDiff?.when ?? '', /textCompareEditorVisible/u);
});

void test('v0.7 documentation workflows support Markdown, MDX, and AsciiDoc', () => {
  const commands = manifest.contributes.commands.map((entry) => entry.command);
  const documentationCommands = [
    'mermaidPreviewOffline.previewDocumentationBlock',
    'mermaidPreviewOffline.previewDocumentation',
    'mermaidPreviewOffline.exportDocumentation',
  ];
  for (const command of documentationCommands) {
    assert.ok(commands.includes(command));
    assert.ok(manifest.activationEvents.includes(`onCommand:${command}`));
  }
  for (const language of ['markdown', 'mdx', 'asciidoc']) {
    assert.ok(manifest.activationEvents.includes(`onLanguage:${language}`));
  }
  const titleCommands = manifest.contributes.menus['editor/title'] ?? [];
  for (const command of documentationCommands) {
    const contribution = titleCommands.find((entry) => entry.command === command);
    assert.match(contribution?.when ?? '', /editorLangId == markdown/u);
    assert.match(contribution?.when ?? '', /editorLangId == mdx/u);
    assert.match(contribution?.when ?? '', /editorLangId == asciidoc/u);
  }
});

void test('professional export is exposed to the UI, tasks, and offline CLI', () => {
  assert.equal(manifest.bin.mpo, './bin/mpo.cjs');
  const task = manifest.contributes.taskDefinitions[0];
  assert.equal(task?.type, 'mermaid-export');
  assert.deepEqual(task?.required, ['source']);
  for (const property of [
    'source',
    'output',
    'format',
    'theme',
    'scale',
    'dpi',
    'margin',
    'background',
    'nameTemplate',
  ]) {
    assert.ok(property in (task?.properties ?? {}));
  }
});

void test('Mermaid contributes language snippets for advanced editing', () => {
  assert.deepEqual(manifest.contributes.snippets, [
    { language: 'mermaid', path: './snippets/mermaid.json' },
  ]);
  const snippets = JSON.parse(
    readFileSync(resolve(__dirname, '../../snippets/mermaid.json'), 'utf8'),
  ) as Record<string, unknown>;
  assert.equal(Object.keys(snippets).length, 43);
  const grammar = readFileSync(
    resolve(__dirname, '../../syntaxes/mermaid.tmLanguage.json'),
    'utf8',
  );
  assert.match(grammar, /flowchart-elk/u);
  assert.match(grammar, /\|info\|/u);
});

void test('refresh, large-file, and diagram-theme settings are configurable', () => {
  const properties = manifest.contributes.configuration.properties;
  assert.deepEqual(properties['mermaidPreviewOffline.refreshMode']?.enum, [
    'automatic',
    'manual',
  ]);
  assert.equal(properties['mermaidPreviewOffline.refreshDelay']?.default, 140);
  assert.equal(properties['mermaidPreviewOffline.refreshDelay']?.maximum, 2000);
  assert.equal(properties['mermaidPreviewOffline.largeFileThresholdKb']?.default, 512);
  assert.equal(properties['mermaidPreviewOffline.minimap.enabled']?.default, true);
  assert.equal(properties['mermaidPreviewOffline.minimap.enabled']?.scope, 'resource');
  assert.deepEqual(properties['mermaidPreviewOffline.diagramTheme']?.enum, [
    'adaptive',
    'default',
    'dark',
    'forest',
    'neutral',
    'base',
  ]);
  assert.equal(properties['mermaidPreviewOffline.diagramTheme']?.scope, 'window');
  assert.deepEqual(properties['mermaidPreviewOffline.export.format']?.enum, [
    'svg',
    'png',
    'webp',
    'pdf',
  ]);
  assert.equal(properties['mermaidPreviewOffline.export.scale']?.default, 1);
  assert.equal(properties['mermaidPreviewOffline.export.dpi']?.default, 144);
  assert.equal(properties['mermaidPreviewOffline.export.margin']?.default, 24);
  assert.equal(properties['mermaidPreviewOffline.export.optimizeSvg']?.default, true);
  assert.equal(properties['mermaidPreviewOffline.export.includeMetadata']?.default, true);
});

void test('the extension can run in local and remote VS Code extension hosts', () => {
  assert.deepEqual(manifest.extensionKind, ['workspace', 'ui']);
});

void test('split preview follows the active source without duplicate custom editors', () => {
  const extension = readFileSync(resolve(__dirname, '../../src/extension.ts'), 'utf8');
  const controller = readFileSync(
    resolve(__dirname, '../../src/editorLayoutController.ts'),
    'utf8',
  );
  assert.match(extension, /supportsMultipleEditorsPerDocument:\s*false/u);
  assert.match(extension, /onDidChangeActiveTextEditor/u);
  assert.match(extension, /onDidChangeTabs/u);
  assert.match(extension, /syncPreviewForSource/u);
  assert.match(extension, /handleTabsChanged/u);
  assert.match(controller, /disposeOtherSplitPanels/u);
  assert.match(controller, /closeDuplicateSourceTabs/u);
  assert.match(controller, /closeUnexpectedPreviewTabs/u);
});

void test('Mermaid rendering stays out of the DOM-less extension host', () => {
  const languageFeatures = readFileSync(
    resolve(__dirname, '../../src/languageFeatures.ts'),
    'utf8',
  );
  assert.doesNotMatch(languageFeatures, /import mermaid from ['"]mermaid['"]/u);
  assert.doesNotMatch(languageFeatures, /mermaid\.parse/u);
});
