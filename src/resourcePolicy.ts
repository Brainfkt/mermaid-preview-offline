const MEBIBYTE = 1024 * 1024;

export interface ImageInliningLimits {
  maxConcurrency: number;
  maxImageBytes: number;
  maxImages: number;
  maxTotalBytes: number;
}

export const DEFAULT_IMAGE_INLINING_LIMITS: Readonly<ImageInliningLimits> = Object.freeze({
  maxConcurrency: 4,
  maxImageBytes: 8 * MEBIBYTE,
  maxImages: 64,
  maxTotalBytes: 24 * MEBIBYTE,
});

export const DEFAULT_MAX_SOURCE_BYTES = 10 * MEBIBYTE;
export const DEFAULT_MAX_RASTER_PIXELS = 32_000_000;

export const HARD_RESOURCE_LIMITS = Object.freeze({
  maxImageBytes: 32 * MEBIBYTE,
  maxImages: 256,
  maxRasterPixels: 64_000_000,
  maxSourceBytes: 64 * MEBIBYTE,
  maxTotalBytes: 128 * MEBIBYTE,
});

export interface ResourceLimits extends ImageInliningLimits {
  maxRasterPixels: number;
  maxSourceBytes: number;
}

export const DEFAULT_RESOURCE_LIMITS: Readonly<ResourceLimits> = Object.freeze({
  ...DEFAULT_IMAGE_INLINING_LIMITS,
  maxRasterPixels: DEFAULT_MAX_RASTER_PIXELS,
  maxSourceBytes: DEFAULT_MAX_SOURCE_BYTES,
});

export interface ResourcePolicy {
  additionalLocalRoots: readonly string[];
  allowAdditionalLocalRoots: boolean;
  allowPrivateNetwork: boolean;
  allowRemoteImages: boolean;
  allowedRemoteBases: readonly string[];
  limits: ResourceLimits;
}

export interface ResourceLimitInput {
  maxImageBytes?: unknown;
  maxImages?: unknown;
  maxRasterPixels?: unknown;
  maxSourceBytes?: unknown;
  maxTotalBytes?: unknown;
  useCustom?: boolean;
}

export const DEFAULT_RESOURCE_POLICY: Readonly<ResourcePolicy> = Object.freeze({
  additionalLocalRoots: Object.freeze([]),
  allowAdditionalLocalRoots: false,
  allowPrivateNetwork: false,
  allowRemoteImages: false,
  allowedRemoteBases: Object.freeze([]),
  limits: DEFAULT_RESOURCE_LIMITS,
});

export function normalizeResourceLimits(input: ResourceLimitInput): ResourceLimits {
  if (!input.useCustom) return { ...DEFAULT_RESOURCE_LIMITS };

  const maxTotalBytes = boundedInteger(
    input.maxTotalBytes,
    DEFAULT_IMAGE_INLINING_LIMITS.maxTotalBytes,
    MEBIBYTE,
    HARD_RESOURCE_LIMITS.maxTotalBytes,
  );
  const maxImageBytes = Math.min(
    boundedInteger(
      input.maxImageBytes,
      DEFAULT_IMAGE_INLINING_LIMITS.maxImageBytes,
      MEBIBYTE,
      HARD_RESOURCE_LIMITS.maxImageBytes,
    ),
    maxTotalBytes,
  );

  return {
    maxConcurrency: DEFAULT_IMAGE_INLINING_LIMITS.maxConcurrency,
    maxImageBytes,
    maxImages: boundedInteger(
      input.maxImages,
      DEFAULT_IMAGE_INLINING_LIMITS.maxImages,
      1,
      HARD_RESOURCE_LIMITS.maxImages,
    ),
    maxRasterPixels: boundedInteger(
      input.maxRasterPixels,
      DEFAULT_MAX_RASTER_PIXELS,
      1_000_000,
      HARD_RESOURCE_LIMITS.maxRasterPixels,
    ),
    maxSourceBytes: boundedInteger(
      input.maxSourceBytes,
      DEFAULT_MAX_SOURCE_BYTES,
      MEBIBYTE,
      HARD_RESOURCE_LIMITS.maxSourceBytes,
    ),
    maxTotalBytes,
  };
}

export function normalizeStringList(value: unknown, maximumItems = 64): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean),
  )].slice(0, maximumItems);
}

export function normalizeRemoteBases(value: unknown): string[] {
  const bases: string[] = [];
  for (const candidate of normalizeStringList(value)) {
    try {
      const url = new URL(candidate);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        continue;
      }
      const path = normalizeBasePath(url.pathname);
      bases.push(`${url.origin}${path}`);
    } catch {
      // Invalid entries remain inert instead of broadening the policy.
    }
  }
  return [...new Set(bases)];
}

export function allowedRemoteImageUrl(
  reference: string,
  allowedBases: readonly string[],
): URL | undefined {
  let candidate: URL;
  try {
    candidate = new URL(reference);
  } catch {
    return undefined;
  }
  if (
    candidate.protocol !== 'https:' ||
    candidate.username ||
    candidate.password ||
    /%(?:2f|5c)/iu.test(candidate.pathname)
  ) {
    return undefined;
  }

  for (const baseValue of allowedBases) {
    let base: URL;
    try {
      base = new URL(baseValue);
    } catch {
      continue;
    }
    if (candidate.origin !== base.origin) continue;
    const basePath = normalizeBasePath(base.pathname);
    if (basePath === '/' || candidate.pathname.startsWith(basePath)) {
      candidate.hash = '';
      return candidate;
    }
  }
  return undefined;
}

function normalizeBasePath(path: string): string {
  const normalized = path.replace(/\/{2,}/gu, '/');
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(Math.round(value), minimum), maximum)
    : fallback;
}
