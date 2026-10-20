# Brief — Lot L8bis : rafraîchissement de la documentation sur l'état final

> Rédigé à 01:00, envoyé après intégration de L9e. Cible 1h.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`, version 0.3.0 en cours de bump. Depuis la première passe de documentation (L8, écrite sur 0.1.0), ont été livrés : L5 Angular + démo, L6 images/tables avancées, L7 recherche/vue source/plein écran, L10 export .docx, L11 markdown/autosave/caractères spéciaux/impression, L12 e2e, et cinq lots de correctifs (L9a-e) issus de revues adverses qui ont changé des comportements documentés. **La doc décrit le code, pas les briefs** : chaque nom, option, classe CSS, clé i18n, export cité doit exister dans les sources. Méthode imposée (celle de L8) : typechecker tous les exemples contre les sources, compter programmatiquement commandes/icônes/variables/clés.

## Lot

Relire et mettre à jour, en lisant le code réel (`packages/*/src/index.ts` d'abord, puis les fichiers concernés) :

1. `README.md` racine : section Angular alignée sur `packages/angular/README.md` (inputs réels dont `ariaLabel`/`ariaLabelledBy`/`wordPaste`, outputs), statut du projet (ce qui est livré en 0.3.0 : liste complète), scripts (`playground`, `e2e`), tableau des paquets, compteurs (commandes standard + commandes `search.*`, icônes, tests).
2. `packages/core/README.md` : nouveaux exports (`Search`, `search.*`, `getMarkdown`/`setMarkdown`, `createAutosave`, `createImageExtension`, `EXTRA_SHORTCUT_BINDINGS`…), comportements changés par L9d (`setReadOnly` n'émet pas `change`, `setHTML(…, false)` hors historique et vide l'historique, `insertHTML` brut, `paragraph`/`heading` sans repli et jamais bascule, pas de table imbriquée, `clearFormatting` conserve les liens, `getText` un séparateur, erreurs après `destroy`, politique d'images `data:image/` et `blob:` seulement, `focus` synchrone en navigateur), image NodeView (`figure.aster-image`, `aster:image-edit`, `width`/`align`), tables redimensionnables.
3. `packages/ui/README.md` : relire après L9c (déjà partiellement à jour) ; vérifier presets (`full` = groupes réels), widgets (`heading`, `link`, `image`, `table`, `textColor`, `backgroundColor`, `fontFamily`, `fontSize`, `search`, `source`, `fullscreen`, `specialChars`, `print`), `createAster` méthodes (`toggleSource`, `isSourceView`, `setFullscreen`, `isFullscreen`), `images-tables.css`, `search-source.css`, `print.css`, variables (30) et test de contraste, a11y.
4. `packages/word/README.md` : relire après L9b/L9e (import `DocxInput`, sécurité du collage, export : `start`, numérotation, caractères de contrôle, NBSP, limites connues M-1/M-2).
5. `packages/angular/README.md` : relire après L9a (ariaLabel, remontage, `writeValue` idempotent, `setDisabledState` silencieux).
6. `docs/API_CORE.md` : JSDoc du contrat modifiée par L9a/L9d (`setHTML`, `setJSON`, `insertHTML`, `focus`, `ready`), `commands` sans `never`, doc `icon`/`shortcut`.
7. `docs/GUIDE_INTEGRATION.md` : ajouter export .docx, markdown, autosave, impression, e2e ; note Vite à froid (premier `importDocx` sur `ng serve` recharge la page) ; sécurité mise à jour (politique d'images, balises supprimées au collage).
8. `docs/THEMING.md` : classes ajoutées par L6/L7/L9c/L11 (`figure.aster-image*`, `.aster-search-*`, `.aster--source`, `.aster--fullscreen`, `.aster-dropdown__panel--flip`, `.aster-special-chars*`, `.aster-context-menu`), fichiers CSS multiples.
9. `docs/ARCHITECTURE.md` : structure réelle des dossiers (`markdown/`, `export/`, `e2e/`), pipeline export, décisions produit (pas de titre dans les listes, pas de table imbriquée), liste des CSS.
10. `CHANGELOG.md` : **ne pas toucher** (orchestrateur).

## Périmètre

✅ les 9 fichiers ci-dessus. ❌ tout fichier de code, `CHANGELOG.md`, `CLAUDE.md`, `docs/JOURNAL.md`, `docs/REX.md`, `docs/ROADMAP_NUIT.md`, `docs/briefs/`, `docs/BILAN.md`.

## Vérification

`npx prettier --write` puis `--check` sur les 9 fichiers ; exemples TypeScript typecheckés dans le scratchpad contre les sources via les `paths` de `tsconfig.base.json` (réutilise la méthode L8 : `readme-check/examples.ts` + tsconfig) ; compteurs vérifiés par script.

## Rapport attendu

`## Rapport Lot L8bis` : Fait / Écarts code-docs corrigés (liste) / Écarts code-docs restants ou décisions à prendre / Fichiers modifiés / Points à vérifier.
