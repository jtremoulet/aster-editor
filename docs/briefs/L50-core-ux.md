# Brief — Lot L50 : correctifs UX du core signalés par les e2e (sélection en retard, historique, pied de l'hôte)

> Session 4, vague 3. Cible 45 min. Trois bugs prouvés en navigateur par L47 (rapport dans `docs/JOURNAL.md` 01:05), aucun contrat à changer.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `packages/core/src/extensions/pagination-controller.ts` (mesure après `requestAnimationFrame`, `view.updateState(view.state)` ligne ≈ 406), `pagination.ts`, `page-view.ts` (`bodySectionCount`, pied de l'hôte, `maxSectionWidthMm`), `editor/aster-editor.ts` (`HISTORY_OPTIONS`, `replaceContent`, `setHTML(html, emit)`), `e2e/sections.spec.ts` et `e2e/fixtures.ts` (`clickInto`, `placeCursorAtEnd` : contournements des bugs 1 et 2, à **retirer** une fois corrigés si les tests restent verts sans eux).

## Lot

1. **Sélection d'état en retard après un clic en vue page** : preuve L47 : import de 18, clic sur « Section 1, paragraphe 2 » → `state.selection` encore à l'ancienne position pendant ≈ 300 ms (jusqu'au `updateState` du `requestAnimationFrame`), une commande ou une frappe envoyée juste après part de l'ancienne position (sur 19 : clic + `End` + `Tab` insère en fin de document). Cause probable : `view.updateState(view.state)` **remet** l'état précédent par-dessus la sélection DOM que ProseMirror n'a pas encore relue (`selectionchange` asynchrone), ou le redessin réinitialise la sélection. Correctif attendu : ne jamais réappliquer un état périmé (rafraîchir les décorations par `view.dispatch(state.tr.setMeta(paginationKey, …))` sans pas, ou `view.updateState(view.state)` seulement après `view.domObserver.flush()` / lecture de la sélection), sans ajouter d'entrée d'historique ni d'événement `update` superflu (vérifie le compteur d'`update`). Test core (jsdom : simuler la sélection DOM puis la mesure) + **vérification en vrai navigateur** sur le playground `http://localhost:4300` (déjà lancé, ne le stoppe pas) : clic puis `Tab` immédiat insère au bon endroit ; retirer le contournement `clickInto` de `e2e/sections.spec.ts` si le test reste vert sur 3 runs (`npx playwright test -c e2e/playwright.config.ts --project=playground --repeat-each=3 sections.spec.ts`).
2. **Historique** : `setHTML(html, true)` entre dans l'historique **et** se groupe avec l'édition suivante dans les 500 ms (`newGroupDelay`) : `insertBreak` puis `undo` revenait au document initial. Correctif : `closeHistory` (de `prosemirror-history`) sur la transaction de `replaceContent` quand `emit` est vrai (ou toujours), test : `setHTML(a, true)` → édition immédiate → `undo` ne défait que l'édition.
3. **Pied de l'hôte et `--aster-page-width-max` après `section.removeBreak` / `insertBreak`** : recalculés seulement à `setPageView`. Correctif : le contrôleur de pagination (ou l'écouteur de `aster:section-breaks-change`) rafraîchit le pied et la largeur max de l'hôte après chaque changement de la suite des sauts (API interne de `page-view.ts`, pas de contrat). Test core.
4. **Focus** (observation L47) : `editor.commands.focus()` diffère le focus DOM ; si `AsterEditor.focus()` existe dans le contrat et s'appuie dessus, documente en JSDoc que le focus est effectif au prochain frame (pas de changement de comportement).

## Périmètre

✅ `packages/core/src/extensions/pagination-controller.ts`, `pagination.ts`, `page-view.ts`, `section-break.ts` (écouteur seulement), `editor/aster-editor.ts`, specs ; `e2e/sections.spec.ts` et `e2e/fixtures.ts` (retrait des contournements seulement). ❌ `api/**`, `tab.ts`, `table-layout.ts`, `word`, `ui`, `angular`, `docs/`.

## Vérification

`cd packages/core && npx vitest run` (jamais `-w`), `tsc --noEmit`, eslint, prettier ; `npx playwright test -c e2e/playwright.config.ts --project=playground --project=playground-webkit` vert (ne lance pas `npm run e2e` complet pendant que L49 régénère des fixtures : le projet `demo` n'est pas concerné) ; capture ou lecture DOM du playground pour le point 1.

## Rapport attendu

`## Rapport Lot L50` : Fait par point (cause réelle trouvée, correctif, test) / Non fait / Contournements e2e retirés / Tests (compteurs) / Fichiers.
