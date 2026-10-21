# Brief — Lot L40 : fixtures sections, tabulations, bordures (`scripts/`, `fixtures/docx/`)

> Session 4, phase 0. Cible 30 min. Les lots L42 et L43 testent contre ces fichiers : rends-les tôt.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION4.md` (« Déroulé de la session 4 »), `scripts/generate-fixtures-layout.ts` (modèle : lib `docx` + patches XML jszip, fixtures 11-17 à ne **pas** modifier), `fixtures/docx/README.md`. API de la lib `docx` dans `node_modules/docx/dist/index.d.ts` (`sections[]` avec `properties.type`, `page`, `column`, `headers`/`footers`, `titlePage` ; `TabStopType`/`tabStops` sur `Paragraph` ; `Table` `alignment`, `borders` avec `BorderStyle.NIL`, `color`, `space` ; `TableCell` `borders` ; `style`/`tableStyles` ? vérifier).

## Lot

Un script `scripts/generate-fixtures-sections.ts` (Node 24, type stripping, deps `docx` + `jszip` seulement), branché dans `npm run fixtures` (ligne proposée dans le rapport, **tu ne modifies pas `package.json`**), produisant :

| Fichier                        | Contenu exigé                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `18-sections-triple.docx`      | Trois sections : (1) A4 portrait marges 20 mm, en-tête `default` « Section 1 », pied avec `PAGE`, `titlePage` avec en-tête `first` « Première page » ; (2) Letter **paysage** marges 12,7 mm, 2 colonnes, type `nextPage`, en-tête `default` « Section 2 » et `even` « Section 2 paire » ; (3) A4 portrait marges 25,4 mm, type **`continuous`**, **sans** en-tête propre (hérite de la section 2) et pied propre « Pied 3 ». Chaque section : un titre « Section N » et 4 paragraphes libellés « Section N, paragraphe M ». Un tableau dans la section 2.                                                                                                                                              |
| `19-tabulations-bordures.docx` | Paragraphes avec taquets : `left` à 2 cm, `center` à 8 cm, `right` à 14 cm, `decimal` à 10 cm, chacun avec un libellé « Taquet X à N cm » et deux `w:tab` ; un paragraphe avec tabulation sans taquet défini ; bordures de paragraphe avec `w:space` 1, 4 et 8 pt (libellés) ; tableau avec cellules à bordures `nil` sur des côtés précis (libellés « nil gauche », « nil bas »), bordures grises `#BFBFBF` et bleues `#2F5496`, tableau `w:jc center` et un `w:jc right` ; tableau avec style de tableau conditionnel (`firstRow` gras fond `#D9E2F3`, `band1Horz` fond `#F2F2F2`) via `tblLook` et un style injecté par patch XML dans `styles.xml` (`w:tblStylePr w:type="firstRow"`, `band1Horz`). |

Chaque fixture commence par un paragraphe `Fixture NN — <titre>`, chaque cas porte un libellé en clair.

## Périmètre

✅ `scripts/generate-fixtures-sections.ts`, `fixtures/docx/18-*.docx`, `19-*.docx`, `fixtures/docx/README.md` (lignes des deux fixtures dans le tableau existant, commande de régénération). ❌ tout le reste (pas d'`expected/`).

## Vérification

- Script reproductible (hash des parties hors `docProps/core.xml` identique entre deux runs).
- Chaque fixture lue par `importDocx(buffer, { fidelity: 'styled' })` et `semantic` dans un script jetable du scratchpad : aucun rejet ; pour la 18, `layout.page` = A4 portrait 25,4 mm (dernière section) et 3 `w:sectPr` dans le XML ; pour la 19, les `w:tab`, `w:tabs`, `w:space`, `w:val="nil"`, `w:color="BFBFBF"`, `w:jc`, `w:tblStylePr` présents (cite-les dans ton rapport).
- `npx prettier --write scripts fixtures/docx/README.md`, `npx eslint scripts`.

## Pièges

Outil Write ; pas de `\u00a0` ; twips (1 cm = 567, 1 pt = 20) ; huitièmes de point pour `w:sz` des bordures ; `jszip` pour patcher `styles.xml` ; ne lance ni n'arrête de serveur.

## Rapport attendu

`## Rapport Lot L40` : Fait par fixture / Non fait / Éléments injectés par patch XML / Ligne `package.json` proposée / Points à vérifier.
