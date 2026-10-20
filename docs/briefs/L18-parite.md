# Brief — Lot L18 : parité d'usage avec CKEditor (`core` + `ui`)

> Session 2, vague 2. Envoyé après intégration de L13/L14. Cible 2h30. Trois sous-lots indépendants, à rendre dans l'ordre ; chacun peut être sacrifié seul.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION2.md`, `packages/core/src/api/**`, `packages/ui/src/components/dropdown.ts`, `link-dialog.ts`, `image-dialog.ts`, `variable-suggestion.ts` (panneau flottant positionné au curseur, modèle pour la bulle et le menu `/`), `table-context-menu.ts` (clamp viewport), `toolbar/widgets.ts`, `create-aster.ts`, `testing/mock-editor.ts`. `@tiptap/suggestion` et `@floating-ui/dom` sont installés.

## Sous-lot A — Bulles contextuelles (`ui`)

- `components/link-bubble.ts` : quand la sélection est dans un lien (`tiptap.isActive('link')`), bulle flottante sous le lien : URL tronquée cliquable (ouvre dans un nouvel onglet), boutons Modifier (ouvre le dialogue de lien existant ou un mini-champ inline), Supprimer (`link.unset`). Positionnée avec `@floating-ui/dom` (`computePosition`, `flip`, `shift`), re-positionnée sur `selectionChange`, cachée hors lien, en lecture seule, et en vue source.
- `components/image-bubble.ts` : image sélectionnée (`isActive('image')`) → bulle au-dessus : alignement gauche/centre/droite (`image.setAttributes { align }`), Modifier (émet `aster:image-edit` ou ouvre le dialogue), Supprimer (`deleteSelection` via `tiptap`), largeur 25/50/100 % (en px depuis `contentElement.clientWidth`).
- Montées par `createAster` (options additives `linkBubble?: boolean`, `imageBubble?: boolean`, défaut `true`), détruites avec l'instance. CSS dans `themes/bubbles.css` (nouveau).

## Sous-lot B — Menu `/` (`ui`)

- `components/slash-menu.ts` : `Suggestion` char `/` en début de bloc vide (`startOfLine: true`), panneau filtrable : Paragraphe, Titre 1-3, Liste à puces, Liste numérotée, Liste de tâches, Citation, Bloc de code, Séparateur, Tableau 3×3, Image (ouvre le dialogue), Lien, Variable (ouvre la suggestion de variable), Saut de page (insère `<hr data-page-break>` si le schéma l'accepte ; sinon documente). Chaque entrée : icône, libellé i18n, raccourci affiché. Sélection → `commands.run(...)` après suppression du `/texte`. Option `slashMenu?: boolean` (défaut `true`) dans `createAster`.

## Sous-lot C — Sommaire et format painter

- `core/extensions/outline.ts` : `getOutline(editor): readonly { level, text, pos, id }[]` (titres), `scrollToHeading(editor, pos)`, ids stables `aster-h-<n>` posés en attribut `id` sur les titres (sérialisés dans `getHTML`, parsés en entrée). `ui/components/outline-panel.ts` : widget `outline` : dropdown listant les titres, clic → sélection + `scrollIntoView`. Ajouté au preset `full`.
- `core/commands/format-painter.ts` : `formatPainter.copy` (mémorise les marques de la sélection et l'alignement/bloc) et `formatPainter.paste` (applique à la sélection), ids ajoutés hors `STANDARD_COMMAND_IDS` (comme `search.*`), raccourcis `Mod-Shift-c` / `Mod-Shift-v`. Widget `formatPainter` (bouton à état : actif = presse-papier de format chargé, un clic applique puis vide, double-clic verrouille). Preset `full`.

## Périmètre

✅ `packages/ui/src/components/{link-bubble,image-bubble,slash-menu,outline-panel,format-painter-button}*.ts`, `toolbar/widgets.ts`, `toolbar/presets.ts`, `create-aster.ts` (ajouts), `types.ts` (additif), `i18n/ui-*.ts`, `icons/index.ts` (+ icônes), `index.ts`, `themes/bubbles.css` (nouveau) ; `packages/core/src/extensions/outline*.ts`, `commands/format-painter*.ts`, `commands/standard.ts` (ligne additive), `index.ts`, `i18n/fr.ts` / `en.ts` (clés additives). ❌ `api/**`, `word`, `angular`, autres CSS.

## Tests

ui : bulle de lien (apparition/disparition sur `selectionChange` du mock, actions), bulle d'image, menu `/` (filtrage pur + sélection → `run`), sommaire, format painter ; `createAster` options off/on ; `themes.spec.ts` inclut `bubbles.css`. core : `getOutline`, ids stables et idempotence `setHTML(getHTML())`, format painter copy/paste (marques + bloc), raccourcis. Couvertures maintenues, tests existants verts (`cd packages/x && npx vitest run --coverage`, jamais `-w`).

## Pièges

Outil Write ; pas de `\u00a0` ; `verbatimModuleSyntax` ; zéro `any` ; `mousedown` neutralisé sur les boutons ; les bulles ne doivent pas voler le focus ; lire `node_modules/@floating-ui/dom/dist/floating-ui.dom.d.ts`.

## Rapport attendu

`## Rapport Lot L18` : Fait par sous-lot / Non fait / Décisions / Blocages / Propositions de contrat / Tests / Fichiers / Points à vérifier (classes CSS, clés, exports).
