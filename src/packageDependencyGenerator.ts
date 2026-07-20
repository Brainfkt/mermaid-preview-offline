export const PACKAGE_DEPENDENCY_GROUPS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

export type PackageDependencyGroup = typeof PACKAGE_DEPENDENCY_GROUPS[number];

export interface PackageDependency {
  group: PackageDependencyGroup;
  name: string;
  version: string;
}

export interface PackageDependencyManifest {
  dependencies: PackageDependency[];
  name: string;
  version?: string;
}

const GROUP_STYLES: Record<PackageDependencyGroup, { color: string; nodeClass: string }> = {
  dependencies: { color: '#2da44e', nodeClass: 'runtime' },
  devDependencies: { color: '#8250df', nodeClass: 'development' },
  peerDependencies: { color: '#0969da', nodeClass: 'peer' },
  optionalDependencies: { color: '#bf8700', nodeClass: 'optional' },
};

export class PackageManifestParseError extends Error {
  public override readonly name = 'PackageManifestParseError';
}

export function parsePackageDependencyManifest(source: string): PackageDependencyManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PackageManifestParseError(`Invalid package.json JSON: ${message}`);
  }
  if (!isRecord(parsed)) {
    throw new PackageManifestParseError('package.json must contain a JSON object at its root.');
  }

  const nameValue = parsed.name;
  const versionValue = parsed.version;
  if (nameValue !== undefined && (typeof nameValue !== 'string' || !nameValue.trim())) {
    throw new PackageManifestParseError('package.json field "name" must be a non-empty string.');
  }
  if (versionValue !== undefined && typeof versionValue !== 'string') {
    throw new PackageManifestParseError('package.json field "version" must be a string.');
  }

  const dependencies: PackageDependency[] = [];
  for (const group of PACKAGE_DEPENDENCY_GROUPS) {
    const value = parsed[group];
    if (value === undefined) continue;
    if (!isRecord(value)) {
      throw new PackageManifestParseError(`package.json field "${group}" must be an object.`);
    }
    for (const dependencyName of Object.keys(value).sort(compareText)) {
      const dependencyVersion = value[dependencyName];
      if (typeof dependencyVersion !== 'string' || !dependencyVersion.trim()) {
        throw new PackageManifestParseError(
          `Dependency ${dependencyName} in ${group} must have a non-empty string version.`,
        );
      }
      dependencies.push({ group, name: dependencyName, version: dependencyVersion });
    }
  }

  return {
    dependencies,
    name: typeof nameValue === 'string' ? nameValue : 'package',
    version: typeof versionValue === 'string' && versionValue ? versionValue : undefined,
  };
}

export function generatePackageDependencyGraph(source: string): string {
  const manifest = parsePackageDependencyManifest(source);
  const dependencyNames = [...new Set(manifest.dependencies.map((dependency) => dependency.name))]
    .sort(compareText);
  const ids = deterministicDependencyIds(dependencyNames);
  const primaryGroup = new Map<string, PackageDependencyGroup>();
  for (const dependency of manifest.dependencies) {
    if (!primaryGroup.has(dependency.name)) primaryGroup.set(dependency.name, dependency.group);
  }

  const rootLabel = manifest.version ? `${manifest.name}@${manifest.version}` : manifest.name;
  const lines = [
    'flowchart LR',
    `  package_root["${mermaidLabel(rootLabel)}"]`,
  ];
  for (const dependencyName of dependencyNames) {
    const id = ids.get(dependencyName);
    if (!id) continue;
    lines.push(`  ${id}["${mermaidLabel(dependencyName)}"]`);
  }
  lines.push('');

  const edgeStyles: string[] = [];
  for (const dependency of manifest.dependencies) {
    const id = ids.get(dependency.name);
    if (!id) continue;
    lines.push(
      `  package_root -->|"${dependency.group} · ${mermaidLabel(dependency.version)}"| ${id}`,
    );
    edgeStyles.push(GROUP_STYLES[dependency.group].color);
  }

  lines.push(
    '',
    '  classDef root fill:#ff3670,stroke:#b42352,color:#ffffff,stroke-width:2px',
    '  classDef runtime fill:#dafbe1,stroke:#2da44e,color:#1a1f24',
    '  classDef development fill:#f0e7ff,stroke:#8250df,color:#1a1f24',
    '  classDef peer fill:#ddf4ff,stroke:#0969da,color:#1a1f24',
    '  classDef optional fill:#fff8c5,stroke:#bf8700,color:#1a1f24',
    '  class package_root root',
  );
  for (const dependencyName of dependencyNames) {
    const id = ids.get(dependencyName);
    const group = primaryGroup.get(dependencyName);
    if (id && group) lines.push(`  class ${id} ${GROUP_STYLES[group].nodeClass}`);
  }
  edgeStyles.forEach((color, index) => {
    lines.push(`  linkStyle ${index} stroke:${color},stroke-width:2px`);
  });
  return `${lines.join('\n')}\n`;
}

function deterministicDependencyIds(names: string[]): Map<string, string> {
  const result = new Map<string, string>();
  const used = new Set<string>();
  for (const name of names) {
    const slug = name
      .normalize('NFKD')
      .replace(/\p{Mark}/gu, '')
      .replace(/[^A-Za-z0-9_]+/gu, '_')
      .replace(/^_+|_+$/gu, '')
      .slice(0, 48) || 'package';
    const base = `dep_${slug}_${stableHash(name)}`;
    let id = base;
    let suffix = 2;
    while (used.has(id)) {
      id = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(id);
    result.set(name, id);
  }
  return result;
}

function mermaidLabel(value: string): string {
  return value
    .replace(/[\r\n]+/gu, ' ')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
