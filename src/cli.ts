import { spawn, type ChildProcess } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import {
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { release, tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, parse, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CdpClient, withTimeout } from './cdpClient';
import {
  CLI_CACHE_FILE_NAME,
  CliExportCache,
  assertCliOutputPaths,
  canReuseCliExport,
  hashCliFile,
  hashCliValue,
  writeCliFileAtomically,
} from './cliIncremental';
import { cliWatchSnapshot, runCliWatch } from './cliWatch';
import {
  DEFAULT_DIAGRAM_FONT_FAMILY,
  isDiagramFontFamily,
  type DiagramFontFamily,
} from './diagramFont';
import {
  DEFAULT_EXPORT_SETTINGS,
  EXPORT_FORMATS,
  createExportFileName,
  normalizeExportSettings,
  sanitizeFileName,
  type ExportSettings,
} from './exportSettings';
import {
  assertOfflineImageReferences,
  imageMimeType,
  inlineImageReferences,
  isRelativeLocalImage,
} from './localImages';
import type { SerializedExportArtifact } from './protocol';
import { loadRemoteImage } from './remoteImages';
import {
  allowedRemoteImageUrl,
  normalizeRemoteBases,
  normalizeResourceLimits,
  type ResourceLimitInput,
  type ResourcePolicy,
} from './resourcePolicy';

interface CliOptions {
  browser?: string;
  fontFamily: DiagramFontFamily;
  input: string;
  incremental: boolean;
  json: boolean;
  output?: string;
  profile?: string;
  resourcePolicy: ResourcePolicy;
  settings: ExportSettings;
  watch: boolean;
}

interface RenderFile {
  relativeDirectory: string;
  uri: string;
}

interface BrowserSession {
  close(): Promise<void>;
  render(request: {
    fileName: string;
    fontFamily: DiagramFontFamily;
    maxRasterPixels: number;
    settings: ExportSettings;
    source: string;
    sourceUri: string;
  }): Promise<SerializedExportArtifact>;
}

void main().catch((error: unknown) => {
  console.error(`mermaid-preview-offline: ${errorMessageOf(error)}`);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = await parseArguments(args);
  const inputPath = resolve(options.input);
  const inputStats = await stat(inputPath);
  const directoryInput = inputStats.isDirectory();
  const inputRoot = await realpath(directoryInput ? inputPath : dirname(inputPath));
  const initialFiles = directoryInput
    ? await collectMermaidFiles(inputPath)
    : [{ relativeDirectory: '', uri: inputPath }];
  if (initialFiles.length === 0 && !options.watch) {
    throw new Error('No .mmd or .mermaid files were found.');
  }
  for (const file of initialFiles) {
    if (!/\.(?:mmd|mermaid)$/iu.test(file.uri)) {
      throw new Error(`Unsupported input file: ${file.uri}`);
    }
  }

  const output = options.output
    ? resolve(options.output)
    : initialFiles.length > 1 || (options.watch && directoryInput)
      ? join(inputPath, 'exports')
      : dirname(inputPath);
  // A watched folder remains a folder when files are added or removed.
  const outputIsFile = !(options.watch && directoryInput) && initialFiles.length === 1 && Boolean(extname(output));
  const cachePath = join(outputIsFile ? dirname(output) : output, CLI_CACHE_FILE_NAME);
  const cache = options.incremental ? await CliExportCache.load(cachePath) : undefined;
  const engineIdentity = options.incremental ? await cliEngineIdentity(options.browser) : undefined;
  const controller = new AbortController();
  let browser: BrowserSession | undefined;
  let browserStarting: Promise<BrowserSession> | undefined;
  let dependencies = new Set<string>();
  let hasRemoteImages = false;
  let previousSources = new Set(initialFiles.map((file) => file.uri));
  const stop = (): void => {
    controller.abort();
    // Close the renderer to interrupt an in-flight render as well as idle waits.
    if (browser) void browser.close().catch(() => undefined);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const getBrowser = async (): Promise<BrowserSession> => {
    browserStarting ??= startBrowser(options.browser);
    browser = await browserStarting;
    if (controller.signal.aborted) {
      await browser.close();
      throw new Error('Export stopped.');
    }
    return browser;
  };
  const reportError = (error: unknown): void => {
    const message = errorMessageOf(error);
    if (options.json) console.log(JSON.stringify({ event: 'error', error: message }));
    else console.error(`mermaid-preview-offline: ${message}`);
  };

  const run = async (): Promise<void> => {
    // Re-read the profile on every cycle; explicit command-line overrides still win.
    const current = options.watch ? await parseArguments(args) : options;
    const files = directoryInput
      ? await collectMermaidFiles(inputPath)
      : existsSync(inputPath) ? [{ relativeDirectory: '', uri: inputPath }] : [];
    const sources = new Set(files.map((file) => file.uri));
    const removed = [...previousSources].filter((source) => !sources.has(source));
    previousSources = sources;
    cache?.forgetSources(new Set(removed));
    const exported: Array<{ height: number; output: string; width: number }> = [];
    const skipped: Array<{ height: number; output: string; width: number }> = [];
    const errors: Array<{ input: string; error: string }> = [];
    dependencies = new Set<string>();
    hasRemoteImages = false;
    const protectedInputs = [...sources, ...(current.profile ? [resolve(current.profile)] : [])];
    // Read just the bounded source text to protect every local image before any
    // output is written, including images referenced by a later input file.
    for (const file of files) {
      try {
        const raw = await readCliSource(file.uri, current.resourcePolicy);
        for (const match of raw.matchAll(/\bimg\s*:\s*(["'])([^"'\r\n]+)\1/gu)) {
          const reference = match[2];
          if (!reference || !shouldResolveCliImage(reference, current.resourcePolicy) || /^https:/iu.test(reference)) continue;
          const path = cliLocalImagePath(file.uri, reference);
          if (path) protectedInputs.push(path);
        }
      } catch (error: unknown) {
        // Per-file loading below reports invalid/missing sources in watch mode.
        if (!options.watch) throw error;
      }
    }
    const plannedTargets = files.map((file) => outputPathFor(output, outputIsFile ? 1 : 2, file,
      createExportFileName({ fileName: basename(file.uri), settings: current.settings })));
    await assertCliOutputPaths(plannedTargets, protectedInputs, cache ? cachePath : undefined);
    for (const [fileIndex, file] of files.entries()) {
      if (controller.signal.aborted) break;
      try {
        const loaded = await loadSourceWithImages(file.uri, inputRoot, current.resourcePolicy, dependencies);
        hasRemoteImages ||= loaded.hasRemoteImages;
        const fingerprint = hashCliValue({
          engineIdentity,
          fontFamily: current.fontFamily,
          resourcePolicy: current.resourcePolicy,
          settings: current.settings,
          source: loaded.source,
          sourceHash: loaded.sourceHash,
          sourceUri: pathToFileURL(file.uri).toString(),
        });
        const expectedName = createExportFileName({ fileName: basename(file.uri), settings: current.settings });
        const expectedTarget = outputPathFor(output, outputIsFile ? 1 : 2, file, expectedName);
        const cached = canReuseCliExport(current.settings)
          ? await cache?.lookup(file.uri, expectedTarget, fingerprint)
          : undefined;
        if (cached) {
          skipped.push({ height: cached.height, output: cached.output, width: cached.width });
          if (!current.json) console.log(`${cached.output} (up to date)`);
          continue;
        }
        const activeBrowser = await getBrowser();
        const artifact = await withTimeout(activeBrowser.render({
          fileName: basename(file.uri),
          fontFamily: current.fontFamily,
          maxRasterPixels: current.resourcePolicy.limits.maxRasterPixels,
          settings: current.settings,
          source: loaded.source,
          sourceUri: pathToFileURL(file.uri).toString(),
        }), 60_000, `Rendering timed out after 60 seconds: ${file.uri}`);
        if (controller.signal.aborted) break;
        const target = outputPathFor(output, outputIsFile ? 1 : 2, file, artifact.fileName);
        if (target !== plannedTargets[fileIndex]) {
          // A date/time template may cross a clock boundary while rendering.
          plannedTargets[fileIndex] = target;
          await assertCliOutputPaths(plannedTargets, protectedInputs, cache ? cachePath : undefined);
        }
        const bytes = Buffer.from(artifact.dataBase64, 'base64');
        await writeCliFileAtomically(target, bytes);
        cache?.remember({
          fingerprint,
          height: artifact.height,
          output: target,
          outputHash: await hashCliFile(target),
          source: file.uri,
          width: artifact.width,
        });
        exported.push({ height: artifact.height, output: target, width: artifact.width });
        if (!current.json) console.log(`${target} (${artifact.width} × ${artifact.height})`);
      } catch (error: unknown) {
        if (controller.signal.aborted) break;
        if (!options.watch) throw error;
        errors.push({ input: file.uri, error: errorMessageOf(error) });
        if (!current.json) console.error(`${file.uri}: ${errorMessageOf(error)}`);
        // A terminated renderer or timeout must not poison later watch cycles.
        await browser?.close().catch(() => undefined);
        browser = undefined;
        browserStarting = undefined;
      }
    }
    await cache?.save();
    if (options.json && !controller.signal.aborted) {
      console.log(options.watch
        ? JSON.stringify({ event: 'cycle', exported, skipped, errors, removed })
        : JSON.stringify(options.incremental ? { exported, skipped } : { exported }, undefined, 2));
    } else if (options.watch && removed.length > 0) {
      for (const source of removed) console.log(`${source} (removed; existing exports kept)`);
    }
  };
  try {
    if (options.watch) {
      if (!options.json) console.log(`Watching ${inputPath}; press Ctrl+C to stop.`);
      await runCliWatch({
        onError: reportError,
        run,
        signal: controller.signal,
        snapshot: async () => {
          const files = directoryInput ? await collectMermaidFiles(inputPath) : [{ uri: inputPath }];
          return cliWatchSnapshot([
            ...directoryInput ? [] : [inputPath],
            ...files.map((file) => file.uri),
            ...dependencies,
            ...(options.profile ? [resolve(options.profile)] : []),
          ], hasRemoteImages || options.resourcePolicy.allowRemoteImages);
        },
      });
    } else await run();
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    if (browserStarting) await (await browserStarting.catch(() => undefined))?.close();
    if (options.watch && options.json) console.log(JSON.stringify({ event: 'stopped' }));
  }
}

async function parseArguments(args: string[]): Promise<CliOptions> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    process.exit(0);
  }
  if (args.includes('--version') || args.includes('-v')) {
    console.log(await packageVersion());
    process.exit(0);
  }
  let profile: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--profile') {
      const value = args[index + 1];
      if (!value) throw new Error('Missing value after --profile.');
      profile = value;
      index += 1;
    }
  }
  const settingsValue: Record<string, unknown> = { ...DEFAULT_EXPORT_SETTINGS };
  if (profile) {
    const profileValue = JSON.parse(await readFile(resolve(profile), 'utf8')) as unknown;
    Object.assign(settingsValue, isRecord(profileValue) && 'settings' in profileValue
      ? profileValue.settings
      : profileValue);
  }
  let input = '';
  let output: string | undefined;
  let browser: string | undefined;
  let fontFamily: DiagramFontFamily = DEFAULT_DIAGRAM_FONT_FAMILY;
  let json = false;
  let incremental = false;
  let watch = false;
  let allowPrivateNetwork = false;
  const additionalLocalRoots: string[] = [];
  const remoteBaseInputs: string[] = [];
  const limitInput: ResourceLimitInput = {};

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) continue;
    if (!argument.startsWith('-') && !input) {
      input = argument;
      continue;
    }
    const takeValue = (): string => {
      const value = args[index + 1];
      if (!value) throw new Error(`Missing value after ${argument}.`);
      index += 1;
      return value;
    };
    const takePositiveNumber = (): number => {
      const value = Number(takeValue());
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${argument} requires a positive number.`);
      }
      return value;
    };
    switch (argument) {
      case '--output':
      case '-o': output = takeValue(); break;
      case '--format': settingsValue.format = takeValue(); break;
      case '--scale': settingsValue.scale = Number(takeValue()); break;
      case '--dpi': settingsValue.dpi = Number(takeValue()); break;
      case '--density': settingsValue.density = takeValue(); break;
      case '--margin': settingsValue.margin = Number(takeValue()); break;
      case '--theme': settingsValue.theme = takeValue(); break;
      case '--font': {
        const value = takeValue();
        if (!isDiagramFontFamily(value)) {
          throw new Error(`Unsupported font: ${value}`);
        }
        fontFamily = value;
        break;
      }
      case '--name-template': settingsValue.fileNameTemplate = takeValue(); break;
      case '--background': {
        const value = takeValue();
        settingsValue.background = value === 'transparent' ? 'transparent' : 'color';
        if (value !== 'transparent') settingsValue.backgroundColor = value;
        break;
      }
      case '--original-svg': settingsValue.svgVariant = 'original'; break;
      case '--no-optimize': settingsValue.optimizeSvg = false; break;
      case '--metadata': settingsValue.includeMetadata = true; break;
      case '--no-metadata': settingsValue.includeMetadata = false; break;
      case '--browser': browser = takeValue(); break;
      case '--allow-local-root': {
        const root = resolve(takeValue());
        if (parse(root).root === root) {
          throw new Error('--allow-local-root cannot grant access to a filesystem root.');
        }
        additionalLocalRoots.push(root);
        break;
      }
      case '--allow-remote-base': remoteBaseInputs.push(takeValue()); break;
      case '--allow-private-network': allowPrivateNetwork = true; break;
      case '--max-source-mib':
        limitInput.maxSourceBytes = takePositiveNumber() * 1024 * 1024;
        limitInput.useCustom = true;
        break;
      case '--max-images':
        limitInput.maxImages = takePositiveNumber();
        limitInput.useCustom = true;
        break;
      case '--max-image-mib':
        limitInput.maxImageBytes = takePositiveNumber() * 1024 * 1024;
        limitInput.useCustom = true;
        break;
      case '--max-total-image-mib':
        limitInput.maxTotalBytes = takePositiveNumber() * 1024 * 1024;
        limitInput.useCustom = true;
        break;
      case '--max-raster-megapixels':
        limitInput.maxRasterPixels = takePositiveNumber() * 1_000_000;
        limitInput.useCustom = true;
        break;
      case '--profile': profile = takeValue(); break;
      case '--json': json = true; break;
      case '--incremental': incremental = true; break;
      case '--watch': watch = true; incremental = true; break;
      default: throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!input) {
    throw new Error(`An input file or folder is required.\n\n${usage()}`);
  }
  if (!EXPORT_FORMATS.some((format) => format === settingsValue.format)) {
    throw new Error(`Unsupported format: ${String(settingsValue.format)}`);
  }
  const settings = normalizeExportSettings(settingsValue);
  const allowedRemoteBases = normalizeRemoteBases(remoteBaseInputs);
  if (allowedRemoteBases.length !== remoteBaseInputs.length) {
    throw new Error('--allow-remote-base requires an HTTPS URL without credentials, query, or fragment.');
  }
  const resourcePolicy: ResourcePolicy = {
    additionalLocalRoots,
    allowAdditionalLocalRoots: additionalLocalRoots.length > 0,
    allowPrivateNetwork,
    allowRemoteImages: allowedRemoteBases.length > 0,
    allowedRemoteBases,
    limits: normalizeResourceLimits(limitInput),
  };
  return { browser, fontFamily, input, incremental, json, output, profile, resourcePolicy, settings, watch };
}

async function startBrowser(preferredExecutable?: string): Promise<BrowserSession> {
  const executable = preferredExecutable ? resolve(preferredExecutable) : findBrowserExecutable();
  if (!executable || !existsSync(executable)) {
    throw new Error(
      'No Chromium-based browser was found. Install Chrome, Chromium, or Edge, or pass --browser <path>.',
    );
  }
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'mermaid-preview-offline-'));
  const rendererHtml = join(temporaryDirectory, 'renderer.html');
  const rendererScriptUri = pathToFileURL(join(__dirname, 'cli-renderer.js')).toString();
  await writeFile(
    rendererHtml,
    '<!doctype html><html><head>' +
      '<meta http-equiv="Content-Security-Policy" content="' +
      "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; " +
      "font-src data:; script-src 'self' file:; connect-src 'none'; object-src 'none'; frame-src 'none'" +
      `"></head><body><script type="module" src="${rendererScriptUri}"></script></body></html>`,
    'utf8',
  );
  const browserProcess = spawn(
    executable,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      '--remote-debugging-pipe',
      `--user-data-dir=${join(temporaryDirectory, 'profile')}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
  );
  browserProcess.stderr?.resume();
  let client: CdpClient | undefined;
  try {
    const connectedClient = CdpClient.connect(browserProcess);
    client = connectedClient;
    const sessionId = await withTimeout(
      initializeBrowserRenderer(connectedClient, rendererHtml),
      15_000,
      'Chromium did not initialize its debugging connection within 15 seconds.',
    );
    let closing: Promise<void> | undefined;
    return {
      close(): Promise<void> {
        closing ??= (async () => {
          connectedClient.close();
          await stopBrowser(browserProcess);
          await rm(temporaryDirectory, { force: true, recursive: true });
        })();
        return closing;
      },
      async render(request): Promise<SerializedExportArtifact> {
        const expression = `window.mermaidOfflineCli.render(${JSON.stringify(request)})`;
        const response = await connectedClient.send(
          'Runtime.evaluate',
          { awaitPromise: true, expression, returnByValue: true },
          sessionId,
        );
        if (response.exceptionDetails) {
          throw new Error(JSON.stringify(response.exceptionDetails));
        }
        const remoteObject = isRecord(response.result) ? response.result : undefined;
        const value = remoteObject?.value;
        if (!isSerializedExportArtifact(value)) {
          throw new Error('The browser returned an invalid export result.');
        }
        return value;
      },
    };
  } catch (error: unknown) {
    client?.close();
    await stopBrowser(browserProcess);
    await rm(temporaryDirectory, { force: true, recursive: true });
    throw error;
  }
}

async function initializeBrowserRenderer(
  client: CdpClient,
  rendererHtml: string,
): Promise<string> {
  const target = await client.send('Target.createTarget', { url: 'about:blank' });
  const targetId = stringProperty(target, 'targetId');
  const attached = await client.send('Target.attachToTarget', { flatten: true, targetId });
  const sessionId = stringProperty(attached, 'sessionId');
  await client.send('Page.enable', {}, sessionId);
  await client.send('Runtime.enable', {}, sessionId);
  await client.send('Network.enable', {}, sessionId);
  await client.send('Network.setBlockedURLs', {
    urls: ['http://*', 'https://*', 'ftp://*', 'ws://*', 'wss://*'],
  }, sessionId);
  const loaded = client.waitFor('Page.loadEventFired', sessionId);
  await client.send('Page.navigate', { url: pathToFileURL(rendererHtml).toString() }, sessionId);
  await loaded;
  const installed = await client.send(
    'Runtime.evaluate',
    { expression: "typeof window.mermaidOfflineCli?.render === 'function'", returnByValue: true },
    sessionId,
  );
  const installedResult = isRecord(installed.result) ? installed.result : undefined;
  if (installed.exceptionDetails || installedResult?.value !== true) {
    throw new Error(`Could not initialize the browser renderer: ${JSON.stringify(installed.exceptionDetails)}`);
  }
  return sessionId;
}

async function stopBrowser(browser: ChildProcess): Promise<void> {
  if (browser.exitCode !== null || browser.killed) return;
  browser.kill('SIGTERM');
  await new Promise<void>((resolvePromise) => {
    const timeout = setTimeout(resolvePromise, 2_000);
    browser.once('exit', () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });
  if (browser.exitCode === null) browser.kill('SIGKILL');
}

function findBrowserExecutable(): string | undefined {
  const candidates = process.platform === 'darwin'
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ]
    : process.platform === 'win32'
      ? [
          join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
          join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
          join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
        ]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

async function collectMermaidFiles(root: string, directory = root): Promise<RenderFile[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  });
  const files: RenderFile[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'exports') {
      files.push(...await collectMermaidFiles(root, entryPath));
    } else if (entry.isFile() && /\.(?:mmd|mermaid)$/iu.test(entry.name)) {
      files.push({ relativeDirectory: dirname(relative(root, entryPath)), uri: entryPath });
    }
  }
  return files;
}

async function loadSourceWithImages(
  file: string,
  root: string,
  policy: ResourcePolicy,
  dependencies: Set<string>,
): Promise<{ hasRemoteImages: boolean; source: string; sourceHash: string }> {
  const source = await readCliSource(file, policy);
  let hasRemoteImages = false;
  const inlined = await inlineImageReferences(
    source,
    (reference) => {
      hasRemoteImages ||= /^https:/iu.test(reference);
      return loadCliImage(file, root, reference, policy, dependencies);
    },
    (reference) => shouldResolveCliImage(reference, policy),
    policy.limits,
  );
  assertOfflineImageReferences(inlined);
  return { hasRemoteImages, source: inlined, sourceHash: hashCliValue(source) };
}

async function readCliSource(file: string, policy: ResourcePolicy): Promise<string> {
  const sourceMetadata = await stat(file);
  if (sourceMetadata.size > policy.limits.maxSourceBytes) {
    throw new Error(
      `Source file exceeds the ` +
      `${Math.round(policy.limits.maxSourceBytes / (1024 * 1024))} MB ` +
      `render limit: ${file}`,
    );
  }
  const source = await readFile(file, 'utf8');
  if (Buffer.byteLength(source) > policy.limits.maxSourceBytes) {
    throw new Error(`Source file grew beyond the render limit while reading: ${file}`);
  }
  return source;
}

async function loadCliImage(
  file: string,
  inputRoot: string,
  reference: string,
  policy: ResourcePolicy,
  dependencies: Set<string>,
): Promise<{ bytes: Uint8Array; mimeType: string } | undefined> {
  const remoteUrl = policy.allowRemoteImages
    ? allowedRemoteImageUrl(reference, policy.allowedRemoteBases)
    : undefined;
  if (remoteUrl) {
    return loadRemoteImage(remoteUrl.toString(), {
      allowPrivateNetwork: policy.allowPrivateNetwork,
      allowedBases: policy.allowedRemoteBases,
      maxBytes: policy.limits.maxImageBytes,
      maxPixels: policy.limits.maxRasterPixels,
    });
  }

  const mimeType = imageMimeType(reference);
  if (!mimeType) return undefined;
  try {
    const requestedPath = cliLocalImagePath(file, reference);
    if (!requestedPath) return undefined;
    // Keep unresolved paths too: creating a previously missing image must recover
    // an errored watch export without editing its Mermaid source again.
    dependencies.add(requestedPath);
    const resource = await realpath(requestedPath);
    dependencies.add(resource);
    const allowedRoots = [
      await realpath(inputRoot),
      ...policy.allowAdditionalLocalRoots
        ? await Promise.all(policy.additionalLocalRoots.map((candidate) => realpath(candidate)))
        : [],
    ];
    if (!allowedRoots.some((allowedRoot) => isPathInside(allowedRoot, resource))) return undefined;
    const metadata = await stat(resource);
    if (!metadata.isFile() || metadata.size > policy.limits.maxImageBytes) return undefined;
    const bytes = await readFile(resource);
    return bytes.byteLength <= policy.limits.maxImageBytes ? { bytes, mimeType } : undefined;
  } catch {
    return undefined;
  }
}

function cliLocalImagePath(file: string, reference: string): string | undefined {
  const referencePath = reference.split(/[?#]/u, 1)[0];
  if (!referencePath) return undefined;
  return referencePath.startsWith('file:')
    ? fileURLToPath(referencePath)
    : isAbsolute(referencePath)
      ? decodeURIComponent(referencePath)
      : resolve(dirname(file), decodeURIComponent(referencePath));
}

function shouldResolveCliImage(reference: string, policy: ResourcePolicy): boolean {
  if (isRelativeLocalImage(reference)) return true;
  if (policy.allowRemoteImages && allowedRemoteImageUrl(reference, policy.allowedRemoteBases)) {
    return true;
  }
  const referencePath = reference.split(/[?#]/u, 1)[0] ?? '';
  return policy.allowAdditionalLocalRoots &&
    (referencePath.startsWith('file:') || isAbsolute(referencePath));
}

function outputPathFor(
  output: string,
  fileCount: number,
  source: RenderFile,
  generatedName: string,
): string {
  if (fileCount === 1 && extname(output)) {
    return output;
  }
  const safeName = sanitizeFileName(generatedName);
  if (!safeName) throw new Error('The generated output name is invalid.');
  const relativeDirectory = source.relativeDirectory === '.' ? '' : source.relativeDirectory;
  return join(output, relativeDirectory, safeName);
}

function isPathInside(root: string, candidate: string): boolean {
  const relativePath = relative(resolve(root), resolve(candidate));
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

async function cliEngineIdentity(preferredBrowser?: string): Promise<string> {
  const bundles = [join(__dirname, 'cli-renderer.js')];
  const chunks = join(__dirname, 'chunks');
  if (existsSync(chunks)) {
    for (const entry of (await readdir(chunks)).sort()) {
      if (entry.endsWith('.js')) bundles.push(join(chunks, entry));
    }
  }
  const executable = preferredBrowser ? resolve(preferredBrowser) : findBrowserExecutable();
  const browserMetadata = executable ? await stat(executable, { bigint: true }) : undefined;
  const hashes: string[] = [];
  for (const bundle of bundles) hashes.push(await hashCliFile(bundle));
  return hashCliValue({
    browser: executable,
    browserModified: browserMetadata?.mtimeNs.toString(),
    browserSize: browserMetadata?.size.toString(),
    bundles: hashes,
    platform: [process.platform, process.arch, release()],
    version: await packageVersion(),
  });
}

async function packageVersion(): Promise<string> {
  const manifest = JSON.parse(
    await readFile(join(__dirname, '..', 'package.json'), 'utf8'),
  ) as unknown;
  if (!isRecord(manifest) || typeof manifest.version !== 'string') {
    throw new Error('The extension package version is unavailable.');
  }
  return manifest.version;
}

function isSerializedExportArtifact(value: unknown): value is SerializedExportArtifact {
  if (!isRecord(value)) return false;
  return (
    typeof value.dataBase64 === 'string' &&
    typeof value.fileName === 'string' &&
    (value.format === 'svg' || value.format === 'png' || value.format === 'webp' || value.format === 'pdf') &&
    typeof value.height === 'number' &&
    typeof value.mimeType === 'string' &&
    typeof value.width === 'number'
  );
}

function stringProperty(value: Record<string, unknown>, key: string): string {
  const property = value[key];
  if (typeof property !== 'string') throw new Error(`Chromium did not return ${key}.`);
  return property;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function usage(): string {
  return `Usage: mpo <file-or-folder> [options]

Options:
  -o, --output <path>        Output file or folder
      --format <format>      svg, png, webp, or pdf (default: png)
      --scale <factor>       Scale factor from 0.25 to 8
      --dpi <number>         Resolution from 72 to 600 DPI
      --density <density>    compact, comfortable, or spacious
      --margin <pixels>      Margin around the diagram
      --background <value>  transparent or a #rrggbb color
      --theme <theme>        adaptive, classic, Neo, Redux, or Sketch theme name
      --font <font>          vscode, noto-sans, or inter (default: vscode)
      --name-template <tpl>  File template using {name}, {format}, {theme}, …
      --profile <json>       Read export settings from a JSON profile
      --original-svg         Keep SVG output unchanged
      --no-optimize          Disable SVG optimization
      --metadata             Include source metadata and export time
      --no-metadata          Omit metadata, including from a loaded profile
      --allow-local-root <path>
                             Allow images under an additional absolute directory
      --allow-remote-base <https-url>
                             Allow and inline images below an HTTPS base URL
      --allow-private-network
                             Permit allowlisted hosts that resolve to private addresses
      --max-source-mib <n>   Custom source limit, capped at 64 MiB
      --max-images <n>       Custom image-count limit, capped at 256
      --max-image-mib <n>    Custom per-image limit, capped at 32 MiB
      --max-total-image-mib <n>
                             Custom aggregate image limit, capped at 128 MiB
      --max-raster-megapixels <n>
                             Custom raster budget, capped at 64 megapixels
      --browser <path>       Chrome, Chromium, or Edge executable
      --incremental          Skip intact exports with unchanged source, images, and settings
      --watch                Watch sources, images, and profile; implies --incremental
      --json                 Print JSON (one JSON object per cycle with --watch)
  -h, --help                 Show this help
  -v, --version              Show the version`;
}
