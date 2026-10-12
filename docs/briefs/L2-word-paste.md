# Brief — Lot L2 : `@aster-editor/word`, normaliseur de collage Word et Google Docs

> Envoyé à 22:52 à l'agent `a050c081`. Cible 2h30.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`, tout installé. Lire `CLAUDE.md`, `docs/ARCHITECTURE.md` (section word), `docs/STRATEGIE_TESTS.md`, `packages/core/src/api/paste.ts` et `editor.ts`. Remplacer les stubs `paste/`, `google/`, `extension/` en gardant les noms exportés. L3 écrit en parallèle dans `packages/word/src/docx/` : ne modifier `index.ts` que sur les lignes `paste`/`google`/`extension`.

## Lot

Pipeline pur : HTML presse-papier Word/Google Docs → HTML sémantique pour le schéma ProseMirror.

- `paste/detectors.ts` : `isWordHtml` (namespace Office, `Mso`, `mso-`, `<o:p>`, `ProgId`), `isGoogleDocsHtml` (`docs-internal-guid`).
- `paste/passes/*.ts`, une passe par fichier `(doc, options) => void` : `strip-conditional-comments` (dont `<![if !supportLists]>` traités au niveau texte avant parsing), `strip-office-namespaces`, `rebuild-lists` (lecture `mso-list:lXX levelN lfoM`, retrait du marqueur `mso-list:Ignore`, puces vs numéros depuis le marqueur ou `@list` du `<style>`, reconstruction `ul/ol` imbriqués, listes interrompues, listes différentes successives, niveaux qui sautent), `normalize-headings` (`MsoTitle` → h1, `MsoQuote` → blockquote, `MsoListParagraph` sans liste → p), `clean-inline-styles` (suppression `mso-*`, polices, tailles, marges ; conversion `font-weight:bold` → strong, italic → em, underline → u, line-through → s ; `color` si `keepColors` ; `text-align` si `keepAlignment` ; spans vides remontés ; attributs `class`, `lang`, `align` retirés), `normalize-tables` (attributs de layout retirés, `colspan`/`rowspan` conservés, première ligne en `thead > th` si tout en gras ou `mso-yfti-firstrow:yes`), `collapse-empty-paragraphs`, `normalize-whitespace`.
- `paste/normalize-word-html.ts` : extraction du fragment `StartFragment`/`EndFragment`, passes dans l'ordre, sérialisation `body.innerHTML`, parsing injectable via `options.parse`, aucun `document` global.
- `google/normalize-google-docs-html.ts` : déballage du `<b style="font-weight:normal">`, spans → strong/em/u, retrait `style`/`dir`/`role`/`aria-level`, réutilisation des passes Word.
- `extension/word-paste.ts` : `wordPasteTransformer(options)` : Word → `normalizeWordHtml`, Google → `normalizeGoogleDocsHtml`, sinon inchangé ; ne lève jamais.

Fixtures : `fixtures/word-html/*.html`, lues via `import.meta.env.ASTER_FIXTURES`. HTML attendu à écrire dans `fixtures/word-html/expected/`.

## Périmètre

✅ `packages/word/src/{paste,google,extension}/**`, lignes correspondantes de `index.ts`, `fixtures/word-html/**`. ❌ `docx/`, tout le reste, aucune dépendance.

## Définition de fini

Détecteurs corrects ; `word-365-list-nested` → `ul` imbriquée + `p` + `ol` avec sous-`ol`, zéro `mso-`/`<o:p>`/`class` ; `word-365-table` → `thead > th`, `colspan="2"`, zéro layout ; `word-2016-headings` → h1/h2, blockquote, `text-align:center` + em, lien, sub/sup/s/u, aucune police, couleur selon `keepColors` ; `google-docs-basic` → h1, strong/em/u, liste imbriquée, lien, zéro style ; transformateur robuste ; couverture ≥ 90 % sur ses dossiers.

## Temps et repli

2h30. Sacrifier dans l'ordre : Google Docs, `keepColors`, détection d'en-tête.

## Rapport attendu

Structure imposée (voir `docs/BRIEF_AGENT.md`).
