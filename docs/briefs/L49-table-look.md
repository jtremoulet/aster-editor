# Brief — Lot L49 : `w:tblLook` de bout en bout et idempotence stricte des fixtures 01-10

> Session 4, vague 3. Cible 1h. Dernière perte de la fixture 19 (`table.conditional`) et dette d'idempotence signalée par L46.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/JOURNAL.md` session 4, `packages/core/src/api/layout.ts` (**contrat étendu** : `TableLayoutAttrs.look?: TableLook`, `TABLE_LOOK_FLAGS`, sérialisé `data-docx-look="firstRow firstColumn noVBand"`, drapeaux à vrai dans l'ordre des flags), `packages/core/src/extensions/table-layout.ts` (`align` / `data-align` comme modèle), `packages/word/src/docx/reader/table-conditional.ts` (`readTableLook`, `WORD_DEFAULT_LOOK`, `applyConditionalFormats`), `reader/tables.ts`, `writer/graft.ts` + `export/tables*.ts` (ce que le writer écrit pour un tableau : `w:tblPr`, `w:tblLook`, propriétés directes des cellules), `compare/model.ts` (`table.conditional`, L46), `compare/compare-fixtures.spec.ts`, `fixtures/docx/README.md`, rapport L46 dans le journal (01:05) pour les trois causes de non-idempotence.

## Lot

1. **core** `table-layout.ts` : attribut `look` (`data-docx-look`), parse tolérant (drapeaux inconnus ignorés, doublons fusionnés, casse exacte), render dans l'ordre de `TABLE_LOOK_FLAGS`, `null` si aucun drapeau ; idempotence stricte `setHTML(getHTML())` ; `table.setLayout` / `unsetLayout` si une commande de tableau existe (lire `commands/`), sinon attribut seul. Tests.
2. **lecteur** : `tables.ts` émet `data-docx-look` **seulement quand le document porte un `w:tblLook`** (explicite, même vide → drapeaux effectifs ; absent → rien, le défaut Word reste appliqué aux propriétés directes). Ordre des attributs du `<table>` : celui que le core produit (vérifie l'ordre réel de `renderHTML` dans `table-layout.ts` et aligne le lecteur dessus).
3. **writer** : export neuf : `w:tblLook` depuis `look` (lib `docx` : lire `node_modules/docx/dist/index.d.ts` pour l'option) ; **gabarit** : quand le tableau porte `data-docx-style` **et** `data-docx-look`, réécrire `w:tblLook` avec les drapeaux et **ne pas écrire** les propriétés directes des cellules (fond, gras, bordures) qui sont exactement celles que le style conditionnel du gabarit produirait (résolution identique à celle du lecteur : réutilise `table-conditional.ts` sur les styles du gabarit via `TemplateContext`) ; les propriétés différentes restent écrites. Résultat attendu : fixture 19 dans le gabarit → **1** (`run.bold`, `table.cellShading`, `table.conditional` sans perte), idempotence `import → export gabarit → import` conservée (HTML et `layout` égaux), 11-18 et client inchangés (mesure `node scripts/fidelity-report.ts` avant/après sur 14, 18, 19, client).
4. **Idempotence stricte 01-10** (L46) : `reader/lists.ts` émet `data-docx-num-id` et `type` dans l'ordre que le core produit (vérifie avec `createEditor` + `setHTML(getHTML())`), `reader/tables.ts` pose `colwidth` sur toutes les lignes comme le core ; l'image inline sortie de son paragraphe est **hors lot** (contrat core) : documente-la dans le test comme exclusion. Régénère les attendus (`ASTER_REGEN=1 npx vitest run src/docx/reader/regen-expected.spec.ts`), cite le diff ; `import-docx.default.spec.ts` : idempotence stricte étendue à toutes les fixtures qui la tiennent (cite celles qui restent exclues et pourquoi).
5. `compare-fixtures.spec.ts` et `fixtures/docx/README.md` remesurés.

## Périmètre

✅ `packages/core/src/extensions/table-layout.ts` (+spec), `packages/core/src/index.ts` (ré-exports), `packages/word/src/**` (hors `import-docx.ts`), `fixtures/docx/expected/**`, `fixtures/docx/README.md`. ❌ `api/**`, `pagination*.ts`, `page-view.ts`, `aster-editor.ts`, `ui`, `angular`, `docs/`, `e2e/`. Aucun fichier source > 400 lignes.

## Vérification

`cd packages/core && npx vitest run`, `cd packages/word && npx vitest run` (jamais `-w`), `tsc --noEmit`, eslint, prettier ; scores avant → après ; `checkIntegrity` vide sur la 19 ré-exportée.

## Rapport attendu

`## Rapport Lot L49` : Fait par point / Non fait / Scores avant → après / Attendus régénérés (diff expliqué) / Tests (compteurs) / Fichiers.
