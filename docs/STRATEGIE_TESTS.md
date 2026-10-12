# 🧪 Stratégie de tests — Aster Editor

> Beaucoup de tests unitaires, rapides, lisibles. Les e2e graphiques viendront en V1.1.

## 🔺 Pyramide

| Niveau | Outil | Portée | Quand |
|--------|-------|--------|-------|
| Unitaire pur | Vitest, environnement `node` | Fonctions pures : passes du normaliseur Word, i18n, helpers HTML, config de toolbar | V1, majorité des tests |
| Unitaire DOM | Vitest + jsdom | `createEditor`, commandes, sérialisation, toolbar rendue, événements | V1 |
| Composant Angular | Vitest via `@angular/build:unit-test`, TestBed | CVA, inputs/outputs, cycle de vie, zoneless | V1 |
| Intégration manuelle | App démo + navigateur intégré de Claude | Collage réel, import .docx réel, clavier | V1, vérif de fin de lot |
| E2E graphique | Playwright | Parcours utilisateur complets, captures | V1.1 |

## 📐 Règles

- Un test décrit un **comportement**, pas une implémentation : `it('reconstruit une liste numérotée imbriquée sur deux niveaux')`.
- Noms de tests en français, code en anglais.
- Fixtures dans `fixtures/` à la racine, partagées entre paquets. Jamais de HTML Word inline de plus de 5 lignes dans un test, on le met en fixture.
- Un bug corrigé = un test de non-régression ajouté avec la description du bug.
- Pas de snapshot géant. Les snapshots sont tolérés uniquement sur du HTML court et lu par un humain.
- Les tests ne dépendent pas de l'ordre d'exécution ni de timers réels. `vi.useFakeTimers()` pour le debounce et l'autosave.

## 🎯 Seuils de couverture

Mesurés avec `@vitest/coverage-v8`, seuils dans la config de chaque paquet, bloquants dans `npm run check` :

| Paquet | Lignes | Pourquoi |
|--------|--------|----------|
| `word` | 85 % | Cœur de la valeur, logique pure, facile à tester |
| `core` | 75 % | Commandes et sérialisation |
| `ui` | 70 % | DOM rendu, états des boutons |
| `angular` | 70 % | CVA et cycle de vie |

## 📂 Fixtures

```
fixtures/
├── docx/
│   ├── README.md                      provenance et contenu attendu de chaque fichier
│   ├── 01-headings-lists.docx         titres H1-H3, listes imbriquées puces et numéros
│   ├── 02-tables.docx                 tables avec en-têtes, cellules fusionnées
│   ├── 03-images.docx                 images inline et flottantes
│   ├── 04-mixed-client.docx           document client réel anonymisé, fourni par Joris
│   └── expected/                      HTML attendu par fixture, relu à la main
└── word-html/
    ├── word-365-list-nested.html      HTML du presse-papier Word 365, listes
    ├── word-365-table.html
    ├── word-2016-headings.html
    ├── google-docs-basic.html
    └── expected/
```

Les `.docx` synthétiques sont générés par `scripts/generate-fixtures.ts` avec la lib `docx`, pour être reproductibles. Les documents réels anonymisés fournis par Joris sont ajoutés tels quels avec une note de provenance.

## 🧩 Ce que chaque paquet teste

**core**
- `createEditor` monte et détruit sans fuite d'écouteurs.
- Chaque commande standard : `run` change l'état, `isActive` reflète la sélection, `canRun` faux en lecture seule.
- `setHTML(getHTML())` idempotent sur un document complet.
- `LinkSafety` rejette `javascript:` et `data:` hors images.
- i18n : clé manquante retourne la clé, paramètres interpolés, changement de locale à chaud.
- Événements émis dans le bon ordre, désabonnement fonctionne.

**word**
- Chaque passe du normaliseur testée seule sur un mini HTML, puis le pipeline complet sur les fixtures.
- Listes : puces, numéros, imbrication 3 niveaux, reprise de numérotation, liste interrompue par un paragraphe.
- Tables : en-têtes détectés, attributs de layout retirés, cellules fusionnées conservées.
- `importDocx` sur chaque fixture : comparaison structurelle avec `expected/`, avertissements remontés.
- Détecteurs : HTML Word vs Google Docs vs navigateur.

**ui**
- Toolbar rendue depuis un preset : bon nombre de boutons, labels i18n, raccourcis dans le tooltip.
- État actif et désactivé synchronisés sur `selectionChange`.
- Navigation clavier dans la toolbar.
- Dropdown s'ouvre, se ferme à Échap et au clic extérieur.

**angular**
- `writeValue`, `registerOnChange`, `setDisabledState` dans un reactive form.
- `touched` au blur, `dirty` à la frappe, pas d'émission sur `writeValue`.
- Changement d'input `readonly` et `theme` à chaud.
- Destruction propre du composant.

## 🏃 Commandes

```bash
npm run test                      # tout
npm run test -w packages/word     # un paquet
npm run test:watch -w packages/core
npm run test:coverage             # avec seuils
```
