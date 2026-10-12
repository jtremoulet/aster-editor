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

| Métrique                                         | Valeur |
| ------------------------------------------------ | ------ |
| Heure de début phase 0                           |        |
| Heure du gel                                     |        |
| Commits sur `develop`                            |        |
| Versions publiées                                |        |
| Lignes de code hors tests                        |        |
| Lignes de tests                                  |        |
| Nombre de tests                                  |        |
| Couverture globale                               |        |
| Temps orchestrateur en intégration (estimé)      |        |
| Temps orchestrateur en attente d'agents (estimé) |        |
| Agents relancés ou re-briefés                    |        |
| Changements de contrat acceptés                  |        |
| Compactions de contexte subies                   |        |

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

1.
2.
3.
