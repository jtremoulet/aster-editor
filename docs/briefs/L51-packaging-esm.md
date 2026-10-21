# Brief — Lot L51 : imports ESM avec extension `.js` et smoke en Node pur (retour POC n° 7)

> Session 5 (0.7.0). Cible 40 min. Mécanique, mais touche tous les fichiers source des trois paquets vanilla : **lance-toi en premier et rends vite**, d'autres lots éditent les mêmes fichiers en parallèle (lignes de code, pas les lignes d'import ; relance ta vérification en fin de lot).

## Constat

Les paquets publiés (`@aster-editor/core`, `word`, `ui` 0.6.0) exportent du ESM avec des imports relatifs sans extension (`from './api'`, `from './toolbar/create-toolbar'`) : Node les refuse (Vitest chez l'intégrateur a dû inliner les paquets via `server.deps.inline`). `tsc` émet les spécificateurs tels quels ; `moduleResolution: bundler` (`tsconfig.base.json`) les accepte en entrée. Le smoke install (`scripts/smoke-install.mjs`) passe par esbuild et ngc, qui tolèrent la forme : il n'a rien vu.

## Lot

1. **Codemod** `scripts/add-js-extensions.mjs` (Node 24, zéro dépendance) : pour chaque `.ts` de `packages/core/src`, `packages/word/src`, `packages/ui/src` (specs comprises, `packages/angular` exclu : ng-packagr bundle en FESM), réécrit les spécificateurs relatifs des `import`, `export … from`, `import type`, `import()` dynamiques : fichier → `./x.js`, dossier avec `index.ts` → `./x/index.js` ; ne touche pas aux spécificateurs de paquets ni aux `.css` / `.json`. Idempotent, `--check` rend 1 si un spécificateur manque d'extension (branché dans `npm run lint` via `package.json` : **ligne proposée dans le rapport, tu ne modifies pas `package.json`**, l'orchestrateur le fait).
2. Lancer le codemod, vérifier que `tsc`, Vitest (alias `vitest.shared.ts` vers les sources : vérifier que les alias résolvent toujours un `.js` vers le `.ts`, sinon adapter `vitest.shared.ts`) et le build passent, puis que `node --input-type=module -e "import('@aster-editor/core')"` fonctionne depuis une installation à blanc.
3. **Smoke Node pur** : `scripts/smoke-install.mjs` gagne une étape « import ESM en Node » : `node -e` qui importe chacun des quatre paquets (core, word, ui ; angular via son FESM si importable hors navigateur, sinon documente pourquoi non) et appelle un export (ex. `createEditor` ne peut pas tourner sans DOM : importer suffit, vérifier `typeof createEditor === 'function'`). Doit échouer sur la 0.6.0 publiée (prouve-le en installant `@aster-editor/core@0.6.0` dans un dossier jetable du scratchpad) et passer avec les tarballs locaux.
4. `docs/PUBLICATION.md` : une ligne dans la checklist de publication (hors périmètre `docs/` sinon : **seule cette ligne**).

## Périmètre

✅ `scripts/add-js-extensions.mjs`, `scripts/smoke-install.mjs`, `vitest.shared.ts` (si nécessaire), lignes d'import de `packages/{core,word,ui}/src/**`, `docs/PUBLICATION.md` (une ligne). ❌ toute autre ligne de code, `package.json`, `tsconfig*`, `angular`, `e2e`, `docs/` (hors la ligne citée).

## Vérification

`npm run typecheck`, `npm run build`, `npm run test -w packages/core -w packages/word -w packages/ui`, `npm run smoke:install` ; `node scripts/add-js-extensions.mjs --check` rend 0. Ne lance ni n'arrête aucun serveur (le playground 4300 et la démo 4200 tournent peut-être : ils se reconstruisent seuls).

## Rapport attendu

`## Rapport Lot L51` : Fait / Non fait / Nombre de spécificateurs réécrits par paquet / Preuve d'échec sur 0.6.0 et de succès local / Ligne `package.json` proposée / Fichiers.
