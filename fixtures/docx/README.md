# 📎 Fixtures .docx

> Documents de référence pour tester l'import Word. Les trois premiers ont un HTML attendu dans `expected/`, les suivants sont des documents réalistes couverts par `import-all-fixtures.spec.ts`.

## 📥 Déposer un document réel

Pour ajouter un document client anonymisé : le copier ici sous le nom `NN-description.docx`, puis ajouter une ligne au tableau avec sa provenance et ce qu'il contient. Le test `import-all-fixtures.spec.ts` du paquet `word` l'importera automatiquement et vérifiera qu'il ne produit ni rejet ni avertissement d'erreur.

Points à vérifier avant dépôt : aucune donnée personnelle, aucun nom de client, aucun logo propriétaire.

## 🔁 Régénérer les fixtures synthétiques

```bash
npm run fixtures
```

Les fichiers `01` à `03` viennent de `scripts/generate-fixtures.ts`, `04` à `07` de `scripts/generate-fixtures-extra.ts`, `08` à `10` de `scripts/generate-fixtures-variables.ts`, `11` à `17` de `scripts/generate-fixtures-layout.ts`. Les quatre scripts sont reproductibles (seul `docProps/core.xml` change d'un run à l'autre).

## 📋 Inventaire

| Fichier                              | Provenance                                | Contenu                                                                                                                                                                                                                                                             | Statut                          |
| ------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `01-headings-lists.docx`             | Généré                                    | Titres H1-H3, listes puces et numéros imbriquées sur 3 niveaux, lien                                                                                                                                                                                                | Attendu dans `expected/`        |
| `02-tables.docx`                     | Généré                                    | Table avec ligne d'en-tête en gras, table avec cellule `colspan=2`                                                                                                                                                                                                  | Attendu dans `expected/`        |
| `03-images.docx`                     | Généré                                    | Image PNG inline avec `alt`, note de bas de page                                                                                                                                                                                                                    | Attendu dans `expected/`        |
| `04-rapport-client.docx`             | Généré, réaliste                          | Rapport d'audit en français : Titre + H1/H2, listes mixtes 3 niveaux, deux tables (en-tête grisé, cellule fusionnée), image avec légende, note de bas de page, lien, surlignage, barré, souligné, exposant, indice, citation, saut de page, en-tête et pied de page | Testé (structure)               |
| `05-tableaux-complexes.docx`         | Généré, réaliste                          | Fusions horizontales et verticales, cellules vides, liste et image dans des cellules, table imbriquée, table sans bordures                                                                                                                                          | Testé (import sans erreur)      |
| `06-styles-francais.docx`            | Généré, Word en français                  | Styles nommés « Titre 1 », « Titre 2 », « Citation », « Citation intense », « Code », « Préformaté HTML », « Fort », « Accentuation »                                                                                                                               | Testé (style map)               |
| `07-long.docx`                       | Généré, charge                            | 300 paragraphes avec marques, 12 sections, 15 tables de 6 lignes                                                                                                                                                                                                    | Testé (< 3 s)                   |
| `08-variables-braces.docx`           | Généré (`generate-fixtures-variables.ts`) | Contrat avec `{{client.nom}}`, `{{prestataire}}`… dans titre, paragraphes, liste, table ; un `{{` coupé sur deux runs ; accolades seules                                                                                                                            | Attendu dans `expected/`, testé |
| `09-variables-mergefields.docx`      | Généré                                    | Champs de fusion Word : `w:fldSimple` (`Nom`, `NumeroFacture`, `Montant`, `Signataire`) et champ complexe `w:fldChar` (`DateEcheance`)                                                                                                                              | Attendu dans `expected/`, testé |
| `10-variables-content-controls.docx` | Généré                                    | Contrôles de contenu `w:sdt` avec `w:tag`/`w:alias`, valeur saisie ou texte de remplissage                                                                                                                                                                          | Attendu dans `expected/`, testé |
| `client/*.docx`                      | Joris, réels anonymisés                   | À déposer (voir `docs/ROADMAP_SESSION3.md`)                                                                                                                                                                                                                         | En attente                      |

## 🧱 Fixtures 11-17 : mise en page

> Produites par `node scripts/generate-fixtures-layout.ts` (inclus dans `npm run fixtures`). Chaque fixture commence par un paragraphe `Fixture NN — <titre>` et chaque cas porte un libellé en clair : les tests de lecture cherchent ces libellés dans le HTML. Les `expected/` sont à produire par les lots de lecture.

| Fichier                       | Contenu                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `11-styles-inline.docx`       | Un paragraphe par propriété de run (« Police Georgia 14 pt », « Rouge #C00000 », « Surligné jaune », soulignés simple/double/pointillé/tirets/ondulé, « Barré », « Barré double », « Exposant », « Indice », « Petites capitales », « Majuscules », « Espacement 2 pt »), un paragraphe « Tout cumulé », un run de style de caractère `Code`, un paragraphe en police du thème (`minorHAnsi` via docDefaults) |
| `12-paragraphes.docx`         | 4 alignements, interligne multiple 1,5 et exact 18 pt, espacement avant 12 pt / après 6 pt, retraits gauche, droite, première ligne, suspendu, bordure bas, bordures 4 côtés, fond `#EEEEEE`, `keepNext`, `pageBreakBefore`, tabulation, saut de ligne `w:br`, saut de page explicite                                                                                                                         |
| `13-styles-nommes.docx`       | docDefaults Calibri 11, `Normal` modifié (1,15, après 8 pt), `Heading1`/`Heading2` (couleur, taille, `keepNext`), `Citation` basé sur `Normal` (retrait, italique, bordure gauche), `Important` basé sur `Citation` (gras, rouge), un paragraphe `Citation` avec couleur directe                                                                                                                              |
| `14-tableaux-riches.docx`     | Tableau 100 % : en-tête `#D9E2F3` gras, bordures par côté (haut 3 pt, intérieur 0,5 pt, aucune à droite), largeurs fixes 120/240/120 pt, `columnSpan: 2`, `rowSpan: 2`, alignement vertical centré, marges 4 pt, tableau imbriqué ; tableau 300 pt centré avec style `TableGrid` (injecté dans `styles.xml`)                                                                                                  |
| `15-listes-numerotation.docx` | Décimal `%1.`, lettres `%1)`, romain majuscule, puces `•` `–` `▪` sur 3 niveaux, liste redémarrée à 1 (`w:num` + `w:startOverride`), 3 niveaux imbriqués `%1.%2.%3.`, item de deux paragraphes, liste dans une cellule                                                                                                                                                                                        |
| `16-sections.docx`            | Section 1 A4 portrait marges 20 mm, en-tête `default` « Rapport — {{client}} » gras, en-tête/pied `first` (`w:titlePg`), pied `PAGE` / `NUMPAGES` ; section 2 Letter paysage marges 12,7 mm, `w:cols` 2 colonnes, en-tête `even` (`w:evenAndOddHeaders`) ; `w:lang` fr-FR et Arial 10 dans docDefaults                                                                                                        |
| `17-objets-perdus.docx`       | Zone de texte (`w:drawing` + `wps:txbx` + `w:txbxContent`), forme (`wps:wsp` sans texte), équation `m:oMath`, commentaire (`w:commentRangeStart` + `comments.xml`), révisions `w:ins` / `w:del`, champ `DATE` (`w:fldSimple`), objet incorporé `w:object` (+ `embeddings/oleObject1.bin`) ; chaque objet entouré de paragraphes « Avant … » / « Après … »                                                     |

## 📏 Score de fidélité attendu

> Mesuré par `node scripts/fidelity-report.ts <fixture>` (import `styled` → export → `compareDocx`), le 20/10/2026 pendant la vague 2 (L28b, après intégration de L27). Colonne « Gabarit » = export dans le gabarit (`exportDocx({ template, layout })`, mode par défaut du script) : seul le corps est régénéré, les parties annexes ressortent identiques à l'octet. Colonne « Sans gabarit » = `--no-template`, export neuf avec `layout` : styles, numérotation, en-têtes et sections sont régénérés, ce qui plafonne le score. Cible ≥ 0,98 dans le gabarit (`compare-fixtures.spec.ts`) ; les fixtures sous la cible y sont en `it.fails` documenté avec un plancher de non-régression. Un document comparé à lui-même vaut toujours 1.

| Fixture                       | Sans gabarit | Gabarit | Ce qui manque dans le gabarit (toutes parties identiques)                                                                                  |
| ----------------------------- | -----------: | ------: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `11-styles-inline.docx`       |        0,986 |   **1** | rien                                                                                                                                       |
| `12-paragraphes.docx`         |        0,958 |   0,970 | `paragraph.text` ×3 : `w:tab` lu comme un espace, `w:br type="page"` en fin de paragraphe réécrit en paragraphe séparé                     |
| `13-styles-nommes.docx`       |        0,946 |   **1** | rien                                                                                                                                       |
| `14-tableaux-riches.docx`     |        0,916 |   0,930 | bordures intérieures `insideH`/`insideV` distribuées sur chaque cellule, largeur ajoutée au tableau imbriqué, centrage du tableau 2        |
| `15-listes-numerotation.docx` |        0,877 |   0,917 | bordures intérieures distribuées sur les cellules, largeurs 225,65 → 225,75 pt (pixels entiers)                                            |
| `16-sections.docx`            |        0,696 |   0,756 | une seule section restituée : `w:sectPr` de la section 1 perdu, en-têtes et pieds réaffectés à la section restante                         |
| `17-objets-perdus.docx`       |        0,887 |   0,944 | `paragraph.text` ×6 : espaces finaux retirés, texte de zone de texte réinjecté, texte d'équation absent                                    |
| `client/Modele_Demo_DER.docx` |        0,571 |   0,830 | 3 sections → 1, espaces finaux, `MERGEFIELD` → `{{nom}}`, largeurs de cellules arrondies, bordures intérieures, distance du pied 22,85 → 0 |

Le seuil bas du test d'aller-retour sans gabarit est 0,3 (`ROUNDTRIP_MIN_SCORE`) : il garantit l'absence de plantage et un texte conservé à ≥ 70 %, pas la fidélité.

Pour voir le détail d'une fixture : `node scripts/fidelity-report.ts fixtures/docx/14-tableaux-riches.docx --keep /tmp/14.docx` (rapport Markdown sur la sortie standard, `--out` pour l'écrire, `--no-template` pour l'export neuf).

## 🧪 Comment les tester à la main

- Démo Angular : `npm run demo`, page **Import Word**, glisser un fichier.
- Playground vanilla : `npm run playground`, bouton **Importer .docx**, puis **getHTML()** pour voir la sortie, et **Exporter .docx** pour l'aller-retour. Le panneau **Variables** liste les noms trouvés (`08` à `10`), applique des valeurs JSON et exporte en modes `fields` et `resolve`.
- Démo Angular, page **Modèle** (`/template`) : « Charger l'exemple » importe `08-variables-braces.docx`, génère le formulaire et exporte dans les trois modes.
