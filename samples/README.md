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
11. [ ] Enregistrer sous, puis réimporter dans la démo (`/import`) : variables, notes et table reviennent, et depuis la 0.6 (import `styled` par défaut) la mise en page, l'en-tête et le pied aussi (affichés en vue page, pas dans le corps) ; seuls les numéros de titres sont attendus perdus à l'import (champ de numérotation). En `semantic`, en-têtes, pieds et numéros restent perdus (limite mammoth).
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
27. [ ] **Document multi-sections** (orientation ou marges changeantes) : depuis la session 4, toutes les sections ressortent (voir la checklist « Sections, tabulations et bordures » ci-dessous) ; vérifier qu'il s'ouvre sans réparation et que chaque section garde son format.
28. [ ] **Objets non représentables** : un document avec une zone de texte, une forme et un commentaire dans le corps : la démo les liste ; le fichier exporté s'ouvre sans réparation, le texte de la zone est présent en paragraphe, la forme et le commentaire ont disparu ; les mêmes objets dans l'en-tête sont intacts.
29. [ ] **Vue page** : comparer le nombre de pages affiché par la pagination approximative de la démo avec celui de Word sur le même document (écart attendu, à noter pour calibrer).
30. [ ] Rapport de fidélité de la page « Modèle » sur ce même document : noter le score et les propriétés perdues dans `docs/JOURNAL.md` ; si des pertes ne correspondent à rien de visible dans Word, c'est le comparateur qu'il faut ajuster.
31. [ ] Optionnel : ouvrir le fichier greffé dans LibreOffice et comparer.

## Sections, tabulations et bordures (session 4)

Aucun Word réel pendant la session 4 non plus : les sections, tabulations et bordures sont validées par le comparateur (fixtures 16, 18, client à 1 / 1 / 0,995 dans le gabarit, 19 à 0,998), par un validateur de paquet maison, par la relecture du zip en e2e (Chromium et WebKit) et par les revues R41 à R44 (`docs/reviews/`). Produis les fichiers depuis le playground (`npm run playground`, « Importer .docx » puis « Exporter .docx ») ou la démo (page « Modèle », « Télécharger dans le gabarit »), avec `fixtures/docx/18-sections-triple.docx`, `19-tabulations-bordures.docx` et un `.docx` **créé dans Word** à plusieurs sections (portrait puis paysage, un saut continu, un en-tête différent par section, une première page différente).

32. [ ] **Fixture 18 sans modification** : trois sections dans Word (Mise en page → Sauts : A4 portrait, Letter paysage deux colonnes, A4 portrait en saut continu), en-têtes « Section 1 » / « Première page » / « Section 2 » / « Section 2 paire » (pages paires), section 3 qui hérite de l'en-tête de la section 2, pied `PAGE` puis « Pied 3 » ; aucune boîte « contenu illisible ».
33. [ ] **Document Word réel multi-sections** : aller-retour sans modification, puis Révision → Comparer avec l'original : aucune différence de section, de marges, d'orientation ni d'en-tête ; même nombre de pages.
34. [ ] **Saut inséré dans Aster** (`section.insertBreak` via `getHTML` / `setHTML` ou le playground) puis export dans le gabarit : la nouvelle section existe dans Word avec le format de la précédente (régénérée depuis `layout.sections`), les anciennes sont intactes.
35. [ ] **Saut supprimé dans Aster** (fixture 18, saut 1 retiré) : la section 1 disparaît, la section suivante hérite de ses en-têtes `default` / `even` comme Word l'aurait fait, mais **pas** de sa première page différente (R43-06 : `w:titlePg` non hérité) ; vérifier que la première page n'affiche pas l'en-tête « Première page ».
36. [ ] **Deux sauts consécutifs** (section vide, paragraphe porteur seul) : Word affiche une page blanche ; confirmer que c'est acceptable, sinon c'est l'éditeur qui doit refuser (il le refuse déjà au clavier, pas par `setHTML`).
37. [ ] **Export neuf à trois sections** (`exportDocx(html, { layout })` sans gabarit, ou le playground sans import préalable) : section 2 en Letter paysage deux colonnes avec saut continu, en-têtes pairs affichés (`settings.xml` `w:evenAndOddHeaders`), section 3 en saut page impaire.
38. [ ] **Fixture 19 dans le gabarit** : les quatre taquets (`left` 2 cm, `center` 8 cm, `right` 14 cm, `decimal` 10 cm) ressortent avec leur alignement : le texte après la tabulation est centré / aligné à droite / aligné sur la virgule comme dans l'original (R43-05 ; en 0.5 tout taquet devenait `left`). Les points de suite, s'il y en a, sont conservés (`w:leader`).
39. [ ] **Bordures de paragraphe** : `w:space` 1 / 4 / 8 pt identiques à l'original (Révéler la mise en forme, Maj+F1 : « Bordures : distance du texte »). Un `padding-top: 40pt` posé à la main dans le HTML ressort plafonné à 31 pt (R43-07) : vérifier que Word l'accepte sans réparation, et ce qu'il fait d'une valeur `w:space="40"` écrite directement (tronquée ou refusée ?).
40. [ ] **Bordures de cellule** : traits gris `#BFBFBF` restés gris, cellules « nil gauche » / « nil bas » sans trait réapparu depuis le style du tableau, tableau centré resté centré et tableau aligné à droite resté à droite (`w:jc`) ; `w:space` sur les `w:tcBorders` (1 / 4 pt écrits par l'export) sans décalage visible, Word l'ignore.
41. [ ] **Tableau à style conditionnel** (fixture 19, style `AsterConditional`) : première ligne grasse sur fond bleu clair et bandes grises comme dans l'original ; constater que `w:tblLook` a été remis par Word à son défaut (`0x04A0` : première colonne activée en plus) et si la mise en forme change quand on modifie le style du tableau dans Word (elle ne suit plus le style : propriétés directes).
42. [ ] **Tabulation dans un bloc de code** : un `<pre>` avec une tabulation ressort avec un caractère `\t` dans le paragraphe `HTML Preformatted`, pas un `w:tab` avec taquet.
43. [ ] **Position de taquet énorme** (`data-stop="99999999999pt"` posé dans le HTML) : ressort plafonnée à 31 680 twips (R43-02), le fichier s'ouvre sans « contenu illisible ».
44. [ ] **Vue page multi-sections vs Word** : comparer le nombre de pages de la démo (une feuille par section, une seule largeur de feuille) avec celui de Word sur le même document ; noter l'écart dans `docs/JOURNAL.md`.

## En-têtes par page, champs d'en-tête et défauts de paragraphe (session 5)

Aucun Word réel pendant la session 5 non plus : les retours viennent d'un intégrateur qui a mis la 0.6.0 en essai, et les correctifs sont validés par le comparateur (fixtures 11-16 et 18-20 à 1, 17 à 0,972, client à 0,995 dans le gabarit), les revues R52 et R53, les e2e `search.spec.ts` et `headers-dialog.spec.ts` (Chromium). Produis les fichiers depuis le playground ou la démo avec `fixtures/docx/13-styles-nommes.docx`, `16-sections.docx`, `18-sections-triple.docx`, `20-champs-en-tete.docx` et un `.docx` **créé dans Word** avec une première page différente, des pages paires différentes, un QuickPart « Propriété du document → Titre » dans l'en-tête et un style `Normal` modifié (interligne 1,15, espace après 8 pt).

45. [ ] **En-têtes `first` / `even` sans modification** (fixture 18, puis ton document) : export dans le gabarit, ouvrir dans Word : « Première page » sur la page 1, « Section 2 paire » sur les pages paires de la section 2, rien n'a bougé (Révision → Comparer) ; dans la démo, la vue page affiche les mêmes variantes page par page (écart connu : une section à première page différente **sans** en-tête `first` affiche `default` à l'écran là où Word laisse la page vide).
46. [ ] **En-tête saisi dans le dialogue « Mise en page »** (toolbar `full`, section 2 de la fixture 18) : « Appliquer », export dans le gabarit, ouvrir dans Word : la section 2 porte le nouvel en-tête, les autres sections et la première page différente sont intactes, aucune boîte « contenu illisible » ; l'ancienne partie `header` reste dans le zip (normal). Refaire avec un en-tête qui contient une ligne blanche entre deux paragraphes et un filet (paragraphe vide bordé) : ils ressortent.
47. [ ] **« Appliquer » sans toucher aux en-têtes** sur ton document : le `.docx` ressort avec ses parties d'en-tête identiques à l'octet (comparer les `header*.xml` du zip), et décocher « Première page différente » retire `w:titlePg` sans supprimer la partie `first` (comme Word).
48. [ ] **Contrôle de contenu lié** (fixture 20, puis ton document avec un QuickPart « Titre » en en-tête) : l'import ne crée pas de variable `Titre` (panneau Variables du playground), l'en-tête ressort à l'octet dans le gabarit et Word affiche toujours la propriété du document ; en mode `resolve`, `{{Nom}}` et `{{Societe}}` de l'en-tête sont résolus et le contrôle lié reste un contrôle (Développeur → mode Création le montre).
49. [ ] **Défauts de paragraphe** (fixture 13, puis ton document au `Normal` modifié) : la vue page montre le même interligne et le même espace après que Word pour les paragraphes sans mise en forme directe ; un style **non** basé sur `Normal` garde son interligne simple à l'écran (R53-01) ; export **neuf** (`--no-template` ou playground sans import) : Fichier → Options → Styles → `Normal` montre 1,15 / 8 pt ; un interligne « au moins » dans `Normal` ne ressort pas en « exactement » (R53-04 : il n'est pas transporté, le paragraphe reste comme Word le rendait).
50. [ ] **Recherche** : `Ctrl+F` dans la démo sur un document de plusieurs pages : le bandeau pousse le texte sous la toolbar sans le recouvrir, « Suivant » fait défiler jusqu'à la correspondance en vue page comme en vue simple, le focus reste dans le champ ; comparer avec le même document dans Word (Navigation).

## Produire d'autres échantillons

Dans le playground (`npm run playground`), les boutons « Exporter .docx (champs) » et « Exporter .docx (résolu) » utilisent les valeurs du panneau Variables, et exportent dans le gabarit après un import. Dans la démo Angular (`npm run demo`), la page « Modèle » exporte dans les trois modes et dans le gabarit, et affiche le rapport de fidélité. En ligne de commande, `npm run fidelity -- fichier.docx --keep sortie.docx` produit le fichier greffé et son rapport.
