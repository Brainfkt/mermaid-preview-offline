import mermaid from 'mermaid';

import { installOfflineFont } from './offlineFont';

let iconPacksRegistered = false;
let zenUmlRegistration: Promise<void> | undefined;

/** Register offline icon packs without loading their multi-megabyte payloads up front. */
export function registerOfflineIconPacks(): void {
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
  ]);
}

/** Load external renderers only when their syntax is actually used. */
export async function prepareMermaidExtensions(source: string): Promise<void> {
  registerOfflineIconPacks();
  await installOfflineFont();
  if (!/^\s*zenuml\b/imu.test(source)) {
    return;
  }
  zenUmlRegistration ??= import('@mermaid-js/mermaid-zenuml').then(async ({ default: zenUml }) => {
    await mermaid.registerExternalDiagrams([zenUml]);
  });
  await zenUmlRegistration;
}
