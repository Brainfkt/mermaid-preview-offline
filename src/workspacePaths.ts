export interface UriParts {
  authority: string;
  path: string;
  scheme: string;
}

export function isUriWithin(
  root: UriParts,
  candidate: UriParts,
  caseSensitive = true,
): boolean {
  if (root.scheme !== candidate.scheme || root.authority !== candidate.authority) {
    return false;
  }

  const normalize = (value: string): string => {
    const normalized = value.replace(/\/$/u, '');
    return caseSensitive ? normalized : normalized.toLowerCase();
  };
  const rootPath = normalize(root.path);
  const candidatePath = normalize(candidate.path);
  return candidatePath === rootPath || candidatePath.startsWith(`${rootPath}/`);
}

export function isFilePathWithin(
  root: string,
  candidate: string,
  caseSensitive = true,
): boolean {
  const normalize = (value: string): string => {
    const resolved = resolve(value);
    return caseSensitive ? resolved : resolved.toLowerCase();
  };
  const relativePath = relative(normalize(root), normalize(candidate));
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}
import { isAbsolute, relative, resolve } from 'node:path';
