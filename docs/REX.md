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

| Lot | Lancé | Rendu | Durée agent | Check initial | Allers-retours | Tests | Couv. | Findings revue (bloquant/mineur) | Changements de contrat proposés |
|-----|-------|-------|-------------|---------------|----------------|-------|-------|----------------------------------|----------------------------------|
| P0 | | | | | | | | | |
| L1 core | | | | | | | | | |
| L2 word-paste | | | | | | | | | |
| L3 word-docx | | | | | | | | | |
| L4 ui | | | | | | | | | |
| L5 angular+démo | | | | | | | | | |
| L6 tables/images | | | | | | | | | |
| L7 should | | | | | | | | | |
| L8 docs | | | | | | | | | |
| R1-R4 revues | | | | | | | | | |

### Globales

| Métrique | Valeur |
|----------|--------|
| Heure de début phase 0 | |
| Heure du gel | |
| Commits sur `develop` | |
| Versions publiées | |
| Lignes de code hors tests | |
| Lignes de tests | |
| Nombre de tests | |
| Couverture globale | |
| Temps orchestrateur en intégration (estimé) | |
| Temps orchestrateur en attente d'agents (estimé) | |
| Agents relancés ou re-briefés | |
| Changements de contrat acceptés | |
| Compactions de contexte subies | |

## ⏳ Chronologie réelle vs cible 🕐

| Phase | Cible | Réel | Écart | Cause |
|-------|-------|------|-------|-------|
| Cadrage | 22:30–23:00 | | | |
| Phase 0 | 23:00–00:30 | | | |
| Vague 1 | 00:30–03:30 | | | |
| Intégration 1 | 03:30–04:15 | | | |
| Vague 2 | 04:15–06:30 | | | |
| Intégration 2 | 06:30–07:00 | | | |
| Vague 3 | 07:00–07:30 | | | |
| Gel | 07:30–08:15 | | | |

## ✅ Bons points

Notés au fil de l'eau, avec l'heure.

- 22:10 — Vérifier les versions réelles sur le registre npm avant d'écrire les docs a évité une erreur de cible : TypeScript 7 est sorti mais Angular 22 pin TS 6.0.x. Sans cette vérification, la phase 0 aurait démarré sur une version incompatible.
- 22:15 — Vérifier la disponibilité des noms npm en 30 secondes a tranché le débat sur le nom avec des faits.

## 🧱 Blocages et frictions

Notés au fil de l'eau, avec l'heure, la cause et le contournement.

- 22:20 — `python` absent de la machine, l'alias Windows renvoie vers le Store. Contournement : `node -e` pour parser du JSON en shell. Leçon : ne jamais supposer Python sur un poste Windows, Node est la seule certitude.
- 22:35 — Un heredoc bash multi-fichiers avec du contenu markdown français long a échoué au parsing. Contournement : outil d'écriture direct, un fichier par appel. Leçon : pour des docs longues, écrire fichier par fichier, pas en batch shell.

## 🧭 Décisions de process prises en route

| Heure | Décision | Pourquoi |
|-------|----------|----------|
| 22:05 | Toolbar vanilla plutôt qu'Angular | Portabilité React/Vue demandée par Joris |
| 22:05 | 4 paquets au lieu de 2 | Lots disjoints pour le parallélisme, tree-shaking de mammoth |
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
