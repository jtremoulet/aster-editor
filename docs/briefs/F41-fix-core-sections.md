# Brief — Lot F41 : correctifs de la revue R41 (core sections et tabulations)

> Session 4. Cible 45 min. Lis `CLAUDE.md`, `docs/reviews/R41.md` (preuves P1-P13 à reproduire **en tests**), `docs/briefs/L41-core-sections.md`, `packages/core/src/api/layout.ts`.

## Lot

Corriger R41-01 à R41-08, chaque correctif accompagné d'un test qui reproduit la preuve du relecteur (spec existante du fichier touché, ou `section-break.spec.ts` / `tab.spec.ts` / `sections.spec.ts`) :

1. **R41-01** : renuméroter dès que la suite ordonnée des attributs `section` diffère de `1..n` (pas seulement quand le nombre change), hors chargement complet.
2. **R41-02** : méta explicite `asterSetContent` posée par `replaceContent` (`editor/aster-editor.ts`) et lue dans `appendTransaction` ; un collage Ctrl+A + Ctrl+V ou `insertHTML` numéroté 7, 8 est renuméroté.
3. **R41-03** : pas de section vide : `afterCurrentBlock` sur `AllSelection` / profondeur 0 ; `appendTransaction` garantit un paragraphe avant un saut en tête et entre deux sauts consécutifs.
4. **R41-04** : Tab refusé (keymap + `canRun` de `text.insertTab`) dans un bloc de code ou quand le parent n'accepte pas le nœud `tab` ; `<pre><code>a<span data-tab></span>b</code></pre>` au chargement → `\t` texte, pas de scission.
5. **R41-05** : `Array.isArray(sections)` dans `resolveSectionLayout` / `maxSectionWidthMm` ; `setPageView` avec un `layout` invalide ne retire pas l'ancienne vue avant de lever (ou n'en lève pas : valider puis appliquer).
6. **R41-06** : attribut `section` borné (entier 1..10 000) dans `parseHTML` et `renderHTML` : `setHTML(getHTML())` stable.
7. **R41-07** : `section.removeBreak` : `section` entier ≥ 1 sinon `false`, pas le sanitiseur de schéma.
8. **R41-08** : `hr[data-section-break]` hors premier niveau (cellule, citation, item) : converti en `<hr>` simple (ou retiré) au chargement et en `appendTransaction`, jamais compté par `getSections`.

R41-09 (spacePt `between`) et R41-10 (tailles) : **non**, dette L45. Ne change pas la forme sérialisée des attributs du contrat.

## Périmètre

✅ `packages/core/src/extensions/section-break.ts`, `tab.ts`, `page-view.ts` (lignes R41-05 seulement : L44 vient d'y intégrer la pagination par section, ne touche pas au reste), `commands/sections.ts`, `commands/layout.ts`, `editor/aster-editor.ts`, specs. ❌ `api/**`, `pagination*.ts`, `ui`, `word`, `docs/`.

## Vérification

`cd packages/core && npx vitest run` (jamais `-w`), `npx tsc --noEmit`, `npx eslint src`, `npx prettier --write src`. Tests existants verts sans changer d'attendu (sauf ceux dont la preuve R41 montre qu'ils figeaient un bug : cite-les).

## Rapport attendu

`## Rapport Lot F41` : tableau finding → correctif → test ; Non fait ; Tests (compteurs avant/après) ; Fichiers.
