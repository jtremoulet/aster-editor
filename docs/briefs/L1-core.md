# Brief — Lot L1 : `@aster-editor/core`, moteur et commandes

> Envoyé à 22:52 à l'agent `af4dfa72`. Cible 2h30.

## Contexte

Monorepo `C:\workspace\aster-editor`, branche `develop`, tout installé, `npm run check` vert. Lire `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/STRATEGIE_TESTS.md`, puis tous les fichiers de `packages/core/src/api/` : contrat figé, jamais modifié par l'agent. Aucune commande git modifiant l'état. Agents parallèles dans `packages/word` et `packages/ui`.

## Lot

Implémenter `createEditor(options): AsterEditor` dans `packages/core/src/` hors `api/` :

- `editor/` : fabrique `AsterEditor`, émetteur typé, cycle de vie, sérialisation (`setHTML(html, emit=false)` sans `change`, via `setContent(content, { emitUpdate })` v3), focus, lecture seule, destroy.
- `commands/` : `CommandRegistry` + toutes les commandes de `STANDARD_COMMAND_IDS` par fichier de domaine ; `labelKey = command.<id>`, `icon = id` avec `.` → `-`, raccourcis listés (`Mod-b`, `Mod-i`, `Mod-u`, `Mod-Shift-s`, `Mod-e`, `Mod-Shift-h`, `Mod-Alt-1..6`, `Mod-Shift-7/8`, `Mod-k`, `Mod-z`, `Mod-Shift-z`/`Mod-y`, `Mod-a`) ; `canRun` faux en lecture seule ; registre tolérant ; `disabledCommands` retire commande et raccourci ; `options.commands` custom.
- `extensions/` : assemblage Tiptap v3 (StarterKit avec UndoRedo/Link/Underline/ListKeymap inclus, `TableKit`, `TextStyleKit`, `Placeholder`/`CharacterCount` de `@tiptap/extensions`, `ListKit`/`TaskList`/`TaskItem`, TextAlign, Image, Subscript, Superscript, Highlight). Extensions maison : `link-safety.ts` (protocoles autorisés, rejet `javascript:`/`data:`, `rel` sur `_blank`, autolink), `image-upload.ts` (collage/drop de fichiers, hook `upload` avec `uploadStart`/`uploadDone`, repli base64, rejet non-image), `paste-pipeline.ts` (chaîne `pasteTransformers` via `transformPastedHTML`), `shortcuts.ts`.
- `i18n/` : `createI18n`, interpolation `{param}`, repli `en` puis clé, `addTranslations`, `setLocale` + `localeChange`.
- `html/` : helpers de stabilité de `getHTML`.
- `index.ts` : exports publics complets.

Le core crée `.aster-content` dans `element`, `contentElement` = `.ProseMirror`, `injectCSS: false`. `setHTML(getHTML())` idempotent.

## Périmètre

✅ `packages/core/src/**` sauf `api/**`. ❌ tout le reste du repo, aucune dépendance.

## Points d'attention

TS 6.0 strict, `verbatimModuleSyntax`, zéro `any`, `explicit-module-boundary-types`, JSDoc FR, i18n obligatoire. Commandes de vérification : `npx prettier --write packages/core`, `npx eslint packages/core`, `npm run typecheck -w packages/core`, `npm run test:coverage -w packages/core` (seuil 75 %).

## Définition de fini

Montage/destruction sans fuite ; toutes les commandes testées (`run`, `isActive`, `canRun` lecture seule) ; idempotence `setHTML(getHTML())` ; `setHTML(html, false)` silencieux ; `LinkSafety` ; `pasteTransformers` chaînés ; upload d'image avec événements et repli ; i18n complet ; événements dans l'ordre ; couverture ≥ 75 %.

## Temps et repli

2h30. À 70 % du temps sans 70 % du fini : sacrifier dans l'ordre `text-style`, `taskList`, `image.setAttributes`, `table.toggleHeaderColumn`.

## Rapport attendu

Structure imposée : Fait / Non fait et pourquoi / Décisions prises / Blocages rencontrés / Propositions de changement de contrat / Tests / Fichiers créés ou modifiés / Points à vérifier par l'orchestrateur.
