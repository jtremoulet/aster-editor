/**
 * Playground vanilla : bundle `scripts/vanilla-playground/main.ts` avec esbuild depuis les
 * sources des paquets (alias @aster-editor vers les dossiers src des paquets) et le sert sur
 * http://localhost:4300. Sert à vérifier core + ui + word dans un vrai navigateur sans Angular.
 *
 * Usage : `npm run playground`
 */
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const here = fileURLToPath(new URL('./vanilla-playground/', import.meta.url));

const ctx = await esbuild.context({
  entryPoints: [here + 'main.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  outdir: here + 'dist',
  logLevel: 'info',
  alias: {
    '@aster-editor/core': root + 'packages/core/src/index.ts',
    '@aster-editor/word': root + 'packages/word/src/index.ts',
    '@aster-editor/ui': root + 'packages/ui/src/index.ts',
  },
  loader: { '.css': 'css' },
});

await ctx.watch();
const { hosts, port } = await ctx.serve({ servedir: here, port: 4300 });
console.log(`Playground vanilla : http://${hosts[0] ?? 'localhost'}:${port}/`);
