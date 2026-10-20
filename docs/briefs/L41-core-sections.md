# Brief — Lot L41 : sections, tabulations, bordures et alignement de tableau dans `core`

> Session 4, vague 1. Cible 1h45. Quatre sous-lots dans l'ordre ; chacun est intégrable seul.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION4.md`, **`packages/core/src/api/layout.ts` (contrat figé : `SectionLayout`, `SectionBreakAttrs`, `TabAttrs`, `BlockBorder.spacePt`, `TableLayoutAttrs.align`)**, `extensions/page-break.ts` (modèle d'atome bloc avec attribut), `extensions/variable.ts` (modèle d'atome inline avec NodeView), `extensions/paragraph-layout.ts`, `layout-css.ts` (sérialisation des bordures), `table-layout.ts`, `page-view.ts` (`setPageView`, `getLayout`), `commands/layout.ts`, `html/serialize-html.ts`, `testing/mount.ts`. Types Tiptap dans `node_modules/@tiptap/core` (`Node.create` avec `atom: true`, `inline: true`, `group: 'inline'`, `selectable`).

## Sous-lot A — nœud `sectionBreak`

- `extensions/section-break.ts` : nœud bloc atomique `sectionBreak`, attribut `section` (entier ≥ 1), `parseHTML` sur `hr[data-section-break]`, `renderHTML` `<hr data-section-break="n">` ; `selectable: true`, `draggable: false` ; Backspace / Delete le suppriment comme un `horizontalRule`. Idempotence stricte. Le dernier bloc d'un document ne doit jamais être un `sectionBreak` : `TrailingNode` existant s'en charge ? vérifie, sinon complète.
- Commandes hors contrat (comme `search.*`) : `section.insertBreak` (insère un saut après le bloc courant, `section` = nombre de sauts avant + 1, et renumérote les suivants), `section.removeBreak`, `section.renumber` (utilitaire interne appelé après toute insertion/suppression, pour que `data-section-break` reste 1..n dans l'ordre). `getSections(editor): { from, to, section }[]` exporté (positions des blocs de chaque section).
- `getLayout()` / `setPageView({ layout })` : `layout.sections[n - 1]` fournit la mise en page de la section n ; sans `sections`, tout le document est la section 1 avec les champs de premier niveau. Expose `editor.getSectionLayout(sectionIndex)` (hors contrat) qui retombe sur le premier niveau.
- i18n `command.section.*` fr / en.

## Sous-lot B — nœud `tab`

- `extensions/tab.ts` : nœud inline atomique `tab`, attribut `stopPt` (`null` par défaut), `parseHTML` sur `span[data-tab]` (`data-stop="36pt"` → `stopPt`), `renderHTML` `<span data-tab=""></span>` ou `<span data-tab="" data-stop="36pt"></span>`, `NodeView` minimal : `span.aster-tab` avec `style="--aster-tab-stop: 36pt"` quand connu (la feuille `ui` fera le rendu ; ici une largeur de repli `min-width: 2em; display: inline-block`), `getText()` rend `\t`. Règle de saisie : la touche Tab dans un paragraphe insère un `tab` (sans casser l'indentation de liste : `Tab` dans une liste garde `sinkListItem`, `Tab` dans une cellule garde la navigation). Idempotence.
- Commande hors contrat `text.insertTab`.

## Sous-lot C — `spacePt` et `align`

- `layout-css.ts` / `paragraph-layout.ts` / `table-layout.ts` : `BlockBorder.spacePt` parsé depuis `padding-<côté>: Npt` et rendu juste après les `border-*` (ordre fixe top/right/bottom/left), uniquement pour les côtés ayant une bordure ; absent = non émis. Cellules : même règle mais `padding` composite existant (`paddingPt`) prime ; documente l'arbitrage.
- `TableLayoutAttrs.align` : attribut `align` sur `table`, `data-align="center"`, parsé aussi depuis `style="margin-left: auto; margin-right: auto"` (ancienne forme), rendu `data-align` seul ; CSS de repli dans la NodeView de table (`margin: 0 auto` pour `center`, `margin-left: auto` pour `right`).

## Sous-lot D — vue page par section

- `page-view.ts` : quand `layout.sections` existe, l'hôte garde les variables de la **section 1** ; chaque `sectionBreak` reçoit, via une décoration ou un attribut de sa NodeView, les variables CSS de la section suivante (`--aster-page-width`, `-height`, `-margin-*`) posées sur le `hr` lui-même, pour que L44 (`page.css` + pagination) change de feuille au saut. Les en-têtes / pieds affichés restent ceux de la section 1 (L44 gère les suivants). Documente la convention dans ton rapport (noms exacts).

## Périmètre

✅ `packages/core/src/extensions/section-break*.ts`, `tab*.ts`, `aster-extensions.ts` (lignes additives), `layout-css.ts`, `paragraph-layout.ts`, `table-layout.ts`, `page-view.ts` (additif), `editor/aster-editor.ts` (additif : `getSectionLayout`), `commands/layout.ts` ou `commands/sections.ts` (nouveau), `commands/standard.ts` (lignes additives), `i18n/fr.ts`, `en.ts`, `index.ts`, specs. ❌ `api/**`, `pagination*.ts` (L44), `ui`, `word`.

## Tests

Idempotence stricte de chaque forme (`<hr data-section-break="2">`, `<span data-tab=""></span>`, `data-stop`, `padding-*`, `data-align`), renumérotation après insertion / suppression, `getSections`, `getSectionLayout`, Tab dans paragraphe / liste / cellule, `getText()` avec tabulations, `getHTML({ variables: 'resolve' })` inchangé, sérialiseur verbatim sur les nouveaux nœuds. `cd packages/core && npx vitest run` (jamais `-w`), typecheck, eslint, prettier ; `cd packages/word && npx vitest run src/docx/reader/paragraphs.spec.ts` doit rester vert (idempotence des fixtures 11-13).

## Pièges

Outil Write ; pas de `\u00a0` ; `verbatimModuleSyntax` ; zéro `any` ; fichiers < 400 lignes ; un atome inline doit avoir `inline: true, group: 'inline', atom: true` ; ne lance ni n'arrête de serveur.

## Rapport attendu

`## Rapport Lot L41` : Fait par sous-lot / Non fait / Décisions / Blocages / Propositions de contrat / Convention des variables CSS par section (pour L44) / Chaînes HTML exactes produites (pour L42, L43) / Tests (compteurs) / Fichiers.
