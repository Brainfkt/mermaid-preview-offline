import { Buffer } from 'node:buffer';

export interface LoadedLocalImage {
  bytes: Uint8Array;
  mimeType: string;
}

export type LocalImageLoader = (
  reference: string,
) => Promise<LoadedLocalImage | undefined>;

const IMAGE_REFERENCE = /(\bimg\s*:\s*)(["'])([^"'\r\n]+)\2/gu;
const URI_SCHEME = /^[a-z][a-z\d+.-]*:/iu;

export async function inlineLocalImages(
  source: string,
  loadImage: LocalImageLoader,
): Promise<string> {
  let cursor = 0;
  let result = '';

  for (const match of source.matchAll(IMAGE_REFERENCE)) {
    const index = match.index;
    const fullMatch = match[0];
    const prefix = match[1];
    const quote = match[2];
    const reference = match[3];
    if (
      index === undefined ||
      prefix === undefined ||
      quote === undefined ||
      reference === undefined
    ) {
      continue;
    }

    result += source.slice(cursor, index);
    let replacement = fullMatch;
    if (isRelativeLocalImage(reference)) {
      const image = await loadImage(reference);
      if (image) {
        const base64 = Buffer.from(image.bytes).toString('base64');
        replacement = `${prefix}${quote}data:${image.mimeType};base64,${base64}${quote}`;
      }
    }
    result += replacement;
    cursor = index + fullMatch.length;
  }

  return cursor === 0 ? source : result + source.slice(cursor);
}

export function isRelativeLocalImage(reference: string): boolean {
  return (
    reference.length > 0 &&
    !reference.startsWith('/') &&
    !reference.startsWith('\\') &&
    !reference.startsWith('//') &&
    !URI_SCHEME.test(reference)
  );
}

export function imageMimeType(reference: string): string | undefined {
  const path = reference.split(/[?#]/u, 1)[0]?.toLowerCase();
  if (!path) {
    return undefined;
  }

  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.gif')) return 'image/gif';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.avif')) return 'image/avif';
  if (path.endsWith('.bmp')) return 'image/bmp';
  if (path.endsWith('.ico')) return 'image/x-icon';
  return undefined;
}
