import { inferDiagramCategory } from './diagramTemplates';

export const PERSONAL_TEMPLATE_SCHEMA_VERSION = 1;
export const MAX_TEMPLATE_SOURCE_BYTES = 1_000_000;
export const MAX_TEMPLATE_FILE_BYTES = 1_100_000;
export const MAX_SAVED_TEMPLATES = 100;
export const MAX_TEMPLATE_LIBRARY_BYTES = 10_000_000;

export interface PersonalTemplate {
  version: 1;
  id: string;
  title: string;
  description: string;
  category: string;
  fileName: string;
  source: string;
}

export interface SavedDiagramTemplate extends PersonalTemplate {
  key: string;
  origin: 'personal' | 'project';
  projectName?: string;
}

export type PersonalTemplateMessage =
  | { type: 'saveTemplate'; source: string; title: string; fileName: string }
  | { type: 'saveActiveTemplate' }
  | { type: 'setTemplateFavorite'; key: string; favorite: boolean }
  | { type: 'refreshTemplates' };

export function isPersonalTemplateMessage(value: unknown): value is PersonalTemplateMessage {
  if (!isRecord(value)) return false;
  if (value.type === 'saveActiveTemplate' || value.type === 'refreshTemplates') return true;
  if (value.type === 'setTemplateFavorite') {
    return validFavoriteKey(value.key) && typeof value.favorite === 'boolean';
  }
  return value.type === 'saveTemplate' &&
    isTemplateSource(value.source) &&
    isText(value.title, 120) && isTemplateFileName(value.fileName);
}

export function isTemplateSource(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 &&
    value.length <= MAX_TEMPLATE_SOURCE_BYTES &&
    new TextEncoder().encode(value).byteLength <= MAX_TEMPLATE_SOURCE_BYTES &&
    !value.includes('\0');
}

export function templateTitleError(value: string): string | undefined {
  return isText(value, 120) && value.trim().length > 0
    ? undefined : 'Enter a title of 1–120 characters without control characters.';
}

export function templateIdFromTitle(title: string): string {
  const id = title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 64).replace(/-+$/u, '');
  return id || 'diagram';
}

export function nextTemplateId(id: string, existing: ReadonlySet<string>): string {
  if (!existing.has(id)) return id;
  for (let suffix = 2; suffix <= MAX_SAVED_TEMPLATES + 1; suffix += 1) {
    const candidate = `${id.slice(0, 56)}-${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error('The template library is full.');
}

export function createPersonalTemplate(
  title: string,
  source: string,
  fileName: string,
): PersonalTemplate {
  if (templateTitleError(title)) throw new Error(templateTitleError(title));
  if (!isTemplateSource(source)) throw new Error('Template source must contain 1–1,000,000 UTF-8 bytes and no null characters.');
  assertPortableTemplateImages(source);
  if (!isTemplateFileName(fileName)) throw new Error('Use a Mermaid file name without directory separators.');
  return {
    version: PERSONAL_TEMPLATE_SCHEMA_VERSION,
    id: templateIdFromTitle(title),
    title: title.trim(),
    description: 'Saved Mermaid diagram. Edit its source to customize it.',
    category: inferDiagramCategory(source),
    fileName,
    source,
  };
}

export function parsePersonalTemplate(bytes: Uint8Array): PersonalTemplate {
  if (bytes.byteLength > MAX_TEMPLATE_FILE_BYTES) throw new Error('Template file exceeds 1.1 MB.');
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!isRecord(value) || value.version !== PERSONAL_TEMPLATE_SCHEMA_VERSION ||
      typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(value.id) ||
      !isText(value.title, 120) || !value.title.trim() ||
      !isText(value.category, 40) || !value.category.trim() ||
      !isText(value.description, 500) || !isTemplateFileName(value.fileName) ||
      !isTemplateSource(value.source)) {
    throw new Error('Invalid template: expected version 1, a safe id, title, category, description, Mermaid file name, and source.');
  }
  assertPortableTemplateImages(value.source);
  return {
    version: 1, id: value.id, title: value.title.trim(), category: value.category.trim(),
    description: value.description, fileName: value.fileName, source: value.source,
  };
}

export function assertPortableTemplateImages(source: string): void {
  // Saved templates have no source-document directory. Requiring embedded images
  // keeps gallery previews and files created in another project self-contained.
  const references = [
    ...Array.from(source.matchAll(/\bimg\s*:\s*(["'])([^"'\r\n]+)\1/gu), (match) => match[2]),
    ...Array.from(source.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/giu), (match) => match[2]),
    ...Array.from(source.matchAll(/<img\b[^>]*\bsrc\s*=\s*([^\s"'=<>`]+)/giu), (match) => match[1]),
  ];
  if (references.some((reference) => reference && !/^data:image\//iu.test(reference))) {
    throw new Error('Template images must be embedded as data:image URLs. Save the original diagram to embed supported local img: images, or embed/remove unresolved image references.');
  }
}

export function serializePersonalTemplate(template: PersonalTemplate): Uint8Array {
  const bytes = new TextEncoder().encode(`${JSON.stringify(template, null, 2)}\n`);
  parsePersonalTemplate(bytes);
  return bytes;
}

export function normalizeTemplateFavorites(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((key: unknown): key is string => validFavoriteKey(key)))].slice(0, 1_000)
    : [];
}

function validFavoriteKey(value: unknown): value is string {
  return isText(value, 2_048) && /^(?:template|example|personal|project):/u.test(value);
}

function isTemplateFileName(value: unknown): value is string {
  return isText(value, 200) && !/[\\/:*?"<>|]/u.test(value) &&
    !value.startsWith('.') && /\.(?:mmd|mermaid)$/iu.test(value);
}

function isText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum && !/\p{Cc}/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
