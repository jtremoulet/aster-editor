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
