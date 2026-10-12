# Brief — Lot L3 : `@aster-editor/word`, import .docx via mammoth

> Envoyé à 22:52 à l'agent `a83b4e4f`. Cible 2h.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`, tout installé. Lire `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/STRATEGIE_TESTS.md`, `packages/core/src/api/options.ts` (`UploadHandler`), stubs `packages/word/src/docx/`. L2 écrit en parallèle dans `paste/`, `google/`, `extension/` : ne modifier `index.ts` que sur les lignes `docx`.

## Lot

`importDocx(input: File | ArrayBuffer, options?): Promise<DocxImportResult>` dans `packages/word/src/docx/` :

- `style-map.ts` : style map mammoth Aster (Title/Titre → h1, Heading 1..6 / Titre 1..6 → h1..h6, Quote/Citation → blockquote, Code → pre, Strong/Emphasis, surlignage → mark si supporté) ; `options.styleMap` ajoutée après.
- `import-docx.ts` : mammoth en import dynamique ; `File` → `arrayBuffer()` ; `convertToHtml` avec `styleMap` et `convertImage` (hook `upload` → URL, échec → avertissement `image-upload-failed` + base64 ; sans hook → `imgElement` base64) ; messages mammoth → `DocxImportWarning` code `mammoth` ; notes de bas de page conservées (ancres internes en texte `[1]`) ou supprimées si `footnotes: false` ; buffer invalide → rejet `invalid-docx`.
- `postprocess/*.ts`, parsing injectable, jamais de `document` global : `normalize-tables` (`tbody`, `thead > th` si première ligne en gras, `colspan`/`rowspan`), `unwrap-cell-paragraphs` (garder les `<p>` dans les cellules, cellule vide → `<p></p>`), `normalize-lists` (`li` avec bloc `p`, sous-listes rattachées au `li` précédent), `normalize-images` (`alt` vide si absent), `strip-empty-paragraphs` (sauf cellules), `footnotes`.

Fixtures : `fixtures/docx/01..03.docx` (contenu décrit par `scripts/generate-fixtures.ts`), HTML attendu à écrire dans `fixtures/docx/expected/`. Déclaration de types mammoth minimale et stricte si absente.

## Périmètre

✅ `packages/word/src/docx/**`, lignes `docx` de `index.ts`, `fixtures/docx/expected/**`. ❌ `paste/`, `google/`, `extension/`, `.docx`, `scripts/`, tout le reste, aucune dépendance.

## Définition de fini

`01` : h1/h2/h3, strong/em/u, `ul` 3 niveaux, `ol` avec sous-`ol`, lien ; `02` : `thead > th`, `td colspan="2"`, cellules avec `<p>` ; `03` : `img` data URL PNG avec `alt`, note conservée puis supprimée ; hook `upload` succès et échec ; avertissements remontés ; `invalid-docx` ; couverture ≥ 90 % sur `docx/`.

## Temps et repli

2h. Sacrifier dans l'ordre : notes de bas de page, détection d'en-tête, noms de styles français.

## Rapport attendu

Structure imposée (voir `docs/BRIEF_AGENT.md`).
