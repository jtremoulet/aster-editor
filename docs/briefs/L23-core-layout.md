# Brief — Lot L23 : mise en page dans `core` (attributs de paragraphe, marques de run, listes, tableaux, vue page)

> Session 3, vague 1. Cible 2h. Quatre sous-lots dans l'ordre ; chacun est intégrable seul.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION3.md`, **`packages/core/src/api/layout.ts` (contrat figé, sérialisation HTML exacte)**, `api/commands.ts` (`paragraph.setLayout` / `paragraph.unsetLayout` déjà déclarés), `api/options.ts` (`pageView`), `extensions/aster-extensions.ts`, `extensions/variable.ts` (modèle d'extension avec attributs et `parseHTML`/`renderHTML`), `extensions/image.ts` (attributs `width`/`align` avec parse et render de `style`), `commands/standard.ts` (enregistrement des commandes), `editor/aster-editor.ts`, `i18n/fr.ts` / `en.ts`, `testing/mount.ts`. Lire les types Tiptap installés : `node_modules/@tiptap/core`, `@tiptap/extension-text-style` (`TextStyleKit`, attributs `fontFamily`, `fontSize`, `color`, `backgroundColor`, `lineHeight`), `@tiptap/extension-list` (`OrderedList` : attributs `start`, `type`), `@tiptap/extension-table` (`TableKit`, `Table`, `TableCell`, `TableHeader` : `addAttributes` extensible via `.extend`).

## Sous-lot A — `ParagraphLayout` (extension `core/src/extensions/paragraph-layout.ts`)

- Extension globale (`addGlobalAttributes`) qui ajoute à `paragraph` et `heading` les attributs de `ParagraphLayoutAttrs`, défaut `null`. `parseHTML` lit le `style` inline (`line-height`, `margin-top/bottom/left/right`, `text-indent`, `border-top/right/bottom/left` et `border-*` de type `between` via `data-border-between`, `background-color`) et `data-docx-style`, `data-keep-next`, `data-page-break-before`. `renderHTML` produit **exactement** la sérialisation du contrat (ordre des déclarations, `pt` avec au plus deux décimales, couleurs en `#rrggbb` minuscules), en fusionnant avec le `style` que `TextAlign` pose déjà (`text-align` vient **en premier**, puis les déclarations de mise en page). Un attribut absent n'émet rien.
- `lineHeight` (multiple) vs `lineHeightPt` : si les deux sont présents, `lineHeightPt` l'emporte au rendu ; au parse, `line-height: 14pt` → `lineHeightPt`, `line-height: 1.15` → `lineHeight`.
- Commandes `paragraph.setLayout` (fusion d'attributs sur chaque `paragraph`/`heading` de la sélection, `null` efface) et `paragraph.unsetLayout` (liste d'attributs ou tout), enregistrées dans `STANDARD_COMMAND_IDS` (déjà déclarés dans l'API), `canRun` vrai si la sélection contient un bloc texte éditable. Raccourcis : aucun. Clés i18n `command.paragraph.setLayout` / `unsetLayout` (fr, en).
- **Idempotence stricte** : `setHTML(getHTML())` conserve chaque attribut ; tests sur chaque attribut seul et sur le cumul, y compris avec `text-align` et un `<h2>`.
- `getText()` et `getHTML({ variables: 'resolve' })` inchangés.

## Sous-lot B — Marques de run

- `TextStyleKit` étendu (ou `TextStyle.extend`) avec `letterSpacingPt` (`letter-spacing: 1pt`), `caps` (`text-transform: uppercase` pour `all`, `font-variant: small-caps` pour `small`), `docxRunStyle` (`data-docx-run-style`), conformément à `RunLayoutAttrs`. Commandes additives hors `STANDARD_COMMAND_IDS` (comme `search.*`) : `text.setLetterSpacing { pt }`, `text.setCaps { caps }`, `text.unsetCaps` ; i18n.
- `Underline` et `Strike` étendus avec un attribut `decorationStyle: DecorationStyle | null` rendu en `style="text-decoration-style: double"` et parsé depuis ce style (et depuis `text-decoration: underline double`). Idempotence.

## Sous-lot C — Listes, tableaux, images

- `OrderedList` : attributs `type` (déjà Tiptap, vérifier le parse de `type="a"`), `start`, `docxNumId` (`data-docx-num-id`). `BulletList` : `bullet` (`data-bullet`), `docxNumId`. `ListLayoutAttrs` du contrat.
- `Table` : `width` (`style="width: 100%"` ou `width: 450pt`), `borders` (`BlockBorder[]` → `border-top: 1pt solid #000000`…), `docxStyle` (`data-docx-style`). `TableCell` et `TableHeader` : `borders`, `shading` (`background-color`), `verticalAlign` (`vertical-align`), `paddingPt` (`padding: 2pt 4pt 2pt 4pt`). Ne casse pas `colwidth` ni le redimensionnement. Le normaliseur de sortie (`html/normalize-output.ts`) retire `min-width` et `colgroup` : vérifie qu'il laisse tes `style` intacts (il filtre règle par règle).
- Image : rien de nouveau (déjà `width`, `align`) ; vérifie seulement que `height` en `style` est conservé s'il est présent, sinon ajoute l'attribut `height`.
- CSS : rien dans `core` (les `style` inline suffisent), mais `getHTML` doit sortir des styles que le navigateur applique tel quel.

## Sous-lot D — Vue page

- `AsterOptions.pageView` : `true` ou `PageViewOptions`. Quand actif, l'éditeur pose sur son hôte la classe `aster--page-view` et les variables CSS `--aster-page-width`, `--aster-page-height`, `--aster-page-margin-top/right/bottom/left` (en `mm`) calculées depuis `layout.page` (formats nommés : A4 210×297, A3 297×420, A5 148×210, Letter 215,9×279,4, Legal 215,9×355,6 ; orientation paysage inverse ; marges 25,4 mm par défaut), et rend les en-têtes et pieds `default` dans deux conteneurs `div.aster-page-header` / `div.aster-page-footer` (`innerHTML` **assaini** : texte et balises inline/bloc simples uniquement, jamais de script ni d'attribut `on*`, réutilise la sanitization existante si le core en a une, sinon un filtre allowlist minimal) avant et après `contentElement`. Méthodes `editor.setPageView(options | false)` et `editor.getLayout(): DocumentLayout | null` **proposées dans ton rapport** (pas dans `api/`, implémente-les sur `AsterEditor` interne en les marquant « hors contrat »). La feuille CSS est dans `ui` (L26) ; `core` ne pose que classes, variables et conteneurs.
- `setReadOnly` ne touche pas à la vue page ; `destroy` retire les conteneurs.

## Périmètre

✅ `packages/core/src/extensions/paragraph-layout*.ts`, `extensions/run-layout*.ts`, `extensions/list-layout*.ts`, `extensions/table-layout*.ts`, `extensions/page-view*.ts`, `extensions/aster-extensions.ts`, `commands/layout*.ts`, `commands/standard.ts` (lignes additives), `editor/aster-editor.ts` (additif), `editor/create-editor.ts` (additif), `i18n/fr.ts`, `i18n/en.ts`, `index.ts` (exports additifs), specs correspondantes. ❌ `api/**` (propositions dans le rapport), `ui`, `word`, `angular`.

## Tests

Par sous-lot, avec `mountEditor` : parse → attrs, attrs → render exact (chaîne complète attendue), idempotence `setHTML(getHTML())`, commandes (`run`, `canRun`, `null` efface), `text-align` + layout combinés, cellules avec bordures et fond, listes `type`/`start`/`bullet`/`docxNumId`, vue page (classe, variables CSS, conteneurs, assainissement : `<script>` et `onclick` retirés, `destroy`). Compteurs : `STANDARD_COMMAND_IDS` passe à 52, tests i18n fr = en. Couverture maintenue, `cd packages/core && npx vitest run` (jamais `-w`).

## Pièges

Outil Write ; pas de `\u00a0` ; `verbatimModuleSyntax` ; zéro `any` ; attributs ProseMirror : `default: null` et `renderHTML` qui retourne `{}` quand l'attribut est `null` ; `mergeAttributes` de Tiptap concatène les `style` (vérifie l'ordre et l'absence de doublon de `;`) ; `getHTML` passe par `normalizeOutputHtml` (cache par identité de document). Un agent ne lance ni n'arrête de serveur.

## Rapport attendu

`## Rapport Lot L23` : Fait par sous-lot / Non fait / Décisions / Blocages / Propositions de contrat (`setPageView`, `getLayout`, commandes `text.*`) / Tests (compteurs avant → après) / Fichiers / Points à vérifier (chaînes HTML exactes produites, pour L24-L25 et L27).
