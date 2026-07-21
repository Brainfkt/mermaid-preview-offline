import mermaid from 'mermaid';
import tidyTreeLayouts from '@mermaid-js/layout-tidy-tree';

import type { DiagramFontFamily } from './diagramFont';
import { installDiagramFont } from './diagramFontAssets';

let iconPacksRegistered = false;
let layoutLoadersRegistered = false;
let zenUmlRegistration: Promise<void> | undefined;

/** Register offline icon packs without loading their multi-megabyte payloads up front. */
export function registerOfflineIconPacks(): void {
  registerOfflineLayoutLoaders();
  if (iconPacksRegistered) {
    return;
  }
  iconPacksRegistered = true;
  mermaid.registerIconPacks([
    {
      loader: async () => (await import('@iconify-json/logos')).icons,
      name: 'logos',
    },
    {
      loader: async () => (await import('@iconify-json/material-icon-theme')).icons,
      name: 'material-icon-theme',
    },
    {
      loader: async () => (await import('@iconify-json/mdi')).icons,
      name: 'mdi',
    },
  ]);
}

export function registerOfflineLayoutLoaders(): void {
  if (layoutLoadersRegistered) return;
  layoutLoadersRegistered = true;
  mermaid.registerLayoutLoaders(tidyTreeLayouts);
}

/** Load external renderers only when their syntax is actually used. */
export async function prepareMermaidExtensions(
  source: string,
  fontFamily: DiagramFontFamily,
): Promise<void> {
  registerOfflineIconPacks();
  await installDiagramFont(fontFamily);
  if (!/^\s*zenuml\b/imu.test(source)) {
    return;
  }
  zenUmlRegistration ??= import('@mermaid-js/mermaid-zenuml').then(async ({ default: zenUml }) => {
    await mermaid.registerExternalDiagrams([zenUml]);
  });
  await zenUmlRegistration;
}
