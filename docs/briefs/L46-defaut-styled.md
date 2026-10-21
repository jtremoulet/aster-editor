# Brief — Lot L46 : bascule du défaut `fidelity: 'styled'` et comparateur étendu (0.6.0)

> Session 4, vague 2 (après intégration de L41-L44 et de L45). Cible 1h30. Changement observable assumé : c'est la rupture annoncée de la 0.6.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION4.md`, `packages/word/src/docx/import-docx.ts` (`fidelity === 'styled'`), `docx/types.ts` (JSDoc de `fidelity`), `fixtures/docx/expected/` (01-10 = sortie **sémantique**, 11-19 = stylée), `import-docx.spec.ts`, `import-all-fixtures.spec.ts`, `import-docx.variables.spec.ts`, `packages/angular/src/lib/word.ts` (`importFidelity ?? 'styled'`), `scripts/vanilla-playground/main.ts`, `apps/demo` (sélecteur de fidélité), `packages/word/src/docx/compare/**` (comparateur), `docs/reviews/R30.md`.

## Lot

1. **Défaut `styled`** dans `importDocx` ; `fidelity: 'semantic'` conserve le chemin mammoth à l'identique. JSDoc et messages mis à jour.
2. **Re-baseline des tests** : les tests qui appelaient `importDocx(buffer)` sans option et attendaient la sortie mammoth passent `fidelity: 'semantic'` explicitement quand ils testent mammoth (les `expected/01-10.html` restent la référence du chemin sémantique, renommés `expected/semantic/01-10.html` avec mise à jour des chemins ; nouveaux `expected/01-10.html` = sortie stylée figée par `regen-expected.spec.ts` étendu à 01-19). Tests du chemin par défaut : fixtures 01-10 en stylé (texte identique au sémantique, variables identiques), idempotence stricte avec le core sur 01-10.
3. **Angular, démo, playground** : `importFidelity` par défaut inchangé (`styled`) mais plus de valeur forcée dans le composant quand la lib a le même défaut (simplification) ; sélecteur de la page Import toujours là.
4. **Comparateur** : `w:jc` de tableau et styles conditionnels (`tblLook` + `tblStylePr` résolus comme le lecteur) entrent dans la comparaison (`table.align`, `table.conditional`), tolérance documentée ; remesure des scores (gabarit et neuf) sur 11-19 et le document client, `fixtures/docx/README.md` et `compare-fixtures.spec.ts` (cibles et planchers) mis à jour.
5. **Changelog** (dans ton rapport, pas dans `CHANGELOG.md`) : texte de la section « Changed » 0.6.0 pour la bascule, avec la ligne de migration (`importDocx(file, { fidelity: 'semantic' })`).

## Périmètre

✅ `packages/word/src/**` (hors `writer/**` et `export/**` sauf lignes citées), `fixtures/docx/expected/**`, `fixtures/docx/README.md`, `packages/angular/src/lib/word.ts` (+ spec), `scripts/vanilla-playground/main.ts`, `apps/demo/src/app/pages/import.page.ts` (+ spec). ❌ `docs/`, `CHANGELOG.md`, `core`, `ui`.

## Vérification

`cd packages/word && npx vitest run` (jamais `-w`), `npx ng test aster-angular --watch=false`, `npx ng test demo --watch=false`, `npm run typecheck`, eslint, prettier ; `npm run e2e` (les e2e d'import lisent le chemin stylé depuis L32 : ils doivent rester verts) ; scores dans le rapport.

## Rapport attendu

`## Rapport Lot L46` : Fait / Non fait / Changements observables / Scores avant → après / Texte du changelog / Tests (compteurs) / Fichiers.
