// Publie les quatre paquets sur npm dans l'ordre des dépendances
// (core → word → ui → angular). Le paquet Angular se publie depuis sa sortie
// ng-packagr (`packages/angular/dist`), jamais depuis ses sources.
//
// Garde-fous avant toute publication :
// - une seule version pour la racine et les quatre paquets ;
// - les peer dependencies `@aster-editor/*` acceptent cette version ;
// - en CI, le tag git (`GITHUB_REF_NAME`) vaut `v<version>` ;
// - une version déjà sur le registre est sautée (reprise après échec partiel).
//
// Options : --dry-run (npm publish --dry-run), --skip-build, --provenance (CI, OIDC),
//           --tag <dist-tag> (défaut : latest), --allow-dirty.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLISH_DIRS = ['packages/core', 'packages/word', 'packages/ui', 'packages/angular/dist'];
const SOURCE_DIRS = ['packages/core', 'packages/word', 'packages/ui', 'packages/angular'];

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const tagIndex = args.indexOf('--tag');
const distTag = tagIndex >= 0 ? args[tagIndex + 1] : 'latest';
if (!distTag || distTag.startsWith('--')) {
  console.error('✖ --tag attend un dist-tag (ex. next).');
  process.exit(1);
}
const dryRun = has('--dry-run');

/** Lance une commande en héritant la sortie ; échoue bruyamment. */
function run(cmd, cwd = ROOT) {
  const result = spawnSync(cmd, { cwd, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`\n✖ Échec : ${cmd} (dans ${cwd})`);
    process.exit(result.status ?? 1);
  }
}

/** Capture la sortie d'une commande, chaîne vide en cas d'échec. */
function capture(cmd, cwd = ROOT) {
  const result = spawnSync(cmd, { cwd, encoding: 'utf8', shell: true });
  return result.status === 0 ? result.stdout.trim() : '';
}

function readPkg(dir) {
  return JSON.parse(readFileSync(`${ROOT}${dir}/package.json`, 'utf8'));
}

/** Vérifie qu'un intervalle `^x.y.z` accepte la version courante (pré-version comparée sur `x.y.z`). */
function caretAccepts(range, version) {
  const m = /^\^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(range);
  if (!m) return false;
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [vMajor, vMinor, vPatch] = version.split('-')[0].split('.').map(Number);
  if (vMajor !== major) return false;
  if (major > 0) return vMinor > minor || (vMinor === minor && vPatch >= patch);
  return vMinor === minor && vPatch >= patch;
}

// 1. Arbre git propre (sauf --allow-dirty) : on ne publie pas un état non commité.
if (!has('--allow-dirty') && capture('git status --porcelain') !== '') {
  console.error('✖ Arbre git non propre. Commite d’abord, ou passe --allow-dirty.');
  process.exit(1);
}

// 2. Version unique.
const version = readPkg('').version;
for (const dir of SOURCE_DIRS) {
  const pkg = readPkg(dir);
  if (pkg.version !== version) {
    console.error(
      `✖ ${pkg.name} est en ${pkg.version}, la racine en ${version}. Lance scripts/set-version.mjs.`,
    );
    process.exit(1);
  }
  for (const field of ['peerDependencies', 'dependencies']) {
    for (const [dep, range] of Object.entries(pkg[field] ?? {})) {
      if (dep.startsWith('@aster-editor/') && !caretAccepts(range, version)) {
        console.error(`✖ ${pkg.name} : ${field} ${dep}@${range} n'accepte pas ${version}.`);
        process.exit(1);
      }
    }
  }
}

// 3. En CI, une publication réelle exige le tag `v<version>` : un lancement manuel depuis une
// branche ne peut que simuler.
const refType = process.env.GITHUB_REF_TYPE;
const refName = process.env.GITHUB_REF_NAME;
if (refType === 'tag' && refName !== `v${version}`) {
  console.error(`✖ Tag ${refName} ≠ v${version}.`);
  process.exit(1);
}
if (process.env.GITHUB_ACTIONS === 'true' && refType !== 'tag' && !dryRun) {
  console.error('✖ En CI, la publication réelle ne se fait que depuis un tag v<version>.');
  process.exit(1);
}

// 4. Build (sauf --skip-build quand la CI vient de le faire).
if (!has('--skip-build')) run('npm run build');
for (const dir of PUBLISH_DIRS) {
  if (!existsSync(`${ROOT}${dir}/package.json`)) {
    console.error(`✖ ${dir}/package.json introuvable : build manquant ?`);
    process.exit(1);
  }
}

// 5. Publication dans l'ordre des dépendances, en sautant ce qui existe déjà.
const flags = ['--access public', `--tag ${distTag}`];
if (dryRun) flags.push('--dry-run');
if (has('--provenance')) flags.push('--provenance');

for (const dir of PUBLISH_DIRS) {
  const pkg = readPkg(dir);
  const published = capture(`npm view ${pkg.name}@${version} version`);
  if (published === version && !dryRun) {
    console.log(`• ${pkg.name}@${version} déjà publié, sauté.`);
    continue;
  }
  console.log(
    `\n→ ${dryRun ? 'Simulation' : 'Publication'} de ${pkg.name}@${version} depuis ${dir}`,
  );
  run(`npm publish ${flags.join(' ')}`, `${ROOT}${dir}`);
}

console.log(
  `\n✔ ${dryRun ? 'Simulation terminée' : `Version ${version} publiée`} (dist-tag ${distTag}).`,
);
