# Brief — Lot L26 : toolbar de mise en page et vue page (`ui`)

> Session 3, vague 1. Cible 2h. Trois sous-lots dans l'ordre ; chacun est intégrable seul. L23 ajoute en parallèle au `core` les attributs et commandes que tu pilotes : code contre **le contrat** (`packages/core/src/api/layout.ts`, `api/commands.ts` : `paragraph.setLayout` / `paragraph.unsetLayout`) et contre les commandes additives annoncées dans `docs/briefs/L23-core-layout.md` (`text.setLetterSpacing`, `text.setCaps`, `text.unsetCaps`, `editor.setPageView`). Tant que L23 n'est pas intégré, tes tests passent par `testing/mock-editor.ts` (étends-le si besoin : il est dans ton périmètre).

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION3.md`, `packages/ui/src/toolbar/widgets.ts`, `toolbar/presets.ts`, `components/dropdown.ts`, `components/link-dialog.ts` (modèle de dialogue), `components/color-picker.ts`, `create-aster.ts`, `types.ts`, `i18n/ui-fr.ts` / `ui-en.ts`, `icons/index.ts`, `themes/aster.css` (feuilles importées), `themes/base.css`, `themes/print.css`, `themes/variables.css` (modèle de feuille dédiée), `testing/mock-editor.ts`.

## Sous-lot A — Widgets de mise en page de paragraphe

- Widget `lineSpacing` : dropdown « Interligne » avec 1 / 1,15 / 1,5 / 2 / « Personnalisé… » (dialogue : multiple **ou** valeur exacte en pt) → `paragraph.setLayout { lineHeight }` ou `{ lineHeightPt, lineHeight: null }` ; « Par défaut » → `paragraph.unsetLayout { attrs: ['lineHeight', 'lineHeightPt'] }`. État actif lu sur `editor.tiptap.getAttributes('paragraph')` / `('heading')`.
- Widget `paragraphSpacing` : dialogue « Espacement » (avant / après en pt, retrait gauche / droite / première ligne en pt, cases « Conserver avec le suivant », « Saut de page avant ») → `paragraph.setLayout`, bouton « Réinitialiser » → `unsetLayout`.
- Boutons `indentIncrease` / `indentDecrease` : ±18 pt sur `indentLeftPt` (borné à 0) ; dans une liste, délègue à `listIndent` / `listOutdent` existants s'ils existent (vérifie `STANDARD_COMMAND_IDS`), sinon applique au paragraphe.
- Widget `paragraphBorders` : dialogue « Bordures et fond » (quatre côtés avec style / épaisseur / couleur, fond) → `borders` / `shading`.
- Widgets `caps` (dropdown : Normal / MAJUSCULES / Petites capitales → `text.setCaps` / `text.unsetCaps`) et `underlineStyle` (dropdown sous le bouton souligné existant **ou** widget séparé : Simple / Double / Pointillé / Tirets / Ondulé → marque `underline` avec `decorationStyle` via `editor.tiptap.chain().setMark('underline', { decorationStyle })`, hors contrat, documente).
- Icônes nouvelles dans `icons/index.ts`, libellés i18n fr/en dans les groupes `ui.lineSpacing.*`, `ui.paragraphSpacing.*`, `ui.borders.*`, `ui.caps.*`, `ui.underlineStyle.*`, `ui.pageLayout.*`. Presets : `full` reçoit un groupe « Mise en page » (`lineSpacing`, `paragraphSpacing`, `indentDecrease`, `indentIncrease`, `paragraphBorders`), `standard` reçoit `lineSpacing` et les retraits.

## Sous-lot B — Vue page (`themes/page.css`, widget `pageLayout`)

- `themes/page.css`, importée par `aster.css` : quand l'hôte porte `aster--page-view` (posé par le core), le `contentElement` est une feuille centrée de largeur `var(--aster-page-width)`, padding = marges `var(--aster-page-margin-*)`, fond `--aster-page-bg` (blanc en thème clair, gris très sombre en nuit), ombre `--aster-page-shadow`, autour un fond `--aster-page-desk` ; `div.aster-page-header` et `div.aster-page-footer` (posés par le core) affichés en lecture seule dans les marges haute et basse (opacité réduite, `user-select: none`, `pointer-events: none`) ; `hr[data-page-break]` rendu comme une coupure de feuille (deux bords + espace de bureau) ; impression (`print.css`) : la feuille devient la page, `@page` avec `size` et marges depuis les variables si possible (sinon note). Variables `--aster-page-*` documentées dans `THEMING.md` (par l'orchestrateur : liste-les dans ton rapport).
- Widget `pageLayout` : dialogue « Mise en page » (format A4/A3/A5/Letter/Legal, orientation, marges en mm, case « Vue page ») → `editor.setPageView({ layout })` ; lit l'état courant par `editor.getLayout()` (hors contrat, annoncé par L23 ; si absent au moment de tes tests, mocke-le). Preset `full`.
- Option `createAster` `pageView?: boolean | PageViewOptions` transmise au core (`AsterOptions.pageView`, déjà dans le contrat).

## Sous-lot C — Dialogue d'image : taille

- Le dialogue d'image existant reçoit largeur et hauteur en px avec verrou de proportions, posés via `image.setAttributes { width }` (+ `height` si le core l'expose après L23, sinon largeur seule et note).

## Périmètre

✅ `packages/ui/src/components/line-spacing*.ts`, `paragraph-spacing-dialog*.ts`, `paragraph-borders-dialog*.ts`, `caps*.ts`, `underline-style*.ts`, `page-layout-dialog*.ts`, `components/image-dialog.ts` (ajout), `toolbar/widgets.ts`, `toolbar/presets.ts`, `create-aster.ts` (additif), `types.ts` (additif), `i18n/ui-*.ts`, `icons/index.ts`, `index.ts`, `themes/page.css` (nouveau), `themes/aster.css` (une ligne d'import), `themes/print.css` (ajout), `themes/light.css` / `night.css` (variables `--aster-page-*` additives), `testing/mock-editor.ts`, specs. ❌ `core`, `word`, `angular`, autres composants.

## Tests

Chaque widget : rendu, état actif depuis les attributs, action → `commands.run` avec les bons arguments (mock), a11y (`aria-*`, focus, Échap ferme, `mousedown` neutralisé), i18n fr = en (compteurs), icônes présentes pour chaque widget, presets recomptés, `themes.spec.ts` inclut `page.css` et vérifie les variables `--aster-page-*` dans `light.css` et `night.css`, `createAster({ pageView: true })` transmet l'option. Couvertures maintenues, `cd packages/ui && npx vitest run --coverage` (jamais `-w`).

## Pièges

Outil Write ; pas de `\u00a0` ; `verbatimModuleSyntax` ; zéro `any` ; chaînes visibles via i18n ; classes `aster-` ; variables `--aster-*` ; les dialogues ne volent pas le focus de l'éditeur au `mousedown` ; ne lance ni n'arrête de serveur (l'orchestrateur vérifie en navigateur).

## Rapport attendu

`## Rapport Lot L26` : Fait par sous-lot / Non fait / Décisions / Blocages / Propositions de contrat / Variables CSS ajoutées (liste exacte) / Tests (compteurs : widgets, icônes, clés i18n, presets) / Fichiers / Points à vérifier (ce qui dépend de L23 et a été mocké).
