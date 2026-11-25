// Tests visuels (captures de référence) dans l'image Docker officielle de Playwright.
//
// Une capture dépend des polices et du moteur de rendu : celles d'un poste Windows ou
// macOS ne correspondent jamais à celles de la CI Linux. Les références sont donc produites
// et comparées **uniquement** dans l'image `mcr.microsoft.com/playwright:v<version>-noble`,
// la même que le job `visual` de la CI : le résultat est identique sur tous les postes.
//
// Usage :
//   node scripts/visual-tests.mjs            compare aux références de e2e/__screenshots__/
//   node scripts/visual-tests.mjs --update   régénère les références (à relire puis commiter)
//   node scripts/visual-tests.mjs -g "motif" ne joue que les tests dont le titre correspond
//
// Le dépôt est monté en lecture dans le conteneur puis copié (sans node_modules : les
// binaires natifs de Windows n'y tourneraient pas), les dépendances installées par `npm ci`
// avec un cache npm conservé dans le volume `aster-visual-npm`.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const { version } = require('@playwright/test/package.json');
const IMAGE = `mcr.microsoft.com/playwright:v${version}-noble`;

const args = process.argv.slice(2);
const update = args.includes('--update');
const passthrough = args.filter((arg) => arg !== '--update');
// Chaque argument est passé tel quel à Playwright, protégé pour le shell du conteneur.
const quoted = passthrough.map((arg) => `'${arg.replace(/'/g, `'\\''`)}'`).join(' ');

const inner = [
  'set -e',
  'mkdir -p /work',
  // Sources seules : ni dépendances, ni sorties de build, ni rapports précédents.
  'tar -C /repo --exclude=./node_modules --exclude="./packages/*/node_modules"' +
    ' --exclude="./apps/*/node_modules" --exclude=dist --exclude=./.git --exclude=./.angular' +
    ' --exclude=./e2e/test-results --exclude=./e2e/playwright-report --exclude=./e2e/output' +
    ' -cf - . | tar -xf - -C /work',
  'cd /work',
  'npm ci --no-audit --no-fund --prefer-offline >/tmp/npm-ci.log 2>&1 || { cat /tmp/npm-ci.log; exit 1; }',
  'status=0',
  `npx playwright test -c e2e/playwright.config.ts --project=visual ${update ? '--update-snapshots ' : ''}${quoted} || status=$?`,
  // Références régénérées : rapportées dans le dépôt. Écarts : images de diff rapportées aussi.
  update
    ? 'mkdir -p /repo/e2e/__screenshots__ && cp -r /work/e2e/__screenshots__/. /repo/e2e/__screenshots__/'
    : 'if [ "$status" != 0 ] && [ -d /work/e2e/test-results ]; then rm -rf /repo/e2e/test-results/visual && mkdir -p /repo/e2e/test-results/visual && cp -r /work/e2e/test-results/. /repo/e2e/test-results/visual/; fi',
  'exit $status',
].join('\n');

const probe = spawnSync('docker', ['info'], { stdio: 'ignore' });
if (probe.error || probe.status !== 0) {
  console.error(
    '✖ Docker ne répond pas. Les tests visuels ne tournent que dans l’image Playwright :\n' +
      '  lance Docker Desktop, ou laisse le job « visual » de la CI les jouer.',
  );
  process.exit(1);
}

console.log(`Tests visuels dans ${IMAGE}${update ? ' (régénération des références)' : ''}…`);
const run = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--ipc=host',
    '-v',
    `${ROOT}:/repo`,
    '-v',
    'aster-visual-npm:/root/.npm',
    '-e',
    'ASTER_E2E_VISUAL=1',
    '-e',
    'ASTER_E2E_FIREFOX=0',
    '-e',
    'CI=1',
    IMAGE,
    'bash',
    '-c',
    inner,
  ],
  { stdio: 'inherit' },
);
if (run.status !== 0 && !update) {
  console.error(
    '\n✖ Écart visuel ou échec. Images de diff : e2e/test-results/visual/.\n' +
      '  Changement voulu ? `npm run e2e:visual:update`, relis les captures, commite-les.',
  );
}
process.exit(run.status ?? 1);
