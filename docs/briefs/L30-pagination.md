# Brief — Lot L30 : pagination approximative dans la vue page (`core` + `ui`)

> Session 3, vague 2, demande de Joris. Envoyé après intégration de L23 et L26. Cible 2h. Un seul agent, deux paquets, fichiers nouveaux uniquement (plus quelques lignes additives listées).

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION3.md` (section « Ajouts en cours de session » : ce que la pagination promet et ne promet pas), `packages/core/src/api/layout.ts` (`PageViewOptions`, `DocumentLayout`), `packages/core/src/extensions/page-view*.ts` (vue page livrée par L23 : classe `aster--page-view`, variables `--aster-page-*`, conteneurs d'en-tête et de pied, méthodes `setPageView` / `getLayout`), `packages/ui/themes/page.css` (feuille, bureau, coupure `hr[data-page-break]`), `packages/core/src/extensions/outline.ts` (modèle de plugin ProseMirror avec décorations), `node_modules/@tiptap/pm` (`Decoration.widget`, `DecorationSet`, `view.domAtPos`, `view.coordsAtPos`), `packages/ui/testing/mock-editor.ts`.

## Principe

Pagination **approximative**, purement visuelle, qui ne modifie jamais le document :

1. Un plugin ProseMirror `pagination` (core) mesure, après chaque `update` et au `resize` de l'hôte (débouncé, `requestAnimationFrame`, jamais synchrone dans `dispatch`), la hauteur rendue de chaque bloc de premier niveau (`view.nodeDOM(pos).getBoundingClientRect()`), et cumule jusqu'à la **hauteur utile** d'une page = hauteur de page − marge haute − marge basse (depuis les variables `--aster-page-*` lues sur l'hôte, en px via `getComputedStyle` sur un élément témoin de `1mm`, ou conversion 96/25,4).
2. Là où un bloc ferait déborder la page, une **décoration widget** `div.aster-page-gap` est insérée avant ce bloc (coupure de feuille, numéro de page suivante). Un `hr[data-page-break]` explicite force la coupure et remet le compteur à zéro. Un tableau n'est jamais coupé : s'il déborde, il passe entier à la page suivante (approximation documentée) ; un bloc plus haut qu'une page occupe sa page seul.
3. Le pied de page affiché (`div.aster-page-footer`) reçoit un `data-page-count` et l'en-tête/pied de chaque gap affiche `Page n / N` via une classe et un attribut (`data-page-number`), texte i18n (`core` : clés `pageView.page`, `pageView.of`). Aucune promesse d'exactitude Word : la doc le dit.
4. Désactivable : `PageViewOptions.pagination?: boolean` (**proposition de contrat**, à implémenter en lisant l'option si présente, défaut `true` quand la vue page est active), et inactif hors vue page (`aster--page-view` absent : aucune mesure, aucune décoration).
5. Performance : un document de 200 pages (fixture générée en test, 4 000 paragraphes) se pagine en moins de 100 ms après le premier rendu, et une frappe ne relance qu'une mesure débouncée (≥ 150 ms). Les mesures sont faites en lot (lecture seule du DOM puis écriture), pas bloc par bloc entrelacé.

## Périmètre

✅ `packages/core/src/extensions/pagination*.ts` (plugin, mesure, calcul pur `paginate(heights, pageHeight, breaks)` testable sans DOM), `extensions/aster-extensions.ts` (une ligne), `extensions/page-view.ts` (branchement additif : activer/désactiver le plugin avec la vue page), `i18n/fr.ts` / `en.ts` (clés additives), `index.ts` (export additif) ; `packages/ui/themes/page.css` (section `.aster-page-gap`, numéro de page, impression : `break-before: page` sur le gap), `packages/ui/src/i18n/ui-*.ts` si un libellé UI est nécessaire, `packages/ui/src/components/page-layout-dialog.ts` (case « Pagination » additive) + spec. ❌ `api/**` (proposition dans le rapport), `word`, `angular`, le reste de `core` et `ui`.

## Tests

- `paginate()` pur : blocs qui tiennent, bloc qui déborde, bloc plus haut qu'une page, saut explicite, tableau entier, compteur de pages.
- Plugin en jsdom : `getBoundingClientRect` mocké par bloc (jsdom rend 0) → décorations posées aux bons index, retirées quand la vue page est désactivée, aucune transaction émise, `change` non émis, `getHTML()` inchangé (les widgets ne sérialisent rien), `destroy` nettoie l'observer.
- Débounce et `ResizeObserver` (mock) ; i18n fr = en.
- `cd packages/core && npx vitest run`, `cd packages/ui && npx vitest run --coverage` (jamais `-w`), typecheck, eslint, prettier.

## Pièges

Outil Write ; pas de `\u00a0` ; `verbatimModuleSyntax` ; zéro `any` ; décorations **widget** uniquement (jamais de nœud dans le doc) ; `ResizeObserver` absent en jsdom et en SSR (garde) ; ne jamais mesurer pendant `dispatchTransaction` ; `view.nodeDOM` peut rendre `null` pour un nœud sans NodeView ; ne lance ni n'arrête de serveur (l'orchestrateur vérifie en navigateur).

## Rapport attendu

`## Rapport Lot L30` : Fait / Non fait / Décisions / Blocages / Propositions de contrat (`PageViewOptions.pagination`) / Mesures de performance / Tests (compteurs) / Fichiers / Points à vérifier en navigateur.
