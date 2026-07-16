import { build } from 'esbuild';

const production = process.argv.includes('--production');

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
    sourcemap: production ? false : 'linked',
    target: ['chrome120'],
  }),
]);
