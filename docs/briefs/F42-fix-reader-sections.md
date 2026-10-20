# Brief — Lot F42 : correctifs de la revue R42 (lecteur sections, tabulations, bordures)

> Session 4. Cible 45 min. Lancé **après L45a** (fusion `units.ts` / `units-blocks.ts`, découpages) : pars du code tel qu'il est sur `develop`. Lis `CLAUDE.md`, `docs/reviews/R42.md` (preuves à reproduire **en tests**, spec jetable du relecteur dans `C:\Users\Joris\AppData\Local\Temp\claude\C--workspace\6da28716-9c97-4474-a9ce-9218f14ae4a9\scratchpad\r42-proof.spec.ts`), `docs/briefs/L42-reader-sections.md`, `packages/core/src/api/layout.ts`.

## Lot

Corriger R42-01 à R42-07, chaque correctif accompagné d'un test qui reproduit la preuve du relecteur (spec existante du module touché) :

1. **R42-01** : corps terminé par un saut de section (ou un tableau) → émettre `<p></p>` après, en `keep` comme en `drop` : `setHTML(getHTML())` idempotent côté core (garde commune « le corps se termine par un bloc éditable »).
2. **R42-02** : `cellBorders` conditionnel côté par côté avec `null` pour `nil`, lecture d'`insideH` (top/bottom des lignes intérieures) et `insideV` (left/right des colonnes intérieures) des `tcBorders` conditionnels, suppression du côté sur `null` dans `applyConditionalFormats`.
3. **R42-03** : taquets négatifs ignorés (ou 0) dans `applyTabStops` : jamais `data-stop="-36pt"`.
4. **R42-04** : mémoïsation des parties d'en-tête/pied par cible de relation dans `readEffectiveHeadersFooters` (même objet pour deux sections qui héritent), commentaire corrigé.
5. **R42-05** : `readBorder` aligné sur `readBorderElement` pour `w:sz="0"` ou hors bornes → 0,5 pt (après fusion L45a : un seul lecteur de bordure, vérifie qu'il n'en reste qu'un).
6. **R42-06** : `tblLook` absent traité comme `<w:tblLook/>` vide (Word applique alors les bandes et la première ligne par défaut : `firstRow`, `firstColumn`, bandes horizontales, c'est la valeur par défaut `0x04A0` de Word — vérifie dans ECMA-376 §17.4.56 et documente la décision en JSDoc).
7. **R42-07** : `tabStopsPt` du `pPr` d'un style de tableau reporté dans `applyTableStyle`.

Attendus `fixtures/docx/expected/*.html` régénérés par `ASTER_REGEN=1 npx vitest run src/docx/reader/regen-expected.spec.ts` **uniquement si** le diff est expliqué par un correctif ci-dessus (cite chaque différence dans le rapport). `compare/compare-fixtures.spec.ts` et `fixtures/docx/README.md` : scores remesurés (`node scripts/fidelity-report.ts fixtures/docx/<fixture>.docx`), listes de pertes ajustées, jamais de plancher baissé sans justification.

## Périmètre

✅ `packages/word/src/docx/reader/**`, `packages/word/src/docx/compare/compare-fixtures.spec.ts`, `fixtures/docx/expected/**`, `fixtures/docx/README.md`. ❌ `writer/**`, `export/**`, `core`, `ui`, `docs/`.

## Vérification

`cd packages/word && npx vitest run` (jamais `-w`), `npx tsc --noEmit`, `npx eslint src`, `npx prettier --write src`. Chemin `semantic` bit à bit identique (fixtures 01-10).

## Rapport attendu

`## Rapport Lot F42` : tableau finding → correctif → test ; Non fait ; Attendus régénérés (diff expliqué) ; Scores avant → après ; Tests (compteurs) ; Fichiers.
