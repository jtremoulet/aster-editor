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
