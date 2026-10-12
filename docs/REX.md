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

| Lot              | Lancé | Rendu | Durée agent | Check initial | Allers-retours | Tests | Couv. | Findings revue (bloquant/mineur) | Changements de contrat proposés |
| ---------------- | ----- | ----- | ----------- | ------------- | -------------- | ----- | ----- | -------------------------------- | ------------------------------- |
| P0               |       |       |             |               |                |       |       |                                  |                                 |
| L1 core          |       |       |             |               |                |       |       |                                  |                                 |
| L2 word-paste    |       |       |             |               |                |       |       |                                  |                                 |
| L3 word-docx     |       |       |             |               |                |       |       |                                  |                                 |
| L4 ui            |       |       |             |               |                |       |       |                                  |                                 |
| L5 angular+démo  |       |       |             |               |                |       |       |                                  |                                 |
| L6 tables/images |       |       |             |               |                |       |       |                                  |                                 |
| L7 should        |       |       |             |               |                |       |       |                                  |                                 |
| L8 docs          |       |       |             |               |                |       |       |                                  |                                 |
| R1-R4 revues     |       |       |             |               |                |       |       |                                  |                                 |

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
- 23:10 — Mon propre `sed` a mangé un `s` dans une regex en passant par le shell : commit de correction derrière. Leçon : pour patcher du code, passer par un script Node dans un fichier, jamais par sed avec des backslashes.

## 🧭 Décisions de process prises en route

| Heure | Décision                                     | Pourquoi                                                         |
| ----- | -------------------------------------------- | ---------------------------------------------------------------- |
| 22:05 | Toolbar vanilla plutôt qu'Angular            | Portabilité React/Vue demandée par Joris                         |
| 22:05 | 4 paquets au lieu de 2                       | Lots disjoints pour le parallélisme, tree-shaking de mammoth     |
| 22:30 | `tsc` pur au lieu d'un bundler pour les libs | TS 6.0 imposé, moins d'outillage à risque, sortie ESM suffisante |

## 🧠 Leçons 🕐

### Ce que je referais pareil

-

### Ce que je ferais différemment

-

### Ce qui a surpris

-

## 📐 Méthode recommandée pour la prochaine nuit 🕐

Version condensée et réutilisable, à transformer en skill si elle tient la route.

1.
2.
3.
