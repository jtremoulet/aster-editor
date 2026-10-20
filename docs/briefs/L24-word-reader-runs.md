# Brief — Lot L24 : lecteur OOXML, styles, runs et paragraphes (`word/docx/reader`)

> Session 3, vague 1. Cible 2h30. Tu remplaces trois stubs : `styles.ts`, `runs.ts`, `paragraphs.ts`. L25 remplace en parallèle `tables`, `lists`, `images`, `notes`, `headers`, `sections`, `lost` : **ne touche pas à ces fichiers**, ils t'appellent et tu les appelles uniquement par le `ConverterContext`.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION3.md`, **`packages/word/src/docx/reader/types.ts` (interfaces figées)**, `reader/index.ts` (orchestrateur, ne pas modifier), `reader/package.ts` (accès au paquet : `part`, `rels`, `related`, `binary`), `reader/html.ts` (`escapeHtml`, `styleAttr`, `pt`), `reader/reader.spec.ts` (tests du squelette, à garder verts), `preprocess/xml-utils.ts` (`childNamed`, `childrenNamed`, `wordAttribute`, `allNamed`), **`packages/core/src/api/layout.ts` (sérialisation HTML exacte à produire : c'est ce que le core parse)**, `fixtures/docx/README.md` et les fixtures `11-styles-inline`, `12-paragraphes`, `13-styles-nommes` (produites par L22 en parallèle ; si elles n'existent pas encore quand tu commences, écris d'abord tes tests sur des fragments XML en chaîne via `preprocess/minimal-docx.ts`, puis ajoute les tests sur fixtures quand elles arrivent).

## Lot

### `styles.ts` — `createStyleResolver(pkg)`

- Lit `styles.xml` (via `pkg.related(pkg.mainPart, '/styles')`, repli `word/styles.xml`), `theme/theme1.xml` (polices `minorFont`/`majorFont` latin, pour `w:rFonts w:asciiTheme`), `settings.xml` si utile.
- `docDefaults` (`rPrDefault`, `pPrDefault`), styles `paragraph`, `character`, `table`, `numbering` ; chaîne `basedOn` résolue récursivement avec garde anti-cycle ; `w:default="1"` ; `link` entre style de paragraphe et de caractère ; `w:outlineLvl` et noms `Heading N` / `heading N` / `Titre N` (styleId `Heading1`… et `w:name`) → `headingLevel`.
- `paragraph(pPr)` : style résolu puis propriétés directes (`jc`, `spacing` : `line` + `lineRule` (`auto` → multiple = line/240 ; `exact`/`atLeast` → pt = line/20), `before`/`after` (twips → pt), `ind` (`left`/`start`, `right`/`end`, `firstLine`, `hanging` → `indentFirstLinePt` négatif), `pBdr` (côtés, `w:val` → `solid`/`dashed`/`dotted`/`double`, `w:sz` en huitièmes de point → `widthPt`, `w:color`, `auto` → `#000000`), `shd` (`w:fill` → `#rrggbb`), `keepNext`, `pageBreakBefore`, `numPr` → `numbering { numId, level }` (y compris hérité d'un style), `runDefaults` = run résolu du style de paragraphe.
- `run(rPr, paragraph)` : `paragraph.runDefaults` + style de caractère (`rStyle`) + propriétés directes : `rFonts` (`ascii` ou thème), `sz` (demi-points → pt), `b`/`bCs`, `i`, `u` (`w:val` → `DecorationStyle` : `single`→`solid`, `double`, `dotted`, `dash`→`dashed`, `wave`→`wavy`, `none` → `null`), `strike`/`dstrike`, `color` (`auto` → omis), `highlight` (noms Word → hex : `yellow` `#ffff00`, `green` `#00ff00`, `cyan` `#00ffff`, `magenta` `#ff00ff`, `blue` `#0000ff`, `red` `#ff0000`, `darkBlue` `#000080`, `darkCyan` `#008080`, `darkGreen` `#008000`, `darkMagenta` `#800080`, `darkRed` `#800000`, `darkYellow` `#808000`, `darkGray` `#808080`, `lightGray` `#c0c0c0`, `black` `#000000`), `shd` de run → `highlight` si pas de `highlight`, `vertAlign` (`superscript`/`subscript`), `spacing` (twips → `letterSpacingPt`), `caps`/`smallCaps`, `lang`. Une propriété à `w:val="0"`/`false` annule l'héritée.
- `tableStyle(id)` : bordures de table (`tblBorders`), bordures et fond de cellule (`tcPr` du style), marges (`tblCellMar`), `runDefaults`. Les styles conditionnels (`tblStylePr`) sont ignorés avec une note dans le rapport.
- `defaultFont()` : police et taille du style `Normal` résolu (ou des `docDefaults`).

### `runs.ts` — `convertRuns(paragraph, ctx, props)`

- Parcourt les enfants du `w:p` dans l'ordre : `w:r` (runs), `w:hyperlink` (`r:id` → `pkg.rels(ctx.part)` cible externe → `<a href>` ; `w:anchor` → `<a href="#ancre">`), `w:smartTag`/`w:sdt` inline (traversés), `w:fldSimple` (instr `PAGE`/`NUMPAGES`/`DATE`… : rendre le **résultat** en texte, sauf les `MERGEFIELD` déjà réécrits en `{{nom}}` par le prétraitement ; `HYPERLINK "url"` → `<a>`), champs complexes `w:fldChar` (`begin`…`separate`…`end` : texte du résultat seulement), `w:ins` (contenu conservé), `w:del` (ignoré), `w:bookmarkStart`/`End` ignorés, `w:commentRangeStart`/`End` et `w:commentReference` ignorés (L25 les signale au niveau bloc). Dans un `w:r` : `w:t` (espaces conservés avec `xml:space`), `w:tab` → `\t` rendu comme `&emsp;` **ou** mieux : un espace insécable large ; choisis et documente, `w:br` (`type="page"` → le paragraphe est coupé : rends `<hr data-page-break>` **entre** deux blocs ; signale dans ton rapport comment tu le remontes : `RawBlock` inséré par `paragraphs.ts` via un marqueur), `w:cr` → `<br>`, `w:sym` (police + code → caractère si police courante, sinon le caractère), `w:noBreakHyphen` → `‑`, `w:softHyphen` → `&shy;`, `w:drawing` → `ctx.images.drawing`, `w:pict` → `ctx.images.drawing` aussi (VML), `w:footnoteReference`/`w:endnoteReference` → `ctx.notes.reference`, `w:lastRenderedPageBreak` ignoré.
- Runs consécutifs aux **mêmes propriétés résolues** sont fusionnés en un seul `<span>` (sinon le HTML explose). Rendu d'un run : marques imbriquées dans un ordre fixe `<strong><em><u><s><sup|sub><span style data-docx-run-style>texte</span></sup></s></u></em></strong>`, le `<span>` seulement s'il porte une propriété (`font-family`, `font-size: 11pt`, `color`, `background-color` (surlignage, comme Tiptap `backgroundColor`), `letter-spacing`, `text-transform`, `font-variant`) ou `data-docx-run-style` ; `u`/`s` avec `style="text-decoration-style: double"` quand ≠ `solid`. Les propriétés **égales aux `runDefaults` du paragraphe ne sont pas répétées** sur les runs (elles iront sur le bloc via `paragraphs.ts` : `font-family` et `font-size` du paragraphe en `style` du `<p>` sont lus par Tiptap comme… rien ; donc **décision figée** : les polices et tailles de paragraphe sont posées sur chaque run quand elles diffèrent des `docDefaults`, jamais sur le bloc).
- Le texte est échappé (`escapeHtml`), les espaces en début et fin de run conservés.

### `paragraphs.ts` — `convertParagraph(p, ctx)`

- `props = ctx.styles.paragraph(pPr)` ; balise `<hN>` si `headingLevel`, sinon `<p>` ; attributs dans **l'ordre du contrat** via `styleAttr` : `text-align` (si `align` et ≠ `left`), puis `line-height`, `margin-top`, `margin-bottom`, `margin-left`, `margin-right`, `text-indent`, `border-*`, `background-color`, puis `data-docx-style="<styleId>"` (toujours quand connu), `data-keep-next`, `data-page-break-before`. Les valeurs égales aux `docDefaults` ne sont pas émises (un `Normal` sans rien donne `<p data-docx-style="Normal">`).
- `numbering` recopié depuis `props` (L25 regroupe en listes et retire alors `margin-left`/`text-indent` issus de la numérotation : pose `data-docx-num-indent` si l'indentation vient du niveau de liste, documente).
- `isEmpty` : aucun texte ni image ni saut.
- `w:br type="page"` au milieu d'un paragraphe : coupe en deux blocs + `RawBlock` `<hr data-page-break>` ; comme `convertParagraph` retourne un seul `ParagraphBlock`, retourne le premier et stocke les suivants dans une file que `index.ts` ne connaît pas… **non** : solution figée : `ParagraphBlock.html` peut contenir plusieurs blocs frères (`<p>a</p><hr data-page-break><p>b</p>`), le rendu les concatène tel quel. Documente-le dans le rapport.

## Périmètre

✅ `packages/word/src/docx/reader/styles.ts`, `runs.ts`, `paragraphs.ts`, leurs specs (`styles.spec.ts`, `runs.spec.ts`, `paragraphs.spec.ts`), `reader/units.ts` (conversions twips/pt/mm, couleurs, à créer, partagé en lecture seule par L25 : signale-le), `fixtures/docx/expected/11-*.html`, `12-*.html`, `13-*.html` (HTML attendu figé du chemin `styled`, généré par un test de type « snapshot explicite » avec normalisation comme `import-docx.spec.ts`). ❌ `index.ts`, `types.ts`, `package.ts`, `html.ts`, les fichiers de L25, `import-docx.ts`, `core`.

## Tests

- Unitaires par règle de résolution (fragments XML parsés avec `DOMParser` `application/xml`) : chaîne `basedOn` à trois niveaux, `docDefaults`, thème, annulation par `w:val="0"`, cycle `basedOn` (pas de boucle infinie), `lineRule` auto/exact, `hanging`, bordures, surlignage nommé, `rStyle` + direct, fusion de runs voisins, `fldSimple` PAGE, hyperlien externe et interne, saut de page.
- Fixtures 11-13 : le HTML `styled` contient les libellés et les styles attendus (assertions ciblées **et** `expected/*.html` figés).
- Idempotence avec le core : un test qui monte un éditeur (`@aster-editor/core` est une dépendance du paquet, `mountEditor` n'est pas exporté : utilise `createEditor` avec un `div` jsdom) et vérifie `setHTML(html)` puis `getHTML()` ≡ `html` normalisé pour 11-13 — ce test ne peut passer qu'après L23 ; écris-le, et s'il échoue parce que le core n'a pas encore les attributs, marque-le `it.skip` avec un commentaire `TODO L23` et dis-le dans le rapport.
- `cd packages/word && npx vitest run` vert (jamais `-w`), `npx tsc -p tsconfig.json --noEmit`, `npx eslint src/docx/reader`.

## Pièges

Outil Write ; pas de `\u00a0` littéral (`String.fromCharCode(160)`) ; `verbatimModuleSyntax` ; zéro `any` ; namespaces XML : toujours `localName` et `wordAttribute` (jamais `getAttribute('w:val')` seul) ; `xml:space="preserve"` ; ne jamais muter le `Document` du paquet (il est partagé, L25 le relit) ; les twips sont des entiers, arrondis à deux décimales en pt ; ne lance ni n'arrête de serveur.

## Rapport attendu

`## Rapport Lot L24` : Fait / Non fait / Décisions (saut de page, tabulations, polices sur runs, styles conditionnels) / Blocages / Propositions de contrat / Tests (compteurs) / Fichiers / Points à vérifier pour L25 et L27 (noms des helpers de `units.ts`, forme exacte du HTML des runs).
