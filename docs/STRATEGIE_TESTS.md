# 🧪 Stratégie de tests — Aster Editor

> Beaucoup de tests unitaires, rapides, lisibles. Les e2e graphiques couvrent les parcours réels, variables comprises.

## 🔺 Pyramide

| Niveau               | Outil                                          | Portée                                                                                                 | Quand                                         |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Unitaire pur         | Vitest, environnement `node`                   | Fonctions pures : passes du normaliseur Word, prétraitement XML, i18n, helpers HTML, config de toolbar | V1, majorité des tests                        |
| Unitaire DOM         | Vitest + jsdom                                 | `createEditor`, commandes, magasin de variables, sérialisation, toolbar rendue, panneaux, événements   | V1                                            |
| Composant Angular    | Vitest via `@angular/build:unit-test`, TestBed | CVA, inputs/outputs, variables, cycle de vie, zoneless                                                 | V1                                            |
| Intégration manuelle | App démo + navigateur intégré de Claude        | Collage réel, import .docx réel, clavier ; ouverture dans Word réel via `samples/` (checklist)         | V1, vérif de fin de lot                       |
| E2E graphique        | Playwright                                     | Parcours utilisateur complets, captures (`e2e/`, projets `playground` et `demo`, `npm run e2e`)        | Livré en 0.3.0, étendu aux variables en 0.4.0 |

État 0.4.0 : 1 254 tests unitaires (core 449, word 454, ui 289, angular 39, démo 23), tous verts par `npm run test`.

## 📐 Règles

- Un test décrit un **comportement**, pas une implémentation : `it('reconstruit une liste numérotée imbriquée sur deux niveaux')`.
- Noms de tests en français, code en anglais.
- Fixtures dans `fixtures/` à la racine, partagées entre paquets. Jamais de HTML Word inline de plus de 5 lignes dans un test, on le met en fixture.
- Un bug corrigé = un test de non-régression ajouté avec la description du bug. Les correctifs des revues adverses (0.3.0 : cinq lots, 0.4.0 : cinq revues) sont tous figés ainsi.
- Pas de snapshot géant. Les snapshots sont tolérés uniquement sur du HTML court et lu par un humain.
- Les tests ne dépendent pas de l'ordre d'exécution ni de timers réels. `vi.useFakeTimers()` pour le debounce et l'autosave. Pas de `waitForTimeout` en e2e.

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
│   └── expected/                           HTML attendu (01-03, 08-10), relu à la main
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

Les `.docx` sont générés avec la lib `docx` par `scripts/generate-fixtures.ts` (01-03), `generate-fixtures-extra.ts` (04-07) et `generate-fixtures-variables.ts` (08-10), pour être reproductibles (`npm run fixtures`). Les documents réels anonymisés fournis par Joris sont ajoutés tels quels avec une note de provenance. `samples/export-fidelite-complet.docx` est l'inverse : un fichier **produit** par `exportDocx` avec toutes les options, à ouvrir dans Word réel en suivant la checklist de `samples/README.md`.

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

**word**

- Chaque passe du normaliseur testée seule sur un mini HTML, puis le pipeline complet sur les fixtures.
- Listes : puces, numéros, imbrication 3 niveaux, reprise de numérotation, liste interrompue par un paragraphe.
- Tables : en-têtes détectés, attributs de layout retirés, cellules fusionnées conservées.
- `importDocx` sur chaque fixture : comparaison structurelle avec `expected/`, avertissements remontés ; `import-all-fixtures.spec` vérifie que tout `.docx` déposé s'importe sans rejet.
- Variables à l'import (`preprocess/*.spec`, `postprocess/variables.spec`, `import-docx.variables.spec`) : champs simples et complexes, noms cités et normalisés, contrôles de ligne et de bloc, texte de remplissage ignoré, en-têtes et pieds collectés, `detect` et `pattern`, archive illisible → avertissement et import sans prétraitement, prétraitement linéaire sur 2 000 `begin` jamais fermés (< 500 ms).
- Collage : `paste/passes/variables.spec` et `word-365-variables.html` (`{{` coupé sur deux spans, marques, cellules, accolades seules).
- Export (`export/*.spec`, dont `variables.spec`, `fidelity.spec`, `footnotes.spec`, `column-widths.spec`) : trois modes de variables, nom de champ cité, valeurs multi-lignes et non chaînes, motif sticky, en-têtes et pieds avec numéros de page, TOC, notes (collision de clés, appel hors du corps), titres numérotés, marges bornées, `colspan` borné, aller-retours export → import figés avec leurs dégradations connues.
- Détecteurs : HTML Word vs Google Docs vs navigateur ; `security.spec` pour la barrière du collage.

**ui**

- Toolbar rendue depuis un preset : bon nombre de boutons, labels i18n, raccourcis dans le tooltip.
- État actif et désactivé synchronisés sur `selectionChange`.
- Navigation clavier dans la toolbar.
- Dropdown s'ouvre, se ferme à Échap et au clic extérieur.
- Variables (`variable-menu.spec`, `variable-suggestion.spec`, `variable-dialog.spec`) : filtrage et classement, entrée « Créer » selon `allowUnknown`, Entrée valide sans couper le paragraphe, `aria-activedescendant`, dialogue : focus, libellés, suppression, valeur vide.
- Bulles, menu `/`, sommaire, pinceau (`link-bubble.spec`, `image-bubble.spec`, `slash-menu.spec`, `outline-panel.spec`, `format-painter-button.spec`) : affichage selon la sélection, cachés en lecture seule et vue source, saisie survivant au repositionnement, entrées filtrées et exécutables, sommaire non dupliqué, verrou du pinceau.
- `themes.spec` : contraste AA des deux thèmes, chaque `var(--aster-*)` des feuilles (`variables.css` et `bubbles.css` comprises) définie dans les deux thèmes.
- `create-aster.spec` : montage conditionnel des extras et destruction idempotente ; `fullscreen.spec` : Échap ferme d'abord un panneau ouvert (`OPEN_PANEL_SELECTORS`, suggestion `{{` et dialogue de puce compris).

**angular**

- `writeValue`, `registerOnChange`, `setDisabledState` dans un reactive form.
- `touched` au blur, `dirty` à la frappe, pas d'émission sur `writeValue`.
- Changement d'input `readonly`, `theme`, `variables`, `variableValues` à chaud ; remontage sur `toolbar` avec conservation des variables.
- `importDocx` déclare les variables et réapplique `variableValues` ; `exportDocx` transmet les valeurs du magasin ; `variablesChanged` et `variableNames`.
- Destruction propre du composant.

**démo**

- Une spec par page, dont `template.page.spec` : formulaire généré depuis `variableNames`, application des valeurs, aperçu résolu, exports.

## 🎭 E2E

Deux projets Playwright (`e2e/playwright.config.ts`), serveurs lancés par Playwright et réutilisés s'ils tournent déjà :

- `playground` (`scripts/vanilla-playground.mjs`, port 4300) : `playground.spec.ts` (toolbar, collage Word, import `.docx`, export, recherche, vue source, plein écran…) et `variables.spec.ts` (import de `08-variables-braces.docx` et `09-variables-mergefields.docx`, panneau Variables `#vars*`, `setValues` et puces résolues, `getHTML({ variables: 'resolve' })`, suggestion `{{`, widget `variable`, dialogue de puce, exports « champs » et « résolu » interceptés par `waitForEvent('download')`, bulles de lien et d'image, menu `/`, sommaire).
- `demo` (`ng serve`, port 4200) : `demo.spec.ts`, pages du playground au formulaire, import avec `toPass` (Vite à froid), page `/template` (exemple chargé, formulaire, aperçu résolu, export résolu téléchargé).

Rapport dans `e2e/playwright-report/`, captures dans `e2e/output/`. En CI, job dédié après lint, typecheck, tests unitaires et build.

## 🏃 Commandes

```bash
npm run test                      # tout (paquets + démo)
npm run test -w packages/word     # un paquet
npm run test:watch -w packages/core
npm run test:coverage             # avec seuils
npm run e2e                       # Playwright, les deux projets
npm run e2e -- --project=playground
```
