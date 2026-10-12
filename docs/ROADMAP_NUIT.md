# 🌙 Roadmap de la nuit — 12 → 13 octobre 2026

> ✅ **Réalisé** : 0.3.0 livrée à 01:05, soit 7h en avance sur ce plan. Chronologie réelle et écarts dans [`REX.md`](./REX.md), détail dans [`JOURNAL.md`](./JOURNAL.md), bilan dans [`BILAN.md`](../BILAN.md). Ce document est conservé tel quel comme plan initial.
>
> Plan d'exécution de l'orchestrateur. Heure limite absolue : **08:30**. Gel des features à **07:30**.
> Toute dérive se gère en coupant par le bas de la liste, jamais en sacrifiant les tests ou la revue.

## ⏱️ Chronologie cible

| Créneau       | Phase                      | Qui                                          | Sortie                                                           |
| ------------- | -------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| 22:30 – 23:00 | Cadrage                    | Joris + orchestrateur                        | Docs validées, repo prêt                                         |
| 23:00 – 00:30 | **Phase 0 — Socle**        | Orchestrateur seul                           | Monorepo vert à vide, contrat d'API figé, `v0.0.1` sur `develop` |
| 00:30 – 03:30 | **Vague 1 — Fondations**   | 4 agents en parallèle                        | core, word-paste, word-docx, ui                                  |
| 03:30 – 04:15 | Intégration vague 1        | Orchestrateur                                | `v0.1.0` : éditeur vanilla complet dans une page HTML            |
| 04:15 – 06:30 | **Vague 2 — Produit**      | 4 agents en parallèle                        | angular + démo, tables/images avancées, should-features, docs    |
| 06:30 – 07:00 | Intégration vague 2        | Orchestrateur                                | `v0.2.0` : testable dans Angular 22                              |
| 07:00 – 07:30 | **Vague 3 — Durcissement** | 4 agents revue + orchestrateur en navigateur | Correctifs, `v0.2.x`                                             |
| 07:30 – 08:15 | Gel et bilan               | Orchestrateur                                | `BILAN.md`, `REX.md`, `JOURNAL.md` clos, message final           |
| 08:15 – 08:30 | Marge                      | —                                            | —                                                                |

Si la vague 1 déborde au-delà de 04:30, on supprime d'abord le lot L7, puis on réduit L6 aux tables.

## 🧱 Phase 0 — Socle (orchestrateur seul)

Tout ce que les agents ne doivent jamais toucher est posé ici, et vérifié vert.

- [ ] `npm init` workspaces : `packages/core`, `packages/word`, `packages/ui`, `packages/angular`, `apps/demo`. Version racine `0.0.1`.
- [ ] Dépendances installées **une fois pour toutes** : Tiptap 3 complet, `@tiptap/pm`, `mammoth`, `docx`, Angular 22, ng-packagr, TypeScript 6.0, Vitest 5, jsdom, coverage-v8, ESLint 10 flat config, Prettier 3.
- [ ] `tsconfig.base.json` strict, `tsconfig.build.json` par paquet, `exports` ESM.
- [ ] Scripts racine : `build`, `test`, `test:coverage`, `lint`, `typecheck`, `check`, `demo`.
- [ ] **Smoke test Tiptap 3 sous jsdom** : créer un éditeur, taper, lire le HTML. Si ça casse, c'est ici qu'on le découvre, pas dans 4 agents en parallèle.
- [ ] **Smoke test mammoth en import dynamique** côté Vitest et vérification du champ `browser` pour Angular CLI.
- [ ] Contrat d'API dans `packages/core/src/api/` : `AsterOptions`, `AsterEditor`, `AsterCommand`, `CommandRegistry`, `AsterEvents`, `PasteTransformer`, `AsterLocale`, `ToolbarConfig`. Un `index.ts` par paquet qui exporte déjà les symboles attendus, en stub, pour que les lots compilent entre eux.
- [ ] Squelette i18n avec les clés listées pour les commandes standard, `fr.ts` et `en.ts`.
- [ ] `apps/demo` généré par Angular CLI 22, zoneless, une route vide. `ng serve` vérifié.
- [ ] `scripts/generate-fixtures.ts` produit `fixtures/docx/01..03`. Fixtures `word-html/` écrites à la main depuis des structures Word connues.
- [ ] `.github/workflows/ci.yml` : install, check, build sur push `develop`.
- [ ] `.gitignore`, `.editorconfig`, `.prettierrc`, `eslint.config.js`, `LICENSE` MIT.
- [ ] Branche `develop` créée, premier commit `chore: scaffold monorepo` après revue, push.
- [ ] `JOURNAL.md` : entrée de fin de phase 0 avec les écarts constatés.

## 🌊 Vague 1 — Fondations (4 agents en parallèle, arbre principal)

Les quatre lots ne partagent aucun fichier et codent contre le contrat de la phase 0. Décision de phase 0 : pas de worktree, car `node_modules` n'y est pas disponible sous Windows ; les lots sont sur des dossiers strictement disjoints et l'orchestrateur commite par chemins.

### L1 — `core` : moteur et commandes

- Dossier : `packages/core/src/**` sauf `api/`.
- `createEditor` complet, extensions standard configurées, registre de commandes avec toutes les commandes Must, événements, sérialisation, i18n fonctionnelle, `LinkSafety`, `ImageUpload` avec hook et fallback base64, `pasteTransformers` chaînés.
- Tests : voir `STRATEGIE_TESTS.md` section core. Couverture ≥ 75 %.
- Durée cible : 2h30.

### L2 — `word` : normaliseur de collage

- Dossier : `packages/word/src/paste/**`, `packages/word/src/google/**`, `packages/word/src/extension/**`.
- Les 8 passes, les détecteurs, le pipeline, l'extension `WordPaste`. Tout en fonctions pures sur un `Document` passé en paramètre.
- Tests : chaque passe seule, pipeline sur `fixtures/word-html/*`. Couverture ≥ 85 %.
- Durée cible : 2h30.

### L3 — `word` : import .docx

- Dossier : `packages/word/src/docx/**`.
- `importDocx` avec style map, post-traitements, rapport d'avertissements, images via hook ou data URL, notes de bas de page.
- Tests : chaque fixture `fixtures/docx/*` comparée à `expected/`. Couverture ≥ 85 % sur le dossier.
- Durée cible : 2h.

### L4 — `ui` : toolbar et thèmes

- Dossier : `packages/ui/src/**`.
- `createToolbar`, composants vanilla, presets, icônes SVG, thèmes `light` et `night`, a11y clavier. Fonctionne avec un `AsterEditor` mocké sur le contrat tant que L1 n'est pas intégré.
- Tests : rendu, états, clavier, dropdowns. Couverture ≥ 70 %.
- Durée cible : 2h30.

### Intégration vague 1

Pour chaque lot rendu, dans l'ordre d'arrivée : fusion du worktree, `npm run check`, `/code-review` sur le diff, correctifs, commit `feat(<paquet>): ...`. Puis page HTML vanilla dans `apps/demo/public/vanilla.html` qui assemble core + ui + word pour vérifier au navigateur intégré. Bump `0.1.0`, changelog, push.

## 🌊 Vague 2 — Produit (4 agents)

### L5 — `angular` : composant et démo

- Dossiers : `packages/angular/src/**`, `apps/demo/src/**`.
- `AsterEditorComponent` CVA signals, `provideAster`, token upload, import dynamique de `word`. Démo avec les 5 pages du cahier des charges.
- Tests Angular TestBed. Couverture ≥ 70 %.

### L6 — tables et images avancées

- Fichiers : `packages/core/src/extensions/table*`, `packages/core/src/extensions/image*`, `packages/core/src/commands/tables.ts`, `packages/core/src/commands/images.ts`, `packages/ui/src/components/table-grid-picker*`, `packages/ui/src/components/image-dialog*`.
- Fusion/scission de cellules, en-têtes, redimensionnement d'image, alignement, alt, glisser-déposer.

### L7 — should-features

- Fichiers : `packages/core/src/commands/search.ts`, `packages/core/src/extensions/search*`, `packages/core/src/extensions/font*`, `packages/ui/src/components/search-panel*`, `packages/ui/src/components/source-view*`, `packages/ui/src/components/color-picker*`.
- Rechercher/remplacer, vue source, police/taille/couleurs, plein écran. Dans cet ordre, on s'arrête où le temps s'arrête.

### L8 — documentation

- Fichiers : `README.md` racine, `packages/*/README.md`, `docs/API_CORE.md`, `docs/API_ANGULAR.md`, `docs/THEMING.md`.
- Écrit en lisant le code intégré de la vague 1. Chaque exemple de README est copié dans un test `readme.spec.ts` qui le compile.

### Intégration vague 2

Même rituel. Vérification au navigateur intégré de la démo Angular : saisie, collage Word depuis fixture, import .docx, reactive form. Bump `0.2.0`, push.

## 🌊 Vague 3 — Durcissement

- 4 agents de revue, un par paquet, en lecture seule, avec le prompt : bugs de correctness, fuites d'écouteurs, `any` cachés, chaînes en dur, tests manquants sur les cas limites listés dans `STRATEGIE_TESTS.md`. Rapport en findings triés par sévérité.
- Orchestrateur : corrige les findings bloquants, relance `check`, commit `fix(...)`.
- Tests manuels finaux au navigateur intégré avec captures dans `docs/captures/`.

## 🧊 Gel à 07:30

1. Plus aucune feature, plus aucun agent de dev.
2. `npm run check` et `npm run build` verts sur `develop`, push.
3. `BILAN.md` à la racine : état par critère d'acceptation, ce qui marche, ce qui manque, comment tester en 5 minutes.
4. `docs/REX.md` complété avec les métriques et les leçons.
5. `docs/JOURNAL.md` clos.
6. Message final à Joris qui tient seul.

## 🔁 Rituel d'intégration d'un lot

```
1. Lire le rapport de l'agent
2. Fusionner son worktree dans develop
3. npm run check                → rouge ? corriger ≤ 20 min, sinon re-briefer l'agent avec périmètre réduit
4. /code-review sur le diff     → bloquants corrigés, mineurs notés dans JOURNAL
5. Commit conventionnel, push
6. Entrée JOURNAL : heure, lot, durée agent, verdict, écarts au brief, propositions de contrat
7. Propositions de changement de contrat : acceptées → appliquées par l'orchestrateur avant le lot suivant qui en dépend
```

## 🚨 Mode dégradé

| Situation                                           | Réaction                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Un agent rend du rouge irréparable en 20 min        | Jeter le worktree, re-briefer avec périmètre divisé par deux                                       |
| Tiptap 3 incompatible avec une hypothèse du contrat | L'orchestrateur amende le contrat, note dans JOURNAL, informe les agents en cours via SendMessage  |
| mammoth ne bundle pas côté navigateur               | Fallback : `importDocx` passe par un Web Worker avec le build `mammoth.browser.js`                 |
| Angular 22 + ng-packagr capricieux                  | Le wrapper est livré en source dans la démo, packaging reporté en V1.1, noté dans BILAN            |
| Compaction de contexte                              | Relire `CLAUDE.md`, `ROADMAP_NUIT.md`, `JOURNAL.md` dans cet ordre, reprendre à la dernière entrée |

## 📊 Métriques collectées pour le REX

Par lot : heure de lancement, heure de rendu, verdict au premier `check`, nombre d'allers-retours, lignes ajoutées, nombre de tests, couverture, findings de revue par sévérité. Globales : commits, versions, temps orchestrateur vs temps agents, nombre de changements de contrat.
