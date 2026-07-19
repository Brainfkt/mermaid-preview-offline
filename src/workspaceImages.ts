import process from 'node:process';

import * as vscode from 'vscode';

import { imageMimeType, type LoadedLocalImage } from './localImages';
import { isUriWithin } from './workspacePaths';

export async function loadWorkspaceImage(
  documentUri: vscode.Uri,
  reference: string,
): Promise<LoadedLocalImage | undefined> {
  const mimeType = imageMimeType(reference);
  const relativePath = reference.split(/[?#]/u, 1)[0];
  if (!mimeType || !relativePath) return undefined;

  try {
    const segments = relativePath
      .replaceAll('\\', '/')
      .split('/')
      .map((segment) => decodeURIComponent(segment));
    const documentDirectory = vscode.Uri.joinPath(documentUri, '..');
    const resourceUri = vscode.Uri.joinPath(documentDirectory, ...segments);
    const workspaceRoot =
      vscode.workspace.getWorkspaceFolder(documentUri)?.uri ?? documentDirectory;
    if (!isUriWithin(workspaceRoot, resourceUri, process.platform !== 'win32')) {
      return undefined;
    }
    return {
      bytes: await vscode.workspace.fs.readFile(resourceUri),
      mimeType,
    };
  } catch {
    return undefined;
  }
}
