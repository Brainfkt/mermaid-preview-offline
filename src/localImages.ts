import { Buffer } from 'node:buffer';

export interface LoadedLocalImage {
  bytes: Uint8Array;
  mimeType: string;
}

export type LocalImageLoader = (
  reference: string,
) => Promise<LoadedLocalImage | undefined>;

export interface LocalImageInliningLimits {
  maxConcurrency: number;
  maxImageBytes: number;
  maxImages: number;
  maxTotalBytes: number;
}

export const DEFAULT_LOCAL_IMAGE_LIMITS: Readonly<LocalImageInliningLimits> = {
  maxConcurrency: 4,
  maxImageBytes: 8 * 1024 * 1024,
  maxImages: 64,
  maxTotalBytes: 24 * 1024 * 1024,
};

const IMAGE_REFERENCE = /(\bimg\s*:\s*)(["'])([^"'\r\n]+)\2/gu;
const URI_SCHEME = /^[a-z][a-z\d+.-]*:/iu;
const EMBEDDED_IMAGE = /^data:image\/[a-z\d.+-]+(?:;[a-z\d.+-]+=[^,;\s]+)*(?:;base64,[a-z\d+/=\s]+|,[^\s]*)$/iu;

export async function inlineLocalImages(
  source: string,
  loadImage: LocalImageLoader,
  limits: LocalImageInliningLimits = DEFAULT_LOCAL_IMAGE_LIMITS,
): Promise<string> {
  const matches = [...source.matchAll(IMAGE_REFERENCE)];
  const references = [
    ...new Set(
      matches
        .map((match) => match[3])
        .filter((reference): reference is string =>
          reference !== undefined && isRelativeLocalImage(reference),
        ),
    ),
  ];
  if (references.length > limits.maxImages) {
    throw new Error(
      `This diagram references ${references.length.toLocaleString()} local images; ` +
      `the offline preview limit is ${limits.maxImages.toLocaleString()}.`,
    );
  }

  const loaded = new Array<readonly [string, LoadedLocalImage | undefined]>(references.length);
  let nextReference = 0;
  let totalBytes = 0;
  const worker = async (): Promise<void> => {
    while (nextReference < references.length) {
      const index = nextReference;
      nextReference += 1;
      const reference = references[index];
      if (!reference) continue;
      const image = await loadImage(reference);
      if (image && image.bytes.byteLength > limits.maxImageBytes) {
        throw new Error(
          `Local image ${reference} is ${formatLimit(image.bytes.byteLength)}; ` +
          `the per-image limit is ${formatLimit(limits.maxImageBytes)}.`,
        );
      }
      if (image) {
        totalBytes += image.bytes.byteLength;
        if (totalBytes > limits.maxTotalBytes) {
          throw new Error(
            `Local images exceed the ${formatLimit(limits.maxTotalBytes)} aggregate preview limit.`,
          );
        }
      }
      loaded[index] = [reference, image] as const;
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(references.length, Math.max(1, limits.maxConcurrency)) },
      () => worker(),
    ),
  );
  const loadedImages = new Map(loaded);
  let cursor = 0;
  let result = '';

  for (const match of matches) {
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
      const image = loadedImages.get(reference);
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

export function assertOfflineImageReferences(
  source: string,
  options: { allowRelative?: boolean } = {},
): void {
  for (const match of source.matchAll(IMAGE_REFERENCE)) {
    const reference = match[3];
    if (!reference || EMBEDDED_IMAGE.test(reference)) continue;
    if (options.allowRelative && isRelativeLocalImage(reference)) continue;
    throw new Error(
      isRelativeLocalImage(reference)
        ? `Local image could not be embedded for offline export: ${reference}`
        : `External image references are disabled in offline export: ${reference}`,
    );
  }
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

function formatLimit(byteLength: number): string {
  return `${Math.ceil(byteLength / (1024 * 1024)).toLocaleString()} MB`;
}
