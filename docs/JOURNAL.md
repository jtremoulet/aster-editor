# 📓 Journal de bord — nuit du 12 au 13 octobre 2026

> Tenu par l'orchestrateur, une entrée par événement notable. Lisible à froid après une compaction de contexte.
> Format : `### HH:MM — Titre` puis faits, décisions, écarts. Pas de prose, des points.

## 🧭 Comment reprendre après une compaction

1. Lire `CLAUDE.md` puis `docs/ROADMAP_NUIT.md`.
2. Lire la **dernière entrée** de ce journal : elle dit où on en est et quelle est l'action suivante.
3. Vérifier `git log --oneline -10` et `git status` sur `develop`.
4. Vérifier les agents en cours avec ListAgents avant d'en relancer.

---

### 22:05 — Cadrage avec Joris

- Décisions : moteur Tiptap 3 sur ProseMirror, UI vanilla, Angular 22 cible, nom **Aster**, repo `jtremoulet/aster-editor`.
- Finalité : lib embarquable chez les clients Nebula, open source possible ensuite. Licence MIT.
- Contraintes posées par Joris : lib testable demain matin, propre, documentée, beaucoup de TU, process documenté pour un REX.
- Vérifications faites : Angular 22.2.2 impose TS `>=6.0 <6.1` et Node `^24.15`, machine en Node 24.20. Tiptap 3.31.4 MIT, mammoth 1.13 BSD-2, docx 9.10 MIT.
- Noms npm : `aster` pris, `aster-editor` et scope `@aster-editor/*` libres.

### 22:40 — Docs de cadrage écrites

- `CLAUDE.md`, `CAHIER_DES_CHARGES.md`, `ARCHITECTURE.md`, `STRATEGIE_TESTS.md`, `ROADMAP_NUIT.md`, `BRIEF_AGENT.md`, `JOURNAL.md`, `REX.md`, `CHANGELOG.md`, `README.md`, `fixtures/docx/README.md`.
- Aucun code écrit. En attente de validation Joris, puis phase 0.
- **Action suivante** : validation des docs par Joris, création de `develop`, lancement de la phase 0.

### 22:34 — GO de Joris, démarrage phase 0

- Branche `develop` créée et poussée avec les docs de cadrage. Keep-awake demandé à l'app.
- Workspace Angular 22 généré par CLI dans un dossier temporaire puis rapatrié : `apps/demo`, `packages/angular`, `angular.json` racine.

### 22:46 — Phase 0 terminée, socle vert

- Monorepo npm workspaces : `core`, `word`, `ui`, `angular`. `apps/demo` hors workspaces, piloté par `ng` racine.
- Vérifié vert : `npm run lint`, `npm run typecheck`, `npm run test` (Vitest 5 + jsdom sur les 3 paquets vanilla, Vitest via `@angular/build:unit-test` sur la lib et la démo), `npm run build` (tsc pour vanilla, ng-packagr pour Angular).
- **Smoke Tiptap 3 sous jsdom : OK.** `StarterKit`, `TableKit`, `Placeholder` de `@tiptap/extensions`. Écarts v2 → v3 notés pour les agents : kits `ListKit`, `TableKit`, `TextStyleKit`, `UndoRedo` remplace `History`.
- **Smoke mammoth : OK** en import dynamique, et bundle navigateur esbuild OK via le champ `browser` du package. 660 kB non minifié, confirme l'import dynamique côté Angular.
- Contrat d'API figé dans `packages/core/src/api/` : `AsterEditor`, `AsterOptions`, `AsterCommand`, `CommandRegistry` avec surcharges typées, `AsterEvents`, `I18n`, `PasteTransformer`, `ToolbarConfig`, `STANDARD_COMMAND_IDS`.
- Dictionnaires `fr`/`en` avec toutes les clés `command.<id>` des commandes standard.
- Fixtures : 3 `.docx` synthétiques générés par `scripts/generate-fixtures.ts`, 4 HTML de collage (Word 365 listes, Word 365 table, Word 2016 titres, Google Docs).
- CI GitHub Actions sur push `develop`/`main`.
- Écarts à la roadmap : TS 6 interdit `baseUrl`, remplacé par des `paths` relatifs. `rootDir` incompatible avec les `paths` vers les sources des autres paquets en typecheck → `tsconfig.json` sans `rootDir` pour le dev, `tsconfig.build.json` avec `rootDir` et `paths: {}` pour l'émission.
- **Décision** : les agents de la vague 1 travaillent **dans l'arbre principal**, pas en worktree. Raison : `node_modules` absent des worktrees sous Windows, et les lots sont sur des dossiers strictement disjoints. L'orchestrateur commite par chemins.
- **Action suivante** : revue du diff phase 0, commit `chore: scaffold monorepo`, puis lancement des 4 agents L1 à L4.
