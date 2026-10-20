# Brief — Lot L48 : documentation de la session 4 (sections, tabulations, bordures, 0.6.0)

> Session 4, dernier lot. Envoyé après intégration de L40-L47 et des correctifs de revue. Cible 1h. Aucun code, aucun test modifié : la doc décrit ce qui existe, compteurs recalculés par script.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION4.md`, `docs/JOURNAL.md` (section Session 4 : décisions, arbitrages, dettes), `docs/reviews/R41.md` à `R44.md`, puis le code : `packages/core/src/api/layout.ts` (sections, `SectionBreakAttrs`, `TabAttrs`, `spacePt`, `align`), `api/editor.ts` (`setPageView`, `getLayout`, `getSectionLayout`), `api/events.ts` (`pageViewChange`), `api/commands.ts` (commandes `section.*`, `text.insertTab`, `image.setAttributes.height`), `extensions/section-break.ts`, `tab.ts`, `pagination-sections.ts`, `page-view.ts` ; `packages/word/src/docx/reader/sections.ts`, `headers.ts`, `table-conditional.ts`, `properties.ts`, `units.ts` ; `export/sections.ts`, `docx/writer/graft-sections.ts`, `header-footer-graft.ts` ; `docx/import-docx.ts` (défaut `styled`) ; `docx/compare/**` ; `packages/ui/src/components/page-layout-dialog.ts`, `themes/page.css` ; `packages/angular/src/lib/page-view.ts`, `word.ts` ; `e2e/sections.spec.ts`, `e2e/playwright.config.ts` (Firefox, WebKit) ; `fixtures/docx/README.md`, `scripts/generate-fixtures-sections.ts`.

## Lot

- **`docs/GUIDE_INTEGRATION.md`** : chapitre « Fidélité Word » étendu aux sections multiples (ce qu'une section porte, saut de section dans le HTML, vue page par section, pied de l'hôte = dernière section, en-tête = première), tabulations (`data-tab`, `data-stop`, limites : alignement des taquets perdu), bordures (`padding-*` = `w:space`, `0pt solid transparent` = `nil`), tableaux (`data-align`, styles conditionnels résolus en propriétés directes à l'import, non réécrits à l'export), **migration 0.6** (`fidelity` par défaut `styled` : `importDocx(file, { fidelity: 'semantic' })` pour l'ancien comportement, HTML stylé à autoriser côté serveur), checklist mise à jour.
- **`packages/word/README.md`** : défaut `styled`, `layout.sections`, propriétés lues/écrites étendues (section, tabulation, bordure `space`, `nil`, `jc`, styles conditionnels), scores mesurés dans le gabarit (tableau 11-19 + client, chiffres de `compare-fixtures.spec.ts` et `fixtures/docx/README.md`), limites restantes (style conditionnel, taquets alignés, `spacePt` sur `between`).
- **`packages/core/README.md`** : nœuds `sectionBreak` et `tab` (sérialisation exacte), commandes `section.*` et `text.insertTab`, `getSectionLayout`, événement `pageViewChange`, vue page par section, compteurs recalculés (commandes, clés i18n, extensions).
- **`packages/ui/README.md`** : dialogue « Mise en page » par section, classes `.aster-page-gap--section`, variables `--aster-page-width-max`, compteurs.
- **`packages/angular/README.md`** : `pageViewChange`, `importFidelity` (défaut), sections dans `layoutChanged`.
- **`docs/API_CORE.md`** : `layout.ts` à jour (sections, tab, spacePt, align, `defaultParagraph` si L45b l'a livré), `editor.ts`, `events.ts`, `commands.ts` ; propositions de contrat acceptées / différées (journal).
- **`docs/THEMING.md`** : variables et classes de section, impression multi-format.
- **`docs/ARCHITECTURE.md`** : sections dans le lecteur et le writer (greffe par index puis par propriétés, héritage des références), export neuf par sections, arbres de fichiers (fichiers découpés par L45a), décisions produit de la session 4, licences inchangées.
- **`docs/STRATEGIE_TESTS.md`** : fixtures 18-19, projets Firefox/WebKit, test de performance, compteurs par paquet.
- **`fixtures/docx/README.md`**, **`samples/README.md`** : relecture, checklist Word réel étendue (points « À vérifier dans Word réel » des rapports L43 et R43).
- **`CHANGELOG.md` et version** : ne pas toucher (orchestrateur).

## Règles

Chaque chiffre vient d'un script lancé pendant le lot ; chaque identifiant cité est grep-é dans le code ; chaque exemple TypeScript est typechecké dans un fichier scratchpad via les `paths` de `tsconfig.base.json`. Ton direct, tutoiement, titres avec emojis, `npx prettier --write` sur chaque fichier touché. Aucun fichier hors de la liste. Rien n'est commité.

## Rapport attendu

`## Rapport Lot L48` : Fait par fichier / Écarts code-docs corrigés / Écarts restants ou décisions à prendre / Compteurs vérifiés (avec la commande) / Fichiers.
