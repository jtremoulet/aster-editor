# 🔁 REX — Retour d'expérience : une nuit de dev multi-agent

> Objectif : documenter le process de la nuit du 12 au 13 octobre 2026 pour en tirer une méthode réutilisable.
> Ce doc se remplit **pendant** la nuit, pas après. Les sections marquées 🕐 sont complétées au gel de 07:30.

## 🎯 Ce qu'on teste comme process

- Un orchestrateur Claude unique, en autonomie totale pendant environ 9h, sur un projet from scratch.
- Des sous-agents par lot, en worktrees isolés, sur des contrats figés en amont.
- Un rituel d'intégration strict : check, revue, commit, journal, à chaque lot.
- Une documentation de cadrage écrite **avec** Joris avant toute ligne de code.

Les questions auxquelles on veut répondre :

1. Combien de temps de cadrage pour combien de temps de dev autonome utile ?
2. Le parallélisme à 4 agents tient-il sans conflits, et à quel coût d'intégration ?
3. Les contrats d'API figés en phase 0 survivent-ils au contact de l'implémentation ?
4. Où l'orchestrateur perd-il du temps : attente, intégration, correctifs, re-brief ?
5. La qualité de sortie, tests et revue compris, est-elle au niveau d'un dev humain soigneux ?

## 📊 Métriques 🕐

### Par lot

| Lot              | Lancé | Rendu | Durée agent                    | Check initial | Allers-retours | Tests | Couv.              | Findings revue (bloquant/mineur) | Changements de contrat proposés |
| ---------------- | ----- | ----- | ------------------------------ | ------------- | -------------- | ----- | ------------------ | -------------------------------- | ------------------------------- |
| P0               |       |       |                                |               |                |       |                    |                                  |                                 |
| L1 core          |       |       |                                |               |                |       |                    |                                  |                                 |
| L2 word-paste    |       |       |                                |               |                |       |                    |                                  |                                 |
| L3 word-docx     |       |       |                                |               |                |       |                    |                                  |                                 |
| L4 ui            |       |       |                                |               |                |       |                    |                                  |                                 |
| L5 angular+démo  |       |       |                                |               |                |       |                    |                                  |                                 |
| L6 tables/images | 23:25 | 23:41 | 16 min, 227k tokens, 67 outils | vert          | 0              | +46   | core 94 %, ui 97 % | 0/0                              | 4 (différées V1.1)              |
| L7 should        |       |       |                                |               |                |       |                    |                                  |                                 |
| L8 docs          |       |       |                                |               |                |       |                    |                                  |                                 |
| R1-R4 revues     |       |       |                                |               |                |       |                    |                                  |                                 |

### Globales

| Métrique                                         | Valeur                                                        |
| ------------------------------------------------ | ------------------------------------------------------------- |
| Heure de début phase 0                           | 22:34                                                         |
| Heure du gel                                     | 01:10 (features gelées à 01:05, 0.3.0)                        |
| Commits sur `develop`                            | 37                                                            |
| Versions publiées                                | 0.1.0 (23:23), 0.2.0 (23:53), 0.3.0 (01:05)                   |
| Lignes de code hors tests                        | 13 200 (222 fichiers .ts) + 1 200 CSS                         |
| Lignes de tests                                  | 10 500                                                        |
| Nombre de tests                                  | 882 unitaires + 21 e2e                                        |
| Couverture globale                               | core 95 %, word 98 %, ui 98 %, angular 94 %                   |
| Temps orchestrateur en intégration (estimé)      | ≈ 1h45 cumulé (3 à 8 min par lot × 21 rendus)                 |
| Temps orchestrateur en attente d'agents (estimé) | ≈ 1h, jamais à vide : briefs suivants, vérifs navigateur, REX |
| Agents relancés ou re-briefés                    | 0                                                             |
| Changements de contrat acceptés                  | 3 (L1) + 1 (L10 onWarning) ; 10 différés en V1.1 ; 0 rupture  |
| Tokens agents (somme des rapports)               | ≈ 4,9 M sur 21 agents, médiane 225 k                          |
| Compactions de contexte subies                   | 0                                                             |

## ⏳ Chronologie réelle vs cible 🕐

| Phase         | Cible       | Réel | Écart | Cause |
| ------------- | ----------- | ---- | ----- | ----- |
| Cadrage       | 22:30–23:00 |      |       |       |
| Phase 0       | 23:00–00:30 |      |       |       |
| Vague 1       | 00:30–03:30 |      |       |       |
| Intégration 1 | 03:30–04:15 |      |       |       |
| Vague 2       | 04:15–06:30 |      |       |       |
| Intégration 2 | 06:30–07:00 |      |       |       |
| Vague 3       | 07:00–07:30 |      |       |       |
| Gel           | 07:30–08:15 |      |       |       |

## ✅ Bons points

Notés au fil de l'eau, avec l'heure.

- 22:10 — Vérifier les versions réelles sur le registre npm avant d'écrire les docs a évité une erreur de cible : TypeScript 7 est sorti mais Angular 22 pin TS 6.0.x. Sans cette vérification, la phase 0 aurait démarré sur une version incompatible.
- 22:15 — Vérifier la disponibilité des noms npm en 30 secondes a tranché le débat sur le nom avec des faits.
- 22:40 — Lancer la génération Angular CLI en tâche de fond pendant l'écriture des configs racine a fait gagner 5 minutes. Les smoke tests Tiptap et mammoth en phase 0 ont validé les deux hypothèses techniques les plus risquées avant tout parallélisme.
- 22:46 — Phase 0 bouclée en 12 minutes au lieu des 90 prévues, grâce aux docs de cadrage très précises : chaque fichier était déjà spécifié.
- 23:15 — Les trois premiers lots sont rentrés en 11 à 20 minutes, tous verts au premier check, zéro fichier hors périmètre, zéro proposition de changement de contrat. Le contrat figé + le brief très précis (fichiers nommés, définition de fini en cases, ordre de sacrifice) fonctionnent.
- 23:15 — Les rapports au format imposé se lisent en 1 minute et donnent directement les points à vérifier. Les « Décisions prises » sont la matière du REX.
- 23:28 — La vérification en navigateur réel juste après l'intégration de la vague 1 a trouvé en 3 minutes un bug que 470 tests unitaires ne pouvaient pas voir (bouton Lien grisé : deux lots conformes à leurs briefs, incompatibles à l'intégration). Un playground vanilla sans framework, bundlé depuis les sources, est l'outil de vérification le plus rentable de la nuit.
- 23:40 — L'agent docs a typechecké tous ses exemples et compté programmatiquement commandes et variables CSS : zéro invention. C'est la méthode à imposer dans tout brief de documentation.
- 23:50 — L5 a contourné un blocage de config hors de son périmètre avec des tsconfigs temporaires passés en `--ts-config`, sans toucher aux fichiers interdits, et a documenté le correctif attendu en une ligne. C'est le comportement idéal face à une règle de périmètre : contourner, prouver, proposer.
- 23:50 — Version 0.2.0 testable dans Angular à 23:53, soit **1h20 après le GO**, contre 07:00 prévu. Le plan de nuit était calibré pour des agents 5 à 10 fois plus lents que la réalité.

## 🧱 Blocages et frictions

Notés au fil de l'eau, avec l'heure, la cause et le contournement.

- 22:20 — `python` absent de la machine, l'alias Windows renvoie vers le Store. Contournement : `node -e` pour parser du JSON en shell. Leçon : ne jamais supposer Python sur un poste Windows, Node est la seule certitude.
- 22:35 — Un heredoc bash multi-fichiers avec du contenu markdown français long a échoué au parsing. Contournement : outil d'écriture direct, un fichier par appel. Leçon : pour des docs longues, écrire fichier par fichier, pas en batch shell.
- 22:38 — Une variable d'environnement vide dans un `cd "$VAR"` a fait tomber la génération Angular dans le dossier du repo au lieu du scratchpad. Contournement : déplacement manuel. Leçon : toujours vérifier une variable avant un `cd` en script, ou utiliser un chemin absolu.
- 22:42 — TypeScript 6 refuse `baseUrl`, et `rootDir` casse avec des `paths` vers les sources d'autres paquets. Contournement : deux tsconfig par paquet, dev sans `rootDir`, build avec `paths: {}`. Leçon : séparer tsconfig de typecheck et de build dès le scaffold.
- 22:45 — Vitest échoue sur un paquet sans test. Contournement : `passWithNoTests`. Trivial mais ça aurait bloqué 4 agents au premier `npm run check`.
- 22:46 — Les worktrees git n'embarquent pas `node_modules`. Décision : agents dans l'arbre principal sur dossiers disjoints. À réévaluer si un agent déborde de son périmètre.
- 22:47 — Un `node -e` inline avec des backticks dans un script bash a été mangé par le shell et a vidé des mots du REX. Contournement : script dans un fichier `.cjs`. Leçon : jamais de code multi-lignes avec backticks en argument inline.
- 23:13 — Deux agents ont signalé que `Write`/`Edit` décodent ` ` en caractère littéral, ce qui déclenche ESLint `no-irregular-whitespace`. À mettre dans les briefs : utiliser `String.fromCharCode(160)`.
- 23:13 — Un agent a perdu du temps sur des heredocs bash avec des apostrophes françaises. À mettre dans les briefs : écrire les fichiers avec l'outil Write.
- 23:41 — L6 a lancé `npx vitest run -w packages/core` en croyant à un flag workspace : c'est le mode watch, processus orphelin à tuer. À mettre dans les briefs : `cd packages/x && npx vitest run`.
- 23:25 — `preview_start` a lu le `launch.json` du workspace parent et lancé un autre projet : les outils de preview ne sont pas fiables dans un sous-dossier d'un workspace multi-projets. Serveur lancé à la main.
- 23:50 — Le `tsconfig.json` généré par Angular CLI mettait `noPropertyAccessFromIndexSignature: true` à l'encontre de la base ; invisible tant qu'aucun projet Angular ne compilait le core via les `paths`. Leçon : en phase 0, diffuser les flags des tsconfigs générés contre la base, flag par flag, et compiler au moins un import croisé.
- 23:10 — Mon propre `sed` a mangé un `s` dans une regex en passant par le shell : commit de correction derrière. Leçon : pour patcher du code, passer par un script Node dans un fichier, jamais par sed avec des backslashes.

## 🧭 Décisions de process prises en route

| Heure | Décision                                                                              | Pourquoi                                                                                                         |
| ----- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 22:05 | Toolbar vanilla plutôt qu'Angular                                                     | Portabilité React/Vue demandée par Joris                                                                         |
| 22:05 | 4 paquets au lieu de 2                                                                | Lots disjoints pour le parallélisme, tree-shaking de mammoth                                                     |
| 22:30 | `tsc` pur au lieu d'un bundler pour les libs                                          | TS 6.0 imposé, moins d'outillage à risque, sortie ESM suffisante                                                 |
| 22:46 | Agents dans l'arbre principal, pas en worktree                                        | `node_modules` absent des worktrees sous Windows                                                                 |
| 23:25 | L7 sérialisé après L6 au lieu d'un parallélisme à 4                                   | Les deux touchent `create-aster.ts`, dictionnaires UI et CSS ; le temps ne manque pas, les conflits coûtent plus |
| 23:25 | Chaque lot UI ajoute sa propre feuille CSS (`images-tables.css`, `search-source.css`) | Éviter les conflits sur `base.css`, l'orchestrateur assemble dans `aster.css`                                    |

## 🧠 Leçons 🕐

### Ce que je referais pareil

- **Cadrage écrit avant tout code**, validé par Joris, avec un contrat d'API figé en phase 0 : 12 lots d'implémentation, zéro conflit de fichiers, zéro aller-retour sur le contrat pendant la vague 1.
- **Briefs très précis** : fichiers autorisés nommés, définition de fini en cases à cocher, ordre de sacrifice, format de rapport imposé. Les rapports se lisent en une minute et les « Décisions prises » sont la matière du REX.
- **Phase 0 avec smoke tests** des deux hypothèses techniques les plus risquées (Tiptap 3 sous jsdom, mammoth en navigateur) avant tout parallélisme.
- **Playground vanilla bundlé depuis les sources** : l'outil de vérification le plus rentable de la nuit, il a trouvé le premier bug d'intégration 5 minutes après la vague 1.
- **Revues adverses en lecture seule avec preuves exécutables**, un relecteur par paquet, puis un lot de correctifs par paquet. 54 findings sur du code à 94-99 % de couverture : les TU des agents testent ce qu'ils ont construit, la revue teste ce qu'ils n'ont pas imaginé.
- **E2E Playwright tôt** : 2 bugs invisibles sous jsdom (focus au mousedown, Échap capturé par ProseMirror).
- **Journal tenu après chaque lot** et briefs archivés : le REX s'écrit tout seul.

### Ce que je ferais différemment

- **Calibrer le plan sur des agents 5 à 10× plus rapides** que ce que j'avais prévu : la roadmap prévoyait 0.2.0 à 07:00, elle est tombée à 23:53. Prévoir dès le départ les vagues de durcissement, d'e2e et de features « could ».
- **Relire les tsconfigs générés par un CLI contre la base flag par flag** et compiler un import croisé en phase 0 : le flag `noPropertyAccessFromIndexSignature` a bloqué le lot Angular.
- **Mettre dans chaque brief les pièges d'outillage connus** dès qu'un agent les rencontre : ` ` converti par l'outil Write, `npx vitest run -w` = watch, heredocs bash avec apostrophes françaises. Trois agents ont payé le même piège.
- **Lancer les revues adverses dès qu'un paquet est stable**, pas en fin de nuit : elles sont indépendantes et c'est elles qui ont trouvé les vrais bugs.
- **Une feuille CSS par lot** dès le début (fait à partir de la vague 2) et un fichier de dictionnaire i18n par lot pour éviter la sérialisation L6 → L7.
- **Ne jamais patcher du code par `sed`/`node -e` inline avec des backslashes** : deux commits de correction à cause du shell.

### Ce qui a surpris

- La **qualité des rapports d'agents** : décisions argumentées, blocages contournés sans sortir du périmètre, propositions de contrat pertinentes (toutes additives). Aucun agent n'a touché un fichier interdit en 16 lots.
- Un agent bloqué par une config hors de son périmètre (L5) a construit un tsconfig temporaire pour vérifier son lot, l'a supprimé, et a documenté le correctif en une ligne.
- Les relecteurs ont systématiquement produit des **fichiers de preuve** qui passent au rouge après correction : un contrat de test implicite entre deux agents qui ne se parlent pas.
- Le coût d'intégration orchestrateur par lot : 3 à 8 minutes (check scoped, lecture du rapport, revue rapide, commit par chemins, journal). Le goulot n'est pas le dev, c'est la lecture.

## 📐 Méthode recommandée pour la prochaine nuit 🕐

Version condensée et réutilisable, à transformer en skill si elle tient la route.

1. **Cadrage avec le demandeur, 30 min** : finalité, contraintes, nom, stack. Écrire pendant le cadrage : `CLAUDE.md` projet, cahier des charges MoSCoW avec critères d'acceptation mesurables, architecture avec contrats d'API, stratégie de tests avec seuils, roadmap par lots, template de brief, journal, REX vide. Faire valider.
2. **Phase 0 solo, 15 à 30 min** : scaffold, toutes les dépendances, lint/typecheck/test/build verts à vide, **smoke tests des 2 ou 3 hypothèses techniques les plus risquées**, contrat d'API en types figés, fixtures, CI, playground de vérification bundlé depuis les sources. Relire les configs générées par un CLI contre la base. Commit.
3. **Vague 1 : 4 agents sur des lots disjoints par paquet**, dans l'arbre principal, chacun avec un brief qui nomme les fichiers autorisés, la définition de fini en cases, l'ordre de sacrifice, les pièges d'outillage connus, et le format de rapport. Intégrer chaque rendu dès réception : check scoped, revue, commit par chemins, entrée de journal, métriques REX.
4. **Vérifier en navigateur réel dès que le premier assemblage existe**, avant de lancer la vague suivante : c'est là que les bugs d'intégration apparaissent.
5. **Vague 2 : lots produit** (wrapper framework, features avancées) et un lot documentation qui typechecke ses exemples. Sérialiser deux lots qui partagent des fichiers plutôt que de les paralléliser.
6. **Vague 3 : un relecteur adverse en lecture seule par paquet**, avec preuves exécutables obligatoires, puis un lot de correctifs par paquet. Lancer chaque revue dès que son paquet est stable, pas en fin de nuit. Ajouter les e2e tôt : ils trouvent ce que jsdom ne voit pas.
7. **Vague 4 : features bonus** tant que le temps le permet, puis une revue de chaque nouveau lot.
8. **Gel** : check complet, build, e2e, bump, changelog, rafraîchissement de la doc sur l'état final par un agent qui typechecke, bilan en 5 minutes de lecture, REX, mémoire.
9. **Règles pour l'orchestrateur** : ne jamais patcher du code par shell inline avec des backslashes (même un heredoc quoté a mangé un `\\` cette nuit) ; ne pas faire tourner deux agents qui exécutent des e2e en même temps ; tenir le journal après chaque lot ; archiver les briefs.

---

# 🔁 REX session 2 — 16 → 19 octobre 2026 (variables Word, parité CKEditor)

> Même méthode que la session 1, avec les leçons appliquées : revues adverses dès qu'un lot est intégré, pièges d'outillage dans chaque brief, un serveur par port, tests d'intégration réels imposés dans les briefs de correctifs.

## 📊 Métriques par lot

| Lot                       | Durée agent      | Tokens             | Outils       | Tests ajoutés       | Findings revue (bloquants/mineurs)             |
| ------------------------- | ---------------- | ------------------ | ------------ | ------------------- | ---------------------------------------------- |
| Phase 0 (orchestrateur)   | 25 min           | —                  | —            | 0                   | —                                              |
| L13 core-variables        | 16 min           | 221k               | 69           | +57                 | R14 : 5/9 (avec ui)                            |
| L14 ui-variables          | 15 min           | 248k               | 98           | +42                 | idem                                           |
| L15 word-import-variables | 23 min           | 252k               | 86           | +128                | R15 : 2/11                                     |
| L16 word-export-fidélité  | 25 min           | 301k               | 96           | +45                 | R16 : 3/10                                     |
| L17 angular-modèle        | 15 min           | 187k               | 80           | +12                 | —                                              |
| L18 parité                | 27 min           | 325k               | 113          | +57                 | 1 bug trouvé en navigateur (sommaire dupliqué) |
| L20 fix variables         | 17 min           | 261k               | 101          | +25                 | 14/14 corrigés                                 |
| R14 / R15 / R16           | 14 / 13 / 13 min | 231k / 197k / 189k | 69 / 32 / 31 | preuves exécutables | 10 bloquants, 30 mineurs au total              |
| L21 fix import            | 21 min           | 224k               | 65           | +45                 | 15/15 corrigés                                 |
| L22 fix export            | 13 min           | 207k               | 88           | +19                 | 13/13 corrigés                                 |
| L19a e2e                  | 9 min            | 168k               | 51           | +14 e2e             | 1 bug trouvé (Entrée menu /)                   |
| L19b docs                 | 22 min           | 403k               | 116          | —                   | 11 fichiers, 8 écarts code-docs corrigés       |

## ✅ Ce qui a mieux marché qu'en session 1

- **Revues lancées dès l'intégration de chaque lot** : les 3 revues ont tourné pendant que les lots suivants se développaient, et leurs lots de correctifs ont démarré sans attendre la fin de la vague.
- **Contrat des variables écrit en phase 0 et respecté par 5 lots en parallèle** sans aucun aller-retour ; une seule collision (nom de type `DocxVariableOptions`) résolue par les agents eux-mêmes.
- **Tests d'intégration réels imposés** dans le brief de correctifs : c'est ce qui a masqué le bug « Entrée dans le menu `{{` » dans 42 tests sur mock.
- Vérification en navigateur par l'orchestrateur après chaque intégration : 2 bugs trouvés (valeurs perdues à la réimportation `fields`, sommaire dupliqué).

## 📐 Ce que la session 2 ajoute à la méthode

1. **Lancer les revues dès l'intégration de chaque lot et les lots de correctifs dès le rapport de revue** : les trois revues et leurs correctifs ont tourné pendant que la vague 2 se développait. Coût : zéro attente, 41 findings corrigés avant le gel.
2. **Imposer des tests d'intégration réels dans les briefs de correctifs** (vrai core, vrai `keydown`) : les deux bugs « Entrée coupe le paragraphe » (menu `{{`, menu `/`) étaient invisibles dans 60 tests sur mock.
3. **Un même bug dans deux composants jumeaux** (`registerPlugin` sans ordre) : quand un correctif touche un pattern, grep les autres usages du pattern avant de clore (fait a posteriori ici par l'agent e2e).
4. **Chaque relecteur reçoit la liste des fichiers qu'un autre agent modifie en ce moment** et un périmètre de lecture : aucune revue n'a été polluée par du code en cours.
5. **Garantir le lockstep d'un écosystème** (Tiptap) par le lockfile, et vérifier l'absence de copies imbriquées après chaque `npm install`. Correction du 19/10 : l'épinglage **exact** dans les paquets publiés (0.4.1) était une erreur, il multipliait les copies de `@tiptap/core` chez les consommateurs ; les intervalles publiés restent en caret, c'est le test d'installation à blanc qui garde le compte des copies.

## 🧱 Frictions nouvelles

- `@tiptap/suggestion@^3.31.4` résolu en 3.32.0 avec une seconde copie de `@tiptap/core` imbriquée → 100 erreurs de types. Épingler Tiptap en exact et vérifier `find … @tiptap/core/package.json` après toute installation.
- Un agent a arrêté le serveur `ng serve` de l'orchestrateur (même port). Règle : ne jamais arrêter un serveur qu'on n'a pas lancé.
- Horodatages du journal estimés par l'orchestrateur pendant une heure, décalés de ~1h30 par rapport à l'horloge : toujours lire `date`.

## 🌙 Session 3 — fidélité de mise en page Word (20 octobre 2026)

### 📊 Métriques par lot

| Lot                                | Durée agent      | Tokens | Outils | Tests ajoutés | Résultat                                               |
| ---------------------------------- | ---------------- | ------ | ------ | ------------- | ------------------------------------------------------ |
| Phase 0 (orchestrateur)            | 25 min           | —      | —      | +5            | contrat, squelette du lecteur, briefs                  |
| L22 fixtures                       | 13 min           | 190k   | 49     | —             | 7 fixtures de mise en page                             |
| L23 core mise en page              | 30 min           | 363k   | 158    | +114          | sérialiseur verbatim, vue page                         |
| L24 lecteur styles/runs            | 22 min           | 267k   | 58     | +70           | résolution des styles, champs                          |
| L25 lecteur blocs                  | 25 min           | 322k   | 62     | +72           | tableaux, listes, images, notes, sections              |
| L26 ui mise en page                | 25 min           | 342k   | 83     | +86           | 8 widgets, page.css                                    |
| L27 export dans le gabarit         | 54 min           | 641k   | 247    | +60           | greffe, fixtures 11 et 13 à l'octet                    |
| L28 / L28b / L28c fidélité         | 26 + 11 + 19 min | 785k   | 301    | +101          | compareDocx, scores, propriétés effectives             |
| L29 angular / démo                 | 2 × 25 min       | 383k   | —      | +17           | interrompu par la limite, repris sans perte            |
| L30 pagination                     | 22 min           | 244k   | 71     | +26           | 4 000 ¶ en 11 ms                                       |
| L31 docs                           | 34 min           | 602k   | 210    | —             | 11 documents, compteurs recalculés                     |
| L32 e2e                            | 13 min           | 221k   | 80     | +7 e2e        | 2 bugs navigateur trouvés                              |
| R23-R27, R30 (6 revues)            | 11 à 20 min      | 1,6M   | 303    | —             | 73 findings prouvés, 3 bloquants                       |
| F23, F23b, F24, F25, F26, F27, F30 | 15 à 31 min      | ≈ 2,1M | ≈ 700  | +150          | tous les findings corrigés avec test de non-régression |

Total : ≈ 8 M tokens d'agents, 1 262 → 1 994 tests unitaires, 35 → 42 e2e, GO → 0.5.0 en 6 h dont 1 h 20 de limite de session.

### ✅ Ce qui a marché

1. **Un dossier partagé, des fichiers disjoints, un contexte figé** : les deux lots du lecteur (L24, L25) ont travaillé dans `reader/` sans conflit, grâce à des stubs à signature figée et au `ConverterContext` comme seule interface. Même recette pour les deux lots de correctifs du core (F23 / F23b) séparés par fichier.
2. **Revues lancées à l'intégration, correctifs lancés au rapport** : 73 findings traités avant le gel, dont trois bloquants (XSS dans l'assainisseur, `colspan` qui tue le core, ordre des marques). Le coût est réel (≈ 3,7 M tokens revues + correctifs) mais chaque finding est devenu un test.
3. **Le document client a changé la session** : en-têtes hérités entre sections, champ imbriqué, `mc:AlternateContent`, `numId 0`, styles localisés (`Lienhypertexte`) : aucun de ces cas n'était dans les fixtures synthétiques. Règle : **un vrai document avant le brief, pas après.**
4. **Un score plutôt qu'une impression** : le rapport de fidélité a orienté L27 (réconciliation contre les `docDefaults` découverte par la mesure : 159 runs passaient de Calibri à Times) et borné la discussion sur « c'est fidèle ».
5. **La reprise après limite de session** : un agent interrompu reprend par `SendMessage` avec son transcript ; aucune perte.

### 🧱 Frictions nouvelles

1. **jsdom ment sur la sérialisation XML** : Chromium réémet la déclaration `<?xml?>`, jsdom non. Deux bugs invisibles par 1 900 tests unitaires (prétraitement des champs : chemin stylé vide dans le navigateur ; greffe : `document.xml` invalide), trouvés par L29 et L32 en navigateur. **Règle : tout lot qui écrit du XML ou du HTML sérialisé par le navigateur livre un e2e réel, et le relecteur l'exige.**
2. **Les fixtures « hostiles » faites à la main ne reproduisent pas Word** : la fixture 17 n'avait pas la forme réelle des dessins (`mc:AlternateContent`). Sans Word, recopier les enveloppes connues du format.
3. **Deux agents sur un même fichier d'utilitaires** (`units.ts` / `units-blocks.ts`) : doublon partiel à fusionner. Le brief doit nommer le propriétaire d'un fichier partagé **avant** le lancement.
4. **Fichiers > 400 lignes** : six agents ont dépassé la règle sous la pression du périmètre ; les relecteurs l'ont relevé, les lots de correctifs ont découpé. Mettre la règle dans la définition of done des briefs, pas seulement dans `CLAUDE.md`.
5. **Les timestamps du journal** : l'orchestrateur a écrit trois fois une heure estimée au lieu de lire `date`. Lire l'horloge avant chaque entrée.

### 📐 Ce que la session 3 ajoute à la méthode

1. Déposer les documents réels du client dans `fixtures/docx/client/` (hors dépôt) **avant** la phase 0 ; tous les lots les reçoivent comme critère obligatoire.
2. Un e2e en navigateur réel par lot qui sérialise du XML ou du HTML, exigé par le relecteur.
3. Les lots de correctifs reprennent chaque preuve du relecteur comme test, et le relecteur suivant vérifie que c'est fait.
4. Nommer le propriétaire de chaque fichier partagé dans les briefs ; les helpers communs sont écrits en phase 0.
5. Un rapport intermédiaire d'agent toutes les 20 minutes (une ligne dans son rapport final suffit), pour qu'une interruption de session ne coûte rien.
