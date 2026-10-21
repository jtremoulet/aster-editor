# Brief — Lot L42 : sections, tabulations, bordures et styles conditionnels dans le lecteur (`word/docx/reader`)

> Session 4, vague 1. Cible 1h45. Tu modifies le lecteur existant (sessions 3) : lis d'abord `docs/JOURNAL.md` section Session 3 (décisions L24, L25, F24, F25) et `docs/reviews/R24.md`, `R25.md`.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION4.md`, **`packages/core/src/api/layout.ts` (contrat : `DocumentLayout.sections`, `SectionLayout`, `SectionBreakAttrs` → `<hr data-section-break="n">`, `TabAttrs` → `<span data-tab="" data-stop="36pt"></span>`, `BlockBorder.spacePt` → `padding-<côté>`, `TableLayoutAttrs.align` → `data-align`)**, `reader/index.ts` (`allSectPrs`, `readEffectiveHeadersFooters`), `reader/sections.ts`, `reader/headers.ts`, `reader/runs.ts` (tabulation = espace cadratin U+2003 aujourd'hui), `reader/paragraphs.ts`, `reader/properties.ts` (bordures), `reader/tables.ts`, `units-blocks.ts`, `reader/styles.ts` (`tableStyle`, `tblStylePr` ignorés), fixtures `16-sections`, `18-sections-triple`, `19-tabulations-bordures` (L40, en parallèle : en attendant, fragments XML), document client `fixtures/docx/client/Modele_Demo_DER.docx` (hors dépôt, `skipIf`).

## Lot

1. **Sections** (`index.ts`, `sections.ts`, `headers.ts`) : `layout.sections[]` dans l'ordre du document, chaque section avec `page`, `columns`, `titlePage`, `start` (`w:type`), `headers` / `footers` **effectifs** (héritage de la précédente type par type, comme aujourd'hui pour la dernière) ; les champs de premier niveau = dernière section (inchangé). Dans le corps : après le dernier bloc de chaque section sauf la dernière, un `RawBlock` `<hr data-section-break="n">`. Un `w:sectPr` dans le `pPr` d'un paragraphe **vide** (forme fréquente de Word) ne laisse pas de `<p></p>` parasite : le paragraphe porteur est rendu s'il a du contenu, sinon seul le saut est émis. Document client : 3 sections, pied présent sur les trois (`sections[0..2].footers.default`).
2. **Tabulations** (`runs.ts`, `paragraphs.ts`, `properties.ts`) : `w:tab` → `<span data-tab=""></span>` ; les taquets du paragraphe (`w:tabs` résolus avec le style, `w:clear` retiré) donnent `data-stop="Npt"` sur chaque tabulation dans l'ordre (le premier `w:tab` du paragraphe prend le premier taquet > position courante estimée… approximation : n-ième tabulation = n-ième taquet défini, sinon pas de `data-stop`). Un taquet `decimal`/`right`/`center` est noté `data-stop-align` ? **Non** : hors contrat, ignore l'alignement, note-le.
3. **Bordures** (`properties.ts`, `units.ts`, `tables.ts`) : `w:space` → `spacePt` ; couleur exacte conservée (`#bfbfbf` ne devient jamais noir : vérifie `borderColor` et `auto` seulement → `#000000`) ; cellule : un côté `nil` **explicite** sur `tcBorders` alors que le style ou le tableau en pose un → représenté (`border-<côté>: 0pt none` ? hors contrat) : **décision figée** : une bordure effective absente sur une cellule intérieure n'est pas émise (comme aujourd'hui), mais une bordure `nil` **explicite** qui annule celle du tableau est émise comme `border-<côté>: 0pt solid transparent`, que le core relit comme `BlockBorder { widthPt: 0 }` ; vérifie que `layout-css.ts` du core accepte `0pt` et `transparent` (sinon propose dans ton rapport et émets quand même).
4. **Alignement de tableau** (`tables.ts`) : `w:jc` → `data-align="center|right"` (`left` omis).
5. **Styles conditionnels** (`styles.ts`, `tables.ts`) : `w:tblStylePr` `firstRow`, `lastRow`, `firstCol`, `lastCol`, `band1Horz`, `band2Horz`, `band1Vert`, `band2Vert` lus dans `tableStyle(id)` (propriétés de cellule et de run) et appliqués selon `w:tblLook` (`firstRow`, `lastRow`, `firstColumn`, `lastColumn`, `noHBand`, `noVBand`) à chaque cellule comme propriétés directes (fond, bordures, gras) **seulement si la cellule n'en pose pas**. Sacrifice n° 2 de la roadmap : si le temps manque, `firstRow` et `band1Horz` seulement.

## Périmètre

✅ `packages/word/src/docx/reader/**` (sauf `types.ts` : `ReaderResult.layout` reste `DocumentLayout`, qui contient déjà `sections`), `fixtures/docx/expected/16-sections.html` (régénéré : `ASTER_REGEN=1 npx vitest run src/docx/reader/regen-expected.spec.ts` après avoir ajouté 18 et 19 à `NAMES`), `expected/18-*.html`, `expected/19-*.html`. ❌ `import-docx.ts`, `writer/**`, `export/**`, `compare/**`, `core`.

## Tests

Sections (fixture 16 : 2 sections, `sections[1]` Letter paysage, `sections[0]` A4 avec `first` ; fixture 18 : 3 sections, saut `continuous`, en-têtes hérités ; client : 3 sections, pied sur chacune ; `sectPr` dans un paragraphe vide), tabulations (taquets, sans taquet, dans une cellule), bordures (`space`, couleurs, `nil` explicite), `w:jc`, styles conditionnels (fixture 19 et fragments), idempotence stricte avec le core sur 16, 18, 19 (comme `paragraphs.spec.ts`, `it.skip` + `TODO L41` si le core n'a pas encore les nœuds au moment du test, et dis-le). `cd packages/word && npx vitest run src/docx/reader` puis la suite complète (jamais `-w`), typecheck, eslint, prettier.

## Pièges

Outil Write ; pas de `\u00a0` ; `localName` + `wordAttribute` ; ne jamais muter le `Document` du paquet ; les tests du comparateur (`compare/`) et de la greffe (`writer/`) lisent ton HTML : une forme qui change casse leurs attendus, cite dans ton rapport tout changement de forme hors contrat ; ne lance ni n'arrête de serveur.

## Rapport attendu

`## Rapport Lot L42` : Fait / Non fait / Décisions / Blocages / Propositions de contrat / Formes HTML exactes émises (sections, tabulations, bordures, `data-align`, styles conditionnels) pour L43 / `layout.sections` exact des fixtures 16, 18 et du client / Tests (compteurs) / Fichiers.
