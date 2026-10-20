import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/** Racine du monorepo : les serveurs de dev se lancent depuis là, pas depuis `e2e/`. */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** URL du playground vanilla (esbuild serve, voir `scripts/vanilla-playground.mjs`). */
const PLAYGROUND_URL = 'http://127.0.0.1:4300';

/** URL de la démo Angular (`ng serve demo`). */
const DEMO_URL = 'http://localhost:4200';

/**
 * Configuration Playwright des tests e2e. Deux projets Chromium, un par application :
 * `playground` (vanilla, sans framework) et `demo` (Angular). Les serveurs déjà lancés
 * sont réutilisés (`reuseExistingServer`), sinon Playwright les démarre lui-même.
 *
 * Lancer depuis la racine : `npx playwright test -c e2e/playwright.config.ts --project=playground`.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  outputDir: 'test-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
  },
  projects: [
    {
      name: 'playground',
      // `variables.spec.ts` (variables, bulles, menu `/`, sommaire) et `fidelity.spec.ts`
      // (import stylé, vue page, pagination, export gabarit) tournent aussi sur le playground.
      testMatch: /(playground|variables|fidelity)\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: PLAYGROUND_URL },
    },
    {
      name: 'demo',
      // `fidelity.spec.ts` contient aussi le scénario de la page « Modèle » de la démo.
      testMatch: /(demo|fidelity)\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: DEMO_URL },
    },
  ],
  webServer: [
    {
      command: 'node scripts/vanilla-playground.mjs',
      url: `${PLAYGROUND_URL}/`,
      cwd: REPO_ROOT,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npx ng serve demo --port 4200',
      url: `${DEMO_URL}/`,
      cwd: REPO_ROOT,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
