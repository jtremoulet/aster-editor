# 📎 Fixtures .docx

> Documents de référence pour tester l'import Word. Chaque fichier a un HTML attendu dans `expected/`.

## 📥 Déposer un document réel

Pour ajouter un document client anonymisé : le copier ici sous le nom `NN-description.docx`, puis ajouter une ligne au tableau avec sa provenance et ce qu'il contient. L'orchestrateur générera le `expected/` à la première intégration et tu le reliras.

Points à vérifier avant dépôt : aucune donnée personnelle, aucun nom de client, aucun logo propriétaire.

## 📋 Inventaire

| Fichier                  | Provenance                                | Contenu                                                          | Statut               |
| ------------------------ | ----------------------------------------- | ---------------------------------------------------------------- | -------------------- |
| `01-headings-lists.docx` | Généré par `scripts/generate-fixtures.ts` | Titres H1-H3, listes puces et numéros imbriquées sur 3 niveaux   | À générer en phase 0 |
| `02-tables.docx`         | Généré                                    | Table avec ligne d'en-tête, cellules fusionnées, table imbriquée | À générer en phase 0 |
| `03-images.docx`         | Généré                                    | Image inline PNG, image avec légende                             | À générer en phase 0 |
| `04-mixed-client.docx`   | Joris, document réel anonymisé            | Mélange titres, listes, tables, images, notes de bas de page     | En attente de dépôt  |
