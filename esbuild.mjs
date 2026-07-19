import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const production = process.argv.includes('--production');
const zenUmlRemoteFontFace =
  '@font-face{font-family:MS Sans Serif;src:url(/fonts/MS%20Sans%20Serif.ttf) format("truetype")}';
const offlineZenUmlStyles = {
  name: 'offline-zenuml-styles',
  setup(buildContext) {
    buildContext.onLoad(
      { filter: /[/\\]@zenuml[/\\]core[/\\]dist[/\\]zenuml\.esm\.mjs$/ },
      async (args) => ({
        contents: (await readFile(args.path, 'utf8')).replace(zenUmlRemoteFontFace, ''),
        loader: 'js',
      }),
    );
  },
};

await Promise.all([
  build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    external: ['vscode'],
    format: 'cjs',
    logLevel: 'info',
    minify: production,
    outfile: 'dist/extension.js',
    platform: 'node',
    sourcemap: production ? false : 'linked',
    target: 'node20',
  }),
  build({
    entryPoints: ['src/webview.ts'],
    bundle: true,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    format: 'iife',
    logLevel: 'info',
    minify: true,
    outfile: 'dist/webview.js',
    platform: 'browser',
    plugins: [offlineZenUmlStyles],
    sourcemap: production ? false : 'linked',
    target: ['chrome120'],
  }),
  build({
    entryPoints: ['src/projectWebview.ts'],
    bundle: true,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    format: 'iife',
    logLevel: 'info',
    minify: true,
    outfile: 'dist/project-webview.js',
    platform: 'browser',
    plugins: [offlineZenUmlStyles],
    sourcemap: production ? false : 'linked',
    target: ['chrome120'],
  }),
  build({
    entryPoints: ['src/cliRenderer.ts'],
    bundle: true,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    format: 'iife',
    logLevel: 'info',
    minify: true,
    outfile: 'dist/cli-renderer.js',
    platform: 'browser',
    plugins: [offlineZenUmlStyles],
    sourcemap: false,
    target: ['chrome120'],
  }),
  build({
    entryPoints: ['src/cli.ts'],
    bundle: true,
    format: 'cjs',
    logLevel: 'info',
    minify: production,
    outfile: 'dist/cli.js',
    platform: 'node',
    sourcemap: production ? false : 'linked',
    target: 'node22',
  }),
]);
