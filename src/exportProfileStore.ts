import {
  normalizeExportProfiles,
  normalizeExportSettings,
  type ExportProfile,
  type ExportSettings,
} from './exportSettings';

export class ExportProfileStore {
  private profilesValue: ExportProfile[] = [];

  public constructor(profiles: unknown = []) {
    this.replace(profiles);
  }

  public get profiles(): readonly ExportProfile[] {
    return this.profilesValue;
  }

  public delete(id: string): boolean {
    const next = this.profilesValue.filter((profile) => profile.id !== id);
    const deleted = next.length !== this.profilesValue.length;
    this.profilesValue = next;
    return deleted;
  }

  public find(id: string): ExportProfile | undefined {
    return this.profilesValue.find((profile) => profile.id === id);
  }

  public replace(profiles: unknown): void {
    this.profilesValue = normalizeExportProfiles(profiles);
  }

  public save(
    input: {
      id?: string;
      name?: string;
      settings: ExportSettings;
    },
    createId: () => string,
  ): ExportProfile {
    const id = input.id || createId();
    const profile: ExportProfile = {
      id,
      name: input.name?.trim() || `Export profile ${this.profilesValue.length + 1}`,
      settings: normalizeExportSettings(input.settings),
    };
    const index = this.profilesValue.findIndex((entry) => entry.id === id);
    const next = [...this.profilesValue];
    if (index >= 0) {
      next[index] = profile;
    } else {
      next.push(profile);
    }
    this.profilesValue = normalizeExportProfiles(next);
    return this.find(id) ?? profile;
  }
}
