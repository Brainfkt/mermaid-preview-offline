import {
  MAX_SAVED_TEMPLATES,
  MAX_TEMPLATE_LIBRARY_BYTES,
  parsePersonalTemplate,
  serializePersonalTemplate,
  type PersonalTemplate,
} from './personalTemplates';

export interface PersonalTemplateStorage {
  list(): Promise<string[]>;
  read(fileName: string): Promise<Uint8Array>;
  createExclusive(fileName: string, bytes: Uint8Array): Promise<void>;
}

export interface LoadedTemplateLibrary {
  templates: PersonalTemplate[];
  issues: string[];
  fileNames: string[];
  bytesRead: number;
}

export async function loadPersonalTemplateLibrary(storage: PersonalTemplateStorage): Promise<LoadedTemplateLibrary> {
  const fileNames = (await storage.list()).filter((name) => name.endsWith('.json')).sort();
  const result: LoadedTemplateLibrary = { templates: [], issues: [], fileNames, bytesRead: 0 };
  if (fileNames.length > MAX_SAVED_TEMPLATES) result.issues.push(`Only the first ${MAX_SAVED_TEMPLATES} templates are loaded.`);
  for (const name of fileNames.slice(0, MAX_SAVED_TEMPLATES)) {
    try {
      const bytes = await storage.read(name);
      result.bytesRead += bytes.byteLength;
      if (result.bytesRead > MAX_TEMPLATE_LIBRARY_BYTES) {
        result.issues.push('Template library exceeds the 10 MB loading limit.');
        break;
      }
      const template = parsePersonalTemplate(bytes);
      if (name !== `${template.id}.json`) throw new Error('File name must match the template id.');
      result.templates.push(template);
    } catch (error: unknown) {
      result.issues.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}

export async function savePersonalTemplate(
  storage: PersonalTemplateStorage,
  template: PersonalTemplate,
): Promise<void> {
  const bytes = serializePersonalTemplate(template);
  const library = await loadPersonalTemplateLibrary(storage);
  if (library.fileNames.length >= MAX_SAVED_TEMPLATES) throw new Error(`A library can contain at most ${MAX_SAVED_TEMPLATES} templates.`);
  if (library.bytesRead + bytes.byteLength > MAX_TEMPLATE_LIBRARY_BYTES) throw new Error('Template library exceeds the 10 MB limit.');
  if (library.fileNames.includes(`${template.id}.json`)) throw new Error('A template with this id already exists. Save a copy with another name.');
  await storage.createExclusive(`${template.id}.json`, bytes);
}
