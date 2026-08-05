import * as vscode from 'vscode';

import {
  normalizeRemoteBases,
  normalizeResourceLimits,
  normalizeStringList,
  type ResourcePolicy,
} from './resourcePolicy';

const MEBIBYTE = 1024 * 1024;

export function readResourcePolicy(resource?: vscode.Uri): ResourcePolicy {
  const resources = vscode.workspace.getConfiguration('mermaidPreviewOffline.resources', resource);
  const limits = vscode.workspace.getConfiguration('mermaidPreviewOffline.resourceLimits', resource);
  const trusted = vscode.workspace.isTrusted;

  return {
    additionalLocalRoots: normalizeStringList(resources.get('additionalLocalRoots')),
    allowAdditionalLocalRoots: trusted && resources.get<boolean>(
      'allowAdditionalLocalRoots',
      false,
    ),
    allowPrivateNetwork: trusted && resources.get<boolean>('allowPrivateNetwork', false),
    allowRemoteImages: trusted && resources.get<boolean>('allowRemoteImages', false),
    allowedRemoteBases: normalizeRemoteBases(resources.get('allowedRemoteBases')),
    limits: normalizeResourceLimits({
      maxImageBytes: mebibytes(limits.get('maxImageMiB')),
      maxImages: limits.get('maxImages'),
      maxRasterPixels: megapixels(limits.get('maxRasterMegapixels')),
      maxSourceBytes: mebibytes(limits.get('maxSourceMiB')),
      maxTotalBytes: mebibytes(limits.get('maxTotalImageMiB')),
      useCustom: trusted && limits.get<boolean>('useCustom', false),
    }),
  };
}

function mebibytes(value: unknown): unknown {
  return typeof value === 'number' && Number.isFinite(value)
    ? value * MEBIBYTE
    : value;
}

function megapixels(value: unknown): unknown {
  return typeof value === 'number' && Number.isFinite(value)
    ? value * 1_000_000
    : value;
}
