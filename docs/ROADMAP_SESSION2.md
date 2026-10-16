# 🌙 Roadmap session 2 — 16 → 19 octobre 2026 ✅ réalisée le 16/10 (0.4.0)

> Objectif de Joris : d'ici **lundi 19 octobre 09:00**, un éditeur le plus proche possible de CKEditor, en priorité sur l'import et l'export Word **avec variables** (champs de fusion). Défauts validés : trois formes détectées (`{{nom}}`, `MERGEFIELD`, contrôles de contenu), `{{nom}}` canonique, valeurs statiques + résolveur asynchrone optionnel, export `resolve` ou `fields` au choix.
> Point de départ : 0.3.0 sur `develop`, 893 tests unitaires + 21 e2e verts. Même rituel que la session 1, avec les leçons du REX : revues au fil de l'eau, pièges d'outillage dans les briefs, pas deux agents qui lancent des e2e en même temps.

## 🎯 Résultat attendu lundi

1. Un .docx client contenant `{{nom}}`, des champs `MERGEFIELD` ou des contrôles de contenu s'importe avec des **puces de variables** dans l'éditeur.
2. L'intégrateur fournit les valeurs (objet ou résolveur), les puces les affichent, l'export .docx sort **résolu** ou **avec champs de fusion Word**, et le HTML aussi.
3. Une page de démo « Modèle » fait le tour complet : import, formulaire de valeurs, export.
4. Export Word fidèle : en-têtes et pieds de page, sauts de page, table des matières, notes de bas de page, numérotation des titres, largeurs de colonnes, marges, orientation.
5. Parité d'usage : bulle de lien et d'image, menu `/`, format painter, sommaire du document, si le temps le permet.
6. Dettes de la session 1 soldées en fin de session.

## 🧱 Phase 0 — orchestrateur

- [x] Vérifications : `docx` expose `SimpleMailMergeField`, `SimpleField`, `TableOfContents`, `Header`/`Footer`, `PageBreak`, `FootnoteReferenceRun`, `Bookmark` ; mammoth ignore l'instruction `MERGEFIELD` (rend le texte résultat) et traverse les `w:sdt` → **prétraitement du XML avant mammoth** ; `@tiptap/suggestion` absent → installé ; `jszip` présent en transitif → déclaré dans `word`.
- [ ] `npm run check` de base vert après installation.
- [ ] Contrat étendu dans `packages/core/src/api/` (dégel contrôlé, **additif**) : `variables.ts` (`AsterVariable`, `VariableValues`, `VariableResolver`, `VariableSource`, `VariableRenderMode`, `GetHtmlOptions`, `VariableStore`), `AsterOptions.variables`, `AsterEditor.variables` et `getHTML(options?)`, événement `variablesChange`, commandes `variable.insert` / `variable.remove` dans `STANDARD_COMMAND_IDS`, clés i18n.
- [ ] Sérialisation HTML figée : `<span data-aster-variable="nom" data-label="Nom">{{nom}}</span>`. En mode `resolve`, texte brut ; variable sans valeur → `{{nom}}`.
- [ ] Fixtures : `08-variables-braces.docx` (`{{}}` dans paragraphes, tables, titres), `09-variables-mergefields.docx` (champs simples et complexes), `10-variables-content-controls.docx` (`w:sdt` avec `w:tag`, injecté par patch XML du générateur).
- [ ] Briefs des lots, journal.

## 🌊 Vague 1 — Variables (4 agents, lots disjoints)

| Lot                                    | Paquet        | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **L13 core-variables**                 | `core`        | Nœud inline atomique `variable` (attrs `name`, `label`), NodeView puce (libellé, valeur si connue, état « non résolue »), parse/serialize HTML, `VariableStore` concret, commandes `variable.insert`/`variable.remove`, `getHTML({ variables })`, `resolveVariablesHtml()` pur, événement `variablesChange`, `options.variables`, `getText` avec valeurs, markdown passthrough `{{nom}}`, règle de saisie `{{nom}}` → puce.                                                                                                                                  |
| **L14 ui-variables**                   | `ui`          | Widget `variable` (menu des variables déclarées + présentes, saisie libre si `allowUnknown`), menu de suggestion déclenché par `{{` (`@tiptap/suggestion`), édition de la puce au double-clic (libellé, valeur), CSS `variables.css`, i18n, preset `full` + `standard`.                                                                                                                                                                                                                                                                                      |
| **L15 word-import-variables**          | `word/docx`   | Prétraitement du zip avant mammoth : `w:fldSimple` et champs complexes `MERGEFIELD` → texte `{{nom}}` ; `w:sdt` avec `w:tag`/`w:alias` → `{{tag}}` ; post-traitement HTML : `{{nom}}` → `<span data-aster-variable>` (hors `<pre>`/`<code>`) ; `DocxImportOptions.variables` ; `DocxImportResult.variables` (noms) ; fixtures 08-10 + attendus. Normaliseur de collage : `{{nom}}` collé depuis Word → puce aussi.                                                                                                                                           |
| **L16 word-export-variables-fidélité** | `word/export` | `DocxExportOptions.variables: { mode: 'resolve' \| 'fields' \| 'placeholders', values }` ; mode `fields` → `SimpleMailMergeField` ; puis fidélité : en-têtes/pieds de page (`options.header`/`footer` HTML ou texte + numéro de page), saut de page (`<div data-page-break>` / `<hr data-page-break>`), table des matières (`options.toc`), notes de bas de page export (`<sup data-footnote>` + `<ol data-footnotes>` → vraies notes Word), numérotation des titres (`options.numberedHeadings`), largeurs de colonnes (`colwidth`), marges et orientation. |

Intégration au fil de l'eau, revue adverse de chaque lot dès intégration (R13-R16), correctifs immédiats.

## 🌊 Vague 2 — Produit

| Lot                      | Contenu                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L17 angular-template** | Inputs `variables` / `variableValues`, output `variablesChanged`, méthode `exportDocx(options)`, page démo « Modèle » : import d'un .docx à variables, formulaire généré depuis `getNames()`, export résolu et export champs, aperçu HTML résolu. |
| **L18 parité**           | Bulle de lien au survol/sélection (modifier, ouvrir, supprimer), bulle d'image (aligner, redimensionner, remplacer, alt), menu `/` (blocs, table, image, variable), format painter, sommaire cliquable (`createOutline`), bookmarks internes.     |
| **L19 e2e + docs**       | E2E variables (playground et démo), docs : README word/core/ui/angular, guide « Modèles et variables », API_CORE, CHANGELOG par l'orchestrateur.                                                                                                  |

## 🌊 Vague 3 — Dettes et gel

- Propositions de contrat différées de la session 1, `data-testid`, `focus()` synchrone à remplacer côté `ui`, contournement e2e plein écran.
- Revue produit : un agent qui utilise la démo comme un utilisateur et rédige des findings UX.
- Lot de .docx exportés pour vérification dans Word réel par Joris, avec checklist.
- Gel : check, build, e2e, bump **0.4.0**, changelog, docs, `BILAN_SESSION2.md`, REX, mémoire.

## 🧊 Règle d'arrêt

Gel au plus tard dimanche 18 octobre 22:00, pour laisser une marge. Toute dérive se gère par le bas : L18 d'abord, puis la fidélité export au-delà des champs et des en-têtes.
