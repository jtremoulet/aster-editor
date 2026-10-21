# Brief — Lot L55 : documentation de la session 5 (0.7.0, retours du POC)

> Session 5, dernier lot. Envoyé après intégration de L51-L54, F52, F53. Cible 45 min. Aucun code, aucun test modifié : la doc décrit ce qui existe, compteurs recalculés par script.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/JOURNAL.md` (section Session 5 : les huit retours de l'intégrateur, décisions, arbitrages), `docs/reviews/R52.md`, `R53.md`, le brouillon du changelog 0.7.0 dans `CHANGELOG.md` (déjà inséré par l'orchestrateur : ne le modifie pas, sers-t'en), puis le code : `packages/core/src/api/layout.ts` (`DefaultParagraph`), `extensions/page-view-variants.ts`, `page-view-defaults.ts`, `pagination-sections.ts`, `search.ts` ; `packages/ui/src/components/rich-field.ts`, `page-layout-headers.ts`, `search-panel.ts`, `themes/page.css`, `base.css`, `search-source.css` ; `packages/word/src/docx/reader/styles.ts` (`defaultParagraph`), `preprocess/content-controls.ts` ; `scripts/add-js-extensions.mjs`, `smoke-install.mjs`, `generate-fixtures-fields.ts` ; `e2e/search.spec.ts`, `headers-dialog.spec.ts`.

## Lot

- **`docs/GUIDE_INTEGRATION.md`** : chapitre « Fidélité Word » : en-têtes et pieds sur chaque page (variantes `first` / `even`, écart documenté « `titlePage` sans `first` → `default` »), défauts de paragraphe et police à l'écran (variables, repli, cellules), édition des en-têtes et pieds dans le dialogue, contrôles de contenu liés (QuickPart « Propriété du document ») jamais variables sauf `w:tag` nommé lié à un XML personnalisé ; chapitre Angular inchangé sauf mention ; **nouvelle section « Import en Node pur »** (Vitest sans `server.deps.inline`, SSR) ; recherche en bandeau ; checklist.
- **`packages/word/README.md`** : relecture des lignes L53 / F53 (`defaultParagraph`, `atLeast` non transporté, contrôles liés), scores avec la 20, section comparateur (`section.defaultParagraph`).
- **`packages/core/README.md`** : `DefaultParagraph`, variables de défauts, événement `aster:page-view-last-page`, `searchPluginKey` typé, export `scrollCurrentIntoView`, compteurs recalculés (commandes, extensions, clés i18n).
- **`packages/ui/README.md`** : dialogue « Mise en page » avec en-têtes et pieds (champs, cases, vide = retiré, type masqué conservé), `rich-field`, bandeau de recherche (markup), radios, classes et variables nouvelles, compteurs (clés i18n).
- **`packages/angular/README.md`** : rien de nouveau dans l'API : vérifier et le dire ; scores.
- **`docs/API_CORE.md`** : `DefaultParagraph`, `layout.defaultParagraph`, tableau des propositions (ajouter `variablesToChipsHtml` différée, `lineHeightMinPt` / `atLeast` différée).
- **`docs/THEMING.md`** : variables `--aster-page-font-*`, `--aster-page-default-*`, classes `.aster--page-defaults`, `.aster-search-panel`, `.aster-page-layout__rich`, `.aster-dialog__checks`, bande minimale.
- **`docs/ARCHITECTURE.md`** : état 0.7.0, modules nouveaux, décisions produit de la session 5 (liste du journal), packaging ESM (`.js`, codemod dans `lint`, smoke Node), dette (fichiers > 400 lignes : `page-layout-dialog.ts`, `page-view.ts`).
- **`docs/STRATEGIE_TESTS.md`** : fixture 20, specs nouvelles, compteurs par paquet (lance `npx vitest run` par paquet, jamais `-w`), e2e (`npx playwright test --list -c e2e/playwright.config.ts`).
- **`docs/PUBLICATION.md`** : relecture de la ligne L51.
- **`fixtures/docx/README.md`**, **`samples/README.md`** : relecture, checklist Word réel : en-têtes `first` / `even`, contrôle lié, fixture 20.
- **`CHANGELOG.md`, `package.json`, `docs/JOURNAL.md`, `docs/REX.md`, `BILAN_*.md`** : ne pas toucher (orchestrateur).

## Règles

Chaque chiffre vient d'un script lancé pendant le lot ; chaque identifiant cité est grep-é dans le code ; exemples TypeScript typecheckés dans un fichier scratchpad via les `paths` de `tsconfig.base.json`. Ton direct, tutoiement, titres avec emojis, `npx prettier --write` sur chaque fichier touché. Aucun fichier hors de la liste. Rien n'est commité. Ne lance ni n'arrête aucun serveur.

## Rapport attendu

`## Rapport Lot L55` : Fait par fichier / Écarts code-docs corrigés / Écarts restants / Compteurs vérifiés (avec la commande) / Fichiers.
