# ✳️ Aster Editor — instructions Claude

> Éditeur de texte riche headless-first, framework-agnostic, avec wrapper Angular.
> Objectif : alternative MIT à CKEditor pour les clients Nebula, avec import Word de qualité.
> Lire ce fichier en premier. Les docs détaillées sont dans [`docs/`](./docs).

## 📚 Documents de référence

| Doc                                                          | Rôle                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [`docs/CAHIER_DES_CHARGES.md`](./docs/CAHIER_DES_CHARGES.md) | Périmètre, MoSCoW, critères d'acceptation                              |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)             | Paquets, contrats d'API, pipeline Word, théming, build                 |
| [`docs/STRATEGIE_TESTS.md`](./docs/STRATEGIE_TESTS.md)       | Pyramide de tests, fixtures, seuils de couverture                      |
| [`docs/ROADMAP_NUIT.md`](./docs/ROADMAP_NUIT.md)             | Phases, vagues d'agents, lots, rituel d'intégration, règle d'arrêt     |
| [`docs/BRIEF_AGENT.md`](./docs/BRIEF_AGENT.md)               | Template de brief pour les sous-agents                                 |
| [`docs/JOURNAL.md`](./docs/JOURNAL.md)                       | Journal de bord horodaté (tenu pendant la nuit)                        |
| [`docs/REX.md`](./docs/REX.md)                               | Retour d'expérience process : bons points, blocages, métriques         |
| [`docs/PUBLICATION.md`](./docs/PUBLICATION.md)               | Publication npm : compte, release, workflow de confiance, test à blanc |

## 🧱 Stack

- **Moteur** : [Tiptap 3](https://tiptap.dev) sur ProseMirror (MIT). Accès direct aux API ProseMirror via `@tiptap/pm` quand nécessaire.
- **Import Word** : `mammoth` (BSD-2) pour .docx → HTML sémantique. Normaliseur maison pour le collage depuis Word.
- **Langage** : TypeScript **6.0.x** strict (contrainte Angular 22), ESM only.
- **Angular** : 22.x, standalone, signals, zoneless-ready. Lib packagée via ng-packagr.
- **Tests** : Vitest + jsdom pour les paquets vanilla ; Vitest via `@angular/build:unit-test` pour le wrapper.
- **Build** : `tsc` (émission ESM + d.ts) pour les paquets vanilla, ng-packagr pour Angular. Pas de bundler côté lib.
- **Monorepo** : npm workspaces, **une seule version SemVer** au `package.json` racine.

## 📁 Structure

```
aster-editor/
├── packages/
│   ├── core/      @aster-editor/core     moteur, extensions, registre de commandes, i18n
│   ├── word/      @aster-editor/word     import .docx + normaliseur de collage Word
│   ├── ui/        @aster-editor/ui       toolbar vanilla, thèmes CSS (light, night)
│   └── angular/   @aster-editor/angular  composant standalone + CVA + provideAster()
├── apps/
│   └── demo/      playground Angular 22 (sert aussi de banc d'essai manuel)
├── fixtures/      .docx réels anonymisés + HTML de collage Word capturé
└── docs/
```

Dépendances entre paquets, **strictement dans ce sens** : `angular → ui → core`, `word → core`, `angular → word` (optionnel). Jamais de cycle, jamais `core → ui`.

## ⚙️ Commandes

```bash
npm install                 # racine, installe tous les workspaces
npm run build               # build de tous les paquets dans l'ordre des dépendances
npm run test                # tests unitaires de tous les paquets
npm run test -w packages/word   # un seul paquet
npm run lint                # eslint + prettier check
npm run typecheck           # tsc --noEmit sur tous les paquets
npm run demo                # ng serve apps/demo sur http://localhost:4200
npm run check               # lint + typecheck + test, à lancer avant tout commit
```

## 🧭 Conventions

- **Code en anglais, commentaires et docs en français**, tutoiement dans les docs.
- TypeScript strict, **zéro `any`**, `unknown` + type guards à la place.
- Naming : PascalCase classes/types, camelCase fonctions, UPPER_SNAKE constantes, kebab-case fichiers.
- Un fichier = un concept. Pas de fichier > 400 lignes sans bonne raison.
- Chaque fonction exportée a un commentaire JSDoc en français expliquant le **pourquoi**.
- **Tout code livré arrive avec ses tests.** Pas de test, pas de merge. Voir `docs/STRATEGIE_TESTS.md`.
- Pas de dépendance ajoutée sans l'inscrire dans `docs/ARCHITECTURE.md` section licences. MIT, BSD, Apache-2.0 uniquement.
- Les chaînes visibles passent par le module i18n du core, jamais en dur dans l'UI.
- CSS : variables `--aster-*` pour tout ce qui est thémable, préfixe de classes `aster-`.

## 🔀 Git

- Branche de travail : `develop`. **Jamais de push direct sur `main`.** Merge `develop → main` uniquement sur demande explicite de Joris.
- Commits conventionnels : `feat(core):`, `fix(word):`, `test(ui):`, `docs:`, `chore:`. Scope = nom du paquet.
- Avant chaque commit : `npm run check` vert, puis revue de code (`/code-review`) sur le diff. Aucun commit sans revue.
- Chaque livraison met à jour `CHANGELOG.md` (Keep a Changelog) et bump la version racine : `feat` → minor, `fix`/`chore` → patch.
- La skill `/ship` automatise ce rituel.

## 🤖 Règles pour les sous-agents

Un agent reçoit un **lot** défini dans `docs/ROADMAP_NUIT.md` via un brief au format `docs/BRIEF_AGENT.md`. Règles non négociables :

1. **Périmètre fichiers** : un agent n'écrit que dans le dossier de son lot. Interdit de toucher `package.json`, `package-lock.json`, `tsconfig*.json`, `CHANGELOG.md`, `docs/`, `.github/` et les autres paquets. Seul l'orchestrateur le fait.
2. **Aucune dépendance ajoutée.** Tout est préinstallé en phase 0. Si une dépendance manque, l'agent le signale dans son rapport et contourne.
3. **Contrat d'API figé** : les types publics définis en phase 0 dans `packages/core/src/api/` sont la vérité. Un agent qui a besoin de les changer le propose dans son rapport, il ne les modifie pas.
4. **Tests obligatoires** dans le même lot, `npm run test -w <paquet>` vert avant de rendre.
5. **Lire les types installés** dans `node_modules/@tiptap/*` plutôt que se fier à sa mémoire de l'API Tiptap. L'API v3 diffère de la v2.
6. **Rapport de fin** structuré : fait / non fait / décisions / points de blocage / propositions de changement de contrat. Ce rapport alimente `docs/REX.md`.
7. Aucun commit par l'agent. L'orchestrateur intègre, revoit, commite.

## 🎯 Cible V1

Voir `docs/CAHIER_DES_CHARGES.md`. En une phrase : un éditeur utilisable dans une app Angular 22 via `<aster-editor [formControl]>`, avec toolbar complète, tables, images, import .docx et collage Word propre, documenté et testé.
