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

## Export dans le gabarit (session 3)

Aucun Word réel n'était disponible pendant la session 3 : la greffe du corps dans le gabarit est validée par un validateur de paquet maison, par la lib `docx`, par LibreOffice en relecture d'archive et par le score de fidélité, pas par Word. Produis les fichiers depuis la démo (page « Modèle », « Télécharger dans le gabarit ») ou le playground (« Exporter .docx » après un import), avec un `.docx` **créé dans Word** (pas une fixture générée) : un document de deux pages avec titres, une liste numérotée, un tableau à bordures, une image, un en-tête et un pied avec numéro de page, un style personnalisé, une note de bas de page.

18. [ ] **Aller-retour sans modification** : importer dans la démo, exporter dans le gabarit sans rien toucher, ouvrir dans Word : aucune boîte « contenu illisible » ni réparation ; Fichier → Informations ne signale rien ; le document ressemble à l'original page par page (polices, tailles, interlignes, retraits, bordures, en-tête, pied, numéro de page, note).
19. [ ] Styles : Accueil → volet Styles. Les styles du document d'origine sont tous là, inchangés (ouvrir « Modifier » sur `Normal` et sur le style personnalisé : mêmes valeurs) ; aucun style `Quote` / `Code` ajouté si le corps n'en utilise pas ; les paragraphes affichent bien leur style d'origine (`Titre 1`, style personnalisé) et non `Normal` + mise en forme directe (Ctrl+Maj+N sur un paragraphe ne doit **pas** changer son aspect s'il était déjà en `Normal` ; révéler la mise en forme avec Maj+F1 pour voir les propriétés directes).
20. [ ] Liste numérotée : même numérotation, mêmes retraits et puces qu'à l'origine ; ajouter un item dans Word continue la numérotation ; une liste **ajoutée** dans Aster s'ouvre sans réparation et se numérote.
21. [ ] Tableau : bordures, fonds, largeurs de colonnes et fusions identiques ; cellules sans bordure restées sans bordure (pas de trait réapparu depuis un style de tableau, pas de trait gris devenu noir) ; tableau centré resté centré (limite connue : `w:jc` non relu, à constater).
22. [ ] Image : même taille et même place ; une image **ajoutée** dans Aster apparaît et le fichier s'ouvre sans réparation.
23. [ ] En-tête et pied : identiques à l'octet, numéro de page toujours un champ (Alt+F9), première page différente et pages paires conservées si le document en avait.
24. [ ] **Modification locale** : changer un mot dans la démo, exporter dans le gabarit : seul ce mot diffère (comparer avec Révision → Comparer dans Word), rien d'autre n'a bougé.
25. [ ] **En-tête modifié** dans le panneau En-tête / Pied de la page « Modèle » : la nouvelle valeur s'affiche sur toutes les pages, l'ancienne partie reste dans le zip (normal) sans gêner Word.
26. [ ] **Variables** : export dans le gabarit en mode `fields` → Alt+F9 montre les `MERGEFIELD` dans le corps **et** dans le pied si le modèle en avait ; en mode `resolve` → les valeurs sont dans le corps et dans le pied, plus aucun champ de fusion.
27. [ ] **Document multi-sections** (orientation ou marges changeantes) : constater la limite documentée (une seule section ressort, celle de la fin) et vérifier qu'il s'ouvre sans réparation.
28. [ ] **Objets non représentables** : un document avec une zone de texte, une forme et un commentaire dans le corps : la démo les liste ; le fichier exporté s'ouvre sans réparation, le texte de la zone est présent en paragraphe, la forme et le commentaire ont disparu ; les mêmes objets dans l'en-tête sont intacts.
29. [ ] **Vue page** : comparer le nombre de pages affiché par la pagination approximative de la démo avec celui de Word sur le même document (écart attendu, à noter pour calibrer).
30. [ ] Rapport de fidélité de la page « Modèle » sur ce même document : noter le score et les propriétés perdues dans `docs/JOURNAL.md` ; si des pertes ne correspondent à rien de visible dans Word, c'est le comparateur qu'il faut ajuster.
31. [ ] Optionnel : ouvrir le fichier greffé dans LibreOffice et comparer.

## Produire d'autres échantillons

Dans le playground (`npm run playground`), les boutons « Exporter .docx (champs) » et « Exporter .docx (résolu) » utilisent les valeurs du panneau Variables, et exportent dans le gabarit après un import. Dans la démo Angular (`npm run demo`), la page « Modèle » exporte dans les trois modes et dans le gabarit, et affiche le rapport de fidélité. En ligne de commande, `npm run fidelity -- fichier.docx --keep sortie.docx` produit le fichier greffé et son rapport.
