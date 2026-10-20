# Brief — Lot L27 : export dans le gabarit (`word/docx/writer`)

> Session 3, vague 2. Envoyé après intégration de L23-L25. Cible 2h30. Le livrable décisif : un `.docx` importé, édité, ressort avec tout ce qui n'est pas le corps **identique à l'octet**.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION3.md`, **`packages/word/src/export/types.ts` (`DocxExportOptions.template`, `layout`)**, `export/export-docx.ts` et `export/html-to-docx.ts` (chaîne d'export actuelle : HTML → objets de la lib `docx` → `Packer`), `export/styles.ts`, `export/lists.ts` (numérotation générée), `export/images.ts`, `export/footnotes.ts`, `export/header-footer.ts`, `export/variables.ts`, `docx/reader/package.ts` (lecture du paquet : réutilise `openPackage`, `relsPathOf`, `resolveTarget`), `docx/reader/types.ts`, `docx/preprocess/variables.ts` (modèle de réécriture d'un zip avec jszip : `zip.file(path, xml)` puis `generateAsync`), **`packages/core/src/api/layout.ts`** (attributs `data-docx-style`, `data-docx-run-style`, `data-docx-num-id`, styles inline que le corps édité porte), fixtures 11-17 et `expected/`.

## Principe figé : la greffe

1. Le HTML (ou JSON) édité est converti par la **chaîne d'export existante** en un `.docx` neuf en mémoire (`generated`).
2. Le gabarit (`options.template`) est ouvert avec jszip ; **aucune de ses parties n'est réécrite** sauf : `word/document.xml` (corps), `word/_rels/document.xml.rels` (relations du corps, fusionnées), `word/media/*` (images ajoutées, jamais supprimées), `word/numbering.xml` (définitions **ajoutées** pour les listes sans `data-docx-num-id`, jamais modifiées), `word/styles.xml` (styles **ajoutés** seulement s'ils sont référencés par le corps et absents du gabarit : `ListParagraph`, `Hyperlink`, `TableGrid`, `FootnoteText`…), `word/footnotes.xml` + rels si le corps a des notes (fusion : conserver les séparateurs du gabarit), `[Content_Types].xml` (types par défaut ajoutés si nouvelles extensions d'images).
3. Dans `generated/word/document.xml`, on prend les enfants de `<w:body>` **sauf** le `w:sectPr` final, on les greffe dans le `w:body` du gabarit **à la place** de ses blocs, en conservant **son** `w:sectPr` final (en-têtes, pieds, marges, colonnes intacts).
4. Remappages dans le corps greffé : `w:rId` des relations (images, liens, notes) → nouveaux ids sans collision avec ceux du gabarit ; `w:numId` → si le bloc porte `data-docx-num-id` existant dans le gabarit, on **réutilise** ce `numId` (et l'`ilvl` du niveau), sinon le `num` généré est ajouté à `numbering.xml` avec de nouveaux ids ; `w:pStyle`/`w:rStyle`/`w:tblStyle` → si `data-docx-style` est présent et que le style existe dans le gabarit, on **réutilise l'identifiant du gabarit** et l'on **retire les propriétés directes égales au style résolu** (relis `styles.xml` du gabarit avec le `StyleResolver` de L24 pour résoudre), sinon on garde le style généré (ajouté à `styles.xml` s'il manque).
5. Pour obtenir les `data-docx-*` et les styles inline dans la chaîne existante, elle doit les **transmettre** : étends `html-to-docx.ts` (et `styles.ts`, `lists.ts`, tables) pour lire `data-docx-style` → `pStyle`, `data-docx-run-style` → `rStyle`, `data-docx-num-id` → attribut interne, et pour appliquer les styles inline du contrat (`line-height`, `margin-*`, `text-indent`, `border-*`, `background-color`, `letter-spacing`, `text-transform`, `font-variant`, `text-decoration-style`, bordures et fond de cellule, `vertical-align`, `padding`, `width` de table) aux objets `docx` correspondants (`Paragraph.spacing`, `indent`, `border`, `shading`, `TextRun.characterSpacing`, `allCaps`, `smallCaps`, `underline.type`, `TableCell.borders`, `shading`, `verticalAlign`, `margins`, `Table.width`). Ces ajouts valent aussi pour l'**export neuf** (sans gabarit) : la mise en page éditée est alors écrite directement, et `DocxExportOptions.layout` alimente `page`, `header`, `footer`, `defaultFont`, `lang` (champ par champ, les options explicites priment).
6. Variables : mode `fields` inchangé (les `MERGEFIELD` sont dans le corps généré). `toc` et `numberedHeadings` s'appliquent au corps.

## Repli obligatoire (ordre de sacrifice)

Si la greffe des listes échoue (ids introuvables, `numbering.xml` absent du gabarit) : les listes repassent en numérotation neuve ajoutée, avertissement `template-numbering-fallback`. Si un style référencé n'existe ni dans le gabarit ni dans le généré : propriétés directes seules, avertissement `template-style-missing`. Si le gabarit n'est pas un `.docx` lisible : export neuf, avertissement `template-invalid` (ne jamais lever). Codes d'avertissement **additifs** dans `export/types.ts` (ton périmètre).

## Périmètre

✅ `packages/word/src/docx/writer/**` (nouveau : `graft.ts`, `relationships.ts`, `numbering-merge.ts`, `styles-merge.ts`, `content-types.ts`, specs), `export/export-docx.ts` (branchement `template`), `export/html-to-docx.ts`, `export/styles.ts`, `export/lists.ts`, `export/tables.ts`, `export/inline.ts`, `export/blocks.ts`, `export/types.ts` (additif), `export/header-footer.ts` (lecture de `layout`), `export/*.spec.ts`, `index.ts` (exports additifs). ❌ `docx/reader/**` (lecture seule : tu importes `openPackage` et `createStyleResolver`), `core`, `ui`, `angular`, `import-docx.ts`.

## Tests

- Greffe sans modification : pour chaque fixture 11-17, `importDocx(styled)` → `exportDocx(html, { template })` → les parties hors corps sont **identiques à l'octet** à celles du gabarit (test générique sur la liste des parties), le `w:sectPr` final est celui du gabarit, le corps relu par `importDocx(styled)` donne le même HTML normalisé qu'au départ (idempotence `import → export → import`).
- Greffe avec modification locale : un mot changé → seul ce run diffère dans `document.xml` (comparaison XML après retrait des `rsid`).
- Listes : réutilisation du `numId` du gabarit (fixture 15), ajout d'une liste neuve dans un gabarit, repli sans `numbering.xml`.
- Styles : `data-docx-style="Citation"` → `w:pStyle w:val="Citation"` sans propriétés directes redondantes (fixture 13) ; style absent → ajout.
- Images : ajout d'une image dans un gabarit qui en a déjà (ids sans collision, `[Content_Types].xml` mis à jour).
- Notes : corps avec notes dans un gabarit sans `footnotes.xml`, et inversement.
- Export neuf : chaque style inline du contrat se retrouve dans le XML (`w:spacing`, `w:ind`, `w:pBdr`, `w:shd`, `w:spacing` de run, `w:caps`, `w:u w:val="double"`, `w:tcBorders`, `w:vAlign`, `w:tcMar`, `w:tblW`), `layout` → `pgSz`, `pgMar`, en-têtes et pieds.
- Variables en mode `fields` dans un gabarit (fixture 09 ré-exportée) : champs présents, aller-retour conserve les valeurs.
- `cd packages/word && npx vitest run` vert (jamais `-w`), typecheck, eslint, prettier.

## Pièges

Outil Write ; pas de `\u00a0` ; `verbatimModuleSyntax` ; zéro `any` ; la lib `docx` numérote ses relations `rId1`… à partir de 1 : le remappage est obligatoire, jamais un simple ajout ; `generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })` ; conserver l'ordre des parties du zip n'est pas requis mais ne réécris pas une partie non modifiée (jszip conserve les octets d'une entrée non touchée) ; un `w:sectPr` peut aussi apparaître dans un `w:pPr` (sections multiples) : conserver ceux du gabarit n'a pas de sens pour un corps régénéré, documente que seules les propriétés de la **dernière** section survivent ; les `rsid` ne sont pas générés.

## Rapport attendu

`## Rapport Lot L27` : Fait / Non fait / Décisions / Blocages / Repli déclenchés sur les fixtures / Propositions de contrat / Tests (compteurs) / Fichiers / Points à vérifier dans Word réel (liste pour la checklist de Joris).
