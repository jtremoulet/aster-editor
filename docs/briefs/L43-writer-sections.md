# Brief — Lot L43 : sections, tabulations, bordures et alignement de tableau à l'export (`word/docx/writer`, `word/src/export`)

> Session 4, vague 1. Cible 2h. Tu modifies la greffe et l'export existants (L27, F27) : lis d'abord `docs/JOURNAL.md` section Session 3 (L27, F27) et `docs/reviews/R27.md`.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION4.md`, **`packages/core/src/api/layout.ts` (contrat : `DocumentLayout.sections`, `SectionLayout`, `<hr data-section-break="n">`, `<span data-tab="" data-stop="36pt">`, `BlockBorder.spacePt` = `padding-<côté>`, `TableLayoutAttrs.align` = `data-align`)**, `writer/graft.ts` (corps greffé, `w:sectPr` final conservé et complété par héritage), `writer/template.ts`, `writer/header-footer-graft.ts`, `writer/style-reconcile.ts`, `export/html-to-docx.ts`, `export/blocks.ts`, `export/inline.ts` (tabulation : aujourd'hui l'espace cadratin U+2003 est réécrit en `w:tab` ? vérifie), `export/tables.ts`, `export/styles.ts` (`paragraphBorderSpace`), `export/header-footer.ts`, `export/layout.spec.ts`, fixtures 16, 18, 19 (L40, en parallèle) et le document client (hors dépôt, `skipIf`). Le lecteur (L42, en parallèle) produira `layout.sections[]` et les `<hr data-section-break>` ; en attendant, construis tes entrées à la main dans les tests.

## Lot

1. **Sections à l'export neuf** (`html-to-docx.ts`, `blocks.ts`, `header-footer.ts`) : le HTML est découpé aux `<hr data-section-break="n">` ; chaque segment devient une `section` de la lib `docx` avec les propriétés de `layout.sections[n - 1]` (page, colonnes, `titlePage`, `start` → `properties.type`, en-têtes et pieds propres ou hérités) ; la dernière section prend `layout.sections[last]` ou, à défaut, les champs de premier niveau (comportement 0.5 conservé sans `sections`).
2. **Sections dans le gabarit** (`graft.ts`, `template.ts`) : pour un corps à `k` sauts, le corps greffé porte `k + 1` sections : les `w:sectPr` des sections 1..k sont écrits dans le `w:pPr` du **dernier paragraphe** de chaque segment (créé vide s'il faut), le `w:sectPr` final reste celui du gabarit. Chaque `w:sectPr` est **greffé depuis le gabarit** quand la section n existait (`allSectPrs` du gabarit, dans l'ordre : même nombre de sections → correspondance par index, sinon par les propriétés) : copié à l'octet avec ses `headerReference` / `footerReference` (relations déjà présentes) ; sinon généré depuis `layout.sections[n - 1]` (en-têtes et pieds régénérés comme `header-footer-graft.ts` le fait pour la dernière section). Document client : 3 sections ressortent avec leurs 3 `w:sectPr` identiques à l'octet au gabarit, pied présent partout. Fixture 16 : score ≥ 0,98 dans le gabarit.
3. **Tabulations** (`inline.ts`) : `<span data-tab>` → `w:tab` ; `data-stop` → `w:tabs` sur le paragraphe (taquets `left` aux positions des tabulations qui en portent, dédoublonnés, triés) ; l'ancien espace cadratin n'est plus produit par le lecteur mais reste accepté (converti en `w:tab`).
4. **Bordures** (`styles.ts`, `blocks.ts`, `tables.ts`, `style-reconcile.ts`) : `padding-<côté>` → `w:space` (sinon la règle 1 pt / 4 pt actuelle) ; couleur exacte conservée ; `border-<côté>: 0pt solid transparent` (bordure `nil` explicite du lecteur) → `<w:<côté> w:val="nil"/>` sur `tcBorders` / `pBdr` ; cellules intérieures sans bordure déclarée : comportement actuel.
5. **Alignement** (`tables.ts`) : `data-align` → `w:jc` du tableau (`center`, `right`), `style="margin: 0 auto"` accepté aussi.
6. **Styles conditionnels** (`tables.ts`, `style-reconcile.ts`) : les propriétés directes que le lecteur a posées à cause d'un style conditionnel (fond, gras de première ligne) sont **supprimées** à l'export dans le gabarit quand le style du gabarit avec son `tblLook` les produit déjà (réconciliation : résoudre `tblStylePr` comme L42 le fait, sur le même `tblLook`) ; export neuf : propriétés directes conservées. Sacrifice n° 2 si le temps manque.

## Périmètre

✅ `packages/word/src/docx/writer/**`, `packages/word/src/export/**`, leurs specs, `packages/word/src/index.ts` (exports additifs). ❌ `reader/**` (lecture seule : tu importes `readSectionLayout`, `readHeadersFooters`, `allSectPrs` s'ils sont exportés ; sinon duplique le minimum et signale), `compare/**`, `import-docx.ts`, `core`.

## Tests

Export neuf : 3 sections depuis un HTML à 2 sauts (`w:sectPr` ×3 dans le XML, types, pages, en-têtes propres et hérités, `layout` relu identique par `importDocx` styled une fois L42 intégré, sinon lecture XML directe) ; gabarit : fixture 16 et 18 aller-retour sans modification → `w:sectPr` identiques à l'octet, parties annexes identiques, `document.xml` équivalent ; document client : 3 `sectPr`, pied partout ; modification locale dans la section 2 → seule la section 2 change ; tabulations (fixture 19 : `w:tab` et `w:tabs` restitués, idempotence import → export → import une fois L42 intégré) ; bordures (`w:space` 1/4/8, couleurs, `nil` explicite) ; `w:jc` ; styles conditionnels. `cd packages/word && npx vitest run src/docx/writer src/export` puis la suite complète (jamais `-w`), typecheck, eslint, prettier ; `checkIntegrity()` du harnais sur chaque paquet produit.

## Pièges

Outil Write ; pas de `\u00a0` ; la lib `docx` numérote les en-têtes de chaque section : les relations sont remappées par `relationships.ts` ; un `w:sectPr` copié du gabarit référence des parties qui existent déjà : ne pas les dupliquer ; `generateAsync` ; fichiers < 400 lignes (découpe `graft.ts` si besoin : `graft-sections.ts`) ; ne lance ni n'arrête de serveur.

## Rapport attendu

`## Rapport Lot L43` : Fait / Non fait / Décisions / Blocages / Propositions de contrat / Résultats sur 16, 18, 19 et le client (`sectPr` à l'octet, scores si `compare` tourne) / Tests (compteurs) / Fichiers (tailles) / Points à vérifier dans Word réel.
