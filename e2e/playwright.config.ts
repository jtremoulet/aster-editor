import { defineConfig, devices, firefox } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Racine du monorepo : les serveurs de dev se lancent depuis là, pas depuis `e2e/`. */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** URL du playground vanilla (esbuild serve, voir `scripts/vanilla-playground.mjs`). */
const PLAYGROUND_URL = 'http://127.0.0.1:4300';

/** URL de la démo Angular (`ng serve demo`). */
const DEMO_URL = 'http://localhost:4200';

/**
 * Specs multi-navigateurs (session 4) : fidélité Word et sections seulement, les specs de
 * base restent sur Chromium (durée).
 */
const CROSS_BROWSER_SPECS = /(fidelity|sections)\.spec\.ts$/;

/**
 * Variable d'environnement qui force (`1`) ou retire (`0`) le projet Firefox. Sans elle,
 * le navigateur est sondé une fois (`firefox --version`) : un binaire Playwright présent
 * mais qui ne démarre pas (erreur SxS Windows `mozglue` sur une installation incomplète,
 * `spawn UNKNOWN`) ferait échouer tous ses tests au lancement, pas dans les specs. Le
 * résultat de la sonde est transmis aux workers par l'environnement.
 */
const FIREFOX_ENV = 'ASTER_E2E_FIREFOX';

/** Vrai si le Firefox de Playwright se lance sur cette machine (sondé une fois par run). */
function firefoxAvailable(): boolean {
  const forced = process.env[FIREFOX_ENV];
  if (forced === '0' || forced === '1') {
    return forced === '1';
  }
  const probe = spawnSync(firefox.executablePath(), ['--version'], { timeout: 15_000 });
  const available = probe.error === undefined && probe.status === 0;
  if (!available) {
    const reason = probe.error ? `${probe.error.message}` : `code de sortie ${probe.status}`;
    console.warn(
      `[e2e] Firefox de Playwright indisponible, projet playground-firefox retiré : ${reason}`,
    );
  }
  process.env[FIREFOX_ENV] = available ? '1' : '0';
  return available;
}

/**
 * Configuration Playwright des tests e2e. Deux projets Chromium, un par application :
 * `playground` (vanilla, sans framework) et `demo` (Angular), plus `playground-firefox` et
 * `playground-webkit` (session 4) qui rejouent les specs de fidélité et de sections sur le
 * playground. Les serveurs déjà lancés sont réutilisés (`reuseExistingServer`), sinon
 * Playwright les démarre lui-même.
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
      // `variables.spec.ts` (variables, bulles, menu `/`, sommaire), `fidelity.spec.ts`
      // (import stylé, vue page, pagination, export gabarit) et `sections.spec.ts`
      // (sections, tabulations) tournent aussi sur le playground.
      testMatch: /(playground|variables|fidelity|sections)\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: PLAYGROUND_URL },
    },
    ...(firefoxAvailable()
      ? [
          {
            name: 'playground-firefox',
            testMatch: CROSS_BROWSER_SPECS,
            use: { ...devices['Desktop Firefox'], baseURL: PLAYGROUND_URL },
          },
        ]
      : []),
    {
      name: 'playground-webkit',
      testMatch: CROSS_BROWSER_SPECS,
      use: { ...devices['Desktop Safari'], baseURL: PLAYGROUND_URL },
    },
    {
      name: 'demo',
      // `fidelity.spec.ts` et `sections.spec.ts` contiennent aussi un scénario de la page
      // « Modèle » de la démo.
      testMatch: /(demo|fidelity|sections)\.spec\.ts$/,
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
