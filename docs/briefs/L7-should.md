# Brief — Lot L7 : should-features (recherche/remplacement, vue source, plein écran)

> Rédigé à 23:30, envoyé après intégration de L6 pour éviter les conflits sur `create-aster.ts`, les dictionnaires UI et les CSS. Cible 1h30.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`, tout installé. Lire `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/STRATEGIE_TESTS.md`, `packages/core/src/api/**`, `packages/core/src/commands/define.ts`, `commands/standard.ts`, `extensions/aster-extensions.ts`, `packages/ui/src/create-aster.ts`, `types.ts`, `components/dropdown.ts`, `toolbar/widgets.ts`, `toolbar/presets.ts`, `testing/mock-editor.ts`. Core, ui, word, angular implémentés et commités.

## Lot

### Recherche / remplacement (core + ui)
- Core `extensions/search.ts` : extension Tiptap `Search` avec plugin ProseMirror de décorations (`aster-search-match`, `aster-search-match--current`), état `{ query, caseSensitive, matches, currentIndex }` dans `storage`, commandes Tiptap `setSearchQuery`, `nextMatch`, `previousMatch`, `replaceCurrent`, `replaceAll`, `clearSearch`. Recherche sur le texte des blocs (concaténation des nœuds texte, positions mappées). Commandes Aster custom enregistrées via `options.commands`-like interne : ajouter au registre standard les ids `search.open`, `search.next`, `search.previous`, `search.replace`, `search.replaceAll`, `search.clear` **sans toucher `STANDARD_COMMAND_IDS`** (contrat figé) : elles sont enregistrées par le core comme commandes supplémentaires, typées `AsterCommand<{ query: string; replacement?: string; caseSensitive?: boolean }>`. Raccourci `Mod-f` sur `search.open` (émet un événement custom `aster:search-open` sur `editor.element`, l'UI écoute).
- UI `components/search-panel.ts` : widget `search` (barre repliable sous la toolbar ou panneau dropdown `dialog`) : champ recherche, champ remplacement, case « respecter la casse », compteur `n / total`, boutons précédent/suivant/remplacer/tout remplacer/fermer. Ouverture sur `aster:search-open` et par le bouton de toolbar. Ajouter `search` au preset `full`.
- Clés `ui.search.*` fr/en. CSS dans `themes/search-source.css` (nouveau, **pas `base.css`**) : surlignage des correspondances, panneau.

### Vue source HTML (ui)
- `components/source-view.ts` : widget `source` : bascule la zone de contenu en `<textarea class="aster-source">` contenant `getHTML()` formaté (indentation simple par balises de bloc), retour → `setHTML(textarea.value)`. Pendant la vue source, la toolbar est désactivée sauf le bouton source (`aria-pressed`). Ajouter `source` au preset `full`.
- `createAster` : exposer `instance.toggleSource()` et `instance.isSourceView()` dans `AsterInstance` (ajout **additif** au type `types.ts`).

### Plein écran (ui)
- `createAster` : `instance.setFullscreen(boolean)` / `isFullscreen()` : ajoute `aster--fullscreen` sur `.aster` (position fixed, inset 0, z-index), Échap quitte. Widget `fullscreen` dans la toolbar (`aria-pressed`). Ajouter au preset `full`.

### Tests
Core : recherche (matches, casse, next/previous cyclique, replace courant, replaceAll, clear, décorations présentes dans `view.dom`), raccourci `Mod-f`. UI : panneau (ouverture, saisie → `setSearchQuery`, boutons), vue source (bascule, contenu, retour avec modification, toolbar désactivée), plein écran (classe, Échap). Couvertures maintenues (core ≥ 75 %, ui ≥ 70 %).

## Périmètre

✅ `packages/core/src/extensions/search*.ts`, `packages/core/src/commands/search.ts` (+ enregistrement dans `commands/standard.ts` et `extensions/aster-extensions.ts` : lignes additives), `packages/core/src/index.ts` (exports), `packages/ui/src/components/search-panel*.ts`, `source-view*.ts`, `fullscreen*.ts`, `packages/ui/src/create-aster.ts`, `packages/ui/src/types.ts` (additif), `toolbar/widgets.ts`, `toolbar/presets.ts`, `i18n/ui-fr.ts`, `ui-en.ts`, `packages/core/src/i18n/fr.ts`, `en.ts`, `packages/ui/themes/search-source.css`, `packages/ui/src/index.ts`.
❌ `api/`, `base.css`, `images-tables.css`, `package.json`, `tsconfig*`, `word`, `angular`, `apps`, `docs`. Aucune dépendance.

## Points d'attention

TS strict, zéro `any`, JSDoc FR, i18n, outil Write, pas de `\u00a0` littéral. Lire `node_modules/@tiptap/pm/state` et `view` pour `Plugin`, `PluginKey`, `DecorationSet`. Vérification : `npx prettier --write packages/core packages/ui`, `npx eslint packages/core packages/ui`, `npm run typecheck -w packages/core -w packages/ui`, `npm run test:coverage -w packages/core`, `npm run test:coverage -w packages/ui`.

## Ordre de sacrifice

Plein écran, puis remplacement (garder la recherche), puis formatage de la vue source.

## Rapport attendu

Structure imposée `## Rapport Lot L7`.
