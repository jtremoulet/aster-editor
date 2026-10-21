# Brief — Lot F44 : correctifs de la revue R44 (vue page et pagination par section)

> Session 4. Cible 40 min. Lancé après F41 (core). Lis `CLAUDE.md`, `docs/reviews/R44.md` (specs jetables du relecteur dans `C:\Users\Joris\AppData\Local\Temp\claude\C--workspace\6da28716-9c97-4474-a9ce-9218f14ae4a9\scratchpad\r44\` : `core-l44.spec.ts`, `ui-l44.spec.ts`, à copier dans ton scratchpad, pas dans le dépôt tels quels), `docs/briefs/L44-page-view-sections.md`, `packages/core/src/api/layout.ts`.

## Lot

Corriger R44-01 à R44-06, chaque correctif accompagné d'un test qui reproduit la preuve du relecteur :

1. **R44-01** : une seule fonction core « section ouverte par le k-ième `hr` » (positionnelle : le k-ième saut de premier niveau ouvre la section k+1, quel que soit son attribut) partagée par `SectionBreakNodeView` et `sectionSegments` ; les variables posées sur le `hr` et la coupure portent toujours le même format, libellé et en-tête. F41 renumérote dès que la suite diffère de 1..n : la désynchronisation devient impossible après `appendTransaction`, mais la fonction partagée reste la garantie.
2. **R44-02** : `withSectionPage` ne tronque jamais `layout.sections` ; si la section éditée est la dernière du corps, recopier `page` / `headers` / `footers` / `columns` / `titlePage` de la dernière entrée dans les champs de premier niveau (invariant du contrat).
3. **R44-03** : `count === 1` avec `layout.sections` présent : préremplir depuis `resolveSectionLayout(layout, 1)` (comme l'hôte) et éditer `sections[0]` puis recopier dans `page`.
4. **R44-04** : libellé « Section n · … » et numéro de page posés au-dessus de l'en-tête de section dans la coupure (plus de chevauchement), `page.css`.
5. **R44-05** : dernière section de l'hôte (pied, `--aster-page-width-max`) calculée depuis le corps (nombre de `hr` de premier niveau + 1, borné par `sections.length`), pas depuis `layout.sections.length`.
6. **R44-06** : `sectionOfSelection` lit `$head` ; la note du dialogue signale une sélection à cheval sur plusieurs sections (clé i18n `ui.pageLayout.sectionMixed`, fr/en).

## Périmètre

✅ `packages/core/src/extensions/pagination-measure.ts`, `pagination-sections.ts`, `section-break.ts` (uniquement l'usage de la fonction partagée dans le NodeView), `page-view.ts` (lignes R44-05), specs ; `packages/ui/src/components/page-layout-dialog.ts` (+spec), `ui/themes/page.css`, `ui/src/i18n/ui-fr.ts`, `ui-en.ts`, `ui/src/testing/mock-editor.ts`. ❌ `api/**`, `commands/**`, `word`, `angular`, `docs/`.

## Vérification

`cd packages/core && npx vitest run`, `cd packages/ui && npx vitest run` (jamais `-w`), `tsc --noEmit`, eslint, prettier. Vérification visuelle du R44-04 dans le playground `http://localhost:4300` (déjà lancé, ne le stoppe pas) : importer `fixtures/docx/18-sections-triple.docx` via l'input de fichier, zoomer sur la coupure « Section 2 » : capture dans ton rapport (chemin scratchpad).

## Rapport attendu

`## Rapport Lot F44` : tableau finding → correctif → test ; Non fait ; Tests (compteurs) ; Fichiers.

## Ajout (contrat étendu après R43)

7. **`tab.ts`** : attributs `align` (`data-align`, valeurs `center` / `right` / `decimal`, `left` ou invalide → `null`, non sérialisé) et `leader` (`data-leader`, `dot` / `hyphen` / `underscore`), émis dans cet ordre après `data-stop`, `setHTML(getHTML())` stable ; `text.insertTab` accepte `{ stopPt?, align?, leader? }`. Rendu : aucun changement visuel exigé (l'espace élastique reste), mais `.aster-tab[data-leader]` peut recevoir une bordure basse pointillée dans `page.css` si trivial.
