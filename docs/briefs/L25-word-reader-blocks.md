# Brief — Lot L25 : lecteur OOXML, tableaux, listes, images, notes, en-têtes, sections, objets perdus (`word/docx/reader`)

> Session 3, vague 1. Cible 2h30. Tu remplaces sept stubs : `tables.ts`, `lists.ts`, `images.ts`, `notes.ts`, `headers.ts`, `sections.ts`, `lost.ts`. L24 remplace en parallèle `styles.ts`, `runs.ts`, `paragraphs.ts` : **ne touche pas à ces trois fichiers**. Pendant ton lot, ce sont encore des stubs (texte brut, titres) : tes tests portent sur la **structure** (balises, attributs de tableau, listes, images, notes, layout), pas sur le formatage des runs.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION3.md`, **`packages/word/src/docx/reader/types.ts` (interfaces figées)**, `reader/index.ts` (orchestrateur : `convertBlocks` traverse `w:p`, `w:tbl`, `w:sdt`, et appelle `detectLost` sur le reste ; `readDocx` appelle tes fabriques), `reader/package.ts`, `reader/html.ts`, `reader/reader.spec.ts` (à garder vert), `preprocess/xml-utils.ts`, **`packages/core/src/api/layout.ts` (sérialisation HTML exacte : `ListLayoutAttrs`, `TableLayoutAttrs`, `CellLayoutAttrs`, `DocumentLayout`, `HeaderFooterSet`)**, `docx/types.ts` (`DocxLostObject`, codes d'avertissement `image-skipped`, `object-lost`), `postprocess/normalize-images.ts` et `docx/import-docx.ts` `createImageConverter` (ce que mammoth faisait des images : data URL ou `upload`), `postprocess/footnotes.ts` (forme HTML des notes : `<ol data-footnotes>`, `data-footnote`, `<sup data-footnote-ref>`), fixtures `14-tableaux-riches`, `15-listes-numerotation`, `16-sections`, `17-objets-perdus` (produites par L22 en parallèle ; en attendant, fragments XML via `preprocess/minimal-docx.ts`). Conversions d'unités : L24 crée `reader/units.ts` ; si absent quand tu commences, écris les tiennes dans `reader/units-blocks.ts` et signale le doublon.

## Lot

### `tables.ts` — `convertTable(tbl, ctx)`

- `tblPr` : `tblStyle` → `ctx.styles.tableStyle(id)` (bordures, fond, marges par défaut), `tblW` (`pct` → `width: NN%` ; `dxa` → `width: NNpt` ; `auto` → rien), `jc` (`center` → `style="margin-left: auto; margin-right: auto"` **non** : hors contrat, ignore et note), `tblBorders` (table), `tblCellMar`. `tblGrid` → `colwidth` par colonne en px entier (twips/15, comme Tiptap attend des px) sur chaque cellule de la première ligne (`data-colwidth`) : vérifie le format exact attendu par `@tiptap/extension-table` (`colwidth` attribut, `data-colwidth="120,80"`).
- `tr` : `trPr` `tblHeader` → `<th>` pour toutes les cellules de la ligne. `tc` : `tcPr` `gridSpan` → `colspan`, `vMerge` (`restart` ouvre, continuation sans `w:val` fusionne : calcule `rowspan` et **omet** la cellule fusionnée, comme Tiptap), `tcBorders` (priment sur le style), `shd`, `vAlign` (`center` → `middle`), `tcMar`. Rendu : `<table style="width: 100%; border-top: …" data-docx-style="TableGrid"><tbody><tr><td colspan rowspan data-colwidth style="border-top: 0.5pt solid #000000; …; background-color: #d9e2f3; vertical-align: middle; padding: 2pt 4pt 2pt 4pt">…</td>`. Ordre des déclarations : celui du contrat (`CellLayoutAttrs` : bordures top/right/bottom/left, `background-color`, `vertical-align`, `padding`).
- Contenu : `ctx.convert.blocks(tc, derived)` avec `tableStyle` et `cellVerticalAlign` dans le contexte dérivé (`deriveContext` exporté par `index.ts`), puis `ctx.convert.render` ; cellule vide → `<p></p>`. Tableau imbriqué : récursif naturel.

### `lists.ts` — `createNumberingResolver(pkg)` et `renderBlocks(blocks, ctx)`

- `numbering.xml` : `w:abstractNum` (niveaux `w:lvl` : `numFmt` → `ListFormat` (`bullet`, `decimal`→`'1'`, `lowerLetter`→`'a'`, `upperLetter`→`'A'`, `lowerRoman`→`'i'`, `upperRoman`→`'I'`, autres → `'1'` avec note), `lvlText`, `start`, `pPr/ind`), `w:num` → `abstractNumId` + `lvlOverride` (`startOverride`).
- `renderBlocks` : regroupe les `ParagraphBlock` consécutifs ayant `numbering` en listes imbriquées selon `level` ; un changement de `numId` à même niveau ferme la liste ; `<ol type start data-docx-num-id>` ou `<ul data-bullet data-docx-num-id>` (`data-bullet` = `lvlText` pour `bullet`) ; `start` posé seulement si ≠ 1 ou si la liste reprend après interruption (compte les items déjà rendus pour ce `numId`/niveau : Word continue la numérotation, HTML repart à 1 : pose `start` pour compenser) ; chaque item `<li>` contient le `<p …>` du paragraphe (Tiptap exige un paragraphe dans `li`) ; un paragraphe **non numéroté** immédiatement après un item, avec un retrait gauche ≥ celui de l'item, est rattaché au même `<li>` (paragraphe de continuation, fixture 15) ; les `ParagraphBlock` dont le `html` contient plusieurs frères (saut de page, décision L24) sont rendus tels quels hors liste. `emptyParagraphs: 'drop'` retire les paragraphes vides hors cellule (le stub le fait déjà, garde-le).

### `images.ts` — `createImageConverter(pkg, options)`

- `w:drawing` : `wp:inline` et `wp:anchor` ; `a:blip r:embed` → `pkg.rels(ctx.part)` → `pkg.binary(target)` ; type MIME par extension (`png`, `jpeg`/`jpg`, `gif`, `bmp`, `svg`, `webp` ; `emf`/`wmf`/`tiff` → avertissement `image-skipped`) ; `wp:extent cx/cy` (EMU, 914400 par pouce → px à 96 dpi, entier) → attributs `width` et `height` ; `wp:docPr descr`/`title` → `alt`/`title` ; `wp:anchor` `wp:positionH align` → `align` (`left`/`center`/`right`) si présent, sinon rien ; `options.upload` → même contrat que `createImageConverter` d'`import-docx.ts` (appelle `upload(file)` avec un `File` construit depuis les octets, `src` = URL retournée, échec → data URL + avertissement `image-upload-failed`). Sans `upload` : data URL base64 (`btoa` sur chaîne binaire par morceaux, pas de `Buffer`). `w:pict` (VML `v:imagedata r:id`) : même chemin. Rendu `<img src alt title width height data-align>` conforme à ce que `core/extensions/image.ts` parse (lis-le : `align` est lu depuis `data-align` ou `style`, `width` depuis l'attribut).

### `notes.ts` — `createNoteRegistry(pkg, options)`

- Parties `footnotes.xml` / `endnotes.xml` via `pkg.related` ; ignore les notes `separator`/`continuationSeparator` ; `reference(id, kind, ctx)` → `<sup data-footnote-ref="n">n</sup>` avec `n` numérotation d'apparition (1, 2, …) ; `render(ctx)` → `<ol data-footnotes><li data-footnote="n">…</li></ol>` avec le contenu converti par `ctx.convert.blocks` dans un contexte dérivé (`part` = partie des notes, `where: 'footnote'`), sans le `w:footnoteRef` initial. Si `options.footnotes` est faux, `reference` rend `''` et `render` `''` avec un avertissement `footnotes-dropped` une seule fois. Forme HTML **identique** à celle de `postprocess/footnotes.ts` (vérifie avec un test comparant au chemin sémantique sur une fixture existante qui a des notes, s'il y en a une ; sinon fragment XML).

### `headers.ts` — `readHeadersFooters(sectPr, ctx)`

- `w:headerReference` / `w:footerReference` (`w:type` `default`/`first`/`even`, `r:id`) → partie via `pkg.rels(ctx.part)` ; conversion par `ctx.convert.blocks` + `render` dans un contexte dérivé (`part`, `where: 'header'|'footer'`) ; `titlePage` depuis `w:titlePg`. Résultat `HeaderFooterSet` du contrat (`{ default: { html }, first, even }`). Les champs `PAGE`/`NUMPAGES` sont rendus par L24 en texte de résultat : vérifie qu'ils apparaissent (le résultat est souvent `1` ou vide) et signale.

### `sections.ts` — `readSectionLayout(sectPr, styles)`

- `pgSz` (`w:w`/`w:h` twips → mm, `w:orient`) : format nommé si ±1 mm d'un format connu (A4 210×297, A3 297×420, A5 148×210, Letter 215,9×279,4, Legal 215,9×355,6, dans les deux orientations), sinon `PageDimensions` ; `pgMar` (`top`, `right`, `bottom`, `left`, `header`, `footer` → mm, deux décimales) ; `cols w:num` → `columns` ; langue : `w:lang w:val` des `docDefaults` (`styles.xml`, lis la partie via `pkg` : expose ce dont tu as besoin en relisant `styles.xml` toi-même, **sans** modifier `StyleResolver`) ; `defaultFont` depuis `styles.defaultFont()`. `sectPr` absent → `{}` plus `defaultFont`.

### `lost.ts` — `detectLost(element, ctx)`

- Au niveau bloc (appelé par `index.ts` pour tout enfant du corps qui n'est ni `p`, ni `tbl`, ni `sdt`) **et** à exposer pour L24 au niveau run (export supplémentaire `detectLostInline(element, ctx)`, même logique, pour `w:drawing` contenant `wps:txbx`, `w:pict` avec `v:shape` sans image, `m:oMath`, `w:object`, `w:commentReference`) : retourne un `DocxLostObject` `{ kind, where: ctx.where, text?, detail? }`, `text` = texte brut de l'objet s'il en a (`w:txbxContent` → ses paragraphes en texte), `detail` = nom (`wp:docPr name`) ou type d'objet. Les `w:ins`/`w:del` sont signalés une fois par document (`revision`), pas par run. Ne retire rien du DOM.

## Périmètre

✅ `packages/word/src/docx/reader/tables.ts`, `lists.ts`, `images.ts`, `notes.ts`, `headers.ts`, `sections.ts`, `lost.ts`, leurs specs, `reader/units-blocks.ts` si nécessaire, `fixtures/docx/expected/14-*.html` … `17-*.html` (chemin `styled`, structure ; le formatage des runs changera quand L24 arrivera : l'orchestrateur régénérera, note-le). ❌ `index.ts`, `types.ts`, `package.ts`, `html.ts`, `styles.ts`, `runs.ts`, `paragraphs.ts`, `import-docx.ts`, `core`.

## Tests

- Unitaires par module sur fragments XML (parsés en `application/xml`) : fusions, `vMerge` continuation, bordures par côté et héritées du style, `colwidth`, numérotation (formats, `start`, reprise après interruption, imbrication 3 niveaux, continuation de paragraphe), images (inline, ancrée, data URL, `upload` mocké, extension non supportée), notes (numérotation d'apparition, `footnotes: false`), en-têtes (`default`/`first`/`even`, `titlePage`), sections (A4, Letter paysage, format libre, marges, colonnes, langue), objets perdus (chaque `kind`, `text` d'une zone de texte).
- Fixtures 14-17 : assertions structurelles + `expected/*.html` figés.
- `reader.spec.ts` reste vert ; `cd packages/word && npx vitest run` (jamais `-w`), `npx tsc -p tsconfig.json --noEmit`, `npx eslint src/docx/reader`.

## Pièges

Outil Write ; pas de `\u00a0` littéral ; `verbatimModuleSyntax` ; zéro `any` ; `localName` + `wordAttribute` toujours ; ne jamais muter le `Document` du paquet ; `btoa` et non `Buffer` (le paquet tourne dans le navigateur) ; `File` construit via `new File([bytes], name, { type })` (disponible en jsdom) ; ne lance ni n'arrête de serveur.

## Rapport attendu

`## Rapport Lot L25` : Fait par module / Non fait / Décisions (alignement de tableau, formats de liste non mappés, EMF) / Blocages / Propositions de contrat / Tests (compteurs) / Fichiers / Points à vérifier pour L24 (`detectLostInline`), L27 (attributs `data-docx-*` posés) et L29 (`layout` exact produit sur la fixture 16).
