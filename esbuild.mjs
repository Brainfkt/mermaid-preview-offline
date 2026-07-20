import { build } from 'esbuild';
import { readFile, readdir, rm, stat } from 'node:fs/promises';

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
    loader: { '.woff2': 'dataurl' },
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
    target: 'node20',
  }),
]);

const browserJavaScriptBytes = await javascriptBytes('dist');
const browserBundleBudget = 20 * 1024 * 1024;
if (browserJavaScriptBytes > browserBundleBudget) {
  throw new Error(
    `Browser bundles use ${(browserJavaScriptBytes / 1024 / 1024).toFixed(2)} MiB, ` +
    `above the ${(browserBundleBudget / 1024 / 1024).toFixed(0)} MiB release budget.`,
  );
}
console.log(`Browser JavaScript budget: ${(browserJavaScriptBytes / 1024 / 1024).toFixed(2)} / 20 MiB`);

async function javascriptBytes(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      bytes += await javascriptBytes(path);
    } else if (entry.name.endsWith('.js') && !['cli.js', 'extension.js'].includes(entry.name)) {
      bytes += (await stat(path)).size;
    }
  }
  return bytes;
}
