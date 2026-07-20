import process from 'node:process';
import { realpath } from 'node:fs/promises';

import * as vscode from 'vscode';

import {
  DEFAULT_LOCAL_IMAGE_LIMITS,
  imageMimeType,
  type LoadedLocalImage,
} from './localImages';
import { isFilePathWithin, isUriWithin } from './workspacePaths';

interface CachedWorkspaceImage {
  image: LoadedLocalImage;
  modified: number;
  size: number;
}

const workspaceImageCache = new Map<string, CachedWorkspaceImage>();
let workspaceImageCacheBytes = 0;

export async function loadWorkspaceImage(
  documentUri: vscode.Uri,
  reference: string,
): Promise<LoadedLocalImage | undefined> {
  const mimeType = imageMimeType(reference);
  const relativePath = reference.split(/[?#]/u, 1)[0];
  if (!mimeType || !relativePath) return undefined;

  let resourceUri: vscode.Uri;
  try {
    const segments = relativePath
      .replaceAll('\\', '/')
      .split('/')
      .map((segment) => decodeURIComponent(segment));
    const documentDirectory = vscode.Uri.joinPath(documentUri, '..');
    resourceUri = vscode.Uri.joinPath(documentDirectory, ...segments);
    const workspaceRoot =
      vscode.workspace.getWorkspaceFolder(documentUri)?.uri ?? documentDirectory;
    if (!isUriWithin(workspaceRoot, resourceUri, process.platform !== 'win32')) {
      return undefined;
    }

    if (workspaceRoot.scheme === 'file' && resourceUri.scheme === 'file') {
      const [canonicalRoot, canonicalResource] = await Promise.all([
        realpath(workspaceRoot.fsPath),
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
  if (metadata.size > DEFAULT_LOCAL_IMAGE_LIMITS.maxImageBytes) {
    throw new Error(
      `Local image ${reference} exceeds the ` +
      `${Math.ceil(DEFAULT_LOCAL_IMAGE_LIMITS.maxImageBytes / (1024 * 1024))} MB limit.`,
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
  if (bytes.byteLength > DEFAULT_LOCAL_IMAGE_LIMITS.maxImageBytes) {
    throw new Error(
      `Local image ${reference} exceeds the ` +
      `${Math.ceil(DEFAULT_LOCAL_IMAGE_LIMITS.maxImageBytes / (1024 * 1024))} MB limit.`,
    );
  }
  const image = { bytes, mimeType };
  cacheWorkspaceImage(key, { image, modified: metadata.mtime, size: metadata.size });
  return image;
}

function cacheWorkspaceImage(key: string, entry: CachedWorkspaceImage): void {
  const existing = workspaceImageCache.get(key);
  if (existing) workspaceImageCacheBytes -= existing.image.bytes.byteLength;
  workspaceImageCache.delete(key);
  workspaceImageCache.set(key, entry);
  workspaceImageCacheBytes += entry.image.bytes.byteLength;

  while (workspaceImageCacheBytes > DEFAULT_LOCAL_IMAGE_LIMITS.maxTotalBytes) {
    const oldest = workspaceImageCache.entries().next().value;
    if (!oldest) break;
    workspaceImageCache.delete(oldest[0]);
    workspaceImageCacheBytes -= oldest[1].image.bytes.byteLength;
  }
}
