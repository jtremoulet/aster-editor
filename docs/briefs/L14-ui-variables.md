# Brief — Lot L14 : variables dans `@aster-editor/ui`

> Session 2, vague 1. Cible 2h. Travaille en parallèle de L13 (core) : code contre le **contrat** `packages/core/src/api/variables.ts`, pas contre l'implémentation. Le mock `src/testing/mock-editor.ts` doit être complété avec un `variables: VariableStore` en mémoire.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION2.md`, `packages/core/src/api/variables.ts`, `api/commands.ts` (`variable.insert { name, label? }`, `variable.remove`), `api/events.ts` (`variablesChange`), `packages/ui/src/components/dropdown.ts`, `link-dialog.ts`, `search-panel.ts` (modèles), `toolbar/widgets.ts`, `toolbar/presets.ts`, `testing/mock-editor.ts`, `themes/base.css` (variables `--aster-*`). `@tiptap/suggestion` 3.31.4 est installé à la racine : lis `node_modules/@tiptap/suggestion/dist/index.d.ts`.

Conventions du core (L13) à respecter : le NodeView de la puce pose `span.aster-variable` avec `data-name`, classes `aster-variable--resolved` / `aster-variable--unresolved` ; double-clic → `CustomEvent('aster:variable-edit', { detail: { pos, name } })` sur `editor.element` ; HTML `<span data-aster-variable="nom" data-label="…">{{nom}}</span>`.

## Lot

1. **Widget `variable`** (`components/variable-menu.ts`) : dropdown `menu` listant `editor.variables.list()` (libellé, nom en secondaire, valeur si connue, pastille « non résolue »), clic → `editor.commands.run('variable.insert', { name, label })`. Si `allowUnknown` n'est pas `false` (le store ne l'expose pas : utilise `canRun('variable.insert', { name: 'x' })` comme sonde, ou propose dans le rapport), une entrée « Nouvelle variable… » ouvre un mini-formulaire nom + libellé (validation : nom conforme à `/^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u`). Se resynchronise sur `variablesChange`. `aria-pressed` quand `variable.remove` est actif (curseur sur une puce). Déclaré dans `WIDGETS`, ajouté aux presets `full` et `standard` (groupe des liens/images/tables).
2. **Menu de suggestion `{{`** (`components/variable-suggestion.ts`) : extension Tiptap `Suggestion` (char `{{`, `allowSpaces: false`, `startOfLine: false`) construite dans `ui` et enregistrée sur l'éditeur **après** montage via `editor.tiptap.registerPlugin(...)` (plugin ProseMirror renvoyé par `Suggestion({...})`), avec un panneau flottant positionné sous le curseur (`clientRect`), navigation ↑/↓/Entrée/Échap, filtrage par nom/libellé, entrée « Créer {{xxx}} » si inconnu et autorisé. Sélection → `variable.insert` en remplaçant le texte `{{xxx` saisi (utilise `range` de la suggestion). Monté par `createAster` (option `AsterUiOptions.variableSuggestion?: boolean`, défaut `true`) et détruit avec l'instance ; **aussi** utilisable seul via `createVariableSuggestion(editor)`.
3. **Édition de puce** (`components/variable-dialog.ts`) : sur `aster:variable-edit`, panneau `dialog` positionné près de la puce (ou dropdown ancré sur le widget) : libellé modifiable, valeur modifiable (→ `editor.variables.setValues({ [name]: value })`), bouton « Supprimer » (→ `variable.remove`). Écouteur posé par `createAster`, retiré au `destroy`.
4. **CSS** : nouveau `themes/variables.css` (puce : fond `--aster-accent-soft`, bordure, rayon, police, états résolue/non résolue avec `--aster-danger` discret, sélectionnée ; panneau de suggestion ; dialogue). **Ne touche pas aux autres CSS.** L'orchestrateur l'ajoute à `aster.css`.
5. **i18n** `ui.variable.*` fr/en, icône `variable` (accolades) dans `icons/index.ts`.
6. `types.ts` : `AsterUiOptions.variableSuggestion?: boolean` (additif). `index.ts` : exports.

## Périmètre

✅ `packages/ui/src/components/variable-*.ts`, `toolbar/widgets.ts`, `toolbar/presets.ts`, `create-aster.ts` (ajouts), `types.ts` (additif), `testing/mock-editor.ts` (ajout `variables`), `icons/index.ts` (+1 icône, test de compteur à ajuster), `i18n/ui-fr.ts`, `ui-en.ts`, `index.ts`, `themes/variables.css`. ❌ tout le reste, `core`, `word`.

## Tests (`cd packages/ui && npx vitest run --coverage`)

Widget : rendu de la liste depuis le mock, clic → `run('variable.insert', …)`, resync sur `variablesChange`, création d'une variable inconnue (validation), `aria-pressed`. Suggestion : plugin enregistré sur le mock (`tiptap.registerPlugin` mocké) ; logique de filtrage et de rendu du panneau testée via une fonction pure `filterVariables(query, list)` + rendu du panneau avec des props simulées (`items`, `command`), navigation clavier (`onKeyDown` de la suggestion). Dialogue : ouverture sur `aster:variable-edit`, valeur → `setValues`, suppression. `createAster` : montage/démontage sans fuite (`listenerCount`), option `variableSuggestion: false`. Thèmes : `themes.spec.ts` doit inclure `variables.css` dans la vérification des variables définies. Couverture ≥ 70 %, 188 tests existants verts.

## Pièges connus

Outil Write ; pas de `\u00a0` littéral ; `npx vitest run -w` = watch ; `verbatimModuleSyntax` ; zéro `any` ; `mousedown` des boutons déjà neutralisé par `createPlainButton` ; dropdowns se ferment au `focusout` (le panneau de suggestion n'est **pas** un dropdown : gère ses propres fermetures : Échap, clic extérieur, `onExit`).

## Rapport attendu

`## Rapport Lot L14` : Fait / Non fait / Décisions / Blocages / Propositions de contrat / Tests / Fichiers / Points à vérifier (classes CSS, clés i18n, exports, besoins côté core constatés).
