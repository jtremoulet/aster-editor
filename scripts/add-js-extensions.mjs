// Codemod : ajoute l'extension `.js` aux spécificateurs relatifs des paquets vanilla.
//
// Pourquoi : `tsc` émet les spécificateurs tels quels et Node (ESM strict) refuse
// `from './api'` ou `from './toolbar/create-toolbar'` sans extension. Les sources
// doivent donc écrire `./api/index.js` et `./toolbar/create-toolbar.js` ; tsc
// (`moduleResolution: bundler`), Vite/Vitest et esbuild savent tous remonter d'un
// `.js` inexistant vers le `.ts` source. `packages/angular` est exclu : ng-packagr
// bundle en FESM et ne laisse aucun spécificateur relatif dans la sortie.
//
// Réécrit les `import … from`, `export … from`, `import type … from`, les imports
// d'effet (`import './x'`) et les `import('./x')` dynamiques. Ignore les paquets nus,
// les `.css` / `.json` et tout spécificateur déjà muni d'une extension. Idempotent.
//
// Usage : node scripts/add-js-extensions.mjs [--check] [--verbose] [dossier…]
//   --check    ne modifie rien, liste les spécificateurs sans extension, rend 1 s'il y en a
//   --verbose  liste chaque réécriture (ou, avec --check, chaque manque)
//   dossier…   dossiers à traiter (défaut : packages/{core,word,ui}/src)
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_DIRS = ['packages/core/src', 'packages/word/src', 'packages/ui/src'];

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const VERBOSE = args.includes('--verbose');
const dirs = args.filter((a) => !a.startsWith('--'));
const targets = (dirs.length ? dirs : DEFAULT_DIRS).map((d) => resolve(ROOT, d));

/** Extensions qu'on laisse telles quelles : déjà résolubles par Node ou hors JS. */
const KNOWN_EXTENSIONS = /\.(?:[cm]?js|[cm]?ts|css|json|scss|svg|html|txt|docx|xml)$/;

/**
 * Spécificateur relatif, dans l'ordre : `from '…'` (import / export / import type),
 * `import('…')` dynamique, `import '…'` d'effet en début de ligne.
 * Groupe 1 : préfixe conservé, 2 : guillemet, 3 : spécificateur.
 */
const SPECIFIER_RE =
  /(\bfrom\s*|\bimport\s*\(\s*|^[ \t]*import\s+)(['"])(\.\.?(?:\/[^'"\n]*)?)\2/gm;

/** Parcours récursif : tous les `.ts` du dossier (specs comprises), hors `node_modules`. */
function listTsFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) listTsFiles(path, out);
    else if (entry.name.endsWith('.ts')) out.push(path);
  }
  return out;
}

function isFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

/**
 * Calcule le spécificateur corrigé, ou `null` s'il n'y a rien à faire.
 * Fichier `./x.ts` → `./x.js` ; dossier avec `index.ts` → `./x/index.js`.
 * Rend `{ unresolved: true }` quand rien ne correspond sur le disque (laissé à tsc).
 */
function fix(file, spec) {
  if (KNOWN_EXTENSIONS.test(spec)) {
    // Déjà suffixé : on vérifie seulement qu'un `.js` pointe bien vers un `.ts`.
    if (/\.js$/.test(spec)) {
      const ts = resolve(dirname(file), spec.replace(/\.js$/, '.ts'));
      if (!isFile(ts)) return { unresolved: true };
    }
    return null;
  }
  const bare = spec.replace(/\/+$/, '');
  const abs = resolve(dirname(file), bare);
  if (isFile(`${abs}.ts`)) return { next: `${bare}.js` };
  if (isFile(join(abs, 'index.ts'))) return { next: `${bare}/index.js` };
  return { unresolved: true };
}

function lineOf(content, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (content.charCodeAt(i) === 10) line++;
  return line;
}

function label(file) {
  return relative(ROOT, file).split(sep).join('/');
}

/** Nom de paquet (`packages/<nom>/…`) ou dossier cible, pour le décompte. */
function bucketOf(file) {
  const rel = label(file);
  const match = /^packages\/([^/]+)\//.exec(rel);
  return match ? match[1] : rel.split('/')[0];
}

const counts = new Map();
const missing = [];
const unresolved = [];
let filesChanged = 0;

for (const dir of targets) {
  if (!existsSync(dir)) {
    console.error(`✖ Dossier introuvable : ${label(dir)}`);
    process.exit(2);
  }
  for (const file of listTsFiles(dir)) {
    const content = readFileSync(file, 'utf8');
    let changed = false;
    const next = content.replace(SPECIFIER_RE, (whole, prefix, quote, spec, offset) => {
      const result = fix(file, spec);
      if (!result) return whole;
      const where = `${label(file)}:${lineOf(content, offset)}`;
      if (result.unresolved) {
        unresolved.push(`${where}  '${spec}'`);
        return whole;
      }
      const bucket = bucketOf(file);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
      missing.push(`${where}  '${spec}' → '${result.next}'`);
      changed = true;
      return `${prefix}${quote}${result.next}${quote}`;
    });
    if (changed && !CHECK) {
      writeFileSync(file, next);
      filesChanged++;
    }
  }
}

if (VERBOSE) for (const line of missing) console.log(`  ${line}`);
for (const line of unresolved)
  console.warn(`  ⚠ non résolu sur le disque (laissé tel quel) : ${line}`);

const summary = [...counts.entries()].map(([pkg, n]) => `${pkg}: ${n}`).join(', ');
if (CHECK) {
  if (missing.length) {
    if (!VERBOSE) for (const line of missing) console.log(`  ${line}`);
    console.error(
      `✖ ${missing.length} spécificateur(s) relatif(s) sans extension .js (${summary}). ` +
        'Corrige avec : node scripts/add-js-extensions.mjs',
    );
    process.exit(1);
  }
  console.log('✔ tous les spécificateurs relatifs portent une extension .js');
} else {
  console.log(
    missing.length
      ? `✔ ${missing.length} spécificateur(s) réécrit(s) dans ${filesChanged} fichier(s) (${summary})`
      : '✔ rien à réécrire',
  );
}
