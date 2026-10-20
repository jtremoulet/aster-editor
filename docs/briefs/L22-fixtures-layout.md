# Brief — Lot L22 : fixtures de mise en page (`scripts/`, `fixtures/docx/`)

> Session 3, phase 0. Cible 40 min. Les lots L24 et L25 testent contre ces fichiers : rends-les tôt, dans l'ordre 11 → 17.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION3.md` (section Fixtures), `scripts/generate-fixtures-variables.ts` (modèle : lib `docx` + patch XML via jszip pour ce que la lib ne produit pas), `fixtures/docx/README.md`. La lib `docx` est installée (voir `node_modules/docx/dist/index.d.ts` pour les API exactes : `Paragraph` options `spacing`, `indent`, `border`, `shading`, `alignment`, `keepNext`, `pageBreakBefore` ; `TextRun` options `font`, `size` (demi-points), `color`, `highlight`, `underline: { type }`, `strike`, `doubleStrike`, `superScript`, `characterSpacing`, `allCaps`, `smallCaps` ; `Table` `width`, `borders`, `columnWidths`, `TableCell` `shading`, `borders`, `verticalAlign`, `columnSpan`, `rowSpan`, `margins` ; `Document` `styles` (`paragraphStyles`, `characterStyles`, `default`), `numbering` (`config`), `sections` (`properties.page`, `headers`, `footers`, `titlePage`, `column`)).

## Lot

Un script `scripts/generate-fixtures-layout.ts` (Node 24, type stripping, zéro dépendance hors `docx` et `jszip`), branché dans `npm run fixtures` (ligne additive du `package.json` racine : propose-la dans ton rapport, **tu ne modifies pas `package.json`**), qui produit dans `fixtures/docx/` :

| Fichier                       | Contenu exigé                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `11-styles-inline.docx`       | Un paragraphe par propriété de run, texte annonçant la propriété (« Police Georgia 14 pt », « Rouge #C00000 », « Surligné jaune », « Souligné double », « Barré », « Exposant », « Petites capitales », « Majuscules », « Espacement 2 pt »), plus un paragraphe cumulant tout, plus un run avec style de caractère nommé (`characterStyles`, id `Code`), plus un paragraphe avec police du thème (pas de `font` explicite).                         |
| `12-paragraphes.docx`         | Alignements (4), interligne multiple 1,5 et exact 18 pt, espacement avant 12 pt / après 6 pt, retrait gauche 1 cm, droite 1 cm, première ligne 0,5 cm, suspendu 0,5 cm, bordure bas 1 pt noire, bordures 4 côtés, fond `#EEEEEE`, `keepNext`, `pageBreakBefore`, tabulation dans un paragraphe, saut de ligne `w:br`, saut de page explicite.                                                                                                        |
| `13-styles-nommes.docx`       | `default.document.run` police Calibri 11 ; `paragraphStyles` : `Normal` modifié (interligne 1,15, après 8 pt), `Heading1`/`Heading2` (couleur, taille, keepNext), style perso `Citation` basé sur `Normal` (retrait, italique, bordure gauche), style perso `Important` basé sur `Citation` (gras, rouge) ; un paragraphe par style, et un paragraphe `Citation` avec une propriété directe qui surcharge le style (couleur).                        |
| `14-tableaux-riches.docx`     | Tableau 100 % avec en-tête (fond `#D9E2F3`, gras), bordures par côté différentes (haut épais, intérieur fin, aucune à droite), largeurs de colonnes fixes en pt, fusion horizontale (`columnSpan: 2`) et verticale (`rowSpan: 2`), alignement vertical `center`, marges de cellule 4 pt, tableau imbriqué dans une cellule, tableau à largeur fixe 300 pt centré, un style de tableau nommé (`TableGrid`).                                           |
| `15-listes-numerotation.docx` | `numbering.config` : décimal `%1.`, lettres minuscules `%1)`, romain majuscule, puces personnalisées (`•`, `–`, `▪`) sur 3 niveaux, liste qui **redémarre** à 1 après un paragraphe normal (nouvelle instance `reference` avec `start`), liste à 3 niveaux imbriqués, item de liste contenant deux paragraphes, liste dans une cellule de tableau.                                                                                                   |
| `16-sections.docx`            | Section 1 : A4 portrait, marges 20 mm, en-tête `default` (« Rapport — {{client}} » en gras) et pied avec `PAGE` / `NUMPAGES`, `titlePage: true` avec en-tête `first` différent ; section 2 : paysage, Letter, marges 12,7 mm, 2 colonnes, en-tête `even` ; `w:lang` fr-FR dans les défauts ; police par défaut Arial 10.                                                                                                                             |
| `17-objets-perdus.docx`       | Par patch XML (la lib ne les produit pas tous) : une zone de texte (`w:drawing` + `wps:txbx` avec `w:txbxContent`), une forme (`wps:wsp` sans texte), une équation `m:oMath`, un commentaire (`w:commentRangeStart` + partie `comments.xml` + relation), une révision `w:ins` et une `w:del`, un champ `DATE` (`w:fldSimple`), un objet incorporé `w:object`. Chaque objet entouré de paragraphes de texte normal pour vérifier que le reste survit. |

Chaque fixture commence par un paragraphe `Fixture NN — <titre>` et chaque cas porte un libellé en clair : les tests des lots lisent le HTML et cherchent ces libellés.

## Périmètre

✅ `scripts/generate-fixtures-layout.ts`, `fixtures/docx/11-*.docx` … `17-*.docx`, `fixtures/docx/README.md` (section « Fixtures 11-17 », tableau ci-dessus en version courte, commande de régénération). ❌ tout le reste (pas d'`expected/`, c'est aux lots de lecture).

## Vérification

- `node scripts/generate-fixtures-layout.ts` reproductible (même contenu à chaque run, hors horodatages docProps).
- Ouvre chaque fixture avec `importDocx` (mode par défaut) dans un script jetable : aucun rejet, le texte des libellés est présent.
- Inspecte le XML (`word/document.xml`, `styles.xml`, `numbering.xml`) de 13, 15, 16, 17 et cite dans ton rapport les éléments injectés (`w:txbxContent`, `w:ins`, `w:cols`, `w:titlePg`…).
- `npx prettier --write scripts fixtures/docx/README.md`, `npx eslint scripts`.

## Pièges

Outil Write pour les fichiers (le shell mange les backslashes) ; pas de `\u00a0` littéral ; la lib `docx` compte les tailles en demi-points et les espacements en twips (1 pt = 20 twips, 1 cm = 567 twips) ; `jszip` pour patcher : relire `generate-fixtures-variables.ts` qui le fait déjà. Ne lance ni ne stoppe aucun serveur.

## Rapport attendu

`## Rapport Lot L22` : Fait par fixture / Non fait / Éléments injectés par patch XML (liste exacte) / Ligne `package.json` proposée / Points à vérifier.
