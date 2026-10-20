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

### 23:40 — L8 docs rendu et intégré (agent 13 min, 289k tokens, 129 outils)

- 7 fichiers, 1 800 lignes, Prettier vert. L'agent a typechecké tous les exemples contre les sources et compté programmatiquement commandes et variables CSS : méthode à garder.
- 10 écarts code/docs remontés. Corrigés : CHANGELOG (48 commandes, 58 icônes), JSDoc `iconSvg` fantôme dans `button.ts`. À traiter plus tard : `ARCHITECTURE.md` cite `HtmlSanitizeOnPaste`, `setLocale()` sur l'éditeur et une extension `WordPaste` qui n'existent pas sous cette forme → mise à jour d'ARCHITECTURE au gel. Repli base64 absent quand un hook `upload` rejette (core) → documenté, candidat pour L9 durcissement.
- Docs à rafraîchir après L6/L7 : exports core/ui, clés i18n, `images-tables.css`, README racine section Angular une fois L5 rendu.

### 23:45 — L6 tables/images rendu et intégré (agent 16 min, 227k tokens, 67 outils)

- +27 tests core (265, 94 %), +19 tests ui (90, 97 %). Rien hors périmètre, `base.css` intact, `images-tables.css` ajouté à `aster.css` par l'orchestrateur.
- Vérifié en navigateur : `figure.aster-image` + poignée, drag 120 → 200 px, double-clic → dialogue en mode édition, menu contextuel de table avec 11 actions. Les poignées de colonnes n'apparaissent qu'au survol (prosemirror-tables), normal.
- 4 propositions de contrat, toutes différées (additives, à traiter en V1.1) : `width/align: null` dans `image.setAttributes`, `align` dans `image.insert`, événement typé `imageEdit`, option `tableContextMenu`.
- Signalé par L6 : flake possible dans `image-upload.spec.ts` (timers) → candidat L9 ; règles `img[data-align]` mortes dans `base.css` → L9.
- L6 a été piégé par `npx vitest run -w` (watch, pas workspace) : à mettre dans les briefs.

### 23:50 — L5 angular+démo rendu et intégré (agent 23 min, 251k tokens, 128 outils)

- 19 tests lib (94 %), 9 tests démo, build prod 269 kB initial, mammoth en chunk lazy. L'agent a vérifié lui-même en navigateur sur un build prod servi depuis le scratchpad.
- **Blocage levé par l'orchestrateur** : le `tsconfig.json` racine généré par Angular CLI mettait `noPropertyAccessFromIndexSignature: true` alors que la base dit `false` → 5 erreurs TS4111 dans le core compilé via les `paths`. Une ligne. Leçon REX : les tsconfigs générés par un CLI doivent être relus contre la base en phase 0, flag par flag.
- Décision L5 validée : inputs dédiés `undefined` par défaut pour que `provideAster` puisse fixer thème/locale/toolbar globalement.
- `angular.json` : `allowedCommonJsDependencies` pour mammoth et ses dépendances (proposé par L5, appliqué).
- Vérifié en navigateur : playground (31 items de toolbar, contenu riche), formulaire réactif (frappe → `value.body` mis à jour, blur), lecture seule (thème night, pas de toolbar, `contenteditable=false`). Zéro erreur console. Capture `03-demo-angular-playground.jpg`.
- Revue : 2 remarques non bloquantes (placeholder à chaud via internals Tiptap, fenêtre de quelques ms avant le chargement lazy de `word`).
- `npm run check` complet : **546 tests verts**. Bump **0.2.0**. Critère d'acceptation n° 5 (reactive form) atteint.

### 00:00 — L7 should-features rendu et intégré (agent 15 min, 229k tokens, 69 outils)

- +23 tests core (288, 95 %), +35 tests ui (125, 98 %). Tout additif, contrat intact, `search.*` enregistrées hors `STANDARD_COMMAND_IDS`.
- Vérifié en navigateur : `search.open` → panneau, 4 correspondances surlignées « 1 / 4 », `next`, `replaceAll`, vue source avec HTML modifié au retour et toolbar grisée pendant, plein écran `position: fixed` et sortie à Échap. 34 items de toolbar en preset `full`.
- Différé : icônes inline des 3 composants à rapatrier dans `icons/index.ts` (confié à L11), ajout des ids `search.*` au contrat au prochain dégel, recherche indisponible en lecture seule (le registre refuse `run`) → L9.
- 0.2.0 → prochain bump 0.3.0 après L10/L11/L12.

### 00:05 — Revue R-angular rendue (agent 7 min, 156k tokens, 54 outils)

- 4 findings bloquants prouvés ou avec scénario précis : `touched` posé dès un clic sur la toolbar (le `mousedown` vole le focus), `writeValue` annulable par Ctrl+Z (pas d'`addToHistory: false`), validateur de la démo refusant une image seule, erreur du corps conditionnée par `form.touched` au lieu de `body.touched`. 8 mineurs (SSR charge `word` inutilement via un `effect`, a11y, titres de routes, `[value]` sur `<select>`).
- Deux de ces bugs sont invisibles sous jsdom (focus au `mousedown`) : argument de plus pour les e2e Playwright (L12 en cours).
- Lot L9a lancé (`affbe982`) pour tout corriger avec un test par finding. Correctif A-2 porté dans le core : `setHTML(html, false)` écrit désormais hors historique, JSDoc du contrat mise à jour.
- `test:coverage` ajouté au paquet angular par l'orchestrateur, et `npm run test` racine simplifié.

### 00:11 — L9a correctifs Angular rendu et intégré (agent 10 min, 187k tokens, 96 outils)

- Les 12 findings corrigés, chacun avec un test, plus les tests manquants listés par le relecteur. angular 19 → 30 tests, demo 9 → 20, ui +7, core +3.
- Changement de comportement du core à mettre au changelog : `setHTML/setJSON(…, false)` hors historique d'annulation.
- `createPlainButton` neutralise désormais le `mousedown` de tous les boutons UI : à valider en e2e sur les dialogues avec champs texte (L12).
- Flake `image-upload.spec.ts` signalé par un 3e agent : passe en lot L9b (core) avec les retours de R-word.

### 00:15 — L10 export .docx rendu et intégré (agent 20 min, 224k tokens, 85 outils)

- 53 nouveaux tests, paquet word à 216 tests et 98 %. Aller-retour `exportDocx` → `importDocx` sans avertissement, vérifié aussi **en navigateur réel** via le playground (10 kB, structure identique au retour, `type="a"` perdu à l'import car mammoth ne le relit pas).
- Décision validée : `onWarning` en option plutôt qu'un retour `{ blob, warnings }`, le `Blob` nu reste pratique pour un bouton de téléchargement.
- L10 a trouvé par le test d'aller-retour un piège de la lib docx (`tableHeader: false` sérialisé et lu comme vrai par mammoth) : le test clé imposé dans le brief a payé.
- À vérifier par Joris : ouvrir un .docx exporté dans Word réel (puces 9 niveaux, style Citation, image, bordures).

### 00:20 — L11 markdown/autosave/extras rendu et intégré (agent 15 min, 258k tokens, 102 outils)

- +35 tests core (323, 94 %), +21 tests ui (146, 98 %). Tiptap 3.31 n'embarque pas de markdown natif (`@tiptap/markdown` séparé, non installé) : convertisseur maison sans dépendance, aller-retour testé.
- `print.css` ajouté à `aster.css` (6 imports). Preset `full` : dernier groupe à 5 widgets.
- **Flake `image-upload.spec.ts` corrigé par l'orchestrateur** : 3 `flush()` à base de `setTimeout` remplacés par `vi.waitFor` sur le HTML attendu. 3 runs complets verts d'affilée. Cause : `FileReader` sous jsdom résout à un moment non déterministe.
- 3 propositions de contrat différées (`getMarkdown` sur `AsterEditor`, `autosave` dans `AsterOptions`, JSDoc des widgets).

### 00:22 — Revue R-word rendue (agent 25 min, preuves exécutables)

- 3 bloquants : **2 regex quadratiques** (`isWordHtml` sur chaque collage, `parseListFormats`) exploitables par un site hostile au `copy` (2,3 Mo → 137 s), et `mso-yfti-firstrow:yes` pris pour un marqueur d'en-tête alors que Word le pose sur la première ligne de toute table → toutes les tables Word collées perdaient leur première ligne de données en `<th>`. 12 mineurs (sécurité par liste blanche confirmée mais `template`/`iframe`/`form` laissés, `importDocx(null)`, `Uint8Array` refusé, marqueurs `c.`/`1.1.`, overrides `lfo`, Google `list-style-type`).
- Méthode du relecteur à retenir : un fichier de preuves `proofs.scratch.spec.ts` avec un test par finding assertant le comportement **obtenu**, qui passera au rouge une fois corrigé. Zéro finding sans entrée concrète.
- Passes DOM mesurées linéaires jusqu'à 3 Mo. Lot L9b lancé (`a?`) pour les 15 findings.
- Note : `export/` (L10) non relu par R-word, livré pendant la revue → revue dédiée à prévoir.

### 00:30 — L12 e2e Playwright rendu et intégré (agent 19 min, 223k tokens, 67 outils)

- 21 tests e2e (16 playground, 5 démo), 3 runs verts, rejoués par l'orchestrateur : **21/21 en 15 s**. Captures dans `e2e/output/` (gitignoré) et 2 copiées dans `docs/captures/`.
- 2 bugs trouvés que jsdom ne pouvait pas voir : Échap en plein écran inerte depuis l'éditeur (ProseMirror capture la touche et `preventDefault`), menu contextuel de table `position: fixed` sans clamp dans le viewport. → L9c après R-ui.
- Piège Vite à froid : le premier `importDocx` sur `ng serve` déclenche l'optimisation de `mammoth` et recharge la page. Contourné par un retry dans le test ; à noter dans le guide d'intégration.
- Scripts `e2e` corrigés (`-c e2e/playwright.config.ts`), `e2e/tsconfig.json` ajouté au `typecheck` racine.
- `data-testid` proposés pour découpler les e2e des libellés FR : à faire en V1.1.

### 00:35 — Revue R-ui rendue (agent 30 min, 9 specs de preuve)

- 9 bloquants, tous d'accessibilité ou de focus : `aria-pressed` sur des boutons non-toggle, focus perdu au re-clic du déclencheur et au passage en lecture seule, Tab ne ferme pas les menus, `getIcon('constructor')` renvoie une fonction (pollution DOM, pas de XSS), menu contextuel jamais resynchronisé, vue source laissée en lecture seule définitive si la toolbar est détruite, panneau coupé en plein écran, contraste du surlignage night à 4,05. Aucune fuite d'écouteur, aucun `innerHTML` non constant, variables CSS toutes consommées.
- Lot L9c lancé sur ui avec ces 9 bloquants + les 2 bugs des e2e (Échap plein écran, clamp du menu contextuel) + un test de contraste automatisé sur les thèmes.
- Observation REX : les trois revues ont chacune trouvé 3 à 9 bloquants dans du code à 94-99 % de couverture. Les TU des agents testent ce qu'ils ont construit ; la revue adverse teste ce qu'ils n'ont pas imaginé. Les deux sont nécessaires.

### 00:40 — Revue R-core rendue (agent 35 min, sondes exécutées puis supprimées)

- 3 bloquants : `setReadOnly` émet `change` (Tiptap `setEditable` émet `update` par défaut) → le wrapper Angular salit le formulaire à chaque `disabled` ; politique de liens non appliquée au parsing des `<img>` (`javascript:` et `data:text/html` conservés) alors que le README promettait le contraire ; `paragraph`/`heading` via `setNode` mutent le document même en échouant (`run` → `false` mais l'item de liste est éjecté).
- Perf mesurée : `getHTML()` 45 ms sur 500 paragraphes + 10 tables (62 % dans le reparse de `normalizeOutputHtml`), appelé à chaque frappe par Angular → cache par identité de `state.doc`.
- Diagnostic du flake confirmé : `FileReader` jsdom = 3 `setImmediate` imbriqués contre 2 `setTimeout(0)` ; 30/30 pertes sous charge. Mon correctif `vi.waitFor` est valide, le relecteur propose `waitForEvent` : équivalent.
- Décisions produit prises par l'orchestrateur pour L9d : pas de titre dans les items de liste en V1, pas de tables imbriquées en V1, `clearFormatting` conserve les liens.
- Lot L9d lancé. Les 4 lots de correctifs L9a-d couvrent 54 findings au total.

### 00:45 — L9c correctifs ui rendu et intégré (agent 17 min, 274k tokens, 146 outils)

- 17 findings corrigés, ui 146 → 188 tests, e2e 21/21 vérifiés par l'agent, E-1 et E-2 revérifiés en vrai navigateur par l'agent lui-même.
- Nouveau test de contraste WCAG lisant les CSS des thèmes : tout thème futur sera contrôlé automatiquement.
- `THEMING.md` aligné par l'orchestrateur (sélecteur d'image, classe flip, note `images-tables.css`). E2E : contournement `button.focus()` du test plein écran à retirer en V1.1 (non bloquant).

### 00:50 — L9b correctifs word rendu et intégré (agent 20 min, 288k tokens, 127 outils)

- 15 findings corrigés, word 216 → 260 tests, 98,8 %. Le fichier de preuves du relecteur passe à 17/17 rouge comme attendu : la boucle revue → preuve → correctif → preuve inversée fonctionne.
- Décisions validées : `svg`/`math` supprimés au collage, liens relatifs déballés (Word n'émet que des ancres `#_Toc` mortes, Google des URL absolues), `start` posé aussi pour alpha/romain.
- Friction récurrente notée : l'outil Write convertit ` ` en NBSP littéral. Trois agents l'ont rencontrée.

### 00:55 — Revue R-export rendue (agent 25 min, a lu le code de la lib docx)

- 4 bloquants : caractères de contrôle écrits bruts dans le XML (`docx` n'assainit que `& " ' < >`) → .docx « contenu illisible » dans Word ; NBSP écrasés par `\s` (typographie française) ; `start` des `<ol>` ignoré ; sous-listes de même format partageant un `abstractNum` → numérotation qui continue dans Word. 7 mineurs. Échappement XML et robustesse salués.
- Lot L9e lancé. Mesure de charge : 2 000 paragraphes + 20 tables exportés en 233 ms.

### 00:57 — L9d correctifs core rendu et intégré (agent 30 min, 301k tokens, 131 outils)

- 13 findings corrigés, core 323 → 363 tests, `getHTML` 17,8 ms → 0 ms entre deux transactions.
- Décision validée contre mon brief : `paragraph`/`heading` sur un bloc déjà du type → `false` sans mutation (sémantique ProseMirror pure, `heading` n'est plus une bascule). Cohérent avec « pas de titre dans les listes en V1 ».
- Décision hors brief acceptée avec réserve : `focus()` synchrone en navigateur (détection `Range.prototype.getClientRects`) pour tenir le contrat « API synchrone » et supprimer une course e2e (grille de table → `type` avant le rAF de Tiptap). À réexaminer en V1.1 : alternative propre côté `ui` (ne pas reconstruire un panneau pendant un clic).
- `data:image/svg+xml` accepté dans `<img>` (pas d'exécution de script), SVG toujours refusé à l'upload.
- Échec transitoire d'un `ng test` pendant un e2e concurrent : le builder Angular bundle `ui`/`word` pendant que d'autres agents y écrivent. À noter dans le REX : ne pas lancer deux agents qui exécutent des e2e en même temps.

### 01:05 — L9e intégré, check complet, 0.3.0

- L9e (agent 12 min, 180k tokens, 61 outils) : 11 findings corrigés, word 260 → 281 tests, charge 182 ms.
- `npm run check` : un échec, le spec Angular résolvait les fixtures depuis `process.cwd()` (différent entre `npm run test --workspaces` et `ng test`). Corrigé par remontée jusqu'au dossier `fixtures/`.
- État final vérifié : **core 363, word 281, ui 188, angular 30, demo 20 = 882 tests unitaires + 21 e2e**, build vert, e2e 21/21 en 6 s.
- Bump **0.3.0**, changelog détaillé (Added / Changed / Fixed). L8bis lancé pour aligner toute la doc sur l'état final.

### 01:27 — Gel. L8bis intégré, 0.3.0 finale sur `develop`

- L8bis (agent 21 min, 381k tokens, 86 outils) : 9 docs réécrites depuis le code, tous les exemples typecheckés, compteurs vérifiés par script (48 + 6 commandes, 66 icônes, 30 variables, 58 + 76 clés i18n, 882 tests). Deux écarts **code** remontés par l'agent docs et corrigés par l'orchestrateur : `Mod-f` consommait la touche sans panneau de recherche (événement rendu annulable, `search.open` rend `false` sans preneur), 4 commandes `search.*` sans icône.
- État final : **883 tests unitaires + 21 e2e verts, lint, typecheck, build verts**, 42 commits sur `develop`, `main` intacte.
- Livrables de fin : `BILAN.md` (5 min), `docs/REX.md` (méthode en 9 points), captures dans `docs/captures/`, mémoire Claude mise à jour.

## 🧭 Reprendre le travail

1. Lire `BILAN.md` puis la section « À vérifier par toi ».
2. Les 10 propositions de contrat différées sont dans les entrées L1, L6, L7, L10, L11 ci-dessus : à instruire en V1.1 avec un dégel explicite de `packages/core/src/api/`.
3. Serveurs encore lancés en fin de nuit : playground esbuild (4300) et `ng serve` (4200), à tuer si besoin.

---

# 📓 Session 2 — 16 → 19 octobre 2026

> Objectif : d'ici lundi 19 octobre 09:00, se rapprocher de CKEditor, en priorité sur l'import et l'export Word avec variables (champs de fusion). Plan dans `docs/ROADMAP_SESSION2.md`.

### 16/10 — GO de Joris avec les défauts proposés, cadrage et phase 0

- État de départ : 0.3.0 + 7 fixtures, 893 TU + 21 e2e verts, aucun document client déposé, serveurs arrêtés.
- Défauts validés : `{{nom}}` canonique, détection aussi des `MERGEFIELD` et des contrôles de contenu ; valeurs statiques + résolveur asynchrone optionnel ; export `resolve` ou `fields`.
- Vérifications phase 0 : `docx` expose `SimpleMailMergeField`, `SimpleField`, `TableOfContents`, `Header`/`Footer`, `PageBreak` ; mammoth ignore l'instruction `MERGEFIELD` (il rend le texte résultat) et traverse les `w:sdt` → prétraitement du XML avant mammoth ; `@tiptap/suggestion` installé pour le menu `{{` ; `jszip` déclaré dans `word` (MIT, déjà transitif via mammoth).
- `npm run check` de base vert après installation. Serveurs relancés (4200, 4300).
- Dégel **additif** du contrat : `api/variables.ts`, `AsterOptions.variables`, `AsterEditor.variables` + `getHTML(options?)`, événement `variablesChange`, commandes `variable.insert`/`variable.remove`, widget `variable`, clés i18n.

### 16/10 10:21 — Phase 0 commitée, vague 1 lancée (4 agents)

- Friction phase 0 : `@tiptap/suggestion@^3.31.4` s'est résolu en **3.32.0** (sortie entre-temps) avec une seconde copie de `@tiptap/core` imbriquée sous `packages/core` → 100 erreurs de types (augmentations Tiptap non fusionnées). Le `npm run check` juste après l'installation était pourtant vert : il tournait sur les sources d'avant le patch de contrat, avant que `tsc` n'inclue… non : il était vert parce que le typecheck ne touchait pas encore aux fichiers qui tiraient la copie imbriquée. Leçon REX : **épingler les versions Tiptap en exact** (lockstep) et vérifier `find node_modules packages -path "*@tiptap/core/package.json"` après toute installation. Corrigé par épinglage `3.31.4` + `npm dedupe` + `npm prune`.
- Magasin de variables de base et commandes stub ajoutés pour que les 4 paquets compilent contre le contrat pendant la vague.
- Lancés : L13 core-variables (`aaaca60e`), L14 ui-variables (`af5b598d`), L15 word-import-variables (`a01c620c`), L16 word-export-fidélité (`a1cc6682`). Briefs dans `docs/briefs/`.
- Pendant la vague : panneau « Variables » dans le playground, briefs L17/L18, REX session 2.

### 16/10 10:40 — L14 ui-variables rendu et intégré (agent 15 min, 248k tokens, 98 outils)

- 230 tests ui (+42), codé entièrement contre le contrat avec un mock enrichi, sans voir l'implémentation core. 6 attentes précises envers le core transmises à L13 en cours par message (remplacement de la sélection, sélection de la puce avant `aster:variable-edit`, libellé lu sur le nœud, sonde `allowUnknown`, export de l'événement, classes CSS).
- Décision L14 à retenir : panneau de suggestion positionné à la main (clamp viewport) plutôt que `floating-ui`, pour rester testable sous jsdom.
- Proposition de contrat notée pour le dégel final : `VariableStore.allowsUnknown()` à la place de la sonde.
- `variables.css` importé, `@tiptap/suggestion`, `@tiptap/pm`, `@floating-ui/dom` déclarés dans `ui` (épinglés 3.31.4), toujours une seule copie de `@tiptap/core`.

### 16/10 10:55 — L13 core-variables rendu et intégré (agent 16 min, 221k tokens, 69 outils)

- +57 tests core (425, 95,5 %), aucun test existant modifié. `AsterVariableStore` concret avec `allowUnknown`/`canInsert`, `resolveVariablesHtml` pur avec chemin rapide sans DOM.
- **Vérifié en navigateur (core + ui assemblés)** : puces rendues depuis `span[data-aster-variable]`, `setValues` → puces `--resolved` affichant « Nebula » et « ACME SAS », `getHTML({ variables: 'resolve' })` correct, `getText` avec valeurs, widget « Variable » dans la toolbar (37 items), menu `{{cli` avec l'option existante et « Créer {{cli}} ». Capture `08-s2-variables-playground.jpg`.
- Propositions de contrat (dégel final) : `VariableStore.allowUnknown`/`canInsert`, `VariableEditEventDetail` dans `api/variables.ts`.
- L13 a reçu mon message avec les attentes de L14 après son rendu : il est relancé et renotifiera ; à intégrer en delta.

### 16/10 11:20 — L15 word-import-variables rendu et intégré (agent 23 min, 252k tokens, 86 outils)

- 128 tests, paquet word à 409 (avec L16 en cours), 98,4 %. Prétraitement en DOM XML (pas de regex sur le XML), champs imbriqués dans `IF` gérés, contrôles de bloc, en-têtes/pieds/notes.
- **Vérifié en navigateur** sur les 3 fixtures : 08 → 9 variables et 11 puces (le `{{` coupé sur deux runs est recollé), 09 → 5 champs de fusion simples et complexe en puces, 10 → 3 contrôles de contenu avec libellés et valeurs (« Jean Dupont », placeholder ignoré). Zéro avertissement.
- Décision L15 à retenir : avec un `pattern` custom ou `braces` désactivé, les `{{nom}}` produits par le prétraitement ne sont reconnus que pour les noms collectés (jamais de conversion contre la volonté de l'intégrateur). Les variables d'en-tête/pied sont remontées dans `result.variables` bien qu'absentes du HTML.
- Inventaires des fixtures mis à jour, `npm run fixtures` enchaîne les trois générateurs. Revue R15 lancée.

### 16/10 11:35 — L16 word-export-fidélité rendu et intégré (agent 25 min, 301k tokens, 96 outils). Vague 1 close.

- 45 tests, word à 409 (98,4 %), charge 224 ms. Trois modes de variables, en-têtes/pieds avec `PAGE`/`NUMPAGES`, saut de page, TOC préremplie par docx 9.10 + `updateFields`, notes de bas de page réelles avec aller-retour, titres numérotés `decimal`/`legal`, largeurs DXA, A4/Letter, orientation, marges, `lang`, police, styles de titres.
- Échantillon « toutes options » rangé dans `samples/export-fidelite-complet.docx` avec une checklist de 12 points dans `samples/README.md` pour l'ouverture dans Word réel par Joris.
- **Tour complet vérifié en navigateur** : import de `09-variables-mergefields` → `setValues` → export `fields` → réimport retrouve les 5 variables ; export `resolve` → réimport : texte substitué, `{{DateEcheance}}`/`{{Signataire}}` préservés et re-détectés, 2 avertissements `variable-unresolved` ; export complet 12 kB sans erreur.
- **Écart pour le lot de correctifs** : à la réimportation d'un export `fields` avec valeurs connues, les valeurs sont perdues (L15 jette le résultat du champ ; L16 l'émet pourtant via `SimpleField`). Correctif : conserver le résultat comme valeur quand il n'est pas le placeholder `«nom»`.
- Vague 1 de la session 2 : 4 lots intégrés en **1h15** après le lancement, 0 fichier hors périmètre, 1 collision de nom de type résolue par les agents eux-mêmes (`DocxVariableOptions` vs `DocxExportVariableOptions`).

### 16/10 11:50 — Revue R14 rendue (variables core + ui, 35 specs de preuve dont 9 rouges = bugs, vérifs navigateur)

- 5 bloquants : **Entrée dans le menu `{{` coupe le paragraphe** (plugin enregistré derrière le keymap Tiptap : `registerPlugin(p, (p, ps) => [p, ...ps])`), Échap en plein écran ignore les panneaux de variables (sélecteur de panneaux ouverts non extensible), `list()` ressuscite une valeur effacée, dialogue qui lit le libellé dans le magasin plutôt que sur le nœud. 9 mineurs (a11y `aria-activedescendant`, `resolve()` qui perd les succès sur un rejet, suggestion dans un bloc de code, `setJSON` avec nom hostile, valeur vide invisible, flip du panneau, re-rendu du menu à 200 variables).
- Leçon REX confirmée : toutes les specs ui passaient par le mock ou appelaient `onKeyDown` directement ; seul un test d'intégration réel (vrai core, vrai `keydown`) pouvait voir V-1. Imposé dans le brief de correctifs.
- Sécurité et fuites : rien à signaler (contraste puce non résolue 4,73 light / 5,25 night mesuré).
- Lot L20 lancé sur les 14 findings, en parallèle de L18 (fichiers disjoints listés dans le brief).

### 16/10 12:05 — Revue R15 rendue (import des variables, 33 docx adversariaux)

- 2 bloquants : `w:sdt` enveloppant une table → table supprimée et XML invalide ; corps `document2.xml` (relation `_rels/.rels`) ignoré par le prétraitement alors que mammoth le lit. 11 mineurs dont `readComplexField` quadratique sur des `begin` non fermés (2 000 → 12 s), parse DOM de toute partie même sans champ (225 ms pour rien sur 1,4 Mo), `PlaceholderText` cloné, `w14:checkbox` transformé en variable, `data-label` perdu au recollage.
- Mesures utiles : réécriture jszip d'une archive de 5 Mo avec PNG = 29 ms (entrées DEFLATE réutilisées) ; l'approche « réécrire le .docx avant mammoth » est viable.
- Sécurité confirmée (alias hostile échappé partout). Lot L21 lancé avec l'écart « valeurs perdues à la réimportation d'un export `fields` » en plus.

### 16/10 12:15 — Revue R16 rendue (export, 41 cas)

- 3 bloquants : appels de note émis dans les en-têtes/pieds et dans une note (Word les interdit → « contenu illisible »), `colspan="1000000"` → export qui ne se termine jamais (1,2 Go ; Word plafonne à 63 colonnes). 10 mineurs (nom de champ non cité si blanc, valeurs multi-lignes aplaties, `footer.align` ignoré pour `PAGE`, collision de clés de notes, drapeau sticky, valeur non chaîne, marges hors page).
- Validité OOXML des ajouts vérifiée (ordre `w:pPr`, `fldSimple` dans `hyperlink` et titres, séparateurs de notes, `tblGrid`), perf 361 ms pour 4 000 variables en mode `fields`.
- Lot L22 lancé sur `export/` seulement, en parallèle de L21 (`docx/`, `paste/`).
- Bilan des 5 revues de la session 2 à ce stade : 10 bloquants et 31 mineurs sur 4 lots à 95-98 % de couverture. Même constat que la session 1.

### 16/10 12:30 — L17 angular-modèle rendu et intégré (agent 15 min, 187k tokens, 80 outils)

- angular 30 → 39 tests, démo 20 → 23, bundle initial 283 kB. `exportDocx` testé avec le vrai module (preuve par `onWarning`) plutôt qu'un `vi.mock` incertain sous le builder Angular : bonne décision.
- Page `/template` : exemple, formulaire généré depuis `variableNames()`, onglet résolu, 3 exports. Vérifiée par l'agent dans le navigateur (9 champs, « Fait à Montpellier »).
- Friction : l'agent a lancé son propre `ng serve` et l'a arrêté, ce qui a tué celui de l'orchestrateur sur 4200 (même port). À mettre dans les briefs : ne pas arrêter un serveur qu'on n'a pas lancé, ou utiliser un autre port.
- Point à surveiller : `aster-editor.component.ts` passe à 636 lignes → extraction `lib/variables.ts` en fin de session si le temps le permet.
- 12:40 — `/template` vérifiée par l'orchestrateur en navigateur : exemple chargé (11 puces), 9 champs générés dans l'ordre du document, « 9 variables sans valeur », onglets Puces/Résolu, 3 boutons d'export. Les deux « ou » de la dropzone séparent trois options (glisser, fichier, exemple) : pas un bug.

### 16/10 12:55 — L18 parité rendu et intégré (agent 27 min, 325k tokens, 113 outils)

- 3 sous-lots livrés : bulles de lien/image (floating-ui), menu `/` (suggestion), sommaire + format painter. ui 270 tests, core +17. Décisions à retenir : ids de titres posés **à la demande** (ouverture du sommaire) pour ne pas casser 71 assertions sur des `<hN>` nus ; saut de page seulement si un nœud `pageBreak` existe (schéma standard sans).
- Commité par chemins explicites (L20 toujours en cours sur les fichiers variables).
- **Vérifié en navigateur** : bulle de lien (URL + Modifier + Supprimer), bulle d'image (3 alignements, 3 largeurs, modifier, supprimer), `/tab` → « Tableau 3 × 3 », ids `aster-h-1/2` sérialisés, 39 items de toolbar. **Bug trouvé** : le sommaire affiche chaque titre deux fois à l'ouverture (4 puis 2 après `update()`) : `ensureHeadingIds` dispatche une transaction pendant `renderPanel` → `selectionChange` → re-rendu imbriqué qui s'ajoute au rendu en cours. Correctif orchestrateur à suivre.

### 16/10 11:15 — L20 correctifs variables rendu et intégré (agent 17 min, 261k tokens, 101 outils)

- 14 findings corrigés, core 425 → 449, ui 230 → 289, avec des **tests d'intégration réels** (vrai core, vrai `keydown`) imposés par le brief ; les 3 bloquants revérifiés en navigateur par l'agent.
- Décision retenue : nom de variable invalide → nœud inerte (`variableName()` rend `''`), plutôt qu'un rejet de `setJSON`. Changement de sémantique à noter au changelog.
- `OPEN_PANEL_SELECTORS` / `registerOpenPanelSelector` exportés par l'orchestrateur depuis `ui/src/index.ts`.
- Horodatage : les heures notées plus haut dans la session 2 (11:50, 12:05…) étaient estimées ; l'horloge réelle est 11:15 à ce point. Les heures suivantes viennent de `date`.

### 16/10 11:25 — L21 et L22 rendus et intégrés

- L22 export (agent 13 min, 207k tokens, 88 outils) : 13 findings, export 119 → 138 tests, `colspan=1e6` en 58 ms, 4 codes d'avertissement additifs (`footnote-not-allowed`, `footnote-duplicate`, `table-span-clamped`, `page-margins-clamped`). Checklist Word complétée (points 13-17).
- L21 import (agent 21 min, 224k tokens, 65 outils) : 15 findings, word 409 → 454 tests, 99 % de lignes. Décision orchestrateur sur la fixture 09 : un résultat de champ entièrement entre guillemets français est toujours le placeholder Word (jamais une valeur fusionnée), ligne corrigée dans `fieldResultInfo`.
- L21 a choisi de scanner les `{{nom}}` tapés dans les en-têtes/pieds (regex sur le XML brut, sans parse) et d'activer le recollage inter-marques aussi au collage. Validé.
- Changement observable à noter : une partie XML illisible **sans** marqueur ne produit plus d'avertissement (jamais parsée).

### 16/10 11:40 — L19a e2e rendu et intégré (agent 9 min, 168k tokens, 51 outils)

- 21 → **35 tests e2e**, 3 runs verts, ~10,5 s. L'agent a trouvé par Entrée réelle le même bug dans le menu `/` que R14 dans le menu `{{` (plugin enregistré derrière les keymaps) : corrigé par l'orchestrateur d'une ligne, test durci sur `Enter`, 35/35 revérifiés.
- Playground : `#vars-names` n'était pas rafraîchi après un import ; corrigé.
- `data-testid` proposés (playground, page Modèle, panneaux ui) : différés en V1.1, comme en session 1.

### 16/10 11:48 — L19b docs rendu et intégré, gel 0.4.0 (agent 22 min, 403k tokens, 116 outils)

- 11 fichiers de documentation réécrits ou relus, compteurs recalculés par script depuis les sources (50 commandes standard, 16 widgets, 77 icônes, 8 feuilles CSS, 63/110 clés i18n), exemples TypeScript des docs typecheckés. 8 écarts code-docs corrigés, dont une convention de clés `word.*` documentée mais inexistante dans le code.
- Deux JSDoc de code signalées par l'agent, corrigées par l'orchestrateur : « huit passes » de collage (neuf), liste des widgets de `ToolbarWidgetItem` (+ `outline`, `formatPainter`).
- **Gel final** : `npm run check` vert (1 254 tests : core 449, word 454, ui 289, angular 39, démo 23), `npm run build` vert, `npm run e2e` 35/35 en 11,5 s. Arbre propre, `develop` poussé.
- Fin de session 2 à 11:48, soit 1h50 de GO à 0.4.0 plus 25 min de documentation et de gel.

#### Reprendre le travail

1. Lire `BILAN_SESSION2.md` (5 min), puis `docs/ROADMAP_SESSION2.md` pour ce qui a été différé.
2. Tester dans Word réel avec `samples/README.md` et déposer un `.docx` client dans `fixtures/docx/`.
3. Prochain contrat à dégeler (additif) : `VariableStore.allowUnknown` / `canInsert`, événements `formatPainterChange` / `sourceViewChange`, option `headingIds`.

## 🌙 Session 3 — fidélité de mise en page Word (20 octobre 2026)

### 20/10 16:32 — GO, phase 0

- Point de départ : 0.4.3 sur `develop`, 1 262 tests + 35 e2e verts, paquets publiés (0.4.3 en validation npm pour `ui` et `angular`). Aucun `.docx` client déposé : la session démarre sur les fixtures générées (L22).
- Contrat figé (additif) : `core/src/api/layout.ts` (`DocumentLayout`, `ParagraphLayoutAttrs` et leur sérialisation HTML exacte, `RunLayoutAttrs`, `ListLayoutAttrs`, `TableLayoutAttrs`, `CellLayoutAttrs`, `PageViewOptions`), `AsterOptions.pageView`, commandes `paragraph.setLayout` / `paragraph.unsetLayout` ; `word` : `DocxImportOptions.fidelity`, `DocxImportResult.layout` / `template` / `lost`, `DocxLostObject`, `DocxExportOptions.template` / `layout`, codes d'avertissement `image-skipped`, `object-lost`, `reader`.
- Squelette du lecteur OOXML (`word/src/docx/reader/`) : `types.ts` (interfaces figées), `package.ts` (zip, parties, relations), `index.ts` (orchestrateur), dix stubs à signature figée que L24 et L25 remplacent fichier par fichier. `importDocx({ fidelity: 'styled' })` fonctionne de bout en bout en texte brut, variables comprises (5 tests). Défaut encore `semantic` : bascule à l'intégration de L24+L25.
- Décision : les deux lots du lecteur se partagent un dossier mais pas un fichier ; ils ne se parlent que par `ConverterContext`. Les polices et tailles sont posées sur les runs, jamais sur les blocs (Tiptap ne lit pas `font-size` sur `<p>`).
- Lancé : L22 fixtures (16:58). À suivre : L23 core, L24 reader runs, L25 reader blocs, L26 ui.

### 20/10 17:05 — L22 fixtures rendu et intégré (agent ≈ 25 min)

- 7 fixtures `11-styles-inline` … `17-objets-perdus` générées par `scripts/generate-fixtures-layout.ts` (lib `docx` + patches XML pour `TableGrid`, zone de texte, forme, objet OLE), reproductibles (hash identique hors `docProps/core.xml`), lisibles par mammoth sans rejet. README des fixtures mis à jour, `npm run fixtures` enchaîne les quatre scripts.
- Décisions de l'agent validées : `Heading1`/`Heading2` déclarés via `styles.default.heading1/2` (la lib dupliquait le `styleId` sinon) ; pas de repli VML `mc:AlternateContent` autour des formes.
- Dette : le script fait 844 lignes (un fichier pour sept fixtures), à découper si on y revient. Point à vérifier dans Word : l'objet OLE factice de la 17 peut déclencher une réparation.

### 20/10 17:11 — L24 lecteur styles/runs/paragraphes rendu et intégré (agent 22 min, 267k tokens, 58 outils)

- Résolution complète des styles (docDefaults, `basedOn` avec garde anti-cycle, `link`, thème, styles de tableau), runs avec champs coupés et imbriqués, paragraphes à la sérialisation exacte du contrat. 70 tests, `expected/` 11-13 figés, document client lu : 14 variables, aucun cas non couvert.
- Décisions validées : saut de page = `<hr data-page-break>` dans le `html` du bloc (plusieurs frères) ; tabulation = U+2003 ; polices et tailles posées sur les runs quand elles diffèrent des `docDefaults`, jamais sur le bloc ; `tblStylePr` ignorés.
- Extensions structurelles du contrat du lecteur acceptées : `DocxStyleResolver.docDefaults()`, `TableStyleProps.paragraphDefaults`. Proposition à trancher : `DocumentLayout.defaultParagraph` (interligne et espacement par défaut du document, utiles à la vue page).
- Dette à solder à l'intégration de L25 : `units.ts` (L24) et `units-blocks.ts` (L25) en doublon ; `renderBlocks` doit retirer `margin-left` / `text-indent` des items (`data-docx-num-indent`).
- Correctifs orchestrateur : regex du test du squelette, `tcPr` et autres propriétés de conteneur ignorées par `convertBlocks` (42 faux `object-lost` sur le document client). Typecheck `word` temporairement rouge à cause de `core/src/html/serialize-html.ts` en cours (L23).
- Revue R24 lancée.

### 20/10 17:16 — L25 lecteur blocs et L26 ui rendus et intégrés

- **L25** (agent 25 min, 322k tokens, 62 outils) : tableaux (bordures extérieures sur `<table>`, intérieures sur les cellules, fusions, `colwidth`), listes depuis `numbering.xml` (reprise, continuation, puces Symbol ramenées à l'Unicode), images DrawingML et VML, notes à séquence commune, en-têtes et pieds, sections, objets perdus. 72 tests, `expected/` 14-17 figés. Document client : 8 tableaux, 4 listes, aucun avertissement.
- Orchestrateur : langue du document branchée, **en-têtes et pieds hérités entre sections** (Word fait hériter ; le document client ne référence son pied que dans la première section), `reportLost` dans `runs.ts` pour les révisions, champs inconnus, maths, commentaires et objets incorporés (fixture 17 : 7 objets signalés, une fois chacun). Décision : un champ `DATE` est rendu par son résultat **et** signalé.
- Dette : `units.ts` (L24) et `units-blocks.ts` (L25) en doublon partiel ; `renderBlocks` ne retire pas encore `margin-left` / `text-indent` des items (`data-docx-num-indent`) ; `w:jc` de tableau ignoré ; `numStyleLink` non suivi.
- **L26** (agent 25 min, 342k tokens, 83 outils) : 8 widgets (interligne, espacement, retraits, bordures et fond, casse, style de souligné, mise en page), `themes/page.css` (bureau, feuille, en-têtes et pieds en lecture seule, coupure de feuille), variables `--aster-page-*`, dialogue d'image avec hauteur et verrou, icône `ordered-list` redessinée avec test géométrique. 289 → 375 tests, 24 widgets, 81 icônes, 179 clés i18n. Décisions validées : `indentIncrease` / `indentDecrease` remplacent `indent` / `outdent` dans les presets `full` et `standard` ; pas de `@page` dans `print.css`.
- Propositions de contrat en attente de L23 : `image.setAttributes.height`, `setPageView` / `getLayout` dans `api/editor.ts`, `text.setCaps` / `text.unsetCaps`, commande de style de souligné.
- Revues R25 et R26 lancées. Typecheck global encore rouge sur `core/src/html/serialize-html.ts` (L23 en cours).

### 20/10 17:55 — L23 core rendu et intégré (agent 30 min, 363k tokens, 158 outils)

- Attributs de paragraphe (12), marques de run, listes et tableaux stylés, vue page : 455 → 572 tests. Décision majeure validée : `getHTML()` passe par un **sérialiseur HTML verbatim** (`html/serialize-html.ts`) car le `DOMSerializer` réécrit les styles via le CSSOM (`rgb()`, raccourcis, ordre faux sous jsdom) ; effet de bord : les couleurs sortent en `#rrggbb`, deux specs existantes ajustées.
- Alignement lecteur ↔ core fait par l'orchestrateur : ordre d'imbrication des marques (`<span><strong><em><s><u><sup>`) et ordre des déclarations du `span` (`background-color, color, font-family, font-size, letter-spacing, …`) calés sur le core dans `runs.ts` ; `AsterHorizontalRule` ajouté au core pour conserver `<hr data-page-break>` (la session 2 l'exportait mais le core le perdait à l'aller-retour). Attendus 11-17 régénérés (`regen-expected.spec.ts`, gardé sous `ASTER_REGEN`). Idempotence stricte import → `setHTML` → `getHTML` : verte sur 11 et 13, 12 dès le core intégré.
- Propositions de contrat en attente : `setPageView` / `getLayout` dans `api/editor.ts`, commandes `text.*`, `image.setAttributes.height`, `DocumentLayout.defaultParagraph`.
- Revue R23 lancée ; L30 pagination lancé.
