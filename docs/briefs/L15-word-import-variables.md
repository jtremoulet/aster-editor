# Brief — Lot L15 : import Word des variables (`@aster-editor/word`, dossier `docx/` et `paste/`)

> Session 2, vague 1. Cible 2h.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION2.md`, `packages/core/src/api/variables.ts`, `packages/word/README.md`, `packages/word/src/docx/**` (import existant : `import-docx.ts`, `postprocess/*`, `types.ts`), `packages/word/src/paste/**` (normaliseur de collage), `scripts/generate-fixtures-variables.ts` (comment les fixtures 08-10 sont construites : `{{}}`, `w:fldSimple`, champs complexes `w:fldChar`, `w:sdt` avec `w:tag`/`w:alias`/`w:showingPlcHdr`). Les fixtures sont dans `fixtures/docx/08-variables-braces.docx`, `09-variables-mergefields.docx`, `10-variables-content-controls.docx`. `jszip` 3.10 est déclaré dans `word` (MIT).

Constat de phase 0 : mammoth rend `{{nom}}` tel quel (OK), **perd les `MERGEFIELD`** (il rend le texte résultat, vide pour un `fldSimple` sans résultat) et **traverse les `w:sdt`** en gardant le texte de remplissage. Donc : prétraitement du XML **avant** mammoth.

## Lot

1. **Prétraitement** (`docx/preprocess/variables.ts`) : ouvrir le zip (jszip), lire `word/document.xml` (+ `header*.xml`, `footer*.xml`, `footnotes.xml` si présents), transformer **par manipulation de chaîne ou de DOM XML** (utilise `DOMParser` avec `'application/xml'`, injectable comme ailleurs ; en test jsdom le supporte) :
   - `w:fldSimple[w:instr~="MERGEFIELD nom"]` → run `w:t` contenant `{{nom}}` (garder le run de résultat s'il porte une valeur ? non : la valeur Word est un échantillon, on garde le nom) ;
   - champs complexes : séquence `w:fldChar begin` … `w:instrText` (`MERGEFIELD nom`) … `separate` … résultat … `end` → un seul run `{{nom}}`, en respectant les runs qui enjambent plusieurs `w:r` et plusieurs `w:instrText` ; autres instructions (`HYPERLINK`, `PAGE`, `TOC`…) laissées intactes ;
   - `w:sdt` avec `w:tag` → `{{tag}}` (si pas de tag, `w:alias` normalisé en nom : minuscules, espaces → `_`, accents retirés ; sans ni l'un ni l'autre : laisser le contenu), avec libellé = `w:alias`, en **gardant la valeur saisie** par l'utilisateur comme valeur connue (sauf `w:showingPlcHdr` = texte de remplissage → pas de valeur) ;
   - conserver la mise en forme du run porteur (`w:rPr`).
     Renvoyer le zip modifié (buffer) + la table `{ name → { label?, value? } }` collectée.
2. **Post-traitement HTML** (`docx/postprocess/variables.ts`) : après mammoth, remplacer les occurrences `{{nom}}` dans les nœuds texte (hors `pre`/`code`, hors attributs) par `<span data-aster-variable="nom" data-label="…">{{nom}}</span>` ; gérer `{{` coupé sur deux runs (déjà fusionné par mammoth en un seul texte dans la plupart des cas, sinon fusionner les textes adjacents avant), `{{nom}}` avec espaces intérieurs tolérés (`{{ nom }}`), noms validés par `/^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u`, accolades seules ignorées.
3. **Options et résultat** : `DocxImportOptions.variables?: { detect?: readonly ('braces' | 'mergeFields' | 'contentControls')[] (défaut les trois), pattern?: RegExp (alternative à `{{}}`, ex. `/\[([a-z_]+)\]/g`) }` ; `DocxImportResult.variables: readonly AsterVariable[]` (noms, libellés, valeurs connues). Types dans `docx/types.ts`, exportés par `index.ts`.
4. **Collage** (`paste/passes/variables.ts`, dernière passe) : `{{nom}}` dans le HTML collé depuis Word ou Google Docs → même `span` ; option `WordPasteOptions.variables?: boolean | { pattern }` (défaut `true`). Le normaliseur reste pur.
5. **Fixtures** : écrire `fixtures/docx/expected/08…10.html`, et un `fixtures/word-html/word-365-variables.html` (HTML presse-papier Word avec `{{nom}}` dans un `<p class=MsoNormal>` et un `<td>`) + attendu.
6. README du paquet : section « Variables » (import).

## Périmètre

✅ `packages/word/src/docx/preprocess/**`, `docx/postprocess/variables*.ts`, `docx/import-docx.ts` (branchement), `docx/types.ts` (additif), `docx/run-postprocess.ts` (ordre), `paste/passes/variables*.ts`, `paste/normalize-word-html.ts` (ajout de la passe), `paste/types.ts` (additif), `google/normalize-google-docs-html.ts` (ajout de la passe), `index.ts` (exports), `README.md` (section), `fixtures/docx/expected/08-10`, `fixtures/word-html/word-365-variables.html` + attendu. ❌ `export/**` (lot L16 en parallèle), `core`, `ui`, scripts, `.docx` (si une fixture manque, signale-le).

## Tests (`cd packages/word && npx vitest run --coverage`)

Prétraitement : `fldSimple`, champ complexe multi-runs, `sdt` avec tag / alias seul / placeholder, `HYPERLINK` intact, en-têtes et notes traités, zip sans `footnotes.xml`. Post-traitement : `{{nom}}` simple, deux par paragraphe, dans un `<td>`, dans un `<h1>`, `{{ nom }}`, accolades seules, `{{` incomplet, dans `<pre>` ignoré, pattern custom. `importDocx` sur 08/09/10 : `result.variables` exact (noms, libellés, valeurs), HTML attendu. Collage : fixture `word-365-variables`. Couverture ≥ 85 % maintenue, 281 tests existants verts.

## Pièges connus

Outil Write ; pas de `\u00a0` littéral ; `npx vitest run -w` = watch ; regex linéaires uniquement (le relecteur mesurera sur 1 Mo) ; `verbatimModuleSyntax` ; zéro `any` ; JSDoc FR ; jszip : `JSZip.loadAsync(buffer)`, `zip.file(path).async('string')`, `zip.generateAsync({ type: 'uint8array' })` → `.buffer`.

## Rapport attendu

`## Rapport Lot L15` : Fait / Non fait / Décisions / Blocages / Propositions de contrat / Tests / Fichiers / Points à vérifier.
