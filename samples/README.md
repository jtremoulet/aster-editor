# 📂 Échantillons à ouvrir dans Word

> Fichiers produits par `exportDocx` pour vérification dans Word réel, la seule chose que la session autonome ne peut pas faire. Coche au fur et à mesure et note les écarts dans `docs/JOURNAL.md` ou dans une issue.

## `export-fidelite-complet.docx`

Généré par le lot L16 avec **toutes** les options activées : mode `fields` avec `client` et `ref` connus et `ville` inconnue, en-tête aligné à droite, pied avec « x / y », table des matières, titres numérotés, styles de titres, notes de bas de page, table à largeurs fixes, sauts de page, A4 portrait marges 2 cm, langue française, Calibri 11.

1. [ ] Word ouvre le fichier sans « contenu illisible » ni réparation.
2. [ ] À l'ouverture, boîte « Ce document contient des champs… mettre à jour ? » → **Oui** : le sommaire affiche « 1. Contrat 2026-042 / 1.1. Prestations / 1.2. Annexe / 1.2.1. Détail » avec numéros de page, entrées cliquables (Ctrl+clic).
3. [ ] Titres numérotés `1.`, `1.1.`, `1.2.1.` et H1 en bleu foncé 20 pt ; ajouter un nouveau « Titre 2 » dans Word → il reçoit son numéro.
4. [ ] En-tête aligné à droite : « **Nebula** — ACME » (Alt+F9 doit montrer `MERGEFIELD client`).
5. [ ] Pied : « Document généré par Aster » puis « 1 / 2 » centré, correct sur la page 2.
6. [ ] Corps : « Client : ACME » (le gras est perdu en mode `fields`, limite documentée), « ville : «ville» » pour la variable sans valeur ; Alt+F9 → `{ MERGEFIELD client }` et `{ MERGEFIELD ville }` ; Publipostage → Insérer un champ de fusion reconnaît-il les champs ?
7. [ ] Appels de note ¹ et ² en exposant, notes en bas de page « Première note. » et « Seconde note, _en italique_. » ; aucune liste de notes en fin de document.
8. [ ] Table 3 colonnes à largeurs fixes (≈ 4 / 2,65 / 5,3 cm), en-tête gras répété, pas de redimensionnement automatique.
9. [ ] Page 2 commence après la table (saut de page explicite), puis « Page suivante… » ouvre une page 3 avec le carré rouge 40×40.
10. [ ] Mise en page : A4 portrait, marges 2 cm, langue « Français (France) », police Calibri 11.
11. [ ] Enregistrer sous, puis réimporter dans la démo (`/import`) : variables, notes et table reviennent ; en-têtes, pieds et numéros de titres sont attendus perdus à l'import (limite mammoth).
12. [ ] Optionnel : ouvrir dans LibreOffice pour comparer le rendu des champs.

### Ajouts après la revue de l'export (L22)

13. [ ] Publipostage → Insérer un champ de fusion reconnaît un champ au nom cité `MERGEFIELD "Nom du client"` (exporter depuis le playground une puce nommée avec un espace via le panneau Variables).
14. [ ] Une valeur multi-ligne en mode résolu (deux lignes séparées par un saut de ligne dans la valeur) rend deux lignes.
15. [ ] Un document dont l'en-tête contient un appel de note s'ouvre sans réparation (l'appel est rendu en exposant, note dans le corps seulement).
16. [ ] Une table avec `colspan` démesuré s'ouvre sans réparation, bornée à 63 colonnes.
17. [ ] Marges 150/150 mm → page avec 1 cm utile, pas de boîte bloquante « marges hors zone imprimable ».

## Produire d'autres échantillons

Dans le playground (`npm run playground`), les boutons « Exporter .docx (champs) » et « Exporter .docx (résolu) » utilisent les valeurs du panneau Variables. Dans la démo Angular (`npm run demo`), la page « Modèle » exporte dans les trois modes.
