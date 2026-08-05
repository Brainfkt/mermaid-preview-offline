import process from 'node:process';
import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import * as vscode from 'vscode';

import {
  imageMimeType,
  inlineImageReferences,
  isRelativeLocalImage,
  type LoadedLocalImage,
} from './localImages';
import { loadRemoteImage } from './remoteImages';
import {
  allowedRemoteImageUrl,
  DEFAULT_RESOURCE_POLICY,
  type ResourcePolicy,
} from './resourcePolicy';
import { isFilePathWithin, isUriWithin } from './workspacePaths';

interface CachedWorkspaceImage {
  image: LoadedLocalImage;
  modified: number;
  size: number;
}

const workspaceImageCache = new Map<string, CachedWorkspaceImage>();
let workspaceImageCacheBytes = 0;
const remoteImageCache = new Map<string, { expiresAt: number; image: LoadedLocalImage }>();
let remoteImageCacheBytes = 0;
const REMOTE_IMAGE_CACHE_TTL_MS = 5 * 60_000;

export async function inlineWorkspaceImages(
  source: string,
  documentUri: vscode.Uri,
  policy: ResourcePolicy = DEFAULT_RESOURCE_POLICY,
): Promise<string> {
  return inlineImageReferences(
    source,
    (reference) => loadWorkspaceImage(documentUri, reference, policy),
    (reference) => shouldResolveImageReference(reference, policy),
    policy.limits,
  );
}

export async function loadWorkspaceImage(
  documentUri: vscode.Uri,
  reference: string,
  policy: ResourcePolicy = DEFAULT_RESOURCE_POLICY,
): Promise<LoadedLocalImage | undefined> {
  trimWorkspaceImageCache(policy.limits.maxTotalBytes);
  trimRemoteImageCache(policy.limits.maxTotalBytes);
  const remoteUrl = policy.allowRemoteImages
    ? allowedRemoteImageUrl(reference, policy.allowedRemoteBases)
    : undefined;
  if (remoteUrl) {
    return loadCachedRemoteImage(remoteUrl, policy);
  }

  const mimeType = imageMimeType(reference);
  const relativePath = reference.split(/[?#]/u, 1)[0];
  if (!mimeType || !relativePath) return undefined;

  let resourceUri: vscode.Uri;
  let containingRoot: vscode.Uri | undefined;
  try {
    const documentDirectory = vscode.Uri.joinPath(documentUri, '..');
    const workspaceRoot =
      vscode.workspace.getWorkspaceFolder(documentUri)?.uri ?? documentDirectory;
    resourceUri = imageResourceUri(documentUri, documentDirectory, relativePath);
    const roots = [
      workspaceRoot,
      ...policy.allowAdditionalLocalRoots
        ? policy.additionalLocalRoots
            .map((root) => configuredRootUri(root, documentUri))
            .filter((root): root is vscode.Uri => root !== undefined)
        : [],
    ];
    containingRoot = roots.find((root) =>
      isUriWithin(root, resourceUri, process.platform !== 'win32'),
    );
    if (!containingRoot) return undefined;

    if (containingRoot.scheme === 'file' && resourceUri.scheme === 'file') {
      const [canonicalRoot, canonicalResource] = await Promise.all([
        realpath(containingRoot.fsPath),
        realpath(resourceUri.fsPath),
      ]);
      if (!isFilePathWithin(canonicalRoot, canonicalResource, process.platform !== 'win32')) {
        return undefined;
      }
      resourceUri = vscode.Uri.file(canonicalResource);
    }
  } catch {
    return undefined;
  }

  let metadata: vscode.FileStat;
  try {
    metadata = await vscode.workspace.fs.stat(resourceUri);
  } catch {
    return undefined;
  }
  if (metadata.size > policy.limits.maxImageBytes) {
    throw new Error(
      `Local image ${reference} exceeds the ` +
      `${Math.ceil(policy.limits.maxImageBytes / (1024 * 1024))} MB limit.`,
    );
  }

  const key = resourceUri.toString();
  const cached = workspaceImageCache.get(key);
  if (cached && cached.modified === metadata.mtime && cached.size === metadata.size) {
    workspaceImageCache.delete(key);
    workspaceImageCache.set(key, cached);
    return cached.image;
  }

  const bytes = await vscode.workspace.fs.readFile(resourceUri);
  if (bytes.byteLength > policy.limits.maxImageBytes) {
    throw new Error(
      `Local image ${reference} exceeds the ` +
      `${Math.ceil(policy.limits.maxImageBytes / (1024 * 1024))} MB limit.`,
    );
  }
  const image = { bytes, mimeType };
  cacheWorkspaceImage(
    key,
    { image, modified: metadata.mtime, size: metadata.size },
    policy.limits.maxTotalBytes,
  );
  return image;
}

function cacheWorkspaceImage(
  key: string,
  entry: CachedWorkspaceImage,
  maximumBytes: number,
): void {
  const existing = workspaceImageCache.get(key);
  if (existing) workspaceImageCacheBytes -= existing.image.bytes.byteLength;
  workspaceImageCache.delete(key);
  workspaceImageCache.set(key, entry);
  workspaceImageCacheBytes += entry.image.bytes.byteLength;

  trimWorkspaceImageCache(maximumBytes);
}

function trimWorkspaceImageCache(maximumBytes: number): void {
  while (workspaceImageCacheBytes > maximumBytes) {
    const oldest = workspaceImageCache.entries().next().value;
    if (!oldest) break;
    workspaceImageCache.delete(oldest[0]);
    workspaceImageCacheBytes -= oldest[1].image.bytes.byteLength;
  }
}

function shouldResolveImageReference(reference: string, policy: ResourcePolicy): boolean {
  if (isRelativeLocalImage(reference)) return true;
  if (policy.allowRemoteImages && allowedRemoteImageUrl(reference, policy.allowedRemoteBases)) {
    return true;
  }
  return policy.allowAdditionalLocalRoots && isAbsoluteLocalReference(reference);
}

function isAbsoluteLocalReference(reference: string): boolean {
  const path = reference.split(/[?#]/u, 1)[0] ?? '';
  return path.startsWith('file:') || (!path.startsWith('//') && isAbsolute(path));
}

function imageResourceUri(
  documentUri: vscode.Uri,
  documentDirectory: vscode.Uri,
  path: string,
): vscode.Uri {
  if (path.startsWith('file:')) return vscode.Uri.parse(path, true);
  if (isAbsolute(path)) {
    const decoded = decodeURIComponent(path.replaceAll('\\', '/'));
    return documentUri.scheme === 'file'
      ? vscode.Uri.file(decoded)
      : documentUri.with({ fragment: '', path: decoded, query: '' });
  }
  const segments = path
    .replaceAll('\\', '/')
    .split('/')
    .map((segment) => decodeURIComponent(segment));
  return vscode.Uri.joinPath(documentDirectory, ...segments);
}

function configuredRootUri(value: string, documentUri: vscode.Uri): vscode.Uri | undefined {
  try {
    let root: vscode.Uri;
    if (/^[a-z][a-z\d+.-]*:\/\//iu.test(value) || value.startsWith('file:')) {
      root = vscode.Uri.parse(value, true);
    } else {
      if (!isAbsolute(value)) return undefined;
      const path = value.replaceAll('\\', '/');
      root = documentUri.scheme === 'file'
        ? vscode.Uri.file(path)
        : documentUri.with({ fragment: '', path, query: '' });
    }
    return isBroadFilesystemRoot(root.path) ? undefined : root;
  } catch {
    return undefined;
  }
}

function isBroadFilesystemRoot(path: string): boolean {
  return path === '/' || /^\/[a-z]:\/?$/iu.test(path);
}

async function loadCachedRemoteImage(
  url: URL,
  policy: ResourcePolicy,
): Promise<LoadedLocalImage> {
  const key = url.toString();
  const cached = remoteImageCache.get(key);
  if (
    cached &&
    cached.expiresAt > Date.now() &&
    cached.image.bytes.byteLength <= policy.limits.maxImageBytes
  ) {
    remoteImageCache.delete(key);
    remoteImageCache.set(key, cached);
    return cached.image;
  }
  if (cached) removeRemoteCacheEntry(key, cached);

  const image = await loadRemoteImage(key, {
    allowPrivateNetwork: policy.allowPrivateNetwork,
    allowedBases: policy.allowedRemoteBases,
    maxBytes: policy.limits.maxImageBytes,
    maxPixels: policy.limits.maxRasterPixels,
  });
  if (!image) throw new Error(`Remote image is outside the configured allowlist: ${key}`);
  const entry = { expiresAt: Date.now() + REMOTE_IMAGE_CACHE_TTL_MS, image };
  remoteImageCache.set(key, entry);
  remoteImageCacheBytes += image.bytes.byteLength;
  trimRemoteImageCache(policy.limits.maxTotalBytes);
  return image;
}

function trimRemoteImageCache(maximumBytes: number): void {
  while (remoteImageCacheBytes > maximumBytes) {
    const oldest = remoteImageCache.entries().next().value;
    if (!oldest) break;
    removeRemoteCacheEntry(oldest[0], oldest[1]);
  }
}

function removeRemoteCacheEntry(
  key: string,
  entry: { expiresAt: number; image: LoadedLocalImage },
): void {
  remoteImageCache.delete(key);
  remoteImageCacheBytes -= entry.image.bytes.byteLength;
}
