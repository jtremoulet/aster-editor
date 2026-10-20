# 📨 Template de brief pour un sous-agent

> Copié-collé par l'orchestrateur pour chaque lot, trous remplis. Un brief complet évite 80 % des allers-retours.
> Le rapport de fin, en bas, est le format que l'agent doit rendre. Il nourrit `REX.md`.

---

## Brief — Lot `<ID>` : `<titre>`

### Contexte

Tu travailles sur **Aster Editor**, éditeur de texte riche MIT basé sur Tiptap 3, monorepo npm à `C:\workspace\aster-editor`. Lis dans l'ordre : `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/STRATEGIE_TESTS.md`. Le contrat d'API dans `packages/core/src/api/` est **figé** : tu codes contre lui, tu ne le modifies pas.

### Ton lot

`<description en 3 à 6 lignes de ce qui doit exister à la fin>`

### Périmètre fichiers

- ✅ Tu écris uniquement dans : `<liste de dossiers/fichiers>`
- ❌ Tu ne touches jamais à : `package.json`, lockfile, `tsconfig*`, `CHANGELOG.md`, `docs/`, `.github/`, les autres paquets, `packages/core/src/api/`.
- ❌ Aucune dépendance ajoutée. Tout est installé. Si quelque chose manque, contourne et signale-le dans le rapport.

### Points d'attention techniques

- Lis les types réels dans `node_modules/@tiptap/<paquet>/dist/index.d.ts` avant d'utiliser une API Tiptap. La v3 n'est pas la v2.
- `<spécificités du lot : ex. "toutes les fonctions du normaliseur prennent un Document en paramètre, jamais de document global">`
- TypeScript strict, zéro `any`. Code en anglais, commentaires JSDoc en français sur chaque export.
- Chaînes utilisateur via i18n, jamais en dur.

### Définition de fini

- [ ] `<critère fonctionnel 1>`
- [ ] `<critère fonctionnel 2>`
- [ ] Tests écrits selon `docs/STRATEGIE_TESTS.md`, section `<paquet>`. Couverture ≥ `<N>` %.
- [ ] `npm run test -w packages/<paquet>` vert.
- [ ] `npm run typecheck` et `npm run lint` verts sur ton périmètre.
- [ ] Aucun commit. L'orchestrateur intègre.

### Temps

Cible : `<durée>`. Si à 70 % du temps tu n'as pas 70 % de la définition de fini, réduis le périmètre et dis-le dans le rapport plutôt que de rendre quelque chose de cassé. Du rouge coûte plus cher qu'un périmètre réduit.

### Rapport attendu

Rends **exactement** cette structure en fin de tâche, en français :

```markdown
## Rapport Lot <ID>

### Fait

- ...

### Non fait et pourquoi

- ...

### Décisions prises

- <décision> : <raison>

### Blocages rencontrés

- <blocage> : <comment contourné, ou non>

### Propositions de changement de contrat

- <fichier api> : <changement> : <justification> (ou "aucune")

### Tests

- Nombre : N, couverture : X %, commande pour rejouer : ...

### Fichiers créés ou modifiés

- ...

### Points à vérifier par l'orchestrateur

- ...
```
