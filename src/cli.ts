import { spawn, type ChildProcess } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_EXPORT_SETTINGS,
  EXPORT_FORMATS,
  normalizeExportSettings,
  sanitizeFileName,
  type ExportSettings,
} from './exportSettings';
import {
  assertOfflineImageReferences,
  DEFAULT_LOCAL_IMAGE_LIMITS,
  imageMimeType,
  inlineLocalImages,
} from './localImages';
import type { SerializedExportArtifact } from './protocol';
import { MAX_RENDER_SOURCE_BYTES } from './renderPolicy';

interface CliOptions {
  browser?: string;
  input: string;
  json: boolean;
  output?: string;
  profile?: string;
  settings: ExportSettings;
}

interface RenderFile {
  relativeDirectory: string;
  uri: string;
}

interface CdpResponse {
  error?: { message?: string };
  id?: number;
  method?: string;
  params?: unknown;
  result?: Record<string, unknown>;
  sessionId?: string;
}

interface BrowserSession {
  close(): Promise<void>;
  render(request: {
    fileName: string;
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
  const options = await parseArguments(process.argv.slice(2));
  const inputPath = resolve(options.input);
  const inputStats = await stat(inputPath);
  const inputRoot = await realpath(inputStats.isDirectory() ? inputPath : dirname(inputPath));
  const files = inputStats.isDirectory()
    ? await collectMermaidFiles(inputPath)
    : [{ relativeDirectory: '', uri: inputPath }];
  if (files.length === 0) {
    throw new Error('No .mmd or .mermaid files were found.');
  }
  for (const file of files) {
    if (!/\.(?:mmd|mermaid)$/iu.test(file.uri)) {
      throw new Error(`Unsupported input file: ${file.uri}`);
    }
  }

  const output = options.output
    ? resolve(options.output)
    : files.length > 1
      ? join(inputPath, 'exports')
      : dirname(inputPath);
  const browser = await startBrowser(options.browser);
  const exported: Array<{ height: number; output: string; width: number }> = [];
  try {
    for (const file of files) {
      const source = await loadSourceWithImages(file.uri, inputRoot);
      const artifact = await browser.render({
        fileName: basename(file.uri),
        settings: options.settings,
        source,
        sourceUri: pathToFileURL(file.uri).toString(),
      });
      const target = outputPathFor(output, files.length, file, artifact.fileName);
      await mkdir(dirname(target), { recursive: true });
      await writeOutputFile(target, Buffer.from(artifact.dataBase64, 'base64'));
      exported.push({ height: artifact.height, output: target, width: artifact.width });
      if (!options.json) {
        console.log(`${target} (${artifact.width} × ${artifact.height})`);
      }
    }
  } finally {
    await browser.close();
  }
  if (options.json) {
    console.log(JSON.stringify({ exported }, undefined, 2));
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
  const settingsValue: Record<string, unknown> = { ...DEFAULT_EXPORT_SETTINGS };
  let input = '';
  let output: string | undefined;
  let browser: string | undefined;
  let profile: string | undefined;
  let json = false;

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
    switch (argument) {
      case '--output':
      case '-o': output = takeValue(); break;
      case '--format': settingsValue.format = takeValue(); break;
      case '--scale': settingsValue.scale = Number(takeValue()); break;
      case '--dpi': settingsValue.dpi = Number(takeValue()); break;
      case '--margin': settingsValue.margin = Number(takeValue()); break;
      case '--theme': settingsValue.theme = takeValue(); break;
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
      case '--profile': profile = takeValue(); break;
      case '--json': json = true; break;
      default: throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!input) {
    throw new Error(`An input file or folder is required.\n\n${usage()}`);
  }
  if (profile) {
    const profileValue = JSON.parse(await readFile(resolve(profile), 'utf8')) as unknown;
    Object.assign(settingsValue, isRecord(profileValue) && 'settings' in profileValue
      ? profileValue.settings
      : profileValue);
  }
  if (!EXPORT_FORMATS.some((format) => format === settingsValue.format)) {
    throw new Error(`Unsupported format: ${String(settingsValue.format)}`);
  }
  const settings = normalizeExportSettings(settingsValue);
  return { browser, input, json, output, profile, settings };
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
      '--remote-debugging-port=0',
      `--user-data-dir=${join(temporaryDirectory, 'profile')}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  try {
    const websocketUrl = await devtoolsWebsocketUrl(browserProcess);
    const client = await CdpClient.connect(websocketUrl);
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
    return {
      async close(): Promise<void> {
        client.close();
        await stopBrowser(browserProcess);
        await rm(temporaryDirectory, { force: true, recursive: true });
      },
      async render(request): Promise<SerializedExportArtifact> {
        const expression = `window.mermaidOfflineCli.render(${JSON.stringify(request)})`;
        const response = await client.send(
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
    await stopBrowser(browserProcess);
    await rm(temporaryDirectory, { force: true, recursive: true });
    throw error;
  }
}

class CdpClient {
  private nextId = 1;
  private readonly pending = new Map<number, {
    reject(error: Error): void;
    resolve(value: Record<string, unknown>): void;
  }>();
  private readonly waiters: Array<{
    method: string;
    resolve(): void;
    sessionId?: string;
  }> = [];

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => this.receive(String(event.data)));
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('Browser connection closed.'));
      this.pending.clear();
    });
  }

  public static async connect(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolvePromise, reject) => {
      socket.addEventListener('open', () => resolvePromise(), { once: true });
      socket.addEventListener('error', () => reject(new Error('Could not connect to Chromium.')), { once: true });
    });
    return new CdpClient(socket);
  }

  public close(): void {
    this.socket.close();
  }

  public send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { reject, resolve: resolvePromise });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  public waitFor(method: string, sessionId?: string): Promise<void> {
    return new Promise((resolvePromise) => {
      this.waiters.push({ method, resolve: resolvePromise, sessionId });
    });
  }

  private receive(rawMessage: string): void {
    const message = JSON.parse(rawMessage) as CdpResponse;
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? 'Browser protocol error.'));
      else pending.resolve(message.result ?? {});
      return;
    }
    if (!message.method) return;
    const index = this.waiters.findIndex(
      (waiter) => waiter.method === message.method && waiter.sessionId === message.sessionId,
    );
    if (index >= 0) this.waiters.splice(index, 1)[0]?.resolve();
  }
}

async function devtoolsWebsocketUrl(browser: ChildProcess): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Chromium did not expose a debugging endpoint.')), 15_000);
    browser.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      const match = /DevTools listening on (ws:\/\/[^\s]+)/u.exec(output);
      if (match?.[1]) {
        clearTimeout(timeout);
        resolvePromise(match[1]);
      }
    });
    browser.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chromium exited before rendering (code ${String(code)}).`));
    });
    browser.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
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
  const entries = await readdir(directory, { withFileTypes: true });
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

async function loadSourceWithImages(file: string, root: string): Promise<string> {
  const sourceMetadata = await stat(file);
  if (sourceMetadata.size > MAX_RENDER_SOURCE_BYTES) {
    throw new Error(
      `Source file exceeds the ${Math.round(MAX_RENDER_SOURCE_BYTES / (1024 * 1024))} MB ` +
      `render limit: ${file}`,
    );
  }
  const source = await readFile(file, 'utf8');
  assertOfflineImageReferences(source, { allowRelative: true });
  const inlined = await inlineLocalImages(source, async (referenceValue) => {
    const mimeType = imageMimeType(referenceValue);
    const relativePath = referenceValue.split(/[?#]/u, 1)[0];
    if (!mimeType || !relativePath) return undefined;
    try {
      const resource = await realpath(resolve(dirname(file), decodeURIComponent(relativePath)));
      if (!isPathInside(root, resource)) return undefined;
      const metadata = await stat(resource);
      if (!metadata.isFile() || metadata.size > DEFAULT_LOCAL_IMAGE_LIMITS.maxImageBytes) {
        return undefined;
      }
      return { bytes: await readFile(resource), mimeType };
    } catch {
      return undefined;
    }
  });
  assertOfflineImageReferences(inlined);
  return inlined;
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

async function writeOutputFile(target: string, bytes: Uint8Array): Promise<void> {
  try {
    const existing = await lstat(target);
    if (existing.isSymbolicLink()) {
      throw new Error(`Refusing to write an export through a symbolic link: ${target}`);
    }
    if (!existing.isFile()) {
      throw new Error(`The export destination is not a regular file: ${target}`);
    }
  } catch (error: unknown) {
    if (!isNodeError(error) || error.code !== 'ENOENT') throw error;
  }
  await writeFile(target, bytes);
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
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
      --margin <pixels>      Margin around the diagram
      --background <value>  transparent or a #rrggbb color
      --theme <theme>        default, dark, forest, neutral, base, adaptive
      --name-template <tpl>  File template using {name}, {format}, {theme}, …
      --profile <json>       Read export settings from a JSON profile
      --original-svg         Keep SVG output unchanged
      --no-optimize          Disable SVG optimization
      --metadata             Include source metadata and export time
      --no-metadata          Omit metadata, including from a loaded profile
      --browser <path>       Chrome, Chromium, or Edge executable
      --json                 Print a machine-readable result
  -h, --help                 Show this help
  -v, --version              Show the version`;
}
