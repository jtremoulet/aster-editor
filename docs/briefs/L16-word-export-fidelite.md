# Brief — Lot L16 : export Word des variables et fidélité (`@aster-editor/word`, dossier `export/`)

> Session 2, vague 1. Cible 2h30.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION2.md`, `packages/core/src/api/variables.ts`, `packages/word/README.md` (section export), **tout `packages/word/src/export/**`** (contexte, blocs, inline, listes, tables, images, styles, sanitize, `testing/sample.ts` avec `toZipEntries`), `scripts/generate-fixtures-extra.ts` et `generate-fixtures-variables.ts` (API `docx` : `Header`, `Footer`, `PageNumber`, `PageBreak`, `SimpleMailMergeField`, `FootnoteReferenceRun`, `footnotes`, `TableOfContents`). Lis `node_modules/docx/dist/index.d.ts` pour `SimpleMailMergeField`, `SimpleField`, `TableOfContents`, `ISectionOptions` (`properties.page.size/margin/orientation`), `Header`/`Footer`, `PageBreak`, `HeadingLevel` + numérotation de titres via `numbering` sur les styles.

Convention HTML des variables (core) : `<span data-aster-variable="nom" data-label="…">{{nom}}</span>`.

## Lot

### Variables

- `DocxExportOptions.variables?: { mode: 'resolve' | 'fields' | 'placeholders'; values?: VariableValues }` (défaut `placeholders`) :
  - `placeholders` : texte `{{nom}}` tel quel ;
  - `resolve` : valeur de `values[nom]` (texte, marques du span conservées), sinon `{{nom}}` ;
  - `fields` : `SimpleMailMergeField(nom)` ; si une valeur est connue, l'émettre comme résultat de champ (`SimpleField(\`MERGEFIELD nom\`, valeur)`si la lib le permet, sinon`SimpleMailMergeField` seul, documente).
- Un `{{nom}}` en **texte brut** (pas de span) est aussi reconnu en mode `fields`/`resolve` (pattern, option `variables.pattern`).
- Aller-retour : `exportDocx(html, { variables: { mode: 'fields' } })` → `importDocx` (prétraitement du lot L15 non disponible en parallèle : teste le XML `numbering`/`document.xml` via `toZipEntries` : présence de `w:fldSimple w:instr=" MERGEFIELD nom "`).

### Fidélité Word

- **En-têtes et pieds de page** : `options.header?: string | { html?: string; text?: string; align? }`, `options.footer?: … + { pageNumbers?: boolean | 'x-of-y' }` → `Header`/`Footer` avec `PageNumber.CURRENT` / `TOTAL_PAGES`. HTML inline simple accepté (gras/italique/liens) via le convertisseur inline existant.
- **Saut de page** : `<div data-page-break></div>` ou `<hr data-page-break>` ou `<p style="page-break-before: always">` → `PageBreak`.
- **Table des matières** : `options.toc?: boolean | { title?: string; levels?: number }` → `TableOfContents` en tête (champ Word mis à jour à l'ouverture ; documente que Word demande une mise à jour).
- **Notes de bas de page** : `<sup data-footnote-ref="1">` + `<ol data-footnotes><li data-footnote="footnote-1">` (format produit par l'import) → vraies notes Word (`footnotes` + `FootnoteReferenceRun`), liste retirée du corps.
- **Numérotation des titres** : `options.numberedHeadings?: boolean | { levels?: number; format?: 'decimal' | 'legal' }` → `1.`, `1.1`, `1.1.1` via `numbering` lié aux styles `Heading1..6`.
- **Largeurs de colonnes** : `colwidth` / `style="width"` sur les cellules → `columnWidths` + `width` par cellule (DXA), `table-layout: fixed` quand défini.
- **Mise en page** : `options.page?: { size?: 'A4' | 'LETTER'; orientation?: 'portrait' | 'landscape'; margins?: { top, right, bottom, left } en mm }` (remplace/complète `pageSize`), `options.lang?` (`w:lang`), `options.defaultFont?: { family, sizePt }`.
- **Styles de titres** : `options.headingStyles?` (couleur, taille) optionnel ; par défaut, les titres restent ceux de Word.

### Doc

README section export : nouvelles options, tableau de mapping étendu, limites.

## Périmètre

✅ `packages/word/src/export/**`, `index.ts` (exports additifs), `README.md` (section export). ❌ `docx/`, `paste/`, `google/` (L15 en parallèle), `core`, `ui`. Aucune dépendance.

## Tests (`cd packages/word && npx vitest run --coverage`, jamais `-w`)

Variables : 3 modes (XML vérifié : texte, valeur, `fldSimple`), span + texte brut, pattern custom, marques conservées. En-tête/pied : XML `header1.xml`/`footer1.xml` présents avec `PAGE`/`NUMPAGES`. Saut de page : `w:br w:type="page"`. TOC : `w:fldChar`/`TOC` présent. Notes : `footnotes.xml` avec le texte, référence dans le corps, liste retirée ; aller-retour avec `importDocx` existant → `<sup>[1]</sup>` + `data-footnotes`. Titres numérotés : `numbering.xml` lié aux styles. Largeurs : `w:tcW`/`w:gridCol` en DXA. Page : `w:pgSz` A4/paysage, `w:pgMar`. Charge inchangée (< 2 s). Couverture ≥ 85 %, 281 tests existants verts.

## Pièges connus

Outil Write ; `sanitizeXmlText` à appliquer aux nouveaux textes (en-tête, pied, TOC, notes) ; pas de `\u00a0` littéral ; `npx vitest run -w` = watch ; zéro `any` ; JSDoc FR ; la lib `docx` sérialise `tableHeader: false` comme vrai (spread conditionnel), même vigilance pour les nouveaux booléens.

## Ordre de sacrifice

`headingStyles`, puis `numberedHeadings`, puis TOC, puis largeurs de colonnes. Variables, en-têtes/pieds, saut de page et notes sont prioritaires.

## Rapport attendu

`## Rapport Lot L16` : Fait / Non fait / Décisions / Blocages / Propositions de contrat / Tests / Fichiers / Points à vérifier (checklist pour ouverture dans Word réel par Joris).
