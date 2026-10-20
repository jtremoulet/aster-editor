# 🏗️ Architecture — Aster Editor

> Comment les paquets s'emboîtent, quels contrats les séparent, et pourquoi. État 0.5.0 (session 3 : fidélité de mise en page Word).

## 🧩 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────┐
│ apps/demo (Angular 22)            e2e/ (Playwright)          │
├──────────────────────────────────────────────────────────────┤
│ @aster-editor/angular   <aster-editor> CVA, signals, DI,     │
│ gabarit importé, vue page, rapport de fidélité               │
├───────────────────────────┬──────────────────────────────────┤
│ @aster-editor/ui          │ @aster-editor/word               │
│ toolbar vanilla, widgets, │ importDocx (lecteur OOXML stylé  │
│ thèmes, page.css, menus,  │ ou mammoth), exportDocx (neuf ou │
│ bulles, suggestion {{,    │ greffé dans le gabarit),         │
│ menu /, mise en page      │ compareDocx, normalizeWordHtml   │
├───────────────────────────┴──────────────────────────────────┤
│ @aster-editor/core                                           │
│ createEditor, registre, extensions, variables, recherche,    │
│ sommaire, pinceau, mise en page (api/layout.ts), vue page,   │
│ pagination, sérialiseur verbatim, markdown, autosave, i18n   │
├──────────────────────────────────────────────────────────────┤
│ Tiptap 3  →  ProseMirror (@tiptap/pm)                        │
└──────────────────────────────────────────────────────────────┘
```

Sens des dépendances : `angular → ui, word, core` ; `ui → core` ; `word → core`. **Jamais l'inverse.** Le core ne connaît ni la toolbar ni Word, il expose juste des points d'extension (options, registre, événements DOM `aster:*`) et, depuis la session 3, le **contrat de mise en page** (`api/layout.ts`) que `word` écrit à l'import, relit à l'export, et que `ui` et `angular` affichent.

## 📦 Paquets

### `@aster-editor/core`

Responsabilités :

- `createEditor(options)` : instancie Tiptap avec le jeu d'extensions Aster, retourne un `AsterEditor`.
- **Registre de commandes** : chaque action éditable est une `AsterCommand` nommée, avec `run`, `canRun`, `isActive`, clé i18n, icône, raccourci. 52 commandes du contrat (`variable.insert` / `variable.remove`, `paragraph.setLayout` / `paragraph.unsetLayout` compris) + 6 commandes `search.*` + 2 commandes `formatPainter.*` + 3 commandes `text.*` = 63 au montage. La toolbar et le wrapper Angular ne parlent qu'au registre, jamais à Tiptap directement.
- **Extensions Aster** (`createAsterExtensions`, 28 entrées) : `StarterKit` sans `link`, `underline`, `strike` ni `horizontalRule`, `AsterStrike` / `AsterUnderline` (style de trait), `AsterHorizontalRule` (`<hr data-page-break>`), `Link` sécurisé par la politique (`createLinkExtension`), `Image` Aster avec `width`, `align`, NodeView redimensionnable et politique appliquée au parsing (`createImageExtension`), `Variable` (nœud inline atomique, NodeView lié au magasin, règle de saisie `{{nom}}`), tables redimensionnables étendues (`AsterTable`, `AsterTableCell`, `AsterTableHeader` : largeur, bordures, fonds, alignement vertical, marges, `colspan` / `rowspan` bornés), `TaskList`, `TextAlign`, `ParagraphLayout` (attributs de `ParagraphLayoutAttrs` sur `paragraph` et `heading`), `ListLayout` (`data-docx-num-id`, `data-bullet`, `data-docx-num-indent`), `Subscript`, `Superscript`, `AsterHighlight`, `TextStyleKit` + `AsterTextStyle` + `RunLayout` (espacement, casse, style de caractère, couleurs normalisées), `Placeholder`, `CharacterCount`, `Search` (décorations + storage), `Outline` (attribut `id` des titres), `Pagination` (décorations widget de coupure, inerte hors vue page), raccourcis Aster (`createShortcutsExtension`, priorité haute, commandes désactivées avalées). L'upload d'images et le pipeline de collage sont des `editorProps` (`createImageUploadProps`, `createPastePipelineProps`). Pas de sanitizer HTML dédié pour le corps : le schéma ProseMirror est le filtre, voir `docs/GUIDE_INTEGRATION.md` section sécurité ; les en-têtes et pieds de la vue page, injectés en `innerHTML` hors schéma, passent par `sanitizeHeaderFooterHtml` (liste blanche stricte).
- **Mise en page** (`api/layout.ts`, session 3) : un contrat partagé qui fige, pour chaque attribut (paragraphe, run, liste, tableau, cellule), sa **sérialisation HTML exacte** (`style` inline normalisé dans un ordre figé, `#rrggbb`, unités `pt`, attributs `data-docx-*` jamais interprétés), plus `DocumentLayout` (page, colonnes, police, langue, en-têtes et pieds) et `PageViewOptions`. Tout est additif et `null` par défaut : un document sans mise en page garde le HTML nu de 0.4.
- **Vue page et pagination** : `applyPageView` pose classe, variables CSS `--aster-page-*` et conteneurs d'en-tête / pied sur l'hôte ; `ui/themes/page.css` dessine. La pagination est un plugin ProseMirror qui **mesure** le DOM rendu et pose des **décorations widget**, jamais des nœuds : le document ne sait rien des pages, `getHTML()` non plus, et aucune transaction n'est émise. `setPageView` / `getLayout` vivent sur l'implémentation, hors interface (proposition de contrat différée).
- **Sérialiseur HTML verbatim** (`html/serialize-html.ts`) : `getHTML()` rend les `DOMOutputSpec` lui-même en posant `style` par `setAttribute`, parce que le `DOMSerializer` de ProseMirror passe par le CSSOM qui réécrit les styles (`rgb()`, raccourcis, ordre faux sous jsdom) et casserait l'idempotence du contrat. Même garde XSS que ProseMirror sur les specs venus des attributs.
- **Variables de document** : le magasin `editor.variables` (`createVariableStore`) porte déclarations, valeurs et résolveur ; les puces ne stockent que `name` et `label`, la valeur vit dans le magasin et le NodeView se rafraîchit sur `variablesChange`. `getHTML({ variables: 'resolve' })` délègue à `resolveVariablesHtml`, fonction pure réutilisable hors éditeur ; `getText()` rend la valeur ou `{{nom}}`. Le core ne convertit jamais un `{{nom}}` chargé ou collé : c'est le rôle de `word`.
- **i18n** : `t(key, params)` avec dictionnaires `fr` et `en` (70 clés), extensibles.
- **Événements** : émetteur typé, `on/off`, vidé à `destroy`. `variablesChange` s'ajoute aux événements de 0.3.0.
- **Sérialisation** : `getHTML` (`serializeDocumentHtml` verbatim puis `normalizeOutputHtml`, mis en cache par transaction), `setHTML`, `getJSON`, `setJSON`, `getText`, plus `getMarkdown` / `setMarkdown` en fonctions compagnons.
- **Fonctions compagnons** (le contrat `AsterOptions` / `AsterEditor` est figé) : `createAutosave(editor, options)`, `getMarkdown(editor)`, `setMarkdown(editor, md)`, `getSearchStorage(editor)`, `getOutline(editor)`, `scrollToHeading(editor, pos)`, `getFormatClipboard(editor)`, `resolveVariablesHtml(html, values)`.
- **Hooks d'extension** : `options.extensions` pour ajouter des extensions Tiptap, `options.commands` pour enregistrer des commandes custom, `options.pasteTransformers` pour chaîner des transformateurs de collage (c'est par là que `word` se branche), événements DOM `aster:search-open`, `aster:image-edit`, `aster:variable-edit` et `aster:format-painter-change` sur `editor.element` pour que `ui` ouvre ses panneaux et reflète l'état sans que le core la connaisse.

Structure :

```
packages/core/src/
├── api/              types publics figés en phase 0 : AsterEditor, AsterOptions, AsterCommand, AsterEvents, variables, toolbar, layout (session 3)
├── editor/           AsterEditorImpl (cycle de vie, cache HTML, historique, setPageView / getLayout), createEditor, émetteur, variable-store
├── commands/         registre + commandes par domaine (marks, blocks, lists, alignment, links, images, tables, text-style, history, search, variables, format-painter, layout : paragraph.* et text.*)
├── extensions/       assemblage Tiptap, link-safety, image (NodeView), variable (NodeView, règle de saisie), outline, image-upload, paste-pipeline, search, shortcuts, autosave,
│                     paragraph-layout, run-layout, list-layout, table-layout (AsterTable*, bornes de fusion), layout-css (parse / format des styles), page-break (AsterHorizontalRule),
│                     page-view (classe, variables, conteneurs), header-footer-sanitize (liste blanche des en-têtes / pieds), pagination (extension et API publique),
│                     pagination-measure (hauteur utile, mesure du DOM), pagination-controller (vue du plugin, décorations), pagination-layout (paginate, fonction pure)
├── html/             serialize-html (sérialiseur verbatim), normalize-output (HTML stable, bruit de table retiré), resolve-variables (substitution pure)
├── markdown/         html-to-markdown, markdown-to-html, getMarkdown / setMarkdown
├── i18n/             createI18n, dictionnaires fr.ts et en.ts
└── index.ts          exports publics uniquement
```

### `@aster-editor/word`

Responsabilités :

- `importDocx(input: DocxInput, options?): Promise<DocxImportResult>` en trois temps : **prétraitement XML** (`docx/preprocess/`) de l'archive avec `jszip` dès qu'une partie texte contient un champ ou un contrôle de contenu — les `MERGEFIELD` (`w:fldSimple` et champs complexes `w:fldChar`) et les `w:sdt` à `w:tag` / `w:alias` sont réécrits en runs `{{nom}}`, les `{{nom}}` des en-têtes et pieds sont collectés sans réécriture —, puis la **lecture** selon `fidelity` (défaut `semantic` en 0.5.0, `styled` prévu en 0.6) : mammoth (import dynamique) avec une style map maison, ou le **lecteur OOXML d'Aster** (`docx/reader/`), puis **post-traitements DOM** (`docx/postprocess/`) : sur le chemin mammoth, numérotation des listes, en-têtes de table, images en data URL ou passées au hook `upload`, notes de bas de page, déballage des paragraphes de cellule, paragraphes vides, et pose des puces `<span data-aster-variable>` avec les libellés et valeurs collectés (`DocxImportResult.variables`) ; sur le chemin stylé, seules la passe des variables et celle des paragraphes vides s'appliquent, le HTML est déjà structuré. Le prétraitement ne lève jamais : en cas d'échec, import sans lui et avertissement `variables-preprocess-failed`. Le résultat porte toujours `template` (les octets d'origine) et, en stylé, `layout` et `lost`.
- **Lecteur OOXML** (`docx/reader/`, L24 + L25, figé en phase 0) : `package.ts` ouvre le zip et résout parties et relations (XML parsé par le `DOMParser` injectable, cache par partie) ; `index.ts` orchestre : résolveurs construits une fois (`styles.ts` : `docDefaults` → thème → chaîne `basedOn` avec garde anti-cycle → style de caractère → propriétés directes, styles de tableau ; `lists.ts` : `numbering.xml` ; `images.ts` ; `notes.ts`), puis le corps bloc par bloc (`paragraphs.ts` + `runs.ts`, `tables.ts` récursif pour les tableaux imbriqués), rendu des listes par regroupement des paragraphes numérotés (`lists.ts`), notes, mise en page de la dernière section (`sections.ts`) et en-têtes / pieds de toutes les sections hérités dans l'ordre (`headers.ts`), objets non représentables classés par `lost.ts`. Les modules ne se connaissent que par le `ConverterContext` (`types.ts`) : `styles`, `numbering`, `images`, `notes`, `convert` (points d'entrée paragraphe / tableau / blocs / rendu), `warnings`, `lost`, `part`, `where`, `tableStyle`. Décisions figées : les polices et tailles sont posées sur les runs, jamais sur les blocs ; seul ce qui diffère des `docDefaults` est écrit ; ordre d'imbrication des marques et des déclarations calé sur le core pour une idempotence stricte ; saut de page = `<hr data-page-break>` entre blocs frères ; tabulation = U+2003 ; `mc:AlternateContent` lu par son `mc:Choice`. `units.ts` et `units-blocks.ts` (conversions twips / demi-points / EMU → pt, mm, px) sont en doublon partiel assumé, à fusionner.
- `exportDocx(input: string | AsterDocument, options?): Promise<Blob>` via la lib `docx` (import dynamique) : HTML Aster → document Word, avec `jsonToHtml` pour l'entrée JSON, une numérotation dédiée par liste, images embarquées (data URL ou `fetchImage`), tables avec fusions et largeurs de colonnes, variables en trois modes (`placeholders`, `resolve`, `fields` → `MERGEFIELD`), en-têtes et pieds de page avec numéros de page, sauts de page, table des matières (`TOC`, `w:updateFields`), notes de bas de page réelles (`footnotes.xml`), titres numérotés, styles de titres, mise en page (format, orientation, marges bornées, ou `layout` complet avec en-têtes `default` / `first` / `even`), langue, police par défaut, propriétés du document, tout le contrat de mise en page du core relu (`blocks.ts`, `inline.ts`, `tables.ts`, `css.ts`), assainissement XML (`sanitize.ts`). `downloadDocx(blob, filename)` pour le navigateur.
- **Export dans le gabarit** (`docx/writer/`, L27) : avec `options.template`, le corps produit par la chaîne d'export est **greffé** dans le `.docx` d'origine. `template.ts` ouvre et valide le gabarit (partie principale ≤ 16 Mo), `graft.ts` remplace les enfants de `w:body` en conservant le `w:sectPr` final, et délègue : remappage des relations (`relationships.ts`), médias (`media.ts`), types de contenu (`content-types.ts`), styles réutilisés par identifiant ou par nom localisé, ajoutés ou retirés avec avertissement (`styles-merge.ts`), propriétés directes redondantes retirées (`style-strip.ts`) et propriétés absentes réécrites par rapport aux `docDefaults` (`style-reconcile.ts`, la réconciliation inverse sans laquelle les runs du document client changeaient de police), numérotations réutilisées ou ajoutées (`numbering-merge.ts`), notes ajoutées (`footnotes-merge.ts`), variables des en-têtes et pieds résolues (`header-footer-variables.ts`), en-têtes et pieds régénérés quand `layout` en diffère (`header-footer-graft.ts`), `settings.xml` (`settings-merge.ts`) et `docProps/core.xml` (`core-properties.ts`). `xml-io.ts` ne réécrit que les parties marquées modifiées : tout le reste ressort identique à l'octet. Un gabarit illisible ou une greffe qui lève replient sur l'export neuf (`template-invalid`), jamais d'exception.
- **Rapport de fidélité** (`docx/compare/`, L28) : `compareDocx(original, result)` ouvre les deux paquets, compare les parties annexes à l'octet (`parts.ts`), lit un modèle résolu de chaque corps avec les résolveurs du lecteur (`model.ts`, `model-paragraph.ts`, `model-borders.ts`, `model-sections.ts`), aligne les blocs (`align.ts` : préfixe et suffixe communs, LCS borné, puis ancrage par clés uniques façon patience diff pour les longues séquences, trous de même longueur appariés par position), compare propriété par propriété (`compare-blocks.ts`, `compare-tables.ts`, `values.ts` pour les formes canoniques) et agrège un score pondéré par groupe (`tally.ts`). Le script `scripts/fidelity-report.ts` (`npm run fidelity`) enchaîne import stylé → export dans le gabarit → comparaison et imprime le rapport. C'est le critère d'acceptation de la session 3.
- `normalizeWordHtml(html: string, options?): string` : fonction **pure**, sans DOM global, qui prend le HTML du presse-papier Word et rend un HTML propre. Pipeline de passes nommées et testables individuellement (`WORD_PASSES`) :
  1. `stripConditionalComments`
  2. `stripOfficeNamespaces` : `<o:p>`, `<w:*>`, `<v:*>`, `<m:*>`, et les balises actives (`template`, `iframe`, `object`, `embed`, `form`, `svg`, `math`…)
  3. `rebuildLists` : lit `mso-list:lX levelN lfoM` et les `@list` de la feuille de style, reconstruit `<ul>/<ol>` imbriqués avec `type` et `start`
  4. `normalizeHeadings` : `<p class="MsoHeading1">` → `<h1>`, citations
  5. `cleanInlineStyles` : supprime `mso-*`, polices, tailles, conserve gras/italique/souligné/couleur validée si option, déballe les liens hostiles
  6. `normalizeTables` : supprime attributs de layout, détecte les en-têtes (ligne entièrement en gras, jamais `mso-yfti-firstrow`)
  7. `collapseEmptyParagraphs`
  8. `normalizeWhitespace`
  9. `wrapVariables` : `{{nom}}` en texte → `<span data-aster-variable>`, hors `<pre>` / `<code>`, après recollage des textes adjacents ; le moteur (`wrapVariablePlaceholders`) est partagé avec le post-traitement de l'import
- `isWordHtml(html)` et `isGoogleDocsHtml(html)` : détecteurs sur chaîne, en temps linéaire.
- `normalizeGoogleDocsHtml(html)` : pipeline plus court (passes 1, 2, déballage du `<b>` Google, réimbrication des sous-listes, `list-style-type` → `type`, passe 5, `<div>` autour des tables, passes 6 à 9).
- `wordPasteTransformer(options)` : fabrique un `PasteTransformer` (détection Word / Google Docs, normalisation, passthrough sinon, jamais d'exception) à passer dans `AsterOptions.pasteTransformers`. Ce n'est pas une extension Tiptap : le core possède le hook `transformPastedHTML`.

Le parsing HTML se fait avec le `DOMParser` du navigateur (injectable via `parse` pour SSR et tests), et avec jsdom en test. Le XML du prétraitement passe par `DOMParser` / `XMLSerializer` (injectables, `XmlCodec`). Aucune dépendance à un parseur tiers.

Structure :

```
packages/word/src/
├── docx/             importDocx (chemins styled / semantic), style-map, types (DocxInput, DocxImportResult, DocxLostObject, DocxVariableOptions…)
│   ├── preprocess/   variables (orchestration jszip), fields (MERGEFIELD), content-controls (w:sdt), names, xml-utils, minimal-docx (tests)
│   ├── postprocess/  normalize-lists, normalize-tables, normalize-images, footnotes, variables, unwrap-cell-paragraphs, strip-empty-paragraphs, run-postprocess
│   ├── reader/       lecteur OOXML stylé : index (orchestrateur), types (ConverterContext), package, styles, runs, paragraphs, tables, lists, images, notes, headers, sections, lost, html, units, units-blocks
│   ├── writer/       greffe dans le gabarit : template, graft, xml-io, relationships, media, content-types, styles-merge, style-strip, style-reconcile, numbering-merge, footnotes-merge,
│   │                 header-footer-variables, header-footer-graft, settings-merge, core-properties
│   └── compare/      compareDocx : types (FidelityReport), compare-docx, parts, model, model-paragraph, model-borders, model-sections, align, compare-blocks, compare-tables, values, tally
├── export/           exportDocx (export neuf, ou greffe si template), downloadDocx, jsonToHtml, html-to-docx (blocks, inline, tables, images, variables, header-footer, toc, footnotes, context, css, styles, sanitize), types, docx-module
├── paste/            normalizeWordHtml, passes/ (9 passes dont variables), detectors, security.spec
├── google/           normalizeGoogleDocsHtml
├── extension/        wordPasteTransformer (PasteTransformer)
└── index.ts
```

### `@aster-editor/ui`

Responsabilités :

- `createAster(host, options)` : monte thème, toolbar, menu contextuel de table, dialogue et suggestion `{{` des variables, bulles de lien et d'image, menu `/`, contrôleurs de vue source et de plein écran, et l'éditeur (avec `pageView` transmis tel quel au core). Chaque extra est conditionné à la commande du core qu'il requiert (`variable.insert`, `link.set`, `image.setAttributes`) et désactivable par option. `createToolbar(editor, container, config)` rend une toolbar DOM à partir du registre de commandes. Aucune logique d'édition dedans.
- Composants vanilla (`components/`) : `button`, `dropdown` (générique, `menu` ou `dialog`, retourné s'il déborde), `tooltip`, `heading-menu`, `font-menu`, `color-picker`, `table-grid-picker`, `table-context-menu`, `link-dialog`, `image-dialog` (insertion et édition, hauteur et verrou de proportions), `search-panel`, `source-view`, `fullscreen` (avec `OPEN_PANEL_SELECTORS` pour qu'Échap ferme un panneau avant de quitter), `special-chars`, `print`, `variable-menu`, `variable-suggestion` (plugin `@tiptap/suggestion` placé en tête des plugins pour passer avant les keymaps), `variable-dialog`, `bubble` (générique, positionné par `@floating-ui/dom`), `link-bubble`, `image-bubble`, `slash-menu` (second plugin `@tiptap/suggestion`), `outline-panel`, `format-painter-button`, et depuis la session 3 (L26) `paragraph-layout` (briques partagées : lecture des attributs du bloc, `paragraph.setLayout`, champs bornés), `line-spacing`, `paragraph-spacing-dialog`, `paragraph-indent`, `paragraph-borders-dialog`, `caps`, `underline-style`, `page-layout-dialog` (détecte `setPageView` / `getLayout` à l'exécution via `pageViewApiOf`). Fonctions fabriques retournant `{ element, update, destroy }`, pas de classes ni de Web Components en V1 pour rester simple à styler. Les panneaux flottants sont montés dans `editor.element` en `position: fixed` pour hériter des variables du thème.
- Presets `full`, `standard`, `minimal` exprimés en config déclarative (`[['undo', 'redo'], [{ type: 'widget', widget: 'heading' }], …]`), 24 widgets nommés dans `WIDGETS` ; `indentDecrease` / `indentIncrease` ont remplacé `outdent` / `indent` dans `full` et `standard`.
- Thèmes (`themes/`) : `base.css`, `images-tables.css`, `search-source.css`, `print.css`, `variables.css`, `bubbles.css`, `page.css` (vue page, pagination, dialogues de mise en page), `light.css`, `night.css`, assemblés par `aster.css`. Tout passe par 34 variables `--aster-*` de thème (dont quatre `--aster-page-*`), plus les variables posées à chaud par le core (`--aster-page-width`…, `--aster-page-count`), contraste AA vérifié par test.
- Icônes : 85 SVG inline en TypeScript, jeu maison sous MIT, 20 × 20, `currentColor`.
- Accessibilité : `role="toolbar"`, `aria-pressed` sur les commandes à état seulement, `aria-label`, roving tabindex, dialogues et menus au clavier, panneaux `listbox` avec `aria-activedescendant` sur le contenteditable, `Échap` partout.

### `@aster-editor/angular`

Responsabilités :

- `AsterEditorComponent` standalone, `ControlValueAccessor`, inputs signals (`toolbar`, `theme`, `locale`, `placeholder`, `readonly`, `config`, `wordPaste`, `ariaLabel`, `ariaLabelledBy`, `variables`, `variableValues`, `variableResolver`, `allowUnknownVariables`, `variableSuggestion`, `importFidelity`, `exportInTemplate`, `pageView`, `layout`), outputs (`ready`, `changed`, `focused`, `blurred`, `variablesChanged`, `layoutChanged`), signals `editor()`, `variableNames()`, `importedTemplate()`, `layout()`, `lostObjects()`, méthodes `getHTML(options?)`, `resolveVariables()`, `importDocx(file)` (stylé par défaut, déclare les variables trouvées, garde gabarit, mise en page et objets perdus), `exportDocx(options?)` (transmet les valeurs du magasin, le gabarit importé et la mise en page effective), `compareWithTemplate()`. Crée l'éditeur dans `afterNextRender`, le détruit dans `DestroyRef`, le remonte quand `toolbar` change en conservant contenu, déclarations et valeurs de variables, vue page comprise. La logique Word (`lib/word.ts`) et la vue page (`lib/page-view.ts`, via `pageViewApiOf` de `ui` et `getActivePageView` du core) sont hors de la classe.
- `provideAster(config: Partial<AsterUiOptions>)` avec l'`InjectionToken` `ASTER_CONFIG`.
- `ASTER_UPLOAD_HANDLER` : token pour brancher l'upload d'images sur un service applicatif.
- Compatible SSR : aucun accès au DOM hors `afterNextRender`, `@aster-editor/word` chargé par `import()` au montage seulement.
- Peer deps : `@angular/core`, `common`, `forms` ≥ 20, `@aster-editor/core`, `@aster-editor/ui`. `@aster-editor/word` en peer dependency optionnelle, chargée dynamiquement.

### `apps/demo` et `e2e/`

- `apps/demo` : Angular 22, cinq routes chargées à la demande (`/`, `/form`, `/import`, `/readonly`, `/template`), sert de banc d'essai manuel et de cible e2e. mammoth et `docx` sortent dans des chunks séparés. La page `/import` propose le choix `styled` / `semantic` et affiche la mise en page lue ; la page `/template` est l'implémentation de référence du tour « modèle de document » et de la fidélité Word (import, formulaire généré, aperçu résolu, vue page, en-tête et pied éditables sur deux éditeurs `minimal`, trois exports neufs et un export dans le gabarit, rapport de fidélité, objets non représentables). Exemples servis depuis `public/samples/` (08, 09, 13, 16).
- `scripts/vanilla-playground/` : banc d'essai sans framework, importe en `styled`, applique la mise en page à la vue page et exporte dans le gabarit après un import.
- `e2e/` : Playwright, deux projets Chromium (`playground` sur le bundle esbuild de `scripts/vanilla-playground/`, avec `playground.spec.ts` et `variables.spec.ts` ; `demo` sur `ng serve`, `demo.spec.ts`), serveurs lancés par Playwright, captures dans `e2e/output/`. Les scénarios de fidélité (L32) sont en cours d'ajout.

## 📜 Contrat public du core

Figé en phase 0 dans `packages/core/src/api/`, enrichi depuis sans rupture (session 2 : `variables`, `getHTML(options?)`, `variablesChange`, `variable.*` ; session 3 : `layout.ts`, `pageView`, `paragraph.*`). Extrait de l'intention, le fichier fait foi (détail champ par champ dans [`docs/API_CORE.md`](./API_CORE.md)) :

```ts
export interface AsterOptions {
  element: HTMLElement;
  content?: string | AsterDocument; // HTML ou JSON ProseMirror
  placeholder?: string;
  readOnly?: boolean;
  locale?: AsterLocale; // 'fr' | 'en' | string
  autofocus?: boolean;
  extensions?: readonly AnyExtension[]; // extensions Tiptap additionnelles
  commands?: readonly AsterCommand[]; // commandes custom
  pasteTransformers?: readonly PasteTransformer[]; // (html, ctx) => html
  upload?: UploadHandler; // (file) => Promise<string>
  linkPolicy?: LinkPolicy; // liens et images
  variables?: VariableSource; // déclarations, valeurs, résolveur, allowUnknown
  pageView?: boolean | PageViewOptions; // vue page : { layout, showHeadersFooters, pagination }
  disabledCommands?: readonly string[];
}

// api/layout.ts (session 3), partagé avec word et angular : extrait
export interface DocumentLayout {
  page?: PageSetup; // { size: 'A4' | { widthMm, heightMm }, orientation, margins }
  columns?: number;
  defaultFont?: DefaultFont;
  lang?: string;
  headers?: HeaderFooterSet; // { default, first, even } en HTML stylé
  footers?: HeaderFooterSet;
  titlePage?: boolean;
}
export interface ParagraphLayoutAttrs {
  lineHeight?: number | null; // line-height: 1.15
  lineHeightPt?: number | null; // line-height: 14pt
  spacingBeforePt?: number | null; // margin-top
  spacingAfterPt?: number | null; // margin-bottom
  indentLeftPt?: number | null; // margin-left
  indentRightPt?: number | null; // margin-right
  indentFirstLinePt?: number | null; // text-indent (négatif = suspendu)
  borders?: readonly BlockBorder[] | null; // border-<côté>, data-border-between
  shading?: string | null; // background-color
  keepWithNext?: boolean | null; // data-keep-next
  pageBreakBefore?: boolean | null; // data-page-break-before
  docxStyle?: string | null; // data-docx-style, jamais interprété
}

export interface AsterEditor {
  readonly tiptap: Editor; // porte de sortie, non garantie stable
  readonly commands: CommandRegistry;
  readonly i18n: I18n; // t, getLocale, setLocale, addTranslations, has
  readonly variables: VariableStore; // list, getNames, getValues, setValues, define, insert, resolve, hasUnresolved
  readonly element: HTMLElement;
  readonly contentElement: HTMLElement;
  getHTML(options?: GetHtmlOptions): string; // { variables: 'placeholders' | 'resolve' }
  setHTML(html: string, emit?: boolean): void; // emit=false : silencieux, hors historique, historique vidé
  getJSON(): AsterDocument;
  setJSON(doc: AsterDocument, emit?: boolean): void;
  getText(): string;
  insertHTML(html: string): void; // brut : pas de pasteTransformers
  isEmpty(): boolean;
  getCounts(): AsterCounts;
  focus(position?: 'start' | 'end' | 'all'): void; // synchrone
  blur(): void;
  isFocused(): boolean;
  setReadOnly(value: boolean): void; // readOnlyChange, jamais change
  isReadOnly(): boolean;
  isDestroyed(): boolean;
  on<E extends AsterEventName>(event: E, handler: AsterEvents[E]): Unsubscribe;
  off<E extends AsterEventName>(event: E, handler: AsterEvents[E]): void;
  emit<E extends AsterEventName>(event: E, ...payload: Parameters<AsterEvents[E]>): void;
  destroy(): void; // ensuite les méthodes de contenu lèvent
}

export interface AsterCommand<Args = unknown> {
  readonly id: CommandId; // 'bold', 'heading', 'table.insert', 'variable.insert'
  readonly labelKey: string; // clé i18n
  readonly icon?: string; // id d'icône, résolu par ui
  readonly shortcut?: string; // 'Mod-b'
  run(editor: AsterEditor, args: Args): boolean;
  canRun?(editor: AsterEditor, args: Args): boolean;
  isActive?(editor: AsterEditor, args: Args): boolean;
}
```

## 🔄 Pipelines Word

```
.docx ──jszip: préprocess XML (MERGEFIELD, w:sdt → {{nom}})──► .docx réécrit ──┬─ semantic : mammoth + styleMap ──► HTML brut ──postprocess (puces, listes, tables, notes…)──┐
                                                                               └─ styled : lecteur OOXML (styles résolus, runs, blocs, listes, notes, sections) ──► HTML stylé + layout + lost ──┴──► HTML Aster + variables + template ──setHTML + define (+ setPageView)──► ProseMirror
clipboard Word ──isWordHtml──► normalizeWordHtml (9 passes, {{nom}} → puce) ──► HTML Aster ──transformPastedHTML──► ProseMirror
ProseMirror ──getHTML verbatim (ou getJSON → jsonToHtml)──► DOMParser ──html-to-docx (contrat de mise en page, variables selon mode, en-têtes, TOC, notes)──► lib docx ──Packer──► .docx neuf ──┬─ sans template ──► Blob
                                                                                                                                                                                              └─ avec template ──► graft (corps greffé, styles / numérotations / relations remappés, parties annexes à l'octet) ──► Blob
original.docx + résultat.docx ──compareDocx (parties à l'octet, modèles résolus, alignement LCS, score pondéré)──► FidelityReport
```

Le schéma ProseMirror est la dernière ligne de défense à l'entrée : tout ce qu'il ne connaît pas est jeté. Les normaliseurs visent donc à **préserver l'intention** du document, pas à produire un HTML parfait ; le lecteur stylé, lui, vise la **fidélité**, mais ne produit que ce que le contrat `api/layout.ts` déclare, dans la forme exacte que le core réémet (idempotence stricte `setHTML(getHTML())`, vérifiée fixture par fixture). Le prétraitement XML n'ouvre l'archive que si une partie contient une balise de champ ou de contrôle (29 ms mesurés sur 5 Mo) et laisse intact tout le reste du XML (`HYPERLINK`, `PAGE`, `TOC`, mise en page). À la sortie, `html-to-docx` traverse le DOM bloc par bloc (`blocks.ts`), traduit les marques en propriétés de run (`inline.ts`), découpe le texte brut sur le motif des variables (`variables.ts`), donne à chaque liste sa propre numérotation (`registerList` dans `context.ts`, ou réutilise celle du gabarit via `data-docx-num-id`), et tout texte passe par `sanitizeXmlText` avant d'entrer dans le XML. La greffe, elle, ne reconstruit rien : elle transplante le corps et remappe ce qui entre en collision avec le gabarit, en ne réécrivant jamais une partie qu'elle n'a pas modifiée.

## 🧭 Décisions produit

Fixées par les revues adverses de 0.3.0 et 0.4.0 et figées par des tests :

- **Pas de titre dans un item de liste** : `heading` et `paragraph` posent le type sans repli ni bascule ; dans une liste ils répondent `false` sans toucher au document (Tiptap sortait l'item de sa liste avant d'échouer).
- **Pas de table imbriquée** : `table.insert` est refusée dans une table, même si le schéma les tolère au parsing.
- **`clearFormatting` conserve les liens** et ne sort jamais d'une liste, d'une citation ou d'une cellule : un lien est une donnée, pas une mise en forme.
- **`setHTML(…, false)` vide l'historique** : une resynchronisation silencieuse ne doit pas laisser un `undo` rejouer l'ancien document.
- **`setReadOnly` n'émet pas `change`** : désactiver un formulaire ne le salit pas.
- **`insertHTML` est brut** : le pipeline de collage ne s'applique qu'au collage.
- **Politique d'images** : mêmes protocoles que les liens, plus `blob:` et `data:image/` seulement ; appliquée au parsing, pas seulement aux commandes.
- **HTML de sortie stable** : ni `colgroup`, ni `min-width`, ni `colspan="1"`, ni `<figure>` ; les largeurs d'image sont un attribut `width`, l'alignement un `data-align` ; les variables un `<span data-aster-variable>` avec `{{nom}}` en texte ; les titres n'ont d'`id` que si le sommaire a été utilisé ou si le HTML en avait.
- **Une correspondance de recherche ne traverse pas un bloc**, recherche littérale sans regex.
- **`aria-pressed` seulement sur les commandes à état** ; les boutons ne volent pas le focus au `mousedown`.
- **La valeur d'une variable n'est pas dans le document** : une seule source de vérité, le magasin ; un nom invalide rend le nœud inerte (`variableName()` → `''`) ; le core ne convertit jamais un `{{nom}}` chargé ou collé, seules la règle de saisie et `word` le font ; une valeur est du texte, jamais du HTML.
- **`resolve()` applique les succès avant de rejeter** : un résolveur qui échoue sur une variable ne fait pas perdre les autres.
- **Champs de fusion sans marques** : en mode `fields`, `w:fldSimple` ne porte pas de propriétés de run ; c'est documenté plutôt que contourné par un champ complexe.
- **Word fait les calculs** : numéros de page, table des matières et numérotation des titres sont des champs et des styles mis à jour par Word à l'ouverture, pas des valeurs écrites par l'export.

Décisions de la session 3 (fidélité Word), fixées par l'orchestrateur et les revues R23 à R27 :

- **Le défaut de `fidelity` reste `semantic` en 0.5.0** : changer le défaut de la lib aurait rebaselisé une cinquantaine de tests et changé le HTML reçu par les intégrateurs vanilla sans qu'ils le demandent ; le composant Angular, la démo et le playground passent en `styled`, la bascule du défaut est notée pour 0.6.
- **Un seul contrat de sérialisation** : le lecteur Word écrit exactement ce que le core réémet (ordre des déclarations, imbrication des marques, `#rrggbb`, `pt`), pas « quelque chose que le schéma accepte » ; l'idempotence stricte import → `setHTML` → `getHTML` est un test, pas une intention.
- **Polices et tailles sur les runs, jamais sur les blocs** : Tiptap ne lit pas `font-size` sur un `<p>` ; le lecteur résout tout jusqu'au run et n'écrit que ce qui diffère des `docDefaults`.
- **Le gabarit est la source, pas le produit** : l'export dans le gabarit ne régénère que le corps ; tout le reste ressort identique à l'octet, et une partie non modifiée n'est pas même recompressée. Une greffe impossible replie sur l'export neuf avec avertissement, jamais d'exception.
- **Réconciliation inverse des styles** : ce que le lecteur a omis parce qu'égal aux `docDefaults` doit être réécrit en propriété directe quand le style du gabarit dit autre chose, sinon le document change de police sans qu'on ait rien touché.
- **Seule la dernière section survit** : `layout` décrit la dernière section et le corps greffé n'a plus de `w:sectPr` intermédiaire ; c'est la perte principale mesurée (fixture 16, document client), documentée plutôt que contournée.
- **La pagination est une décoration** : elle mesure le DOM, ne touche jamais au document ni à `getHTML()`, n'émet aucun `change`, et se présente partout comme approximative ; rien de ce qu'elle calcule n'entre dans le `.docx`.
- **Le score est le critère** : une propriété ajoutée par le résultat compte comme perdue, le comparateur mesure ce que Word rend (bordures effectives, saut de page comme frontière, champs par nom), la cible est ≥ 0,98 dans le gabarit et les fixtures sous la cible ont un plancher de non-régression testé.
- **Les objets non représentables sont signalés, jamais silencieux** : hors du corps ils restent dans le gabarit, dans le corps ils deviennent leur texte et une entrée de `lost`, une fois chacun.
- **`setPageView` / `getLayout` hors contrat** jusqu'à 0.6 : `ui` et `angular` les détectent à l'exécution plutôt que de figer une API posée en pleine vague.

## 🎨 Théming

Trente-quatre variables définies sur `.aster[data-theme='light']` et `.aster[data-theme='night']`, valeurs de repli sur `.aster` dans `base.css` (et dans `page.css` pour les quatre de la vue page). Catégories : surfaces, texte, accent, bordures, danger, rayons, espacements, typographie, ombre, focus, tailles, surlignage, sélection, vue page (fond de feuille, bureau, ombre, espacement). Un intégrateur crée un thème en surchargeant les variables, sans toucher aux classes. Les feuilles des fonctionnalités (`images-tables.css`, `search-source.css`, `print.css`, `variables.css`, `bubbles.css`, `page.css`) ne déclarent aucune variable de thème et sont vérifiées par test contre les deux thèmes ; les variables `--aster-page-width`, `--aster-page-margin-*`, `--aster-page-count`… sont posées à chaud par le core depuis la mise en page du document. Détail dans [`docs/THEMING.md`](./THEMING.md).

## 🏭 Build et publication

- Paquets vanilla : `tsc -p tsconfig.build.json` → `dist/` ESM + `.d.ts`. `exports` avec `"."` et, pour `ui`, `"./themes/*"` servi depuis le dossier `themes/` du paquet.
- Angular : ng-packagr, format APF, `sideEffects: false`.
- Racine : `npm run build` enchaîne core → word → ui → angular, ordre déclaré dans `workspaces`.
- CI GitHub Actions : un job lint + typecheck + tests + build, un job e2e Playwright (Chromium) avec rapport en artefact.
- Publication npm sous l'org `@aster-editor`, hors périmètre de la nuit.

## ⚖️ Licences des dépendances de production

| Paquet                                                                                                                                         | Licence                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| @tiptap/\* (dont @tiptap/suggestion, @tiptap/extension-horizontal-rule)                                                                        | MIT                                 |
| prosemirror-\* via @tiptap/pm                                                                                                                  | MIT                                 |
| @floating-ui/dom (bulles, `ui`)                                                                                                                | MIT                                 |
| mammoth (chemin `semantic` seulement)                                                                                                          | BSD-2-Clause                        |
| jszip (prétraitement XML, lecteur stylé, greffe, comparateur ; via mammoth)                                                                    | MIT ou GPLv3 au choix, on prend MIT |
| @xmldom/xmldom (via mammoth)                                                                                                                   | MIT                                 |
| docx (export .docx, génération de fixtures)                                                                                                    | MIT                                 |
| @playwright/test (dev uniquement, e2e)                                                                                                         | Apache-2.0                          |
| jsdom (dev uniquement : tests, `npm run fidelity`) ; esbuild (transitif via `@angular/build`, utilisé par le playground et `npm run fidelity`) | MIT                                 |
| @angular/\*                                                                                                                                    | MIT                                 |

Toute nouvelle dépendance s'ajoute ici avant d'entrer dans le code. La session 3 n'en a ajouté qu'une en production : `@tiptap/extension-horizontal-rule` (déjà présent via `StarterKit`, déclaré directement pour `AsterHorizontalRule`), vérifié par `git diff v0.4.3 -- packages/*/package.json`. Le lecteur OOXML, la greffe et le comparateur n'utilisent que `jszip` et le `DOMParser` / `XMLSerializer` de l'environnement.

## ⚠️ Risques techniques identifiés

| Risque                                                                                                                                       | Mitigation                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API Tiptap 3 différente de la v2 en mémoire                                                                                                  | Lire `node_modules/@tiptap/*/dist/*.d.ts`, tester tôt en phase 0                                                                                                                                     |
| TS 6.0 imposé par Angular 22, outillage pas tous compatibles                                                                                 | Pas de bundler pour les libs, `tsc` pur. Vitest 5 vérifié en phase 0                                                                                                                                 |
| mammoth et docx en bundle navigateur via Angular CLI                                                                                         | Import dynamique, chunk séparé vérifié par le budget `initial` de la démo                                                                                                                            |
| Vite à froid recharge la page au premier `importDocx`                                                                                        | Documenté dans le guide, `toPass` dans le test e2e de la démo                                                                                                                                        |
| Plugins `@tiptap/suggestion` enregistrés après les keymaps                                                                                   | Placés en tête de la liste des plugins, figé par test (Entrée dans `{{`)                                                                                                                             |
| Motif de variables fourni par l'intégrateur (ReDoS)                                                                                          | Documenté comme à sa charge, motif recompilé sans `y`, `<pre>` exclus                                                                                                                                |
| `.docx` hostile (noms de police avec CSS, `colspan` géant, `mc:AlternateContent`, styles cycliques, 8 000 `<div>` imbriqués dans un en-tête) | Revues adverses R23-R27 rejouées en tests : injection CSS filtrée, fusions bornées (63 / 1 000), garde anti-cycle, chaînes de styles linéaires, sanitiseur d'en-têtes itératif plafonné à 64 niveaux |
| XML sérialisé par le navigateur différent de jsdom (`<?xml?>` réémis par Chromium)                                                           | Corrigé dans `writer/xml-io.ts` avec test ; toute écriture XML / HTML sérialisée par le navigateur est à vérifier hors jsdom avant le gel                                                            |
| Gabarit volumineux (50 Mo) épuisant la mémoire                                                                                               | Partie principale refusée au-delà de 16 Mo avant tout parse (`template-invalid`, export neuf)                                                                                                        |
| Sections multiples et styles conditionnels de tableau                                                                                        | Limites documentées (une seule section survit, styles conditionnels approximés), mesurées par le score et figées par des planchers de non-régression                                                 |
| Conflits git entre agents                                                                                                                    | Lots sur dossiers disjoints, fichiers partagés réservés à l'orchestrateur                                                                                                                            |
| Compaction de contexte de l'orchestrateur                                                                                                    | `docs/JOURNAL.md` mis à jour après chaque lot, lisible à froid                                                                                                                                       |
