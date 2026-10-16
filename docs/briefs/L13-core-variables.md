# Brief — Lot L13 : variables de document dans `@aster-editor/core`

> Session 2, vague 1. Cible 2h.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`, 0.3.0 + phase 0 de la session 2. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION2.md`, `docs/ARCHITECTURE.md`, puis **`packages/core/src/api/variables.ts`** (contrat figé des variables), `api/options.ts`, `api/editor.ts`, `api/events.ts`, `api/commands.ts` (ids `variable.insert` / `variable.remove` et leurs args), `editor/variable-store.ts` (magasin de base, à compléter), `editor/aster-editor.ts` (`getHTML(_options)` stub), `commands/variables.ts` (stubs), `commands/define.ts`, `extensions/aster-extensions.ts`, `extensions/image.ts` (exemple de NodeView vanilla), `extensions/search.ts` (exemple d'extension avec storage), `testing/mount.ts`, `i18n/fr.ts` (clés `command.variable.*`, `variable.unresolved`).

## Lot

1. **Nœud `variable`** (`extensions/variable.ts`) : inline, atomique, `selectable`, `draggable: false`, attrs `name` (obligatoire), `label` (optionnel). `parseHTML` : `span[data-aster-variable]` (`name` = attribut, `label` = `data-label`). `renderHTML` : `<span data-aster-variable="nom" data-label="Nom">{{nom}}</span>` — **le texte `{{nom}}` est dans le HTML** pour que `getHTML()` reste lisible hors éditeur et que `getText()` le contienne. NodeView vanilla : `<span class="aster-variable" data-name>` avec le libellé (ou le nom) et, si une valeur est connue, la valeur affichée (`aster-variable--resolved`, `title` = `{{nom}}`), sinon `aster-variable--unresolved` avec `title` = `t('variable.unresolved', { name })`. Les puces se rafraîchissent sur `variablesChange` (le NodeView s'abonne via `editor.on`, se désabonne dans `destroy`). Double-clic sur la puce → `CustomEvent('aster:variable-edit', { bubbles: true, detail: { pos, name } })` depuis `view.dom` (même pattern que `aster:image-edit`). Règle de saisie : taper `{{nom}}` dans le texte crée une puce (input rule, nom conforme à `isValidVariableName`). Collage de HTML contenant `{{nom}}` en texte brut → **pas** converti automatiquement (c'est le rôle du paquet `word` pour les sources Word) ; mais `setHTML` d'un `span[data-aster-variable]` → puce.
2. **Commandes** (`commands/variables.ts`) : `variable.insert { name, label? }` insère la puce à la sélection (remplace la sélection), `canRun` faux en lecture seule et si le nom est invalide ou si `allowUnknown === false` et nom non déclaré ; `variable.remove` supprime la puce sélectionnée ou celle sous le curseur, `canRun` = une puce est sélectionnée/au curseur, `isActive` idem.
3. **`VariableStore`** : garde `editor/variable-store.ts` et complète si besoin (ex. `allowUnknown` exposé via `list`/`insert`). `getNames()` doit lire les vrais nœuds. Vérifie que `setValues` provoque bien le rafraîchissement des puces.
4. **`getHTML({ variables: 'resolve' })`** : substitue chaque puce par sa valeur (texte échappé) ; sans valeur, laisse `{{nom}}` en texte brut. Mode `placeholders` (défaut) = sortie avec `span[data-aster-variable]`. Implémente aussi la fonction pure exportée `resolveVariablesHtml(html, values, options?)` dans `html/resolve-variables.ts` (parse HTML via `DOMParser` injectable, remplace les spans) et réutilise-la.
5. **`getText()`** : les puces rendent leur valeur si connue, sinon `{{nom}}`.
6. **Markdown** : `htmlToMarkdown` rend `{{nom}}`, `markdownToHtml` laisse `{{nom}}` en texte (la conversion en puce se fait par la règle de saisie ou par `word`). Tu peux toucher `markdown/*.ts` pour ça uniquement.
7. **Sérialisation JSON** : le nœud survit à `getJSON`/`setJSON`.
8. **Export public** (`index.ts`) : `Variable` (extension), `VARIABLE_EDIT_EVENT`, `resolveVariablesHtml`, `isValidVariableName`, `createVariableStore`, `VARIABLE_COMMANDS`.

## Périmètre

✅ `packages/core/src/extensions/variable*.ts`, `commands/variables*.ts`, `editor/variable-store*.ts`, `editor/aster-editor.ts` (uniquement `getHTML`, `getText` et le branchement du store/extension), `extensions/aster-extensions.ts` (ligne additive), `html/resolve-variables*.ts`, `markdown/*.ts` (variables seulement), `index.ts`, `i18n/fr.ts` / `en.ts` (clés additives). ❌ `api/**` (figé), tout le reste. Aucune dépendance (`@tiptap/suggestion` est installé mais réservé à `ui`).

## Tests (Vitest jsdom, `cd packages/core && npx vitest run --coverage`, jamais `-w`)

Parse/serialize/idempotence `setHTML(getHTML())` avec puces ; `getHTML({ variables: 'resolve' })` avec et sans valeurs, échappement (`<`, `&`) ; `resolveVariablesHtml` pur ; `getText` ; `variable.insert` (remplace la sélection, nom invalide refusé, `allowUnknown: false`) ; `variable.remove` ; règle de saisie `{{nom}}` ; `getNames`/`list`/`setValues` + rafraîchissement du NodeView (classe `--resolved`, texte) ; `resolve()` avec résolveur async ; `hasUnresolved` ; événement `variablesChange` ; `aster:variable-edit` au double-clic ; JSON ; markdown ; destruction sans fuite. Couverture ≥ 75 % maintenue, tous les tests existants (368) verts.

## Pièges connus

Outil Write pour écrire (pas de heredoc bash avec apostrophes) ; pas de `\u00a0` littéral ; `npx vitest run -w` = watch ; lire les types Tiptap dans `node_modules/@tiptap/core/dist/index.d.ts` (`Node.create`, `addNodeView`, `addInputRules`, `nodeInputRule`) ; `verbatimModuleSyntax` → `import type` ; zéro `any` ; JSDoc FR.

## Rapport attendu

`## Rapport Lot L13` : Fait / Non fait et pourquoi / Décisions prises / Blocages / Propositions de changement de contrat / Tests (avant → après) / Fichiers / Points à vérifier (dont les classes CSS du NodeView pour L14 : `aster-variable`, `--resolved`, `--unresolved`, `ProseMirror-selectednode`).
