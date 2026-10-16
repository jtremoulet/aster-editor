# 📎 Fixtures .docx

> Documents de référence pour tester l'import Word. Les trois premiers ont un HTML attendu dans `expected/`, les suivants sont des documents réalistes couverts par `import-all-fixtures.spec.ts`.

## 📥 Déposer un document réel

Pour ajouter un document client anonymisé : le copier ici sous le nom `NN-description.docx`, puis ajouter une ligne au tableau avec sa provenance et ce qu'il contient. Le test `import-all-fixtures.spec.ts` du paquet `word` l'importera automatiquement et vérifiera qu'il ne produit ni rejet ni avertissement d'erreur.

Points à vérifier avant dépôt : aucune donnée personnelle, aucun nom de client, aucun logo propriétaire.

## 🔁 Régénérer les fixtures synthétiques

```bash
npm run fixtures
```

Les fichiers `01` à `03` viennent de `scripts/generate-fixtures.ts`, `04` à `07` de `scripts/generate-fixtures-extra.ts`, `08` à `10` de `scripts/generate-fixtures-variables.ts`. Les deux scripts sont reproductibles.

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
| `11-mixed-client.docx`               | Joris, réel anonymisé                     | À déposer                                                                                                                                                                                                                                                           | En attente                      |

## 🧪 Comment les tester à la main

- Démo Angular : `npm run demo`, page **Import Word**, glisser un fichier.
- Playground vanilla : `npm run playground`, bouton **Importer .docx**, puis **getHTML()** pour voir la sortie, et **Exporter .docx** pour l'aller-retour.
