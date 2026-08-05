import { Buffer } from 'node:buffer';
import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';

import type { LoadedLocalImage } from './localImages';
import { allowedRemoteImageUrl } from './resourcePolicy';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_IMAGE_DIMENSION = 16_384;

export interface RemoteImageRequest {
  allowPrivateNetwork: boolean;
  allowedBases: readonly string[];
  maxBytes: number;
  maxPixels: number;
  timeoutMs?: number;
}

export async function loadRemoteImage(
  reference: string,
  options: RemoteImageRequest,
): Promise<LoadedLocalImage | undefined> {
  const url = allowedRemoteImageUrl(reference, options.allowedBases);
  if (!url) return undefined;
  const bytes = await download(url, options, MAX_REDIRECTS);
  const inspected = inspectRasterImage(bytes);
  if (!inspected) {
    throw new Error(
      `Remote image ${url.toString()} is not a supported PNG, JPEG, GIF, WebP, BMP, or ICO file.`,
    );
  }
  if (
    inspected.width > MAX_IMAGE_DIMENSION ||
    inspected.height > MAX_IMAGE_DIMENSION ||
    inspected.width * inspected.height > options.maxPixels
  ) {
    throw new Error(
      `Remote image ${url.toString()} is ${inspected.width.toLocaleString()} × ` +
      `${inspected.height.toLocaleString()} pixels and exceeds the configured decode budget.`,
    );
  }
  return { bytes, mimeType: inspected.mimeType };
}

export function isPublicNetworkAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/gu, '');
  const family = isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family !== 6) return false;
  const bytes = ipv6Bytes(normalized);
  if (!bytes) return false;
  const [first = 0, second = 0, third = 0, fourth = 0] = bytes;
  if (bytes.every((value) => value === 0)) return false;
  if (bytes.slice(0, 15).every((value) => value === 0) && bytes[15] === 1) return false;
  if ((first & 0xfe) === 0xfc) return false;
  if (first === 0xfe && (second & 0xc0) === 0x80) return false;
  if (first === 0xff) return false;
  if (first === 0x20 && second === 0x01 && third === 0x0d && fourth === 0xb8) {
    return false;
  }
  const mappedPrefix = bytes.slice(0, 10).every((value) => value === 0) &&
    bytes[10] === 0xff && bytes[11] === 0xff;
  const compatiblePrefix = bytes.slice(0, 12).every((value) => value === 0);
  if (mappedPrefix || compatiblePrefix) {
    return isPublicIpv4(bytes.slice(12).join('.'));
  }
  return true;
}

interface InspectedImage {
  height: number;
  mimeType: string;
  width: number;
}

export function inspectRasterImage(bytes: Uint8Array): InspectedImage | undefined {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  )) {
    return dimensions('image/png', buffer.readUInt32BE(16), buffer.readUInt32BE(20));
  }
  if (
    buffer.length >= 10 &&
    (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
      buffer.subarray(0, 6).toString('ascii') === 'GIF89a')
  ) {
    return dimensions('image/gif', buffer.readUInt16LE(6), buffer.readUInt16LE(8));
  }
  if (buffer.length >= 30 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return inspectWebp(buffer);
  }
  if (buffer.length >= 26 && buffer.subarray(0, 2).toString('ascii') === 'BM') {
    return dimensions(
      'image/bmp',
      Math.abs(buffer.readInt32LE(18)),
      Math.abs(buffer.readInt32LE(22)),
    );
  }
  if (
    buffer.length >= 8 &&
    buffer.readUInt16LE(0) === 0 &&
    buffer.readUInt16LE(2) === 1 &&
    buffer.readUInt16LE(4) > 0
  ) {
    return dimensions('image/x-icon', buffer[6] || 256, buffer[7] || 256);
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return inspectJpeg(buffer);
  }
  return undefined;
}

async function download(
  url: URL,
  options: RemoteImageRequest,
  redirectsRemaining: number,
): Promise<Uint8Array> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const addresses = await lookupWithTimeout(stripIpv6Brackets(url.hostname), timeoutMs);
  if (addresses.length === 0) {
    throw new Error(`Remote image host could not be resolved: ${url.hostname}`);
  }
  if (!options.allowPrivateNetwork && addresses.some(({ address }) => !isPublicNetworkAddress(address))) {
    throw new Error(`Remote image host resolves to a private or local address: ${url.hostname}`);
  }
  const selected = addresses[0];
  if (!selected) throw new Error(`Remote image host could not be resolved: ${url.hostname}`);

  return new Promise<Uint8Array>((resolvePromise, rejectPromise) => {
    const requestValue = request({
      family: selected.family,
      headers: {
        Accept: 'image/png,image/jpeg,image/gif,image/webp,image/bmp,image/x-icon',
        'Accept-Encoding': 'identity',
        Host: url.host,
        'User-Agent': 'mermaid-preview-offline/1.3',
      },
      hostname: selected.address,
      method: 'GET',
      path: `${url.pathname}${url.search}`,
      port: url.port ? Number(url.port) : 443,
      servername: stripIpv6Brackets(url.hostname),
    }, (response) => {
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.resume();
        if (redirectsRemaining <= 0 || !response.headers.location) {
          rejectPromise(new Error(`Remote image redirect limit exceeded: ${url.toString()}`));
          return;
        }
        const redirected = allowedRemoteImageUrl(
          new URL(response.headers.location, url).toString(),
          options.allowedBases,
        );
        if (!redirected) {
          rejectPromise(new Error(`Remote image redirected outside the configured allowlist.`));
          return;
        }
        void download(redirected, options, redirectsRemaining - 1).then(
          resolvePromise,
          rejectPromise,
        );
        return;
      }
      if (status !== 200) {
        response.resume();
        rejectPromise(new Error(`Remote image request returned HTTP ${status}: ${url.toString()}`));
        return;
      }
      const contentLength = Number(response.headers['content-length']);
      if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
        response.resume();
        rejectPromise(new Error(`Remote image exceeds the configured per-image byte limit.`));
        return;
      }
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      response.on('data', (chunk: Buffer) => {
        totalBytes += chunk.byteLength;
        if (totalBytes > options.maxBytes) {
          response.destroy(new Error('Remote image exceeds the configured per-image byte limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.once('end', () => resolvePromise(Buffer.concat(chunks, totalBytes)));
      response.once('error', rejectPromise);
    });
    requestValue.setTimeout(timeoutMs, () => {
      requestValue.destroy(new Error(`Remote image request timed out: ${url.toString()}`));
    });
    requestValue.once('error', rejectPromise);
    requestValue.end();
  });
}

function inspectJpeg(buffer: Buffer): InspectedImage | undefined {
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1] ?? 0;
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) return undefined;
    if (offset + 2 > buffer.length) return undefined;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return undefined;
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]
        .includes(marker) &&
      length >= 7
    ) {
      return dimensions(
        'image/jpeg',
        buffer.readUInt16BE(offset + 5),
        buffer.readUInt16BE(offset + 3),
      );
    }
    offset += length;
  }
  return undefined;
}

function inspectWebp(buffer: Buffer): InspectedImage | undefined {
  const kind = buffer.subarray(12, 16).toString('ascii');
  if (kind === 'VP8X' && buffer.length >= 30) {
    return dimensions(
      'image/webp',
      1 + readUInt24LE(buffer, 24),
      1 + readUInt24LE(buffer, 27),
    );
  }
  if (kind === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
    const first = buffer[21] ?? 0;
    const second = buffer[22] ?? 0;
    const third = buffer[23] ?? 0;
    const fourth = buffer[24] ?? 0;
    return dimensions(
      'image/webp',
      1 + first + ((second & 0x3f) << 8),
      1 + (second >> 6) + (third << 2) + ((fourth & 0x0f) << 10),
    );
  }
  if (
    kind === 'VP8 ' &&
    buffer.length >= 30 &&
    buffer[23] === 0x9d &&
    buffer[24] === 0x01 &&
    buffer[25] === 0x2a
  ) {
    return dimensions(
      'image/webp',
      buffer.readUInt16LE(26) & 0x3fff,
      buffer.readUInt16LE(28) & 0x3fff,
    );
  }
  return undefined;
}

function dimensions(mimeType: string, width: number, height: number): InspectedImage | undefined {
  return width > 0 && height > 0 ? { height, mimeType, width } : undefined;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  const [a = -1, b = -1, c = -1] = octets;
  if (octets.length !== 4 || octets.some((value) => value < 0 || value > 255)) return false;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

async function lookupWithTimeout(
  hostname: string,
  timeoutMs: number,
): Promise<LookupAddress[]> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_resolvePromise, rejectPromise) => {
        timer = setTimeout(() => {
          rejectPromise(new Error(`Remote image DNS lookup timed out: ${hostname}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function ipv6Bytes(address: string): number[] | undefined {
  const withoutZone = address.split('%', 1)[0] ?? address;
  const halves = withoutZone.split('::');
  if (halves.length > 2) return undefined;
  const parseHalf = (value: string): number[] | undefined => {
    if (!value) return [];
    const words: number[] = [];
    for (const part of value.split(':')) {
      if (part.includes('.')) {
        const octets = part.split('.').map(Number);
        if (
          octets.length !== 4 ||
          octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
        ) {
          return undefined;
        }
        const [first = 0, second = 0, third = 0, fourth = 0] = octets;
        words.push((first << 8) | second, (third << 8) | fourth);
        continue;
      }
      if (!/^[\da-f]{1,4}$/u.test(part)) return undefined;
      words.push(Number.parseInt(part, 16));
    }
    return words;
  };
  const left = parseHalf(halves[0] ?? '');
  const right = parseHalf(halves[1] ?? '');
  if (!left || !right) return undefined;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    return undefined;
  }
  const words = [...left, ...Array.from({ length: missing }, () => 0), ...right];
  return words.flatMap((word) => [word >> 8, word & 0xff]);
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  return (buffer[offset] ?? 0) + ((buffer[offset + 1] ?? 0) << 8) +
    ((buffer[offset + 2] ?? 0) << 16);
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/gu, '');
}
