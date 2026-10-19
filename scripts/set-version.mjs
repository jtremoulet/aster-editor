// Fixe la version SemVer unique du monorepo : racine, quatre paquets, et les
// peer dependencies `@aster-editor/*` (réécrites en `^<version>`), pour que
// les paquets publiés exigent toujours la même génération que la leur.
//
// Usage : node scripts/set-version.mjs 0.5.0
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACKAGES = ['core', 'word', 'ui', 'angular'];
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const version = process.argv[2];
if (!version || !SEMVER.test(version)) {
  console.error('Usage : node scripts/set-version.mjs <x.y.z>');
  process.exit(1);
}

/** Lit et réécrit un package.json en conservant l'indentation à deux espaces. */
function patch(path, mutate) {
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  mutate(pkg);
  writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
}

patch(`${ROOT}package.json`, (pkg) => {
  pkg.version = version;
});

for (const name of PACKAGES) {
  patch(`${ROOT}packages/${name}/package.json`, (pkg) => {
    pkg.version = version;
    for (const field of ['peerDependencies', 'dependencies']) {
      const deps = pkg[field];
      if (!deps) continue;
      for (const dep of Object.keys(deps)) {
        if (dep.startsWith('@aster-editor/')) deps[dep] = `^${version}`;
      }
    }
  });
}

console.log(`Version ${version} appliquée à la racine et à ${PACKAGES.length} paquets.`);
