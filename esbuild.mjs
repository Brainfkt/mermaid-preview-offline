import { build } from 'esbuild';
import { readFile, rm } from 'node:fs/promises';

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

await rm('dist/chunks', { force: true, recursive: true });

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
    entryPoints: {
      'cli-renderer': 'src/cliRenderer.ts',
      'documentation-webview': 'src/documentationWebview.ts',
      'project-webview': 'src/projectWebview.ts',
      webview: 'src/webview.ts',
    },
    bundle: true,
    chunkNames: 'chunks/[name]-[hash]',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    entryNames: '[name]',
    format: 'esm',
    logLevel: 'info',
    minify: true,
    outdir: 'dist',
    platform: 'browser',
    plugins: [offlineZenUmlStyles],
    sourcemap: production ? false : 'linked',
    splitting: true,
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
