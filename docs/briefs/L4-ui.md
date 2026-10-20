# Brief — Lot L4 : `@aster-editor/ui`, toolbar vanilla, composants et thèmes

> Envoyé à 22:52 à l'agent `a5e66721`. Cible 2h30.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`, tout installé. Lire `CLAUDE.md`, `docs/ARCHITECTURE.md` (ui, théming, contrat), `docs/STRATEGIE_TESTS.md`, tous les fichiers de `packages/core/src/api/`, `packages/core/src/i18n/en.ts`. Remplacer les stubs `types.ts`, `toolbar/create-toolbar.ts`, `create-aster.ts`, `index.ts` en gardant les noms exportés. L1 implémente `createEditor` en parallèle, le stub lève : coder contre l'interface `AsterEditor`, tests avec un mock complet dans `src/testing/mock-editor.ts`, `createEditor` mocké via `vi.mock` pour `createAster`.

## Lot

UI vanilla TypeScript, sans framework ni Web Components, variables CSS, accessible :

- `toolbar/create-toolbar.ts` : `role="toolbar"`, un groupe par `ToolbarGroup`, résolution preset / tableau / `false`, items chaîne, bouton, dropdown, widget ; item inconnu ignoré avec `console.warn` ; abonnement `selectionChange`/`readOnlyChange`/`localeChange` → `update()` (`aria-pressed`, `disabled`, libellés) ; `destroy` se désabonne ; clic → `run` puis `focus`.
- `toolbar/presets.ts` : `full`, `standard`, `minimal`.
- `components/` : `button`, `dropdown` (Échap, clic extérieur, flèches, `aria-haspopup`/`aria-expanded`), `tooltip` (libellé + raccourci lisible `Ctrl+B`/`⌘B`), `table-grid-picker` (grille 10×8 → `table.insert`, menu `table.*` dans une table), `link-dialog` (URL, nouvel onglet, OK/Annuler/Supprimer, préremplissage via `getAttributes('link')`), `image-dialog` (URL + alt, fichier → `image.upload`), `color-picker` (palette 20 + aucune), `heading-menu` (Paragraphe + Titre 1..6, libellé courant), `font-menu` (`fontFamily`, `fontSize`).
- `icons/` : SVG inline maison MIT, 20×20 `currentColor`, `getIcon(name)` avec fallback, nom = id avec `.` → `-`.
- `i18n/ui-fr.ts`, `ui-en.ts` : clés `ui.*`, enregistrées au montage via `editor.i18n.addTranslations`.
- `create-aster.ts` : `<div class="aster" data-theme>` + toolbar + contenu, `createEditor` du core, toolbar par défaut `standard`, thème `light`, `setTheme`, `destroy`.
- `themes/base.css` (structure, composants, mise en forme du contenu `.ProseMirror`, placeholder, `.selectedCell`, focus), `light.css`, `night.css` (variables `--aster-*` seulement, contraste AA), `aster.css` (imports).

## Périmètre

✅ `packages/ui/src/**`, `packages/ui/themes/**`. ❌ tout le reste, aucune dépendance.

## Points d'attention

TS strict, zéro `any`, JSDoc FR, pas d'`innerHTML` avec données utilisateur, classes `aster-` BEM léger, a11y complète (roving tabindex, flèches, Home/End, `aria-label`, `aria-pressed`). Tests jsdom listés (presets, états, clic, clavier, dropdown, link dialog, table grid, locale, destroy, `createAster`). Commandes : `npx prettier --write packages/ui`, `npx eslint packages/ui`, `npm run typecheck -w packages/ui`, `npm run test:coverage -w packages/ui` (seuil 70 %).

## Temps et repli

2h30. Sacrifier dans l'ordre : `font-menu`, `color-picker`, menu contextuel de table, tooltip DOM → `title` natif.

## Rapport attendu

Structure imposée (voir `docs/BRIEF_AGENT.md`).
