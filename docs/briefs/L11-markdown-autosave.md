# Brief — Lot L11 : markdown, autosave, caractères spéciaux, impression (`core` + `ui`)

> Rédigé à 23:58. Cible 1h30. Should n° 7 et 9, Could n° 1 du cahier des charges.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`, 0.2.0+. Lire `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/STRATEGIE_TESTS.md`, `packages/core/src/api/**`, `packages/core/src/editor/aster-editor.ts`, `packages/core/src/index.ts`, `packages/ui/src/create-aster.ts`, `types.ts`, `toolbar/widgets.ts`, `toolbar/presets.ts`, `components/dropdown.ts`, `testing/mock-editor.ts`. Tiptap 3 core embarque un sérialiseur/parseur markdown (`@tiptap/core` exporte `createBlockMarkdownSpec`, `createInlineMarkdownSpec`, `renderNestedMarkdownContent`… et `Editor` expose `getMarkdown()`/`setContent(markdown, { contentType: 'markdown' })` selon la version : **vérifie dans `node_modules/@tiptap/core/dist/index.d.ts`** ce qui existe réellement avant de choisir). Si Tiptap 3.31 fournit nativement `editor.getMarkdown()` et le parsing markdown via `contentType`, utilise-le ; sinon écris un convertisseur minimal maison (titres, paragraphes, gras/italique/code, listes imbriquées, liens, images, citations, code blocks, hr, tables GFM).

## Lot

### Markdown (core)

- `packages/core/src/markdown/` : `htmlToMarkdown(html, parse?)` et `markdownToHtml(md)` **ou** méthodes `editor.getMarkdown()` / `editor.setMarkdown(md, emit?)` ajoutées à l'implémentation (le contrat `AsterEditor` est figé : expose-les comme fonctions exportées `getMarkdown(editor)` / `setMarkdown(editor, md)` dans `packages/core/src/markdown/index.ts`, ré-exportées par `index.ts`). Tests d'aller-retour sur un document complet.

### Autosave (core)

- `packages/core/src/extensions/autosave.ts` : `createAutosave(editor, { interval: 2000, onSave: (html) => Promise<void> | void, debounce?: boolean })` retourne `{ flush(), destroy(), isDirty() }`. Sauvegarde après inactivité (`debounce`) ou à intervalle fixe, uniquement si le contenu a changé depuis la dernière sauvegarde, `flush()` force, `destroy()` sur `editor.on('destroy')`. Tests avec `vi.useFakeTimers()`. Export dans `index.ts`. Pas de modification de `AsterOptions` (contrat figé) : fonction compagnon.

### Caractères spéciaux et emojis (ui)

- `components/special-chars.ts` : widget `specialChars` : dropdown avec onglets « Symboles » (`→ ← ↑ ↓ … – — « » € £ ¥ © ® ™ ° ± × ÷ ≠ ≤ ≥ ∞ § ¶ †`), « Emojis » (20 courants), clic → `editor.tiptap.chain().focus().insertContent(char).run()`. Clés `ui.specialChars.*`. Ajout au preset `full`.

### Impression (ui)

- `components/print.ts` : widget `print` : ouvre `window.open('', '_blank')`, écrit un document HTML avec `getHTML()` et la feuille de contenu minimale (copie des règles `.aster-content` de `base.css` en version imprimable inline, ou `@media print` dans `search-source.css`… non : crée `themes/print.css` nouveau fichier), puis `print()`. En jsdom, `window.open` est mocké dans le test. Ajout au preset `full`.

### CSS

`packages/ui/themes/print.css` (nouveau) uniquement. L'orchestrateur l'ajoute à `aster.css`.

## Périmètre

✅ `packages/core/src/markdown/**`, `packages/core/src/extensions/autosave*.ts`, `packages/core/src/index.ts` (lignes additives), `packages/ui/src/components/special-chars*.ts`, `print*.ts`, `toolbar/widgets.ts`, `toolbar/presets.ts` (ajout au groupe final de `full`), `i18n/ui-fr.ts`, `ui-en.ts`, `packages/ui/src/index.ts`, `packages/ui/themes/print.css`. ❌ `api/`, `create-aster.ts`, `base.css`, autres CSS, `word`, `angular`, `apps`, `docs`. Aucune dépendance.

## Points d'attention

TS strict, zéro `any`, JSDoc FR, outil Write, pas de `\u00a0` littéral (utilise `String.fromCharCode` pour l'espace insécable s'il est dans la liste des caractères spéciaux). Tests : `cd packages/core && npx vitest run --coverage`, `cd packages/ui && npx vitest run --coverage`. `npx vitest run -w` est le mode watch, ne l'utilise pas.

## Ordre de sacrifice

Impression, puis emojis, puis `setMarkdown` (garder `getMarkdown`).

## Rapport attendu

Structure imposée `## Rapport Lot L11`.
