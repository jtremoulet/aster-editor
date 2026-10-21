# Brief — Lot L45 : dette technique et propositions de contrat acceptées

> Session 4, vague 2 (après intégration de L41-L44). Cible 1h30. **Découpé en deux lots** : **L45a** = section `word` (points 1 à 4, lancé dès l'intégration de L43) ; **L45b** = sections `core` et `angular` (points 5 à 9, lancé après F41). Aucune nouvelle fonctionnalité : tout doit rester bit à bit identique en sortie (tests existants verts sans modification de leurs attendus, hors renommages d'imports).

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION4.md` (section 3 « Dette technique »), `docs/JOURNAL.md` sessions 3 et 4 (dettes signalées par les lots et les revues), `docs/reviews/R23.md` à `R30.md` (sections « Dette proposée »).

## Lot

### `word`

1. Fusion `reader/units.ts` et `reader/units-blocks.ts` en un seul `reader/units.ts` (API union, doublons supprimés, `numericAttribute` strict côté blocs = décision F24 appliquée partout, bornes conservées), imports mis à jour, aucun changement de comportement sauf le rejet de l'hexadécimal et des exposants dans les attributs numériques des blocs (cite les tests touchés). **Seule exception fonctionnelle, demandée par L43** : `readBorderElement` (chemin `w:tblBorders` / `w:tcBorders` directs) lit `w:space` → `spacePt` comme `readBorder` le fait déjà ; mesure attendue : fixture 14 revient à ≥ 0,998 (plus de perte `table.borders` / `table.cellBorders`), document client et 19 remontent ; mets à jour `compare/compare-fixtures.spec.ts` (`TEMPLATE_AT_TARGET`, planchers, commentaires) et `fixtures/docx/README.md` avec les scores mesurés (`node scripts/fidelity-report.ts <fixture>`).
2. Helpers exportés au lieu d'être dupliqués : `parseMergeField` (de `preprocess/fields.ts`, utilisé par `compare/model-paragraph.ts`), `invalidDocx` / `DocxImportError` (de `import-docx.ts`, utilisés par `compare/compare-docx.ts` et `writer/template.ts`), `convertBlocks` (de `reader/index.ts`, utilisé par `writer/template.ts`) ; suppression des copies.
3. Fichiers > 400 lignes de `export/` : `styles.ts`, `inline.ts`, `blocks.ts`, `tables.ts`, `css.ts` : découpage par responsabilité (ex. `inline-runs.ts` / `inline-fields.ts`, `tables-borders.ts`, `styles-headings.ts`, `css-colors.ts`), API des modules inchangée (ré-exports), aucune logique modifiée.
4. Test de performance : import stylé d'un document de 100 pages (fixture générée en mémoire par la lib `docx`, ≈ 2 500 paragraphes et 50 tableaux) en moins de 2 s en jsdom, dans `reader/performance.spec.ts`.

### `core` (contrat : dégel **accepté** par l'orchestrateur, additif)

5. `api/editor.ts` : `setPageView(options: boolean | PageViewOptions): void`, `getLayout(): DocumentLayout | null`, `getSectionLayout(index: number): SectionLayout | null` ; `api/events.ts` : événement `pageViewChange` (`{ active: boolean; layout: DocumentLayout | null }`) émis par `setPageView` en plus de l'événement DOM actuel, qui reste. Implémentations déjà présentes sur `AsterEditorImpl` : les relier au contrat, documenter dans la JSDoc.
6. `api/commands.ts` : `'image.setAttributes'` gagne `height?: number` ; `image.ts` applique `height`.
7. `api/layout.ts` : `DocumentLayout.defaultParagraph?: { lineHeight?, lineHeightPt?, spacingBeforePt?, spacingAfterPt? }` ; le lecteur (`reader/sections.ts`) le renseigne depuis les `docDefaults` de paragraphe, la vue page (`page.css` via variables `--aster-page-default-line-height` etc. posées par `page-view.ts`) l'applique aux blocs sans interligne propre.
8. `ui` : l'appel direct `pageViewApiOf` devient inutile si l'API est dans le contrat : simplifie `page-layout-dialog.ts` et `angular/src/lib/page-view.ts` en conséquence (types du contrat), sans changer le comportement.

### `angular`

9. `lib/page-view.ts` : écouter `pageViewChange` du contrat au lieu de l'événement DOM (l'événement DOM reste pour les intégrateurs vanilla).

## Périmètre

✅ `packages/word/src/**` (hors `docx/compare/types.ts`), `packages/core/src/api/editor.ts`, `events.ts`, `commands.ts`, `layout.ts` (additif, cité dans le rapport ligne par ligne), `core/src/editor/aster-editor.ts`, `extensions/image.ts`, `page-view.ts`, `index.ts`, `packages/ui/src/components/page-layout-dialog.ts`, `ui/src/index.ts`, `ui/themes/page.css`, `packages/angular/src/lib/page-view.ts`, `aster-editor.component.ts`, specs. ❌ `e2e/`, `docs/`, `apps/demo` (sauf si un type bouge : alors lignes minimales, citées).

## Vérification

`npm run check` complet vert (lint, typecheck, tests de tous les paquets), `npm run build`, `npm run smoke:install` (exports des paquets intacts), aucun fichier source > 400 lignes dans `word/src/export` et `word/src/docx/reader` (`wc -l` dans le rapport), `git diff --stat`.

## Rapport attendu

`## Rapport Lot L45` : Fait par point / Non fait / Changements observables (doit être vide, sinon justifier) / Lignes du contrat modifiées (citation) / Tests (compteurs) / Fichiers (tailles).
