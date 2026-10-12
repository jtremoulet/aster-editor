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

### 22:49 — Phase 0 commitée et poussée

- Revue `/code-review` du scaffold : 7 findings, tous corrigés avant commit (typage `import.meta.env`, `paths: {}` en build prod Angular pour ne pas inliner le core, peer deps en `>=`, tests démo dans `npm run test`, script fixtures, registre générique).
- Commit `6491ac8 chore: scaffold monorepo`. Durée réelle phase 0 : **15 min** au lieu de 90.

### 22:52 — Vague 1 lancée : 4 agents en parallèle

- L1 core (`af4dfa72`), L2 word-paste (`a050c081`), L3 word-docx (`a83b4e4f`), L4 ui (`a5e66721`). Briefs archivés dans `docs/briefs/`.
- Tous dans l'arbre principal, périmètres disjoints. L2 et L3 partagent `packages/word` sur des sous-dossiers différents et des lignes distinctes de `index.ts` : point de vigilance à l'intégration.
- Cibles : L1 2h30, L2 2h30, L3 2h, L4 2h30. Rendu attendu vers 01:00-01:30.
- Pendant ce temps l'orchestrateur prépare : briefs de la vague 2, page de vérification vanilla (bundle esbuild des sources pour le navigateur intégré), métriques REX.
- **Action suivante** : à chaque notification d'agent, rituel d'intégration (check scoped, revue, commit par chemins, journal).

### 23:04 — L3 word-docx rendu et intégré (agent 11 min, 174k tokens, 66 outils)

- Rapport conforme au format. 61 tests, 100 % de couverture sur `docx/`. Aucun fichier hors périmètre.
- Check scoped vert (eslint, vitest `src/docx`, prettier). Typecheck du paquet rouge à cause d'une erreur transitoire dans `core` (L1 en cours), pas de L3.
- Revue : 5 findings, 2 corrigés (titres dans `<li>` enveloppés en `<p>`, repli base64 pouvant rejeter), 3 notés non bloquants (`data-footnote` perdu par le schéma Tiptap, `tfoot` fusionné, double nettoyage des paragraphes vides).
- Décisions L3 à retenir : entrée mammoth `{arrayBuffer, buffer}` pour couvrir build Node et navigateur ; détection de type sans `instanceof` (realms jsdom) ; notes en `data-footnote`.
- Commit `feat(word): import .docx` par chemins (`docx/`, `fixtures/docx/expected`). `index.ts` de word retenu jusqu'au rendu de L2 (lignes partagées).
- Écart au brief : fixtures README corrigé (table imbriquée et légende d'image n'étaient pas générées).

### 23:10 — L4 ui rendu et intégré (agent 17 min, 192k tokens, 52 outils)

- 71 tests, 96 % de couverture, zéro fichier hors périmètre, aucune proposition de contrat. Tooltip DOM remplacé par `title` natif (repli autorisé).
- Revue : 3 findings, 2 corrigés (`destroy` vidait tout le conteneur hôte, regex URL élargie à `vbscript:`/`file:`), 1 noté (rafraîchissement complet de la toolbar à chaque `selectionChange`, à mesurer en navigateur).
- Hypothèses L4 à vérifier contre L1 : `.aster-content .ProseMirror`, attributs `textStyle.color/fontFamily/fontSize`, `highlight.color` pour `backgroundColor`, classes Tiptap `is-editor-empty`, `.tableWrapper`, `.selectedCell`.
- `base.css` fait 735 lignes : accepté, c'est la feuille de contenu + composants.
- Commit `feat(ui)`.

### 23:13 — L2 word-paste rendu et intégré (agent 20 min, 214k tokens, 95 outils)

- 102 tests pour le lot, paquet `word` à 163 tests et 99 % de couverture, seuil 85 % passé. Zéro fichier hors périmètre, aucun conflit avec L3 sur `index.ts`.
- Revue : 2 remarques non bloquantes (repli défensif mort dans `rebuild-lists`, `<th>` sans `<p>`). Rien à corriger.
- Décisions L2 à retenir : `type`/`start` sur `<ol>` (supportés par Tiptap 3 OrderedList), identité de liste = instance `lfo`, `keepColors` ignore noir/windowtext et les couleurs dans les liens, bonus `mso-highlight` → `mark`, `vertical-align` → sub/sup.
- Friction agent : `Write`/`Edit` décodent ` ` en caractère littéral → `no-irregular-whitespace`. À mettre dans les briefs suivants.
- Commit `feat(word): normaliseur de collage`. Vague 1 : 3 lots sur 4 intégrés à 23:15, reste L1 core.

### 23:21 — L1 core rendu et intégré (agent 28 min, 281k tokens, 113 outils)

- 237 tests, 94 % de couverture. 49 commandes standard, rien sacrifié. Aucun fichier hors périmètre.
- `npm run check` complet vert sur les 4 paquets : 238 + 163 + 71 + 3 tests. `npm run build` vert.
- 4 propositions de contrat, 3 acceptées et appliquées par l'orchestrateur : doc de `icon` (points → tirets), `commands?: readonly AsterCommand[]` sans `never`, `ready` émis en microtâche pour être observable (test ajusté). La 4e (`shortcuts?: string[]`) remplacée par une doc renvoyant à `EXTRA_SHORTCUT_BINDINGS`.
- Décisions L1 à retenir : `defaultTarget: '_blank'` avec `rel` forcé, `alignLeft` = absence d'attribut, `TrailingNode` conservé donc `getHTML()` d'un doc vide vaut `<p></p>` → Angular doit tester `isEmpty()`, `selectionChange` émis même pour `setHTML(…, false)` → Angular ne doit pas s'en servir pour `dirty`.
- Revue : 1 remarque (`selectAll` bloqué en lecture seule), non bloquante.
- Deux frictions de mon côté avant le check complet : un `*/` dans un commentaire JSDoc de mon script playground, et les globals Node absents de la config ESLint pour `.mjs`.
- Bump **0.1.0**, changelog. Vague 1 close à 23:25, soit 33 min après le lancement des agents, contre 3h prévues.

### 23:25 — Vague 2 lancée : L5 angular+démo (`af7b93f6`), L6 tables/images (`abc0fc4a`), L8 docs (`a4b4b6df`)
- L7 (recherche, vue source, plein écran) volontairement différé après L6 : les deux toucheraient `create-aster.ts`, les dictionnaires UI et les CSS. Le temps ne manque pas, la sérialisation coûte moins que les conflits.
- `preview_start` du playground a lancé le mauvais serveur (launch.json du workspace parent `C:\workspace`, « escrime-site »). Contournement : serveur esbuild lancé à la main en arrière-plan sur 4300.

### 23:28 — Vérification navigateur du playground vanilla (0.1.0)
- Rendu complet toolbar `full` (31 items), contenu stylé, compteur de mots. Captures dans `docs/captures/`.
- Vérifié par JS dans le vrai navigateur : collage Word listes imbriquées (`<ol type="a">` conservé), collage table Word (`th`, `colspan`), collage Google Docs, **import .docx réel via le bundle navigateur de mammoth** (titres, listes 3 niveaux, image base64 + alt, note de bas de page), gras par bouton, menu titres, grille de table 2×3, undo, bascule fr/en des tooltips, lecture seule grise les boutons, roving tabindex (1 seul tabbable), thème `night`.
- **Bug trouvé** : bouton Lien toujours grisé. Le dialogue testait `canRun('link.set', { href: '' })` et le core rejette l'URL vide. Deux agents conformes à leurs briefs, incompatibles à l'intégration : c'est exactement le type de bug que seul un test de bout en bout attrape. Corrigé côté UI, commit `52cbd31`.
- Point d'attention : insérer une table avec la sélection dans un titre coupe le titre en deux (comportement Tiptap). À documenter, pas bloquant.
- 23:33 — Clavier vérifié en vrai navigateur : frappe, `Ctrl+A`/`Ctrl+B`, `Enter`, `Ctrl+Shift+8`, `Tab` pour imbriquer, `Ctrl+Alt+2`. Note : `Ctrl+Alt+2` dans un item de liste sort l'item en titre (comportement Tiptap `toggleHeading`), acceptable.
- Brief L7 rédigé dans `docs/briefs/L7-should.md`, en attente de L6.
