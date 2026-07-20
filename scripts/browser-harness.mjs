import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export async function runBrowserHarness({
  chrome,
  compiledRoot,
  harnessPath,
  label,
  resultElementId,
  timeoutMilliseconds = 120_000,
  windowSize = '800,600',
}) {
  const { CdpClient, withTimeout } = await import(
    pathToFileURL(join(compiledRoot, 'cdpClient.js')).href
  );
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'mermaid-visual-regression-'));
  const browser = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      '--remote-debugging-pipe',
      `--user-data-dir=${join(temporaryDirectory, 'profile')}`,
      `--window-size=${windowSize}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
  );
  browser.stderr?.resume();
  let client;
  try {
    client = CdpClient.connect(browser);
    return await withTimeout(
      readHarnessResult(client, harnessPath, resultElementId, windowSize),
      timeoutMilliseconds,
      `${label} timed out after ${Math.round(timeoutMilliseconds / 1_000)} seconds.`,
    );
  } finally {
    client?.close();
    await stopBrowser(browser);
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

async function readHarnessResult(client, harnessPath, resultElementId, windowSize) {
  const target = await client.send('Target.createTarget', { url: 'about:blank' });
  const targetId = stringProperty(target, 'targetId');
  const attached = await client.send('Target.attachToTarget', { flatten: true, targetId });
  const sessionId = stringProperty(attached, 'sessionId');
  await client.send('Page.enable', {}, sessionId);
  await client.send('Runtime.enable', {}, sessionId);
  const [width, height] = viewportDimensions(windowSize);
  await client.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height,
    mobile: false,
    width,
  }, sessionId);
  await client.send('Network.enable', {}, sessionId);
  await client.send('Network.setBlockedURLs', {
    urls: ['http://*', 'https://*', 'ftp://*', 'ws://*', 'wss://*'],
  }, sessionId);
  const loaded = client.waitFor('Page.loadEventFired', sessionId);
  await client.send('Page.navigate', { url: pathToFileURL(harnessPath).href }, sessionId);
  await loaded;

  const result = await client.send(
    'Runtime.evaluate',
    {
      awaitPromise: true,
      expression: `new Promise((resolve) => {
        const poll = () => {
          const output = document.getElementById(${JSON.stringify(resultElementId)});
          if (output) resolve(output.textContent);
          else setTimeout(poll, 20);
        };
        poll();
      })`,
      returnByValue: true,
    },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(`${resultElementId} evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  }
  const remoteObject = result.result;
  const value = isRecord(remoteObject) ? remoteObject.value : undefined;
  if (typeof value !== 'string' || !value) {
    throw new Error(`The ${resultElementId} harness did not produce results.`);
  }
  return JSON.parse(value);
}

async function stopBrowser(browser) {
  if (browser.exitCode !== null) return;
  const exited = new Promise((resolvePromise) => browser.once('exit', resolvePromise));
  browser.kill('SIGTERM');
  await Promise.race([exited, delay(2_000)]);
  if (browser.exitCode === null) {
    browser.kill('SIGKILL');
    await Promise.race([exited, delay(2_000)]);
  }
}

function stringProperty(value, key) {
  const property = value[key];
  if (typeof property !== 'string') throw new Error(`Chromium did not return ${key}.`);
  return property;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function viewportDimensions(windowSize) {
  const dimensions = windowSize.split(',').map(Number);
  const [width, height] = dimensions;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid browser harness window size: ${windowSize}`);
  }
  return [width, height];
}
