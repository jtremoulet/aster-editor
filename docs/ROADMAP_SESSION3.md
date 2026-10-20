# 🌙 Roadmap session 3 — fidélité de mise en page Word ✅ réalisée le 20/10 (0.5.0)

> Objectif de Joris (20 octobre 2026) : l'utilisateur **voit le document tel qu'il est** dès l'import, **modifie ce qu'il modifie**, et **sauvegarde dans le bon format**, c'est-à-dire un `.docx` qui ressort comme l'original partout où il n'a rien touché. Les deux faces sont prioritaires : fidélité à l'écran (import) et fidélité à la sortie (export).
> Point de départ : 0.4.3 sur `develop`, 1 262 tests unitaires + 35 e2e verts, paquets publiés sur npm. Même rituel que les sessions 1 et 2 (contrat figé en phase 0, lots disjoints, revues adverses au fil de l'eau, correctifs immédiats, e2e, docs, bilan), avec les leçons du REX.

## 🎯 Résultat attendu

1. **Import stylé** : un `.docx` s'ouvre dans l'éditeur avec ses polices, tailles, couleurs, surlignages, alignements, interlignes, espacements, retraits, bordures et fonds de paragraphe, tableaux (largeurs, bordures, fonds, cellules fusionnées), images (taille, alignement), listes (format de numérotation, niveaux), notes, et une **vue page** aux dimensions et marges du document. mammoth reste disponible comme mode « sémantique » pour qui veut un HTML propre.
2. **Export dans le gabarit** : l'export réutilise le `.docx` importé comme gabarit. Styles, numérotation, thème, polices, en-têtes, pieds, sections, marges, propriétés du document restent **identiques à l'octet près** ; seul le corps est régénéré depuis l'éditeur. Un aller-retour sans modification donne un corps équivalent (hors identifiants de révision) et des parties annexes intactes.
3. **Fidélité mesurée** : un rapport automatique compare l'original et le résultat propriété par propriété et donne un score ; c'est le critère d'acceptation, pas une impression visuelle.
4. **Angular et démo** : le composant garde le fichier importé et l'utilise tout seul comme gabarit à l'export ; la page « Modèle » montre la vue page, les en-têtes et pieds, et le rapport de fidélité.
5. Les variables de la session 2 continuent de fonctionner sur le chemin stylé (champs de fusion, contrôles de contenu, `{{nom}}`).

## 📏 Ce qu'on ne promet pas

- Une **pagination exacte** (numéro de page affiché au bon endroit, saut de page calculé) : impossible sans moteur de rendu Word. La vue page donne le format, les marges et les sauts de page explicites, pas le nombre de pages.
- Les objets que l'éditeur ne sait pas représenter (formes, SmartArt, zones de texte flottantes, équations, graphiques, commentaires, révisions, champs autres que fusion/numéro de page/TOC) : conservés **tels quels** s'ils sont hors du corps (en-têtes, pieds), **signalés par un avertissement et perdus** s'ils sont dans le corps édité. La liste exacte des pertes est dans le rapport de fidélité.
- La fidélité d'un document **créé de zéro** dans l'éditeur sans gabarit : l'export neuf de la session 2 reste le chemin, inchangé.

## 🧪 Fixtures : la condition du succès

Les fixtures synthétiques des sessions 1 et 2 ne suffisent plus : ce sont les documents réels qui cassent. Deux sources, par ordre de priorité :

1. **Documents du client**, anonymisés si besoin, déposés dans `fixtures/docx/client/`. Chaque document reçu devient une fixture d'aller-retour avec son score de fidélité attendu. Joris les dépose quand il peut ; la session démarre sans si nécessaire.
2. **Fixtures générées** en phase 0 (`scripts/generate-fixtures-layout.ts`) : `11-styles-inline.docx` (polices, tailles, couleurs, surlignages, souligné, barré, exposant, casse), `12-paragraphes.docx` (alignements, interlignes, espacements, retraits, bordures, fonds, tabulations), `13-styles-nommes.docx` (styles Word personnalisés basés les uns sur les autres, `basedOn`, docDefaults, thème), `14-tableaux-riches.docx` (largeurs fixes et en pourcentage, bordures par côté, fonds, fusions horizontales et verticales, tableau imbriqué), `15-listes-numerotation.docx` (formats décimal, lettres, romain, puces personnalisées, niveaux, redémarrage), `16-sections.docx` (marges, orientation paysage, A4 et Letter, en-têtes et pieds différents, première page différente, colonnes), `17-objets-perdus.docx` (zone de texte, forme, équation, commentaire, révision) pour tester les avertissements.

Limite connue : aucun Word réel n'est disponible pendant la session. Les fixtures sont produites par la lib `docx` et par du XML écrit à la main ; la vérification dans Word reste à Joris, avec une checklist dans `samples/README.md` comme en session 2.

## 🧱 Phase 0 — orchestrateur (contrat figé)

- [ ] `npm run check` de base vert, `npm run e2e` vert.
- [ ] **Contrat core** (`packages/core/src/api/`, additif) :
  - `ParagraphLayoutAttrs` : `lineHeight` (nombre ou `'1.5'`), `spacingBefore` / `spacingAfter` (pt), `indentLeft` / `indentRight` / `indentFirstLine` / `indentHanging` (pt), `border` (`{ side, style, width, color }[]`), `shading` (couleur), `keepWithNext`, `pageBreakBefore`. Sérialisés sur `<p>` et `<h1..6>` en `style` inline normalisé (`line-height`, `margin-top`, `margin-bottom`, `margin-left`, `margin-right`, `text-indent`, `border-*`, `background-color`) et `data-keep-next`, `data-page-break-before`.
  - `data-docx-style="Heading1"` sur les blocs et `data-docx-run-style` sur les spans : nom du style Word d'origine, pour que l'export dans le gabarit réutilise le même style et n'écrive en propriétés directes que les différences. Les attributs inconnus de l'éditeur sont conservés dans `data-docx-*` sans être interprétés.
  - `RunLayoutMarks` : les marques existantes (`fontFamily`, `fontSize`, `color`, `highlight`, `underline`, `strike`, `subscript`, `superscript`) plus `letterSpacing`, `caps` (`'all' | 'small'`), `underlineStyle` (`single | double | dotted | dashed | wavy`), `strikeStyle` (`single | double`).
  - Tableaux : `width` (`pt | %`), `borders` par côté sur table et cellule, `shading` sur cellule, `verticalAlign`, `cellPadding`, `columnWidths` (déjà présent) ; images : `width`, `height`, `align`, `wrap` (`inline | left | right`, approximé).
  - `DocumentLayout` : `page { size, orientation, margins }`, `columns`, `defaultFont`, `lang`, `headers` / `footers` (`default`, `first`, `even`, HTML stylé) — type partagé entre import et export.
  - Option `AsterOptions.pageView: boolean | { layout?: DocumentLayout }` : vue page (largeur, marges, fond) sans pagination.
- [ ] **Contrat word** (`packages/word/src/docx/types.ts`, additif) :
  - `DocxImportOptions.fidelity: 'styled' | 'semantic'` — `styled` par défaut (nouveau lecteur), `semantic` = chemin mammoth actuel, inchangé.
  - `DocxImportResult.layout: DocumentLayout`, `DocxImportResult.template: ArrayBuffer` (le paquet d'origine, à repasser à l'export), `DocxImportResult.lost: readonly DocxLostObject[]` (objets non représentables, avec leur position).
  - `DocxExportOptions.template: DocxInput` — export dans le gabarit ; sans gabarit, export neuf actuel. `DocxExportOptions.layout: DocumentLayout` pour l'export neuf (remplace et englobe `page`, `header`, `footer`, `defaultFont`, `lang`, qui restent acceptés).
  - `FidelityReport` : `{ score: number, properties: { name, kept, lost, total }[], lost: DocxLostObject[] }` et la fonction `compareDocx(original, result)`.
- [ ] Fixtures 11-17 générées, `expected/` à produire par les lots de lecture.
- [ ] Briefs, journal, règle d'arrêt.

## 🌊 Vague 1 — Lecture et rendu (4 agents, lots disjoints)

| Lot                        | Paquet             | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L23 core-layout**        | `core`             | Extension `ParagraphLayout` (attrs, parse et rendu du `style` inline normalisé), marques `letterSpacing`, `caps`, `underlineStyle`, `strikeStyle`, attributs `data-docx-*` conservés, attributs tableau et image étendus, `pageView` (classe sur l'hôte, variables CSS `--aster-page-*` depuis `DocumentLayout`), commandes `paragraph.setLayout` / `paragraph.unsetLayout`, i18n. Idempotence stricte `setHTML(getHTML())`.                                                                                   |
| **L24 word-reader-runs**   | `word/docx/reader` | Nouveau lecteur OOXML (jszip + DOM XML existant) : résolution des styles (docDefaults → thème → style `basedOn` → paragraphe → run), polices du thème, tailles, couleurs, surlignage, souligné, barré, exposant, casse, espacement, alignement, interligne, espacements, retraits, bordures, fonds, sauts de page et de ligne, tabulations (approximées en retrait), hyperliens, signets. Produit le HTML stylé + `data-docx-style`. Compatibilité totale avec le prétraitement des variables de la session 2. |
| **L25 word-reader-blocks** | `word/docx/reader` | Tableaux (largeurs, bordures, fonds, fusions, imbrication, alignement vertical, marges de cellule), listes depuis `numbering.xml` (formats, niveaux, redémarrages, puces), images inline et ancrées (taille, alignement, habillage approximé), notes de bas de page et de fin, en-têtes et pieds (`default`, `first`, `even`) en HTML stylé, sections (`DocumentLayout`), objets non représentables → `lost` + avertissements.                                                                                 |
| **L26 ui-layout**          | `ui`               | Toolbar : interligne, espacement de paragraphe (menu), retraits (augmenter, diminuer, première ligne), bordures et fond de paragraphe (dialogue), casse, style de souligné ; vue page (`themes/page.css` : feuille A4/Letter, marges, ombre, sauts de page visibles, en-têtes et pieds affichés en lecture seule au-dessus et au-dessous du corps) ; bouton « Mise en page » (format, orientation, marges). i18n, icônes, a11y.                                                                                |

Intégration au fil de l'eau, revue adverse de chaque lot dès intégration (R23-R26), correctifs immédiats.

## 🌊 Vague 2 — Écriture dans le gabarit et mesure (3 agents)

| Lot                          | Paquet              | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L27 word-writer-template** | `word/docx/writer`  | Export dans le gabarit : le paquet d'origine est conservé, seul `<w:body>` est régénéré depuis le HTML stylé. Stratégie « greffe » : le corps est produit par la chaîne d'export existante (lib `docx`), puis transplanté dans le gabarit avec remappage des identifiants de styles (réutiliser `data-docx-style`, n'ajouter que les styles manquants), de numérotation (réutiliser les `numId` d'origine, ajouter les nouveaux `abstractNum`), des relations (images, liens, notes : fusion des `.rels` et du dossier `media`), et conservation du `sectPr` final, des en-têtes et pieds, de `styles.xml`, `numbering.xml`, `theme`, `fontTable`, `settings`, `docProps`. Propriétés directes écrites seulement quand elles diffèrent du style résolu. Variables en mode `fields` inchangées. |
| **L28 fidelity-report**      | `word/docx/compare` | `compareDocx(original, result)` : extraction des propriétés résolues des deux documents (paragraphe par paragraphe, run par run, tableau, section, en-têtes et pieds, parties annexes), score pondéré, liste des pertes ; script `npm run fidelity -- fichier.docx` qui importe, exporte dans le gabarit et imprime le rapport ; fixtures 11-17 et documents client avec score attendu en test (seuil, pas valeur exacte). Parties annexes : égalité binaire attendue.                                                                                                                                                                                                                                                                                                                         |
| **L29 angular-demo**         | `angular`, `demo`   | Le composant conserve `result.template` et `result.layout`, `exportDocx()` les utilise par défaut (`template: 'imported'`), input `pageView`, output `layoutChanged`, signal `fidelity()` après export ; page « Modèle » : vue page, en-têtes et pieds, bouton « Rapport de fidélité », objets perdus listés. README.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Revues R27-R29, correctifs, puis **L30 e2e** (import stylé dans le playground et la démo, vue page, export dans le gabarit vérifié par relecture du zip) et **L31 docs** (guide d'intégration chapitre « Fidélité Word », README word, ARCHITECTURE, API_CORE, THEMING).

## ✅ Critères d'acceptation

| Critère                                                                                   | Mesure                                                                           |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Aller-retour **sans modification** d'une fixture ou d'un document client dans son gabarit | parties annexes identiques à l'octet, corps équivalent hors `rsid`, score ≥ 0,98 |
| Aller-retour **avec une modification locale** (un mot changé)                             | seule la propriété touchée diffère dans le rapport                               |
| Import stylé des fixtures 11-16                                                           | `expected/*.html` figés, score de lecture ≥ 0,95 par fixture                     |
| Fixture 17 (objets non représentables)                                                    | chaque objet listé dans `lost` avec un avertissement, aucun plantage             |
| Variables (fixtures 08-10) sur le chemin stylé                                            | mêmes `result.variables` qu'en mode sémantique                                   |
| Non-régression                                                                            | 1 262 tests existants verts, mode `semantic` bit à bit identique à 0.4.3         |
| Performance                                                                               | import stylé d'un document de 100 pages (fixture générée) < 2 s en jsdom         |

## 🪓 Ordre de sacrifice (si le temps manque)

1. Habillage des images ancrées (reste `inline`).
2. Colonnes de section (conservées dans le gabarit, non affichées).
3. Bordures et fonds de paragraphe dans la toolbar (conservés à l'import et à l'export, non éditables).
4. En-têtes et pieds `first` / `even` dans la vue page (conservés dans le gabarit).
5. Vue page elle-même (le reste tient sans).

Rien d'autre ne se sacrifie : lecture stylée, export dans le gabarit et rapport de fidélité sont le livrable.

## ⚠️ Risques identifiés

- **Greffe du corps dans le gabarit** : la lib `docx` écrit ses propres identifiants de styles, de numérotation et de relations ; le remappage est le point dur de L27. Repli prévu dans le brief : si la greffe des listes échoue, les listes du corps réutilisent la numérotation d'origine quand elle existe et repassent en numérotation neuve sinon, avec avertissement.
- **Résolution des styles** : `basedOn` en chaîne, docDefaults, thème (polices `minorHAnsi`), styles de tableau conditionnels. L24 doit lire `node_modules`-free, depuis le XML, avec des tests unitaires par règle. Les styles de tableau conditionnels (première ligne, bandes) sont approximés en propriétés directes.
- **Idempotence** : chaque attribut ajouté au core doit survivre à `setHTML(getHTML())` ; les tests d'idempotence existants sont étendus, c'est la première chose que les relecteurs attaquent.
- **Poids** : le lecteur remplace mammoth sur le chemin par défaut ; mammoth reste chargé seulement en mode `semantic` (import dynamique séparé).
- **Pas de Word pendant la session** : la vérification visuelle finale est celle de Joris, checklist fournie.

## 🧭 Déroulé prévu

Phase 0 (contrat, fixtures, briefs) ≈ 45 min · Vague 1 ≈ 2 h en parallèle, intégrations et revues au fil de l'eau · Vague 2 ≈ 2 h · e2e, docs, bilan ≈ 45 min. Soit **5 à 6 heures** de session autonome, version cible **0.5.0** (`feat`), `main` intacte, merge sur demande.

## 📬 Ce que Joris fournit s'il le peut

- Un ou plusieurs `.docx` du client dans `fixtures/docx/client/` (anonymisés). Même un seul change la qualité du résultat.
- La liste des éléments qui comptent le plus pour le client (polices, tableaux, en-têtes…), si elle est connue : elle ordonne les lots.

## ➕ Ajouts en cours de session (20/10, 17:20)

- **Document client** : `fixtures/docx/client/Modele_Demo_DER.docx` déposé par Joris (196 paragraphes, 8 tableaux, 3 sections, 20 champs de fusion complexes dont un imbriqué, 10 révisions, un pied de page). Non commité (`fixtures/docx/client/` ignoré par git tant que Joris n'a pas dit s'il peut être publié). Test `client-doc.spec.ts` activé quand le fichier est présent ; devient le document de référence du rapport de fidélité.
- **L30 pagination (vague 2, `core` + `ui`)** : demande de Joris. Pagination **approximative** dans la vue page : un plugin ProseMirror mesure la hauteur des blocs rendus et pose des décorations de coupure là où la hauteur cumulée dépasse la zone utile (hauteur de page moins marges), avec numéro de page dans le pied affiché ; recalcul débouncé sur `update` et `resize` ; sauts de page explicites respectés ; les tableaux ne sont pas coupés (ils passent entiers à la page suivante, approximation documentée). Pas de garantie d'exactitude avec Word, écrit dans la doc.
- **Numéros de liste écrasés** (capture de Joris) : les marqueurs des listes ordonnées sont rognés ou chevauchés. Piste : `padding-left: 1.6em` sur `ol` dans `themes/base.css` trop court pour deux chiffres, et retraits négatifs (`text-indent`) des paragraphes importés dans un `<li>`. À reproduire dans le playground, corriger dans `ui` (feuille) et dans `lists.ts` (retirer `margin-left` / `text-indent` issus de la numérotation).
- **En-têtes et pieds de page** (rappel de Joris, 17:40) : lus avec héritage entre sections, affichés dans la vue page, conservés à l'octet dans le gabarit ; ajouts : résolution des variables des en-têtes et pieds en mode `resolve` dans le gabarit, régénération d'un en-tête ou pied modifié (L27), édition dans la page « Modèle » et input `layout` du composant Angular (L29).
