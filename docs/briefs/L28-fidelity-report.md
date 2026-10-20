# Brief — Lot L28 : rapport de fidélité (`word/docx/compare`, `scripts/fidelity-report.ts`)

> Session 3, vague 2. Envoyé après intégration de L24-L25 (le lecteur résout les propriétés) ; peut tourner en parallèle de L27. Cible 2h. C'est le critère d'acceptation de la session : un score, pas une impression.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION3.md` (critères d'acceptation), **`packages/word/src/docx/compare/types.ts` (contrat figé : `FidelityReport`, `FidelityProperty`, `CompareDocx`)**, `docx/reader/package.ts`, `reader/styles.ts` (`createStyleResolver` : résolution des styles, à réutiliser pour obtenir les propriétés **résolues** des deux documents), `reader/types.ts`, `reader/sections.ts`, `reader/lists.ts`, fixtures 11-17 et `expected/`, `scripts/generate-fixtures-layout.ts` (modèle de script Node 24).

## Lot

### `compare/compare-docx.ts` — `compareDocx(original, result, options)`

- Ouvre les deux paquets (`openPackage`), construit un `StyleResolver` par document.
- **Parties à l'octet** : pour chaque partie du gabarit hors `word/document.xml`, `word/_rels/document.xml.rels`, `docProps/core.xml`, `docProps/app.xml` (dates, compteurs) : identique (`identicalParts`) ou différente (`changedParts` avec résumé : taille, première ligne qui diffère après parse XML quand c'est du XML, « ajoutée » / « supprimée » sinon). Les parties ajoutées au résultat (nouvelles images, `numbering.xml` enrichi) sont listées comme changées avec le résumé `ajoutée`.
- **Corps** : alignement des blocs de `w:body` des deux documents (paragraphes et tableaux, dans l'ordre, après aplatissement des `w:sdt`) ; alignement par **position** quand les comptes sont égaux, sinon par diff LCS sur le texte des blocs (un bloc sans correspondant compte comme perdu pour toutes ses propriétés). Pour chaque paire : groupe `text` (texte brut égal), `paragraph-style` (`pStyle` résolu égal), `paragraph-format` (chaque champ de `ResolvedParagraphProps` : alignement, interligne, espacements, retraits, bordures, fond, keepNext, pageBreakBefore, numérotation `numId`+`ilvl` → `list`), `run-format` (runs alignés par texte après fusion des runs voisins identiques ; chaque champ de `ResolvedRunProps`), `table` (dimensions, fusions, largeurs de colonnes, bordures et fonds de cellules), `image` (nombre, dimensions ±1 px), `note` (nombre, texte), `header-footer` (texte et propriétés des parties d'en-tête et de pied, alignées par type), `section` (`pgSz`, `pgMar`, `cols`, `titlePg`, `lang`).
- Les `w:rsid*`, `w:lastRenderedPageBreak`, `w:proofErr`, `w:bookmarkStart/End` sont ignorés (`ignoreRevisionIds`).
- **Score** : moyenne pondérée des taux `kept/total` par groupe, poids : `text` 3, `paragraph-style` 2, `paragraph-format` 2, `run-format` 2, `list` 1, `table` 2, `image` 1, `note` 1, `header-footer` 2, `section` 2, `package-part` 2 (ce dernier = parties identiques / parties comparées). Un groupe sans occurrence ne compte pas. Arrondi à trois décimales.
- `lost` : objets non représentables renvoyés par `importDocx(styled)` des deux documents (dédoublonnés).
- `notes` : ce qui n'est pas comparé (styles conditionnels de tableau, habillage d'image, champs…).

### `scripts/fidelity-report.ts`

- `node scripts/fidelity-report.ts <fichier.docx> [--out rapport.md] [--keep sortie.docx]` : importe en `styled`, exporte dans le gabarit sans modification (L27 ; si `exportDocx({ template })` n'est pas encore intégré au moment de ton lot, **export neuf** avec `layout`, et note-le), compare, imprime un tableau Markdown (groupe, propriété, total, conservé, perdu, exemples) et le score, code de sortie 1 si score < seuil (`--threshold 0.98`). Branché dans `package.json` racine (`fidelity`) : propose la ligne dans ton rapport, ne modifie pas `package.json`.
- Le script a besoin d'un DOM : utilise jsdom (dépendance de dev déjà installée) pour fournir `DOMParser`/`XMLSerializer`/`document` globaux avant d'importer `@aster-editor/word` (regarde comment les tests Vitest le font, et `scripts/vanilla-playground` pour l'import des sources via `tsconfig.base.json` `paths` : le plus simple est `node --experimental-strip-types` avec un petit `register` ou un import direct des sources `../packages/word/src/index.ts` ; documente le choix).

## Périmètre

✅ `packages/word/src/docx/compare/**` (sauf `types.ts`, figé), `packages/word/src/index.ts` (export additif de `compareDocx` et des types), `scripts/fidelity-report.ts`, `fixtures/docx/README.md` (section « Score de fidélité attendu » : tableau fixture → score mesuré). ❌ `reader/**`, `writer/**`, `export/**`, `core`, `ui`, `angular`.

## Tests

- Unitaires : parties identiques / différentes / ajoutées, alignement par position et par LCS (bloc inséré, bloc supprimé), chaque groupe de propriétés avec une perte provoquée, score pondéré (cas calculés à la main), `ignoreRevisionIds`.
- Fixtures : `compareDocx(fixture, fixture)` = 1 et `identicalParts` = toutes ; `compareDocx(fixture, fixture ré-exportée sans gabarit)` donne un score et des `changedParts` cohérents (pas de plantage, score < 1 attendu, assertion de seuil bas) ; dès que L27 est intégré, l'orchestrateur ajoute l'assertion ≥ 0,98 avec gabarit (prévois le test en `it.skip` avec `TODO L27`).
- `cd packages/word && npx vitest run` (jamais `-w`), typecheck, eslint, prettier ; `node scripts/fidelity-report.ts fixtures/docx/13-styles-nommes.docx` fonctionne.

## Pièges

Outil Write ; pas de `\u00a0` ; `verbatimModuleSyntax` ; zéro `any` ; comparer des nombres en pt arrondis à deux décimales ; les couleurs en minuscules ; ne jamais muter les `Document` des paquets ; LCS sur des centaines de blocs doit rester linéaire en pratique (bornes) ; ne lance ni n'arrête de serveur.

## Rapport attendu

`## Rapport Lot L28` : Fait / Non fait / Décisions (poids, alignement) / Blocages / Scores mesurés par fixture (sans gabarit) / Ligne `package.json` proposée / Tests (compteurs) / Fichiers / Points à vérifier.
