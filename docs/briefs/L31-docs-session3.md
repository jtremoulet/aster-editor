# Brief — Lot L31 : documentation de la session 3 (fidélité Word)

> Session 3, dernier lot. Envoyé après intégration de L27, L28, L29, L30 et des correctifs de revue. Cible 1h15. Aucun code, aucun test modifié : la doc décrit ce qui existe, compteurs recalculés par script.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION3.md` (avec sa section « Ajouts en cours de session »), `docs/JOURNAL.md` (section Session 3 : décisions, écarts, dettes), les rapports de revue `docs/reviews/R23-R29.md`, puis le code : `packages/core/src/api/layout.ts`, `extensions/paragraph-layout.ts`, `run-layout.ts`, `list-layout.ts`, `table-layout.ts`, `page-view.ts`, `page-break.ts`, `pagination*.ts`, `html/serialize-html.ts`, `commands/layout.ts` ; `packages/word/src/docx/reader/**`, `docx/writer/**`, `docx/compare/**`, `docx/types.ts`, `export/types.ts` ; `packages/ui/src/components/{line-spacing,paragraph-spacing-dialog,paragraph-indent,paragraph-borders-dialog,caps,underline-style,page-layout-dialog}.ts`, `themes/page.css` ; `packages/angular/src/lib/**` ; `apps/demo/src/app/pages/template.page.ts`, `import.page.ts` ; `scripts/fidelity-report.ts`, `scripts/generate-fixtures-layout.ts`.

## Lot

- **`docs/GUIDE_INTEGRATION.md`** : nouveau chapitre « Fidélité Word » (import stylé vs sémantique, ce qui est conservé et ce qui ne l'est pas, vue page et pagination approximative avec leurs limites écrites noir sur blanc, export dans le gabarit : quand l'utiliser, ce qui reste identique, repli et avertissements, rapport de fidélité et score, objets non représentables, document client dans `fixtures/docx/client/`), chapitre Angular mis à jour (`importFidelity`, `pageView`, `exportInTemplate`, `compareWithTemplate`, `layoutChanged`), section stockage (le HTML stylé porte `style` inline et `data-docx-*` : règles de sanitization serveur à autoriser), checklist finale.
- **`packages/word/README.md`** : options d'import (`fidelity`, `emptyParagraphs`), résultat (`layout`, `template`, `lost`), options d'export (`template`, `layout`), codes d'avertissement nouveaux, `compareDocx`, script `npm run fidelity`, tableau des propriétés lues et écrites (paragraphe, run, liste, tableau, image, note, section), limites (styles conditionnels, habillage, pagination).
- **`packages/core/README.md`** : attributs de mise en page (sérialisation exacte, un exemple par attribut), marques de run, listes et tableaux stylés, commandes `paragraph.*` et `text.*`, vue page et pagination (`pageView`, `setPageView`, `getLayout`), sérialiseur HTML verbatim (pourquoi `getHTML` ne passe plus par Tiptap), compteurs recalculés (commandes, clés i18n, extensions).
- **`packages/ui/README.md`** : nouveaux widgets et presets recomptés, `pageView` dans `createAster`, variables `--aster-page-*`, dialogue d'image (hauteur, verrou), icônes recomptées.
- **`packages/angular/README.md`** : section « Fidélité Word » (relecture de ce que L29 a écrit, compteurs).
- **`docs/API_CORE.md`** : `layout.ts` intégralement documenté, commandes ajoutées, `AsterOptions.pageView`, propositions de contrat acceptées ou différées (lire le journal).
- **`docs/THEMING.md`** : `page.css`, variables `--aster-page-*`, classes de la vue page et des gaps de pagination, nouveaux dialogues, impression.
- **`docs/ARCHITECTURE.md`** : lecteur OOXML (modules et contexte), greffe dans le gabarit, rapport de fidélité, sérialiseur verbatim, arbres de fichiers mis à jour, décisions produit de la session 3, licences inchangées (vérifier qu'aucune dépendance n'a été ajoutée hors `@tiptap/extension-horizontal-rule`).
- **`docs/STRATEGIE_TESTS.md`** : fixtures 11-17 et `client/`, `regen-expected.spec.ts`, tests d'idempotence stricts, tests d'aller-retour dans le gabarit, score de fidélité comme critère, compteurs par paquet.
- **`fixtures/docx/README.md`** et **`samples/README.md`** : relecture, checklist Word étendue (export dans le gabarit : points à ouvrir dans Word réel).
- **`CHANGELOG.md` et version** : ne pas toucher (orchestrateur).

## Règles

Chaque chiffre vient d'un script lancé pendant le lot (compteurs de commandes, widgets, icônes, clés i18n, feuilles CSS, tests par paquet via `npm run test`) ; chaque identifiant cité est grep-é dans le code ; chaque exemple TypeScript est typechecké dans un fichier scratchpad via les `paths` de `tsconfig.base.json`. Ton direct, tutoiement, titres avec emojis, `npx prettier --write` sur chaque fichier touché. Aucun fichier hors de la liste. Rien n'est commité.

## Rapport attendu

`## Rapport Lot L31` : Fait par fichier / Écarts code-docs corrigés / Écarts restants ou décisions à prendre / Compteurs vérifiés (avec la commande) / Fichiers / Points à vérifier.
