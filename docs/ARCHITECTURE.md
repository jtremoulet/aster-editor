# 🏗️ Architecture — Aster Editor

> Comment les paquets s'emboîtent, quels contrats les séparent, et pourquoi. État 0.6.0 (session 4 : sections multiples, tabulations, bordures, bascule du défaut `styled`).

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
│ thèmes, page.css, menus,  │ par défaut, ou mammoth),         │
│ bulles, suggestion {{,    │ exportDocx (neuf ou greffé dans  │
│ menu /, mise en page par  │ le gabarit, sections comprises), │
│ section                   │ compareDocx, normalizeWordHtml   │
├───────────────────────────┴──────────────────────────────────┤
│ @aster-editor/core                                           │
│ createEditor, registre, extensions, variables, recherche,    │
│ sommaire, pinceau, mise en page (api/layout.ts), sections,   │
│ tabulations, vue page par section, pagination, sérialiseur   │
│ verbatim, markdown, autosave, i18n                           │
├──────────────────────────────────────────────────────────────┤
│ Tiptap 3  →  ProseMirror (@tiptap/pm)                        │
└──────────────────────────────────────────────────────────────┘
```

Sens des dépendances : `angular → ui, word, core` ; `ui → core` ; `word → core`. **Jamais l'inverse.** Le core ne connaît ni la toolbar ni Word, il expose juste des points d'extension (options, registre, événements DOM `aster:*`) et, depuis la session 3, le **contrat de mise en page** (`api/layout.ts`) que `word` écrit à l'import, relit à l'export, et que `ui` et `angular` affichent ; la session 4 l'a étendu, toujours de façon additive, aux sections (`DocumentLayout.sections`, nœud `sectionBreak`), aux tabulations (nœud `tab`), à l'espace texte-trait des bordures et à l'alignement des tableaux.

## 📦 Paquets

### `@aster-editor/core`

Responsabilités :

- `createEditor(options)` : instancie Tiptap avec le jeu d'extensions Aster, retourne un `AsterEditor`.
- **Registre de commandes** : chaque action éditable est une `AsterCommand` nommée, avec `run`, `canRun`, `isActive`, clé i18n, icône, raccourci. 52 commandes du contrat (`variable.insert` / `variable.remove`, `paragraph.setLayout` / `paragraph.unsetLayout` compris) + 6 commandes `search.*` + 2 commandes `formatPainter.*` + 3 commandes `text.*` + `text.insertTab` + 3 commandes `section.*` (session 4) = 67 au montage. La toolbar et le wrapper Angular ne parlent qu'au registre, jamais à Tiptap directement.
- **Extensions Aster** (`createAsterExtensions`, 30 entrées) : `StarterKit` sans `link`, `underline`, `strike` ni `horizontalRule`, `AsterStrike` / `AsterUnderline` (style de trait), `AsterHorizontalRule` (`<hr data-page-break>`), `SectionBreak` (session 4 : `<hr data-section-break="n">`, bloc atomique de premier niveau, plugin de renumérotation positionnelle et d'invariants « jamais de section vide, jamais imbriqué », NodeView qui porte les variables de la section suivante en vue page), `Tab` (session 4 : nœud inline atomique `<span data-tab data-stop data-align data-leader>`, touche Tab selon `tabKey`, Backspace / Delete en une frappe, priorité basse derrière les listes et les tables), `Link` sécurisé par la politique (`createLinkExtension`), `Image` Aster avec `width`, `align`, NodeView redimensionnable et politique appliquée au parsing (`createImageExtension`), `Variable` (nœud inline atomique, NodeView lié au magasin, règle de saisie `{{nom}}`), tables redimensionnables étendues (`AsterTable`, `AsterTableCell`, `AsterTableHeader` : largeur, alignement `data-align`, bordures avec `spacePt`, fonds, alignement vertical, marges, `colspan` / `rowspan` bornés), `TaskList`, `TextAlign`, `ParagraphLayout` (attributs de `ParagraphLayoutAttrs` sur `paragraph` et `heading`), `ListLayout` (`data-docx-num-id`, `data-bullet`, `data-docx-num-indent`), `Subscript`, `Superscript`, `AsterHighlight`, `TextStyleKit` + `AsterTextStyle` + `RunLayout` (espacement, casse, style de caractère, couleurs normalisées), `Placeholder`, `CharacterCount`, `Search` (décorations + storage), `Outline` (attribut `id` des titres), `Pagination` (décorations widget de coupure, par segment de section, inerte hors vue page), raccourcis Aster (`createShortcutsExtension`, priorité haute, commandes désactivées avalées). L'upload d'images et le pipeline de collage sont des `editorProps` (`createImageUploadProps`, `createPastePipelineProps`). Pas de sanitizer HTML dédié pour le corps : le schéma ProseMirror est le filtre, voir `docs/GUIDE_INTEGRATION.md` section sécurité ; les en-têtes et pieds de la vue page, injectés en `innerHTML` hors schéma, passent par `sanitizeHeaderFooterHtml` (liste blanche stricte).
- **Mise en page** (`api/layout.ts`, sessions 3 et 4) : un contrat partagé qui fige, pour chaque attribut (paragraphe, run, liste, tableau, cellule, saut de section, tabulation), sa **sérialisation HTML exacte** (`style` inline normalisé dans un ordre figé, `#rrggbb`, unités `pt`, attributs `data-docx-*` jamais interprétés), plus `DocumentLayout` (page, colonnes, police, langue, en-têtes et pieds, et `sections[]` dont la dernière est recopiée au premier niveau), `SectionLayout` et `PageViewOptions`. Tout est additif et `null` par défaut : un document sans mise en page garde le HTML nu de 0.4.
- **Vue page et pagination** : `applyPageView` pose classe, variables CSS `--aster-page-*` et conteneurs d'en-tête / pied sur l'hôte ; `ui/themes/page.css` dessine. Avec des sections, l'hôte porte la section 1 (variables, en-tête) et le pied de la dernière section que le corps ouvre ; chaque `hr` de saut porte les variables de la section qu'il ouvre ; la pagination travaille par segments (hauteur utile par section, coupure forcée sauf `continuous`, libellé, en-tête et pied de section dans la première coupure), une seule largeur de feuille (`--aster-page-width-max`). La pagination est un plugin ProseMirror qui **mesure** le DOM rendu et pose des **décorations widget**, jamais des nœuds : le document ne sait rien des pages, `getHTML()` non plus, et aucune transaction n'est émise. `setPageView` / `getLayout` / `getSectionLayout` sont au contrat `AsterEditor` depuis la session 4 (optionnelles), avec l'événement `pageViewChange`.
- **Sérialiseur HTML verbatim** (`html/serialize-html.ts`) : `getHTML()` rend les `DOMOutputSpec` lui-même en posant `style` par `setAttribute`, parce que le `DOMSerializer` de ProseMirror passe par le CSSOM qui réécrit les styles (`rgb()`, raccourcis, ordre faux sous jsdom) et casserait l'idempotence du contrat. Même garde XSS que ProseMirror sur les specs venus des attributs.
- **Variables de document** : le magasin `editor.variables` (`createVariableStore`) porte déclarations, valeurs et résolveur ; les puces ne stockent que `name` et `label`, la valeur vit dans le magasin et le NodeView se rafraîchit sur `variablesChange`. `getHTML({ variables: 'resolve' })` délègue à `resolveVariablesHtml`, fonction pure réutilisable hors éditeur ; `getText()` rend la valeur ou `{{nom}}`. Le core ne convertit jamais un `{{nom}}` chargé ou collé : c'est le rôle de `word`.
- **i18n** : `t(key, params)` avec dictionnaires `fr` et `en` (77 clés), extensibles.
- **Événements** : émetteur typé, `on/off`, vidé à `destroy`. `variablesChange` s'ajoute aux événements de 0.3.0, `pageViewChange` (session 4) à ceux de 0.5.
- **Sérialisation** : `getHTML` (`serializeDocumentHtml` verbatim puis `normalizeOutputHtml`, mis en cache par transaction), `setHTML`, `getJSON`, `setJSON`, `getText`, plus `getMarkdown` / `setMarkdown` en fonctions compagnons.
- **Fonctions compagnons** (le contrat `AsterOptions` / `AsterEditor` est figé) : `createAutosave(editor, options)`, `getMarkdown(editor)`, `setMarkdown(editor, md)`, `getSearchStorage(editor)`, `getOutline(editor)`, `scrollToHeading(editor, pos)`, `getFormatClipboard(editor)`, `resolveVariablesHtml(html, values)`.
- **Hooks d'extension** : `options.extensions` pour ajouter des extensions Tiptap, `options.commands` pour enregistrer des commandes custom, `options.pasteTransformers` pour chaîner des transformateurs de collage (c'est par là que `word` se branche), événements DOM `aster:search-open`, `aster:image-edit`, `aster:variable-edit` et `aster:format-painter-change` sur `editor.element` pour que `ui` ouvre ses panneaux et reflète l'état sans que le core la connaisse ; `aster:page-view-change` sur `contentElement` et `aster:section-breaks-change` sur `view.dom` (session 4) pour les NodeViews et les plugins du core.

Structure :

```
packages/core/src/
├── api/              types publics figés en phase 0 : AsterEditor, AsterOptions, AsterCommand, AsterEvents, variables, toolbar, layout (sessions 3 et 4 : sections, tabulations)
├── editor/           AsterEditorImpl (cycle de vie, cache HTML, historique, setPageView / getLayout / getSectionLayout, pageViewChange), createEditor, émetteur, variable-store
├── commands/         registre + commandes par domaine (marks, blocks, lists, alignment, links, images, tables, text-style, history, search, variables, format-painter, layout : paragraph.*, text.* et text.insertTab, sections : section.*)
├── extensions/       assemblage Tiptap, link-safety, image (NodeView), variable (NodeView, règle de saisie), outline, image-upload, paste-pipeline, search, shortcuts, autosave,
│                     paragraph-layout, run-layout, list-layout, table-layout (AsterTable*, align, bornes de fusion), layout-css (parse / format des styles, padding des bordures), page-break (AsterHorizontalRule),
│                     section-break (nœud, plugin de renumérotation et d'invariants, NodeView), tab (nœud, touche Tab, NodeView),
│                     page-view (classe, variables, conteneurs, resolveSectionLayout, sectionOpenedByBreak, bodySectionCount), header-footer-sanitize (liste blanche des en-têtes / pieds), pagination (extension et API publique),
│                     pagination-measure (hauteur utile, segments par section, mesure du DOM), pagination-controller (vue du plugin, décorations), pagination-layout (paginate par segments, fonction pure), pagination-sections (coupures de section : libellé, en-tête, pied, variables)
├── html/             serialize-html (sérialiseur verbatim), normalize-output (HTML stable, bruit de table retiré), resolve-variables (substitution pure)
├── markdown/         html-to-markdown, markdown-to-html, getMarkdown / setMarkdown
├── i18n/             createI18n, dictionnaires fr.ts et en.ts
└── index.ts          exports publics uniquement
```

### `@aster-editor/word`

Responsabilités :

- `importDocx(input: DocxInput, options?): Promise<DocxImportResult>` en trois temps : **prétraitement XML** (`docx/preprocess/`) de l'archive avec `jszip` dès qu'une partie texte contient un champ ou un contrôle de contenu — les `MERGEFIELD` (`w:fldSimple` et champs complexes `w:fldChar`) et les `w:sdt` à `w:tag` / `w:alias` sont réécrits en runs `{{nom}}`, les `{{nom}}` des en-têtes et pieds sont collectés sans réécriture —, puis la **lecture** selon `fidelity` (défaut `styled` depuis la 0.6, `semantic` sur demande) : le **lecteur OOXML d'Aster** (`docx/reader/`), ou mammoth (import dynamique) avec une style map maison, puis **post-traitements DOM** (`docx/postprocess/`) : sur le chemin mammoth, numérotation des listes, en-têtes de table, images en data URL ou passées au hook `upload`, notes de bas de page, déballage des paragraphes de cellule, paragraphes vides, et pose des puces `<span data-aster-variable>` avec les libellés et valeurs collectés (`DocxImportResult.variables`) ; sur le chemin stylé, seules la passe des variables et celle des paragraphes vides s'appliquent, le HTML est déjà structuré. Le prétraitement ne lève jamais : en cas d'échec, import sans lui et avertissement `variables-preprocess-failed`. Le résultat porte toujours `template` (les octets d'origine) et, en stylé, `layout` et `lost`.
- **Lecteur OOXML** (`docx/reader/`, L24 + L25, étendu par L42 / F42 et découpé par L45a) : `package.ts` ouvre le zip et résout parties et relations (XML parsé par le `DOMParser` injectable, cache par partie) ; `index.ts` orchestre : résolveurs construits une fois (`styles.ts` + `styles-part.ts` + `styles-table.ts` : `docDefaults` → thème → chaîne `basedOn` avec garde anti-cycle → style de caractère → propriétés directes, styles de tableau et leurs formats conditionnels ; `lists.ts` : `numbering.xml` ; `images.ts` ; `notes.ts`), puis le corps bloc par bloc (`paragraphs.ts` + `properties.ts` / `properties-run.ts` + `runs.ts` / `runs-links.ts` / `runs-tags.ts`, `tables.ts` + `table-conditional.ts` récursif pour les tableaux imbriqués), rendu des listes par regroupement des paragraphes numérotés (`lists.ts`), notes, **chaque** `w:sectPr` dans l'ordre (`sections.ts` : page, colonnes, `w:type`, un `<hr data-section-break="n">` à la place du paragraphe porteur, dernière section recopiée au premier niveau) avec ses en-têtes / pieds effectifs hérités type par type et convertis une fois (`headers.ts`), objets non représentables classés par `lost.ts`. Les modules ne se connaissent que par le `ConverterContext` (`types.ts`) : `styles`, `numbering`, `images`, `notes`, `convert` (points d'entrée paragraphe / tableau / blocs / rendu), `warnings`, `lost`, `part`, `where`, `tableStyle`. Décisions figées : les polices et tailles sont posées sur les runs, jamais sur les blocs ; seul ce qui diffère des `docDefaults` est écrit ; ordre d'imbrication des marques et des déclarations calé sur le core pour une idempotence stricte ; saut de page = `<hr data-page-break>` entre blocs frères ; tabulation = nœud `<span data-tab>` avec le n-ième taquet du paragraphe (session 4, U+2003 en 0.5) ; bordures avec couleur exacte, `w:space` en `padding-*`, `nil` explicite en `0pt solid transparent` ; styles conditionnels de tableau résolus en propriétés directes de cellule selon `w:tblLook` (`0x04A0` quand l'élément manque, comme Word) ; le corps se termine toujours par un bloc éditable (miroir des invariants du core) ; `mc:AlternateContent` lu par son `mc:Choice`. `units.ts` (conversions twips / demi-points / EMU → pt, mm, px, un seul lecteur de bordure) a absorbé `units-blocks.ts` en L45a ; aucun fichier source du lecteur ne dépasse 400 lignes.
- `exportDocx(input: string | AsterDocument, options?): Promise<Blob>` via la lib `docx` (import dynamique) : HTML Aster → document Word, avec `jsonToHtml` pour l'entrée JSON, une numérotation dédiée par liste, images embarquées (data URL ou `fetchImage`), tables avec fusions et largeurs de colonnes, variables en trois modes (`placeholders`, `resolve`, `fields` → `MERGEFIELD`), en-têtes et pieds de page avec numéros de page, sauts de page, table des matières (`TOC`, `w:updateFields`), notes de bas de page réelles (`footnotes.xml`), titres numérotés, styles de titres, mise en page (format, orientation, marges bornées, ou `layout` complet avec en-têtes `default` / `first` / `even`), langue, police par défaut, propriétés du document, tout le contrat de mise en page du core relu (`blocks.ts` + `blocks-paragraph.ts`, `inline.ts` + `inline-pieces.ts` + `inline-state.ts`, `tables.ts` + `tables-grid.ts` + `tables-borders.ts`, `css.ts` + `css-borders.ts` + `css-colors.ts` + `css-lengths.ts`, `styles.ts` + `styles-headings.ts` + `styles-page.ts`, découpés par L45a), assainissement XML (`sanitize.ts`). **Sections** (session 4, `sections.ts`) : le corps est découpé à chaque `<hr data-section-break>` de premier niveau, chaque segment devient une `section` de la lib `docx` avec `layout.sections[n - 1]` (page, colonnes, `start` → `w:type`, en-têtes, pieds) ; `section-layout.ts` est la règle unique « quelle `SectionLayout` pour quel segment » (numérotation par position, jamais par l'attribut), partagée avec la greffe. Tabulations en `w:tab` + `w:tabs` (position plafonnée, `w:val`, `w:leader`), `padding-*` en `w:space` (plafonné à 31 pt), `0pt solid transparent` en `nil`, `data-align` en `w:jc`. `downloadDocx(blob, filename)` pour le navigateur.
- **Export dans le gabarit** (`docx/writer/`, L27 + L43 / F43) : avec `options.template`, le corps produit par la chaîne d'export est **greffé** dans le `.docx` d'origine. `template.ts` ouvre et valide le gabarit (partie principale ≤ 16 Mo), `graft.ts` remplace les enfants de `w:body` en conservant le `w:sectPr` final, et délègue : **sections** (`graft-sections.ts`, session 4 : un `w:sectPr` par segment écrit dans le `w:pPr` du dernier paragraphe, **greffé depuis le gabarit** par index quand le nombre de sections est le même, sinon par propriétés de page, régénéré depuis la lib `docx` pour une section ajoutée ; références d'en-tête des sections abandonnées héritées par la suivante, jamais `w:titlePg`), remappage des relations (`relationships.ts`), médias (`media.ts`), types de contenu (`content-types.ts`), styles réutilisés par identifiant ou par nom localisé, ajoutés ou retirés avec avertissement (`styles-merge.ts`), propriétés directes redondantes retirées (`style-strip.ts`) et propriétés absentes réécrites par rapport aux `docDefaults` (`style-reconcile.ts`, la réconciliation inverse sans laquelle les runs du document client changeaient de police), numérotations réutilisées ou ajoutées (`numbering-merge.ts`), notes ajoutées (`footnotes-merge.ts`), variables des en-têtes et pieds résolues (`header-footer-variables.ts`), en-têtes et pieds régénérés par section quand `layout` en diffère (`header-footer-graft.ts`), `settings.xml` (`settings-merge.ts`) et `docProps/core.xml` (`core-properties.ts`). `xml-io.ts` ne réécrit que les parties marquées modifiées : tout le reste ressort identique à l'octet. Un gabarit illisible ou une greffe qui lève replient sur l'export neuf (`template-invalid`), jamais d'exception.
- **Rapport de fidélité** (`docx/compare/`, L28 + L45a / F42 / L46) : `compareDocx(original, result)` ouvre les deux paquets, compare les parties annexes à l'octet (`parts.ts`), lit un modèle résolu de chaque corps avec les résolveurs du lecteur (`model.ts`, `model-paragraph.ts`, `model-borders.ts`, `model-sections.ts`, `compare-context.ts`), aligne les blocs (`align.ts` : préfixe et suffixe communs, LCS borné, puis ancrage par clés uniques façon patience diff pour les longues séquences, trous de même longueur appariés par position), compare propriété par propriété (`compare-blocks.ts`, `compare-tables.ts`, `values.ts` pour les formes canoniques) et agrège un score pondéré par groupe (`tally.ts`). Session 4 : les styles conditionnels de tableau sont résolus par cellule comme le lecteur (`table.conditional` = drapeaux `w:tblLook` effectifs), `table.align` (`w:jc`) et `paragraph.tabs` (position et alignement des taquets d'un paragraphe tabulé) sont comparés, le `w:space` des bordures de tableau et de cellule ne l'est plus (Word ne l'applique pas), les sections le sont une à une. Le script `scripts/fidelity-report.ts` (`npm run fidelity`) enchaîne import stylé → export dans le gabarit → comparaison et imprime le rapport. C'est le critère d'acceptation des sessions 3 et 4.
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
├── docx/             importDocx (chemin styled par défaut, semantic sur demande), style-map, types (DocxInput, DocxImportResult, DocxLostObject, DocxVariableOptions…)
│   ├── preprocess/   variables (orchestration jszip), fields (MERGEFIELD), content-controls (w:sdt), names, xml-utils, minimal-docx (tests)
│   ├── postprocess/  normalize-lists, normalize-tables, normalize-images, footnotes, variables, unwrap-cell-paragraphs, strip-empty-paragraphs, run-postprocess
│   ├── reader/       lecteur OOXML stylé : index (orchestrateur), types (ConverterContext), package, styles + styles-part + styles-table, properties + properties-run, runs + runs-links + runs-tags,
│   │                 paragraphs, tables + table-conditional, lists, images, notes, headers, sections, lost, html, units, test-support, testing-blocks (découpage L45a : aucun source > 400 lignes)
│   ├── writer/       greffe dans le gabarit : template, graft, graft-sections (session 4), xml-io, relationships, media, content-types, styles-merge, style-strip, style-reconcile, numbering-merge, footnotes-merge,
│   │                 header-footer-variables, header-footer-graft, settings-merge, core-properties, testing
│   └── compare/      compareDocx : types (FidelityReport), compare-docx, compare-context, parts, model, model-paragraph, model-borders, model-sections, align, compare-blocks, compare-tables, values, tally
├── export/           exportDocx (export neuf, ou greffe si template), downloadDocx, jsonToHtml, html-to-docx (blocks + blocks-paragraph, inline + inline-pieces + inline-state, tables + tables-grid + tables-borders, images, variables,
│                     header-footer, sections + section-layout (session 4), toc, footnotes, context, css + css-borders + css-colors + css-lengths, styles + styles-headings + styles-page, dom, sanitize), types, docx-module
├── paste/            normalizeWordHtml, passes/ (9 passes dont variables), detectors, security.spec
├── google/           normalizeGoogleDocsHtml
├── extension/        wordPasteTransformer (PasteTransformer)
└── index.ts
```

### `@aster-editor/ui`

Responsabilités :

- `createAster(host, options)` : monte thème, toolbar, menu contextuel de table, dialogue et suggestion `{{` des variables, bulles de lien et d'image, menu `/`, contrôleurs de vue source et de plein écran, et l'éditeur (avec `pageView` transmis tel quel au core). Chaque extra est conditionné à la commande du core qu'il requiert (`variable.insert`, `link.set`, `image.setAttributes`) et désactivable par option. `createToolbar(editor, container, config)` rend une toolbar DOM à partir du registre de commandes. Aucune logique d'édition dedans.
- Composants vanilla (`components/`) : `button`, `dropdown` (générique, `menu` ou `dialog`, retourné s'il déborde), `tooltip`, `heading-menu`, `font-menu`, `color-picker`, `table-grid-picker`, `table-context-menu`, `link-dialog`, `image-dialog` (insertion et édition, hauteur et verrou de proportions), `search-panel`, `source-view`, `fullscreen` (avec `OPEN_PANEL_SELECTORS` pour qu'Échap ferme un panneau avant de quitter), `special-chars`, `print`, `variable-menu`, `variable-suggestion` (plugin `@tiptap/suggestion` placé en tête des plugins pour passer avant les keymaps), `variable-dialog`, `bubble` (générique, positionné par `@floating-ui/dom`), `link-bubble`, `image-bubble`, `slash-menu` (second plugin `@tiptap/suggestion`), `outline-panel`, `format-painter-button`, et depuis la session 3 (L26) `paragraph-layout` (briques partagées : lecture des attributs du bloc, `paragraph.setLayout`, champs bornés), `line-spacing`, `paragraph-spacing-dialog`, `paragraph-indent`, `paragraph-borders-dialog`, `caps`, `underline-style`, `page-layout-dialog` (détecte les méthodes optionnelles `setPageView` / `getLayout` à l'exécution via `pageViewApiOf` ; depuis la session 4, édite la **section du curseur** : « Section n sur N », `sectionOfSelection` positionnel comme le core, `withSectionPage` qui ne tronque jamais `layout.sections` et recopie la dernière section au premier niveau). Fonctions fabriques retournant `{ element, update, destroy }`, pas de classes ni de Web Components en V1 pour rester simple à styler. Les panneaux flottants sont montés dans `editor.element` en `position: fixed` pour hériter des variables du thème.
- Presets `full`, `standard`, `minimal` exprimés en config déclarative (`[['undo', 'redo'], [{ type: 'widget', widget: 'heading' }], …]`), 24 widgets nommés dans `WIDGETS` ; `indentDecrease` / `indentIncrease` ont remplacé `outdent` / `indent` dans `full` et `standard`.
- Thèmes (`themes/`) : `base.css`, `images-tables.css`, `search-source.css`, `print.css`, `variables.css`, `bubbles.css`, `page.css` (vue page, pagination, dialogues de mise en page ; session 4 : filet du saut de section, coupures de section avec libellé, en-tête et pied, feuille à la largeur de la plus large section, points de suite des tabulations), `light.css`, `night.css`, assemblés par `aster.css`. Tout passe par 34 variables `--aster-*` de thème (dont quatre `--aster-page-*`), plus les variables posées à chaud par le core (`--aster-page-width`…, `--aster-page-count`, `--aster-page-width-max`, `--aster-page-height-total`, `--aster-tab-stop`), contraste AA vérifié par test.
- Icônes : 85 SVG inline en TypeScript, jeu maison sous MIT, 20 × 20, `currentColor`.
- Accessibilité : `role="toolbar"`, `aria-pressed` sur les commandes à état seulement, `aria-label`, roving tabindex, dialogues et menus au clavier, panneaux `listbox` avec `aria-activedescendant` sur le contenteditable, `Échap` partout.

### `@aster-editor/angular`

Responsabilités :

- `AsterEditorComponent` standalone, `ControlValueAccessor`, inputs signals (`toolbar`, `theme`, `locale`, `placeholder`, `readonly`, `config`, `wordPaste`, `ariaLabel`, `ariaLabelledBy`, `variables`, `variableValues`, `variableResolver`, `allowUnknownVariables`, `variableSuggestion`, `importFidelity`, `exportInTemplate`, `pageView`, `layout`), outputs (`ready`, `changed`, `focused`, `blurred`, `variablesChanged`, `layoutChanged`), signals `editor()`, `variableNames()`, `importedTemplate()`, `layout()`, `lostObjects()`, méthodes `getHTML(options?)`, `resolveVariables()`, `importDocx(file)` (stylé par défaut, déclare les variables trouvées, garde gabarit, mise en page et objets perdus), `exportDocx(options?)` (transmet les valeurs du magasin, le gabarit importé et la mise en page effective), `compareWithTemplate()`. Crée l'éditeur dans `afterNextRender`, le détruit dans `DestroyRef`, le remonte quand `toolbar` change en conservant contenu, déclarations et valeurs de variables, vue page comprise. La logique Word (`lib/word.ts`, qui ne transmet `fidelity` que si `importFidelity` est donné : le défaut est celui de la lib, `styled` depuis la 0.6) et la vue page (`lib/page-view.ts`, via `pageViewApiOf` de `ui`, `getActivePageView` du core et, depuis la session 4, l'événement `pageViewChange` du contrat) sont hors de la classe.
- `provideAster(config: Partial<AsterUiOptions>)` avec l'`InjectionToken` `ASTER_CONFIG`.
- `ASTER_UPLOAD_HANDLER` : token pour brancher l'upload d'images sur un service applicatif.
- Compatible SSR : aucun accès au DOM hors `afterNextRender`, `@aster-editor/word` chargé par `import()` au montage seulement.
- Peer deps : `@angular/core`, `common`, `forms` ≥ 20, `@aster-editor/core`, `@aster-editor/ui`. `@aster-editor/word` en peer dependency optionnelle, chargée dynamiquement.

### `apps/demo` et `e2e/`

- `apps/demo` : Angular 22, cinq routes chargées à la demande (`/`, `/form`, `/import`, `/readonly`, `/template`), sert de banc d'essai manuel et de cible e2e. mammoth et `docx` sortent dans des chunks séparés. La page `/import` propose le choix `styled` / `semantic` et affiche la mise en page lue ; la page `/template` est l'implémentation de référence du tour « modèle de document » et de la fidélité Word (import, formulaire généré, aperçu résolu, vue page, en-tête de la première section et pied de la dernière éditables sur deux éditeurs `minimal`, trois exports neufs et un export dans le gabarit, rapport de fidélité, objets non représentables). Exemples servis depuis `public/samples/` (08, 09, 13, 16). La démo garde `tabKey: 'focus'` (son formulaire `/form` doit rester navigable au clavier).
- `scripts/vanilla-playground/` : banc d'essai sans framework, importe en `styled`, applique la mise en page à la vue page, exporte dans le gabarit après un import, et monte l'éditeur avec `tabKey: 'insert'` (édition type Word).
- `e2e/` : Playwright, deux projets Chromium (`playground` sur le bundle esbuild de `scripts/vanilla-playground/`, avec `playground.spec.ts`, `variables.spec.ts`, `fidelity.spec.ts` et `sections.spec.ts` ; `demo` sur `ng serve`, `demo.spec.ts` plus les scénarios démo de `fidelity` et `sections`) et, depuis la session 4, `playground-webkit` et `playground-firefox` qui rejouent `fidelity.spec.ts` et `sections.spec.ts` ; le projet Firefox est sondé au démarrage (`firefox --version`) et retiré s'il ne se lance pas (`ASTER_E2E_FIREFOX=1` force). 74 tests sans Firefox, 87 avec. Serveurs lancés par Playwright, captures dans `e2e/output/`.

## 📜 Contrat public du core

Figé en phase 0 dans `packages/core/src/api/`, enrichi depuis sans rupture (session 2 : `variables`, `getHTML(options?)`, `variablesChange`, `variable.*` ; session 3 : `layout.ts`, `pageView`, `paragraph.*` ; session 4 : `sections`, `SectionLayout`, `SectionBreakAttrs`, `TabAttrs`, `spacePt`, `align`, `tabKey`, `setPageView` / `getLayout` / `getSectionLayout`, `pageViewChange`, `image.setAttributes.height`). Extrait de l'intention, le fichier fait foi (détail champ par champ dans [`docs/API_CORE.md`](./API_CORE.md)) :

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
  tabKey?: 'focus' | 'insert'; // session 4 : touche Tab dans un paragraphe, 'focus' par défaut
  disabledCommands?: readonly string[];
}

// api/layout.ts (sessions 3 et 4), partagé avec word et angular : extrait
export interface DocumentLayout {
  page?: PageSetup; // { size: 'A4' | { widthMm, heightMm }, orientation, margins }
  columns?: number;
  defaultFont?: DefaultFont;
  lang?: string;
  headers?: HeaderFooterSet; // { default, first, even } en HTML stylé
  footers?: HeaderFooterSet;
  titlePage?: boolean;
  sections?: readonly SectionLayout[]; // session 4 : une par w:sectPr, la dernière recopiée ci-dessus
}
export interface SectionLayout {
  page?: PageSetup;
  columns?: number;
  headers?: HeaderFooterSet;
  footers?: HeaderFooterSet;
  titlePage?: boolean;
  start?: 'nextPage' | 'continuous' | 'evenPage' | 'oddPage'; // w:type
}
export interface SectionBreakAttrs {
  section: number; // <hr data-section-break="n"> : la section n se termine ici
}
export interface TabAttrs {
  stopPt?: number | null; // <span data-tab data-stop="36pt" data-align="center" data-leader="dot">
  align?: 'left' | 'center' | 'right' | 'decimal' | null;
  leader?: 'dot' | 'hyphen' | 'underscore' | null;
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
  setPageView?(options: boolean | PageViewOptions): void; // session 4, optionnelles : émet pageViewChange
  getLayout?(): DocumentLayout | null;
  getSectionLayout?(index: number): SectionLayout | null;
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
.docx ──jszip: préprocess XML (MERGEFIELD, w:sdt → {{nom}})──► .docx réécrit ──┬─ styled (défaut 0.6) : lecteur OOXML (styles résolus, runs, tabulations, blocs, listes, notes, sections → hr data-section-break) ──► HTML stylé + layout (sections) + lost ──┐
                                                                               └─ semantic : mammoth + styleMap ──► HTML brut ──postprocess (puces, listes, tables, notes…)──┴──► HTML Aster + variables + template ──setHTML + define (+ setPageView)──► ProseMirror
clipboard Word ──isWordHtml──► normalizeWordHtml (9 passes, {{nom}} → puce) ──► HTML Aster ──transformPastedHTML──► ProseMirror
ProseMirror ──getHTML verbatim (ou getJSON → jsonToHtml)──► DOMParser ──html-to-docx (contrat de mise en page, variables selon mode, en-têtes, TOC, notes)──► lib docx ──Packer──► .docx neuf ──┬─ sans template ──► Blob
                                                                                                                                                                                              └─ avec template ──► graft (corps greffé, w:sectPr de chaque section greffé ou régénéré, styles / numérotations / relations remappés, parties annexes à l'octet) ──► Blob
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

- **Le défaut de `fidelity` est resté `semantic` en 0.5.0** : changer le défaut de la lib aurait rebaselisé une cinquantaine de tests et changé le HTML reçu par les intégrateurs vanilla sans qu'ils le demandent ; le composant Angular, la démo et le playground sont passés en `styled`, la bascule du défaut a été faite en 0.6 (session 4, ci-dessous).
- **Un seul contrat de sérialisation** : le lecteur Word écrit exactement ce que le core réémet (ordre des déclarations, imbrication des marques, `#rrggbb`, `pt`), pas « quelque chose que le schéma accepte » ; l'idempotence stricte import → `setHTML` → `getHTML` est un test, pas une intention.
- **Polices et tailles sur les runs, jamais sur les blocs** : Tiptap ne lit pas `font-size` sur un `<p>` ; le lecteur résout tout jusqu'au run et n'écrit que ce qui diffère des `docDefaults`.
- **Le gabarit est la source, pas le produit** : l'export dans le gabarit ne régénère que le corps ; tout le reste ressort identique à l'octet, et une partie non modifiée n'est pas même recompressée. Une greffe impossible replie sur l'export neuf avec avertissement, jamais d'exception.
- **Réconciliation inverse des styles** : ce que le lecteur a omis parce qu'égal aux `docDefaults` doit être réécrit en propriété directe quand le style du gabarit dit autre chose, sinon le document change de police sans qu'on ait rien touché.
- **Seule la dernière section survivait** en 0.5 : `layout` décrivait la dernière section et le corps greffé n'avait plus de `w:sectPr` intermédiaire ; c'était la perte principale mesurée (fixture 16, document client), documentée plutôt que contournée, et levée en session 4.
- **La pagination est une décoration** : elle mesure le DOM, ne touche jamais au document ni à `getHTML()`, n'émet aucun `change`, et se présente partout comme approximative ; rien de ce qu'elle calcule n'entre dans le `.docx`.
- **Le score est le critère** : une propriété ajoutée par le résultat compte comme perdue, le comparateur mesure ce que Word rend (bordures effectives, saut de page comme frontière, champs par nom), la cible est ≥ 0,98 dans le gabarit et les fixtures sous la cible ont un plancher de non-régression testé.
- **Les objets non représentables sont signalés, jamais silencieux** : hors du corps ils restent dans le gabarit, dans le corps ils deviennent leur texte et une entrée de `lost`, une fois chacun.
- **`setPageView` / `getLayout` hors contrat** jusqu'à 0.6 : `ui` et `angular` les ont détectées à l'exécution plutôt que de figer une API posée en pleine vague ; entrées au contrat en session 4, en optionnelles.

Décisions de la session 4 (sections, tabulations, bordures, bascule stylée), fixées par l'orchestrateur et les revues R41 à R44 (`docs/reviews/`, 23 findings prouvés, aucun bloquant) :

- **`importDocx` lit en `styled` par défaut** (0.6.0, L46) : `fidelity: 'semantic'` reste le repli explicite, ses attendus figés dans `fixtures/docx/expected/semantic/` (01-03, 08-10) pour que le comportement 0.4.x soit testé, pas seulement disponible ; les attendus du chemin par défaut couvrent 01-06 et 08-19. Changement observable pour les intégrateurs vanilla, documenté comme migration (guide, chapitre 7.9) ; le composant Angular ne transmet plus `fidelity` que si `importFidelity` est donné.
- **Un saut de section est un nœud du corps** (`<hr data-section-break="n">`), pas une propriété de bloc : atomique, de premier niveau, numéroté par **position** (renuméroté 1..k à toute édition, conservé tel quel à un chargement pour une idempotence stricte) ; tous les lecteurs (vue page, pagination, dialogue, export neuf et greffe) désignent une section par son rang, jamais par l'attribut (R41-01, R43-04, R44-01). Jamais de section vide, jamais de saut imbriqué (R41-03, R41-08).
- **`layout.sections` dans l'ordre, la dernière recopiée au premier niveau** : invariant du contrat qui garde la compatibilité 0.5 (un consommateur qui ne lit que `layout.page` voit la dernière section, comme avant). Un `layout.sections` plus long que le corps n'impose pas une section jamais ouverte (`bodySectionCount`, R44-05) ; le dialogue ne tronque jamais `sections` (R44-02).
- **Hôte de la vue page = section 1, pied de l'hôte = dernière section du corps** (arbitrage de l'orchestrateur à l'intégration de L44 ; L41 avait posé la section 1 pour les deux) : c'est ce que l'utilisateur voit en haut et en bas du document ; les en-têtes et pieds intermédiaires vivent dans la première coupure de chaque section. Le panneau En-tête / Pied de la démo édite donc `sections[0].headers` et le pied de la dernière section recopié au premier niveau (arbitrage 2 du 21/10 01:05 : il éditait `layout.headers`, sans effet visible).
- **Une seule largeur de feuille** (`--aster-page-width-max`, celle de la plus large section), marges horizontales de la section 1 partout : approximation assumée de la vue page, les hauteurs et marges verticales suivent chaque section. Les variables `--aster-page-*` de la section suivante sont posées sur le `hr` du saut, convention figée en phase 0 sans attendre L41.
- **Touche Tab : `tabKey: 'focus'` par défaut** (arbitrage 1 du 21/10 01:05) : L41 faisait insérer une tabulation dans tout paragraphe, ce qui piégeait le focus clavier dans un formulaire (WCAG 2.1.2, test `/form` de la démo rouge) ; `'insert'` est l'édition type Word (playground), `text.insertTab` marche dans les deux modes, et Tab reste à la liste, à la cellule et au bloc de code (R41-04).
- **Tabulation = nœud atomique avec son taquet** (`stopPt`, puis `align` et `leader` ajoutés après R43-05 : sans eux, tout taquet non `left` était réécrit `left`), « n-ième tabulation = n-ième taquet » sans mesure du texte ; l'écran n'aligne pas, le `.docx` oui.
- **Bordures : couleur exacte, `w:space` en `padding-<côté>`, `nil` explicite en `0pt solid transparent`** ; `spacePt` d'un côté `between` n'a pas de sérialisation (R41-09, décision en attente). `w:space` sur une bordure de tableau ou de cellule n'est **pas comparé** par `compareDocx` (L45a : mesuré seul, il faisait chuter les scores alors que Word ne l'applique pas, l'espace vient de `w:tcMar`).
- **Styles conditionnels de tableau résolus en propriétés directes à l'import, `w:tblLook` conservé et réécrit à l'export** (vague 3, L49, levée du sacrifice n° 2 de la roadmap) : `w:tblLook` absent vaut `0x04A0` comme Word ([MS-OI29500] §2.1.160, contre le `0x0000` d'ECMA-376, R42-06), les `nil` conditionnels retirent les traits de style (R42-02) ; le comparateur résout le style par cellule comme le lecteur (L46) et compare `table.conditional`. `TableLayoutAttrs.look` (`data-docx-look`) est émis quand le document porte un `w:tblLook` ; dans le gabarit (`writer/table-look.ts`) les fonds, gras et bordures directs égaux à ce que le style conditionnel produit sont retirés (bordures tout ou rien par tableau) : fixture 19 à 1.
- **Export : sections numérotées par position, options explicites « du document »** : `page`, `pageSize`, `header`, `footer` complètent toute section qui ne déclare pas la sienne et priment sur la dernière (R43-03, comportement 0.5 conservé) ; une seule règle « quelle `SectionLayout` pour quel segment » partagée par l'export neuf et la greffe (`section-layout.ts`, R43-01 / R43-04) ; dans le gabarit, un `w:sectPr` est greffé par index quand le nombre de sections est le même, sinon par propriétés de page ; les références d'en-tête d'une section abandonnée sont héritées par la suivante, jamais `w:titlePg` (R43-06). Bornes de Word respectées : `w:pos` ≤ 31 680 twips, `w:space` ≤ 31 pt (R43-02, R43-07).
- **`setPageView` / `getLayout` / `getSectionLayout` et `pageViewChange` au contrat, en optionnelles** (L45b) : le mock de `ui` reste valide, `angular` écoute l'événement du contrat au lieu de l'événement DOM ; `image.setAttributes.height` au contrat. Reportés en dette : `DocumentLayout.defaultParagraph` et le retrait de `pageViewApiOf` (L45 points 7 et 8), `rStyle Hyperlink` forcé sur les liens (R43-09, seule perte du document client), `spacePt` sur `between`. `TableLayoutAttrs.look` a été livré en vague 3 (L49).
- **E2E multi-navigateurs** : WebKit 11/11 ; le Firefox de Playwright ne se lance pas sur la machine de la session (erreur SxS Windows, `mozglue`), le projet est sondé au démarrage et retiré s'il ne démarre pas plutôt que de faire échouer la suite (`ASTER_E2E_FIREFOX=1` force).

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

Toute nouvelle dépendance s'ajoute ici avant d'entrer dans le code. La session 3 n'en a ajouté qu'une en production : `@tiptap/extension-horizontal-rule` (déjà présent via `StarterKit`, déclaré directement pour `AsterHorizontalRule`), vérifié par `git diff v0.4.3 -- packages/*/package.json`. La session 4 n'en a ajouté **aucune** : sections, tabulations, bordures et comparateur étendu n'utilisent que ce qui était là ; les navigateurs WebKit et Firefox de Playwright sont des binaires de dev, pas des dépendances. Le lecteur OOXML, la greffe et le comparateur n'utilisent que `jszip` et le `DOMParser` / `XMLSerializer` de l'environnement ; mammoth n'est plus chargé que par `fidelity: 'semantic'`.

## ⚠️ Risques techniques identifiés

| Risque                                                                                                                                       | Mitigation                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API Tiptap 3 différente de la v2 en mémoire                                                                                                  | Lire `node_modules/@tiptap/*/dist/*.d.ts`, tester tôt en phase 0                                                                                                                                                                                |
| TS 6.0 imposé par Angular 22, outillage pas tous compatibles                                                                                 | Pas de bundler pour les libs, `tsc` pur. Vitest 5 vérifié en phase 0                                                                                                                                                                            |
| mammoth et docx en bundle navigateur via Angular CLI                                                                                         | Import dynamique, chunk séparé vérifié par le budget `initial` de la démo                                                                                                                                                                       |
| Vite à froid recharge la page au premier `importDocx`                                                                                        | Documenté dans le guide, `toPass` dans le test e2e de la démo                                                                                                                                                                                   |
| Plugins `@tiptap/suggestion` enregistrés après les keymaps                                                                                   | Placés en tête de la liste des plugins, figé par test (Entrée dans `{{`)                                                                                                                                                                        |
| Motif de variables fourni par l'intégrateur (ReDoS)                                                                                          | Documenté comme à sa charge, motif recompilé sans `y`, `<pre>` exclus                                                                                                                                                                           |
| `.docx` hostile (noms de police avec CSS, `colspan` géant, `mc:AlternateContent`, styles cycliques, 8 000 `<div>` imbriqués dans un en-tête) | Revues adverses R23-R27 rejouées en tests : injection CSS filtrée, fusions bornées (63 / 1 000), garde anti-cycle, chaînes de styles linéaires, sanitiseur d'en-têtes itératif plafonné à 64 niveaux                                            |
| XML sérialisé par le navigateur différent de jsdom (`<?xml?>` réémis par Chromium)                                                           | Corrigé dans `writer/xml-io.ts` avec test ; toute écriture XML / HTML sérialisée par le navigateur est à vérifier hors jsdom avant le gel                                                                                                       |
| Gabarit volumineux (50 Mo) épuisant la mémoire                                                                                               | Partie principale refusée au-delà de 16 Mo avant tout parse (`template-invalid`, export neuf)                                                                                                                                                   |
| Sections multiples et styles conditionnels de tableau                                                                                        | Sections conservées de bout en bout depuis la session 4 (16, 18 et client à 1 / 0,995 dans le gabarit) ; styles conditionnels résolus à l'import et `w:tblLook` réécrit (19 à 1), mesuré par le score et figé par la liste des pertes attendues |
| Numérotation des sauts de section désynchronisée par un HTML chargé tel quel                                                                 | Tous les lecteurs sont positionnels (`sectionOpenedByBreak`, `getSections`, `sectionOfSelection`, `section-layout.ts`) ; renumérotation par comparaison de suite, méta `asterSetContent` sur un chargement (R41-01, R41-02, R44-01)             |
| Firefox de Playwright qui ne démarre pas (SxS Windows)                                                                                       | Projet sondé au démarrage et retiré s'il ne se lance pas, `ASTER_E2E_FIREFOX=1` / `0` pour forcer                                                                                                                                               |
| Conflits git entre agents                                                                                                                    | Lots sur dossiers disjoints, fichiers partagés réservés à l'orchestrateur                                                                                                                                                                       |
| Compaction de contexte de l'orchestrateur                                                                                                    | `docs/JOURNAL.md` mis à jour après chaque lot, lisible à froid                                                                                                                                                                                  |
