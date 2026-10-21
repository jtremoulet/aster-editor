# 🧪 Stratégie de tests — Aster Editor

> Beaucoup de tests unitaires, rapides, lisibles. Les e2e graphiques couvrent les parcours réels, variables comprises. Depuis la session 3, le **score de fidélité** d'un aller-retour `.docx` est un critère de test, pas une impression.

## 🔺 Pyramide

| Niveau               | Outil                                          | Portée                                                                                                                                                                                     | Quand                                                                                                                                      |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Unitaire pur         | Vitest, environnement `node`                   | Fonctions pures : passes du normaliseur Word, prétraitement XML, i18n, helpers HTML, config de toolbar                                                                                     | V1, majorité des tests                                                                                                                     |
| Unitaire DOM         | Vitest + jsdom                                 | `createEditor`, commandes, magasin de variables, sérialisation, toolbar rendue, panneaux, événements                                                                                       | V1                                                                                                                                         |
| Composant Angular    | Vitest via `@angular/build:unit-test`, TestBed | CVA, inputs/outputs, variables, cycle de vie, zoneless                                                                                                                                     | V1                                                                                                                                         |
| Fidélité mesurée     | Vitest + `compareDocx`, `npm run fidelity`     | Aller-retour import stylé → export dans le gabarit → comparaison propriété par propriété : score ≥ 0,98 ou plancher de non-régression par fixture, parties annexes à l'octet               | Session 3                                                                                                                                  |
| Intégration manuelle | App démo + navigateur intégré de Claude        | Collage réel, import .docx réel, clavier, vue page ; ouverture dans Word réel via `samples/` (checklist)                                                                                   | V1, vérif de fin de lot                                                                                                                    |
| E2E graphique        | Playwright                                     | Parcours utilisateur complets, captures (`e2e/`, projets `playground` et `demo` sur Chromium, `playground-webkit` et `playground-firefox` pour la fidélité et les sections, `npm run e2e`) | Livré en 0.3.0, étendu aux variables en 0.4.0, à la fidélité en session 3 (L32), aux sections et aux autres navigateurs en session 4 (L47) |

État session 4 (21/10/2026, `npx vitest run` par paquet) : **2 323 tests unitaires** verts (core 753 dans 40 fichiers, word 1 075 passés + 1 `it.fails` attendu + 18 ignorés sans document client dans 82 fichiers, ui 412 dans 37 fichiers, angular 53, démo 30), contre 1 994 en session 3 et 1 262 en 0.4.3. Le test de performance du lecteur (`reader/performance.spec.ts`, import stylé de 100 pages < 2 s, meilleur de deux imports) peut échouer quand la suite tourne en parallèle d'une autre (contention CPU) : relancé seul, il passe. E2E (`npx playwright test --list -c e2e/playwright.config.ts`) : **74 tests dans 5 specs** sans Firefox (playground 42, playground-webkit 13, demo 19), **87** avec le projet Firefox (`e2e/sections.spec.ts`, L47 : six scénarios, import de la fixture 18, feuille et coupure de section, dialogue par section, `section.insertBreak` et undo, tabulations, export gabarit avec trois `w:sectPr` relus dans le zip, page Modèle de la démo), contre 42 en session 3.

## 📐 Règles

- Un test décrit un **comportement**, pas une implémentation : `it('reconstruit une liste numérotée imbriquée sur deux niveaux')`.
- Noms de tests en français, code en anglais.
- Fixtures dans `fixtures/` à la racine, partagées entre paquets. Jamais de HTML Word inline de plus de 5 lignes dans un test, on le met en fixture.
- Un bug corrigé = un test de non-régression ajouté avec la description du bug. Les correctifs des revues adverses (0.3.0 : cinq lots, 0.4.0 : cinq revues, session 3 : revues R23 à R27, chaque preuve du relecteur reprise en test, nommée `R24-03`, `R26-06 (F1)`…) sont tous figés ainsi.
- Pas de snapshot géant. Les snapshots sont tolérés uniquement sur du HTML court et lu par un humain. Exception assumée : les attendus `fixtures/docx/expected/*.html` du lecteur stylé (01-06, 08-19 : la sortie du chemin par défaut depuis la 0.6), figés en entier parce que c'est la sérialisation exacte qui est testée ; régénérés **seulement** par `ASTER_REGEN=1 npx vitest run src/docx/reader/regen-expected.spec.ts` (`describe.skipIf` sans la variable), puis relus dans le diff git avant d'être figés. Les attendus du chemin `semantic` (`expected/semantic/`, 01-03 et 08-10, sortie mammoth) ne sont jamais régénérés : ils figent le comportement 0.4.x.
- **Idempotence stricte** : tout attribut ajouté au core doit survivre à `setHTML(getHTML())` **à l'identique** (`expect(editor.getHTML()).toBe(html)`), pas « structurellement » ; le HTML du lecteur stylé est testé de la même façon après passage dans un éditeur réel (`reader/paragraphs.spec.ts`, `writer/graft-fixes-body.spec.ts` : import → export dans le gabarit → import strictement idempotent sur la fixture 17). C'est la première chose que les relecteurs attaquent. Session 4 : un document chargé garde ses numéros de saut de section tels quels (`setHTML(getHTML())` idempotent même hors ordre), alors qu'une édition renumérote ; les deux sont testés.
- **Score de fidélité comme critère** : un aller-retour sans modification vise ≥ 0,98 dans le gabarit ; une fixture à la cible est assertée **avec la liste exacte des propriétés encore perdues** (`TEMPLATE_AT_TARGET`, vide sauf `table.conditional` pour la 19) ; une fixture sous la cible est en `it.fails` documenté avec un **plancher** de non-régression (score mesuré moins une marge) ; quand elle atteint la cible, le `it.fails` échoue et il faut la déplacer dans le jeu « à la cible ». Une valeur exacte n'est jamais assertée.
- **Les relecteurs prouvent, les lots corrigent, les preuves deviennent des tests** : en session 4, les 23 findings de R41 à R44 (aucun bloquant) sont repris dans les correctifs F41 à F44 sous leur identifiant (`R41-03`, `R43-05`, `R44-02`…), spec par spec.
- Les tests ne dépendent pas de l'ordre d'exécution ni de timers réels. `vi.useFakeTimers()` pour le debounce, l'autosave et la pagination. Pas de `waitForTimeout` en e2e.
- Un document client réel est en `describe.skipIf(!existsSync(CLIENT))` : la suite passe sans lui et s'active dès qu'il est déposé dans `fixtures/docx/client/` (ignoré par git).

## 🎯 Seuils de couverture

Mesurés avec `@vitest/coverage-v8`, seuils dans la config de chaque paquet, bloquants dans `npm run check` :

| Paquet    | Lignes | Pourquoi                                         |
| --------- | ------ | ------------------------------------------------ |
| `word`    | 85 %   | Cœur de la valeur, logique pure, facile à tester |
| `core`    | 75 %   | Commandes et sérialisation                       |
| `ui`      | 70 %   | DOM rendu, états des boutons                     |
| `angular` | 70 %   | CVA et cycle de vie                              |

## 📂 Fixtures

```
fixtures/
├── docx/
│   ├── README.md                           provenance et contenu attendu de chaque fichier
│   ├── 01-headings-lists.docx              titres H1-H3, listes imbriquées puces et numéros, lien
│   ├── 02-tables.docx                      tables avec en-tête en gras, cellule colspan
│   ├── 03-images.docx                      image PNG inline, note de bas de page
│   ├── 04-rapport-client.docx              rapport réaliste : styles, listes, tables, image, note, en-tête et pied
│   ├── 05-tableaux-complexes.docx          fusions, cellules vides, liste et image dans des cellules, table imbriquée
│   ├── 06-styles-francais.docx             styles Word nommés en français (style map)
│   ├── 07-long.docx                        300 paragraphes, 12 sections, 15 tables (charge, < 3 s)
│   ├── 08-variables-braces.docx            {{client.nom}}… dans titre, paragraphes, liste, table ; {{ coupé sur deux runs
│   ├── 09-variables-mergefields.docx       champs de fusion w:fldSimple et champ complexe w:fldChar
│   ├── 10-variables-content-controls.docx  contrôles de contenu w:sdt avec tag, alias, valeur ou texte de remplissage
│   ├── 11-styles-inline.docx               session 3 : polices, tailles, couleurs, surlignages, soulignés stylés, barrés, exposant, casse, espacement, thème
│   ├── 12-paragraphes.docx                 alignements, interlignes, espacements, retraits, bordures, fonds, keepNext, pageBreakBefore, tabulation, sauts
│   ├── 13-styles-nommes.docx               docDefaults, Normal modifié, Heading1/2, styles basés les uns sur les autres (basedOn)
│   ├── 14-tableaux-riches.docx             largeurs, bordures par côté, fonds, fusions, alignement vertical, marges, tableau imbriqué, style TableGrid
│   ├── 15-listes-numerotation.docx         décimal, lettres, romain, puces, niveaux, redémarrage, continuation, liste en cellule
│   ├── 16-sections.docx                    deux sections (A4 / Letter paysage), en-têtes default / first / even, pied PAGE / NUMPAGES, colonnes, langue
│   ├── 17-objets-perdus.docx               zone de texte, forme, équation, commentaire, révisions, champ DATE, objet incorporé
│   ├── 18-sections-triple.docx             session 4 : trois sections (A4 / Letter paysage 2 colonnes / A4), saut nextPage puis continuous, en-têtes default / first / even, en-tête hérité, pied propre
│   ├── 19-tabulations-bordures.docx        taquets left / center / right / decimal, tabulation sans taquet, bordures w:space 1 / 4 / 8 pt, nil, couleurs grises, w:jc, style de tableau conditionnel
│   ├── client/                             documents client réels (Modele_Demo_DER.docx), ignorés par git, tests en skipIf
│   ├── expected/                           HTML attendu du chemin par défaut (styled) : 01-06, 08-19, figés depuis le lecteur stylé (regen-expected.spec.ts)
│   └── expected/semantic/                  HTML attendu du chemin semantic (mammoth, comportement 0.4.x) : 01-03, 08-10, jamais régénérés
└── word-html/
    ├── README.md
    ├── word-365-list-nested.html           HTML du presse-papier Word 365, listes
    ├── word-365-list-3-levels.html
    ├── word-365-list-no-style.html
    ├── word-365-table.html
    ├── word-365-variables.html             {{nom}} collé : dans un <b>, coupé sur deux spans, dans des <td>, {{ tva }}
    ├── word-2016-headings.html
    ├── google-docs-basic.html
    └── expected/
```

Les `.docx` sont générés avec la lib `docx` par `scripts/generate-fixtures.ts` (01-03), `generate-fixtures-extra.ts` (04-07), `generate-fixtures-variables.ts` (08-10), `generate-fixtures-layout.ts` (11-17, lib `docx` plus patches XML pour `TableGrid`, zone de texte, forme, objet OLE) et `generate-fixtures-sections.ts` (18-19, session 4 : trois `w:sectPr`, taquets, `w:space`, `nil`, style de tableau conditionnel injecté par patch XML), pour être reproductibles (`npm run fixtures`). Point connu : la lib `docx` écrit les booléens `w:tblLook` / `w:cols` en `true` / `false` là où Word écrit `1` / `0`, le lecteur accepte les deux. Les documents réels anonymisés fournis par Joris vont dans `fixtures/docx/client/`, hors dépôt, avec une note de provenance dans `fixtures/docx/README.md` ; chacun devient une fixture d'aller-retour avec son score attendu. `samples/export-fidelite-complet.docx` est l'inverse : un fichier **produit** par `exportDocx` avec toutes les options, à ouvrir dans Word réel en suivant la checklist de `samples/README.md`. Limite connue de la session : aucun Word réel pendant la session, une fixture « objets perdus » écrite à la main ne reproduit pas la forme réelle de Word (`mc:AlternateContent` a été découvert par une revue, pas par la fixture), d'où la checklist Word.

## 🧩 Ce que chaque paquet teste

**core**

- `createEditor` monte et détruit sans fuite d'écouteurs.
- Chaque commande standard : `run` change l'état, `isActive` reflète la sélection, `canRun` faux en lecture seule.
- `setHTML(getHTML())` idempotent sur un document complet, puces de variables comprises.
- `LinkSafety` rejette `javascript:` et `data:` hors images.
- i18n : clé manquante retourne la clé, paramètres interpolés, changement de locale à chaud.
- Événements émis dans le bon ordre, désabonnement fonctionne.
- Variables (`variable-store.spec`, `variable.spec`, `commands.variables.spec`, `resolve-variables.spec`) : une seule source de valeurs, `undefined` efface et `define` ne ressuscite pas, `resolve()` garde les succès avant de rejeter, nom invalide inerte (`setJSON` hostile), règle de saisie, NodeView rafraîchi sur `variablesChange` et désabonné à la sortie, `getHTML({ variables: 'resolve' })` échappe les valeurs.
- Sommaire et pinceau (`outline.spec`, `commands.format-painter.spec`) : aucun `id` sans `getOutline`, `id` importés conservés, doublon renuméroté ; copie / application des marques et du bloc, lien conservé, verrou.
- Mise en page (`paragraph-layout.spec`, `run-layout.spec`, `list-layout.spec`, `table-layout.spec`, `layout-css.spec`, `commands.layout.spec`, `page-break.spec`) : sérialisation exacte de chaque attribut dans l'ordre du contrat, idempotence stricte, valeurs invalides ignorées sans effacer, bornes (±100 000, `colspan` ≤ 63, `rowspan` ≤ 1 000), couleurs normalisées, `span` vide refusé, sélection de cellules traitée plage par plage, `<hr data-page-break>` conservé.
- Vue page et pagination (`page-view.spec`, `pagination.spec`, `pagination-layout.spec`) : métriques et replis (jamais `Infinitymm`), sanitiseur d'en-têtes (XSS `java\tscript:`, `url()` masqué, profondeur plafonnée), mise en page hostile ignorée au montage et vue précédente remontée à chaud (R41-05), coupures aux bons index, sauts forcés, tableau entier à la page suivante, débounce et frame avec timers simulés, `ResizeObserver` absent toléré, 4 000 paragraphes paginés en moins de 100 ms ; session 4 : `resolveSectionLayout` avec des entrées hostiles (`sections: 'abc'`, index 0 / −1 / NaN / 1e9), hôte = section 1 et pied = dernière section du corps, `--aster-page-width-max`, pagination par segments (hauteur utile par section, saut forcé sauf `continuous`, coupure portant les variables de ses deux sections, libellé « Section n · format », en-tête et pied de section), numéros de saut hors ordre résolus par position (R44-01), `pageViewChange` émis après l'état.
- Sections et tabulations (`section-break.spec`, `tab.spec`, `commands/sections.spec`, `commands.layout.spec`) : sérialisation exacte de `<hr data-section-break>` et `<span data-tab data-stop data-align data-leader>`, idempotence stricte sur 44 formes hostiles, renumérotation par suite ordonnée après collage de plage, drop et undo, méta `asterSetContent` qui garde les numéros d'un chargement, paragraphe garanti avant un saut en tête et entre deux sauts, saut imbriqué rétrogradé en `hr`, numéro borné à 10 000, `removeBreak` qui refuse un argument invalide, Tab réservée aux listes, cellules et blocs de code (`canInsertTab`), `tabKey` `focus` / `insert`, Backspace et Delete en une frappe, `getText()` en `\t`, fuite d'écouteurs des NodeViews (ajoutés = retirés après `destroy`), 1 000 sauts en moins de 200 ms.
- Sérialiseur verbatim (`serialize-html.spec`) : même sortie que `getHTML` sur un document ordinaire, `style` verbatim, garde anti-XSS de ProseMirror reprise.

**word**

- Chaque passe du normaliseur testée seule sur un mini HTML, puis le pipeline complet sur les fixtures.
- Listes : puces, numéros, imbrication 3 niveaux, reprise de numérotation, liste interrompue par un paragraphe.
- Tables : en-têtes détectés, attributs de layout retirés, cellules fusionnées conservées.
- `importDocx` sur chaque fixture : comparaison structurelle avec `expected/`, avertissements remontés ; `import-all-fixtures.spec` vérifie que tout `.docx` déposé s'importe sans rejet.
- Variables à l'import (`preprocess/*.spec`, `postprocess/variables.spec`, `import-docx.variables.spec`) : champs simples et complexes, noms cités et normalisés, contrôles de ligne et de bloc, texte de remplissage ignoré, en-têtes et pieds collectés, `detect` et `pattern`, archive illisible → avertissement et import sans prétraitement, prétraitement linéaire sur 2 000 `begin` jamais fermés (< 500 ms).
- Collage : `paste/passes/variables.spec` et `word-365-variables.html` (`{{` coupé sur deux spans, marques, cellules, accolades seules).
- Export (`export/*.spec`, dont `variables.spec`, `fidelity.spec`, `footnotes.spec`, `column-widths.spec`, `layout.spec`) : trois modes de variables, nom de champ cité, valeurs multi-lignes et non chaînes, motif sticky, en-têtes et pieds avec numéros de page, TOC, notes (collision de clés, appel hors du corps), titres numérotés, marges bornées, `colspan` borné, contrat de mise en page écrit (paragraphe, run, liste, tableau) et `options.layout` (page, colonnes, police, langue, en-têtes des trois types, priorité des options explicites), aller-retours export → import figés avec leurs dégradations connues.
- Lecteur stylé (`docx/reader/*.spec` : `styles`, `runs`, `paragraphs`, `tables`, `table-conditional`, `lists`, `images`, `notes`, `headers`, `sections`, `sections-fixtures`, `lost`, `units`, `reader`, `blocks-fixtures`, `performance`) : une règle de résolution par test (docDefaults, thème, `basedOn` avec cycle, `link`, styles de tableau et leurs formats conditionnels, `w:tblLook` nommé / masque / absent = `0x04A0`, bandes, `nil` conditionnel sur `insideH` / `insideV`), chaînes de styles linéaires (1 500 niveaux), champs coupés et imbriqués, `HYPERLINK` jamais fermé, `w:sym` hors Unicode, injection CSS par un nom de police, `gridSpan` géant, `mc:AlternateContent`, `w:customXml`, compteurs de liste à travers un tableau, sections (`sectPr` dans un `sdt`, une cellule, un en-tête ; deux `sectPr` consécutifs ; corps terminé par un saut → `<p></p>` ; `w:type`, `w:cols`, `titlePg` non hérité, en-têtes hérités type par type et convertis une fois, 300 sections en 27 ms), tabulations (n-ième taquet, `w:clear`, positions hostiles, taquet négatif ignoré, 3 000 tabulations en 330 ms), bordures (`w:space`, couleurs exactes, `nil` explicite, `sz` hors bornes), bornes de page, import stylé de 100 pages en moins de 2 s, et pour chaque fixture 01-06, 08-19 l'attendu figé **et** l'idempotence stricte dans un éditeur réel.
- Export neuf (`export/sections.spec`, `sections-options.spec`, `tabs-borders.spec`) : trois sections relues par `importDocx`, segment vide ou finissant par un tableau, `n` hostile (`0`, `abc`, `1e20`, ordre `3-1`), options `page` / `header` / `footer` « du document » avec des sections (R43-03), `w:tabs` triés et dédoublonnés, `w:pos` et `w:space` plafonnés (R43-02, R43-07), `nil` sur `pBdr` et `tcBorders`, `w:jc` depuis `data-align` et `margin: 0 auto`.
- Greffe dans le gabarit (`docx/writer/*.spec` : `graft`, `graft-fixes`, `graft-fixes-body`, `graft-sections`, `graft-sections-fixes`, `numbering-merge`, `relationships`, `styles-merge`, `xml-io`) : parties hors corps identiques à l'octet sur 11-19, corps identique à l'octet sur 11, 13 et 16, un mot changé → seul ce bloc diffère, `numId` réutilisés sans toucher `numbering.xml`, styles réutilisés / ajoutés / manquants, images et notes ajoutées sans collision, variables des en-têtes résolues, `layout.headers` identique → rien réécrit, différent → régénéré, gabarit illisible ou de 50 Mo → repli, `<?xml?>` dupliqué par Chromium, identifiants bornés à `2147483647`, 72 attaques de la revue R27 rejouées et validées par un validateur de paquet maison ; session 4 : 12 mutations du corps × 2 gabarits (saut ajouté, supprimé, consécutif, en tête, en queue, dans une citation ou une cellule), `w:sectPr` greffés par index puis par propriétés, références d'en-tête héritées d'une section abandonnée sans `w:titlePg` (R43-06), en-têtes de section régénérés (R43-01), taquets de la fixture 19 identiques à l'original (`center` / `right` / `decimal`), gabarit sans `w:sectPr` final, 102 sections greffées en 113 ms.
- Rapport de fidélité (`docx/compare/*.spec` : `compare-docx`, `compare-fixtures`, `model`, `parts`, `align`, `tally`) : document comparé à lui-même = 1, propriété ajoutée = perdue, alignement LCS borné, score pondéré ; `compare-fixtures.spec` mesure l'aller-retour sans gabarit (pas de plancher de score : texte conservé ≥ 0,7, pas de plantage) et dans le gabarit (à la cible avec la liste exacte des pertes pour 11-16, 18 et 19 ; `it.fails` avec plancher 0,96 pour 17 ; plancher 0,98 pour le document client), parties annexes jamais modifiées hors ajouts ; session 4 : `table.align`, `table.conditional` (styles conditionnels résolus comme le lecteur) et `paragraph.tabs` comparés, `w:space` des bordures de tableau ignoré.
- Document client (`client-doc.spec`, `blocks-fixtures.spec`, `compare-fixtures.spec`, `skipIf`) : mêmes 14 variables sur les deux chemins, 8 tableaux, 3 sections conservées, texte inséré des révisions conservé et signalé une fois, A4 avec marges, score dans le gabarit ≥ 0,98 (0,995 mesuré).
- Détecteurs : HTML Word vs Google Docs vs navigateur ; `security.spec` pour la barrière du collage.

**ui**

- Toolbar rendue depuis un preset : bon nombre de boutons, labels i18n, raccourcis dans le tooltip.
- État actif et désactivé synchronisés sur `selectionChange`.
- Navigation clavier dans la toolbar.
- Dropdown s'ouvre, se ferme à Échap et au clic extérieur.
- Variables (`variable-menu.spec`, `variable-suggestion.spec`, `variable-dialog.spec`) : filtrage et classement, entrée « Créer » selon `allowUnknown`, Entrée valide sans couper le paragraphe, `aria-activedescendant`, dialogue : focus, libellés, suppression, valeur vide.
- Bulles, menu `/`, sommaire, pinceau (`link-bubble.spec`, `image-bubble.spec`, `slash-menu.spec`, `outline-panel.spec`, `format-painter-button.spec`) : affichage selon la sélection, cachés en lecture seule et vue source, saisie survivant au repositionnement, entrées filtrées et exécutables, sommaire non dupliqué, verrou du pinceau.
- `themes.spec` : contraste AA des deux thèmes, chaque `var(--aster-*)` des feuilles (`variables.css`, `bubbles.css` et `page.css` comprises) définie dans les deux thèmes, mêmes variables dans les deux (vue page comprise), `aster.css` importe `page.css`.
- `create-aster.spec` : montage conditionnel des extras et destruction idempotente ; `fullscreen.spec` : Échap ferme d'abord un panneau ouvert (`OPEN_PANEL_SELECTORS`, suggestion `{{` et dialogue de puce compris).
- Mise en page (`line-spacing.spec`, `paragraph-spacing-dialog.spec`, `paragraph-indent.spec`, `paragraph-borders-dialog.spec`, `caps.spec`, `underline-style.spec`, `page-layout-dialog.spec`, `paragraph-layout.spec`, `image-dialog.spec`) : état lu depuis le bloc ou la marque, commandes appelées avec les bons arguments, `null` et non `0` pour effacer, bornes et messages `role="alert"`, retrait délégué à la liste et bouton désactivé si la liste refuse (R26), bordure `between` conservée, dialogue de mise en page désactivé sans `setPageView`, marges bornées à la moitié de la page, dimensions libres conservées, verrou de proportions de l'image, regex non quadratiques, formulaire non reconstruit à chaque `update` ; session 4 : « Section n sur N » depuis la tête de sélection, sélection à cheval signalée (R44-06), seule la section du curseur modifiée, `sections` jamais tronqué (R44-02), dernière section recopiée au premier niveau, `sections[0]` éditée quand le corps n'a plus de saut (R44-03).
- `themes.spec` vérifie aussi que `page.css` ne consomme que des variables définies par les deux thèmes, règles de section et de tabulation comprises.
- `icons/index.spec` : chaque nom a un SVG, test géométrique de l'icône `ordered-list` redessinée.

**angular**

- `writeValue`, `registerOnChange`, `setDisabledState` dans un reactive form.
- `touched` au blur, `dirty` à la frappe, pas d'émission sur `writeValue`.
- Changement d'input `readonly`, `theme`, `variables`, `variableValues` à chaud ; remontage sur `toolbar` avec conservation des variables et de la vue page.
- `importDocx` déclare les variables et réapplique `variableValues` ; `exportDocx` transmet les valeurs du magasin ; `variablesChanged` et `variableNames`.
- Fidélité Word : `importFidelity: 'semantic'` passe par mammoth (mise en page vide, gabarit conservé), `importFidelity` absent ne transmet pas `fidelity` (défaut de la lib) ; `exportDocx` réutilise le gabarit importé par défaut, pas avec `exportInTemplate: false` ; `pageView` active, modifie et retire la vue page à chaud ; `config.pageView` honoré et input dédié prioritaire ; l'input `layout` prime sur l'import, se répercute sur la vue page et émet `layoutChanged` ; le dialogue « Mise en page » du core est relu via `pageViewChange` (session 4 : hôte = section 1, `sections` dans `layoutChanged`) ; `compareWithTemplate` rend `null` sans gabarit puis un rapport après import.
- Destruction propre du composant.

**démo**

- Une spec par page, dont `import.page.spec` (sélecteur `styled` / `semantic`, mise en page lue affichée, mammoth en `semantic`) et `template.page.spec` : formulaire généré depuis `variableNames`, application des valeurs, aperçu résolu, exports, case « Vue page », exemple stylé (vue page aux dimensions lues, en-tête de la première section et pied de la dernière éditables et recopiés au premier niveau, export dans le gabarit), rapport de fidélité rendu (score, tableau, parties), absence de gabarit signalée, objets non représentables listés (fixture 17).

## 🎭 E2E

Quatre projets Playwright (`e2e/playwright.config.ts`), serveurs lancés par Playwright et réutilisés s'ils tournent déjà :

- `playground` (`scripts/vanilla-playground.mjs`, port 4300, Chromium) : `playground.spec.ts` (toolbar, collage Word, import `.docx`, export, recherche, vue source, plein écran…), `variables.spec.ts` (import de `08-variables-braces.docx` et `09-variables-mergefields.docx`, panneau Variables `#vars*`, `setValues` et puces résolues, `getHTML({ variables: 'resolve' })`, suggestion `{{`, widget `variable`, dialogue de puce, exports « champs » et « résolu » interceptés par `waitForEvent('download')`, bulles de lien et d'image, menu `/`, sommaire), `fidelity.spec.ts` (L32 : import stylé idempotent en navigateur réel, vue page, pagination, export dans le gabarit relu dans le zip, objets perdus, document client) et `sections.spec.ts` (L47 : import de `18-sections-triple.docx` → deux sauts, hôte aux variables de la section 1, `hr` aux variables de la suivante, coupure « Section 2 · Letter paysage » ; dialogue « Mise en page » qui n'édite que la section du curseur ; `getHTML` idempotent, `section.insertBreak` renumérote 1..3, undo ; import des taquets de la 19, Tab qui insère dans un paragraphe (`tabKey: 'insert'`) et navigue dans une cellule, Backspace ; export dans le gabarit avec trois `w:sectPr` et parties d'en-tête à l'octet).
- `playground-webkit` et `playground-firefox` (session 4) : rejouent `fidelity.spec.ts` et `sections.spec.ts` sur le playground. WebKit passe 13/13 sans `fixme`. Le Firefox de Playwright ne se lance pas sur la machine de la session (erreur SxS Windows, `mozglue` introuvable, même après réinstallation forcée) : le projet est sondé au démarrage (`firefox --version`) et retiré s'il ne démarre pas, avec un avertissement `[e2e]` ; `ASTER_E2E_FIREFOX=1` le force, `0` le retire.
- `demo` (`ng serve`, port 4200, Chromium) : `demo.spec.ts`, pages du playground au formulaire (la touche Tab y quitte l'éditeur : `tabKey: 'focus'`), import avec `toPass` (Vite à froid), page `/template` (exemple chargé, formulaire, aperçu résolu, export résolu téléchargé), plus les scénarios démo de `fidelity.spec.ts` et `sections.spec.ts` (page Modèle : fixture à trois sections rendue avec une coupure de section).

Dette signalée par L47 : sélection d'état en retard d'un `requestAnimationFrame` après un clic en vue page (`pagination-controller`), `setHTML(html, true)` groupé avec l'édition suivante dans l'historique. Rapport dans `e2e/playwright-report/`, captures dans `e2e/output/`. En CI, job dédié après lint, typecheck, tests unitaires et build.

## 📏 Fidélité mesurée

```bash
npm run fidelity -- fixtures/docx/14-tableaux-riches.docx                 # import styled → export dans le gabarit → compareDocx, rapport Markdown
npm run fidelity -- fixtures/docx/client/Modele_Demo_DER.docx --keep out.docx --out rapport.md
npm run fidelity -- fixtures/docx/16-sections.docx --no-template --threshold 0.7   # export neuf, seuil ajusté
```

Le script sort en 1 sous le seuil (0,98 par défaut) : utilisable en CI sur un document de référence. Les scores courants et ce qui manque pour chaque fixture sont tenus à jour dans `fixtures/docx/README.md` ; `compare-fixtures.spec.ts` les fige en cible ou en plancher.

## 🏃 Commandes

```bash
npm run test                      # tout (paquets + démo)
npm run test -w packages/word     # un paquet
npm run test:watch -w packages/core
npm run test:coverage             # avec seuils
npm run e2e                       # Playwright, les quatre projets (Firefox retiré s'il ne démarre pas)
npm run e2e -- --project=playground
npm run e2e -- --project=playground-webkit
npx playwright test --list -c e2e/playwright.config.ts   # compte les tests par projet sans les lancer
npm run fidelity -- <fichier.docx>   # rapport de fidélité d'un document
ASTER_REGEN=1 npx vitest run src/docx/reader/regen-expected.spec.ts   # depuis packages/word : régénère expected/*.html (jamais expected/semantic/)
```
