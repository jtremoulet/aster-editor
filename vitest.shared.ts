import { fileURLToPath } from 'node:url';
import type { ViteUserConfig } from 'vitest/config';

/**
 * Alias partagés par tous les paquets : les imports `@aster-editor/*` pointent
 * vers les sources, pas vers `dist/`, pour tester sans build préalable.
 */
export const asterAliases: Record<string, string> = {
  '@aster-editor/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
  '@aster-editor/word': fileURLToPath(new URL('./packages/word/src/index.ts', import.meta.url)),
  '@aster-editor/ui': fileURLToPath(new URL('./packages/ui/src/index.ts', import.meta.url)),
};

/** Chemin absolu du dossier `fixtures/` racine, exposé aux tests via `import.meta.env`. */
export const fixturesDir = fileURLToPath(new URL('./fixtures/', import.meta.url));

/**
 * Config Vitest commune. `lines` est le seuil de couverture bloquant du paquet.
 */
export function asterVitestConfig(
  lines: number,
  environment: 'jsdom' | 'node' = 'jsdom',
): ViteUserConfig {
  return {
    resolve: { alias: asterAliases },
    define: { 'import.meta.env.ASTER_FIXTURES': JSON.stringify(fixturesDir) },
    test: {
      environment,
      include: ['src/**/*.spec.ts'],
      passWithNoTests: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        exclude: ['src/**/*.spec.ts', 'src/**/index.ts', 'src/api/**'],
        thresholds: { lines },
        reporter: ['text', 'html'],
      },
    },
  };
}
