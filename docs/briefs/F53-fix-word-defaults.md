# Brief — Lot F53 : correctifs de la revue R53 (défauts de paragraphe, contrôles liés, codemod)

> Session 5. Cible 40 min. Lis `CLAUDE.md`, `docs/reviews/R53.md` (preuves dans `C:\Users\Joris\AppData\Local\Temp\claude\C--workspace\6da28716-9c97-4474-a9ce-9218f14ae4a9\scratchpad\lab\probe.mjs`, à reproduire **en tests**), `docs/briefs/L53-word-defaults-fields.md`, `docs/briefs/L51-packaging-esm.md`.

## Lot

1. **R53-01 (régression)** : le lecteur retranche les quatre clés d'espacement (`lineHeight`, `lineHeightPt`, `spacingBeforePt`, `spacingAfterPt`) contre `defaultParagraphOf(ctx.styles)` (docDefaults puis `Normal`), et écrit explicitement le défaut Word (interligne 1, 0 pt) sur un paragraphe résolu sans valeur quand le document a un défaut différent ; les autres propriétés restent retranchées contre `docDefaults`. Attendu 13 régénéré (diff cité), test `default-paragraph.spec.ts:144` corrigé, cas `probe.mjs` A, B, B2 et la fixture 13 (export neuf → import, `compareDocx` sans perte `paragraph.lineHeight` / `spacingAfterPt`) en tests.
2. **R53-02** : `w:dataBinding` n'est structurel que si `w:tag` est vide ou absent, **ou** si `w:xpath` vise les propriétés du document (`coreProperties`, `extended-properties`, `customProperties`, `dc:` / `cp:` / `ep:` / `op:`) ; un contrôle lié à un XML personnalisé avec `w:tag` nommé reste une variable (contrat session 2). Cas E1 / E1b et la fixture 20 en tests.
3. **R53-03** : `toDefaultParagraph` ignore `lineHeightPt <= 0`, borne `before` / `after` à `>= 0` (idéalement dans `applySpacing`) ; idempotence sur le cas C.
4. **R53-04** : `lineRule` inconnu → ignoré ; `atLeast` **non transporté** dans `defaultParagraph` (ni réécrit en `exact`) ; comportement par paragraphe inchangé, documenté en JSDoc et dans `packages/word/README.md` (une ligne).
5. **R53-06 / R53-07** : `scripts/add-js-extensions.mjs` ignore les lignes de commentaire (`^\s*(//|\*)`) et les chaînes (n'accepte que `import` / `export` en tête d'instruction ou `import(`), `--check` rend 1 sur un spécificateur non résolu ; cas de test dans un dossier jetable du scratchpad, cités dans le rapport.
6. **R53-08** : les trois `build` des paquets vanilla vident `dist` avant `tsc` (`node -e "require('fs').rmSync('dist',{recursive:true,force:true})" && tsc …`, zéro dépendance) : **lignes proposées dans le rapport, tu ne modifies pas les `package.json`** ; `scripts/smoke-install.mjs` ajoute le `grep` « aucun spécificateur relatif sans extension dans `dist` » sur les tarballs.
7. `fixtures/docx/README.md` : écart `semantic` sur la 20 (mammoth ne rend pas les résultats de `w:fldSimple`) noté.

## Périmètre

✅ `packages/word/src/**`, `fixtures/docx/expected/**`, `fixtures/docx/README.md`, `packages/word/README.md` (une ligne), `scripts/add-js-extensions.mjs`, `scripts/smoke-install.mjs`. ❌ `core`, `ui`, `angular`, `docs/`, `package.json`.

## Vérification

`cd packages/word && npx vitest run` (jamais `-w`), `tsc --noEmit`, eslint, prettier ; `node scripts/add-js-extensions.mjs --check` rend 0 sur le dépôt ; scores 11-20 remesurés (aucun ne baisse ; 13 cité avant / après en neuf).

## Rapport attendu

`## Rapport Lot F53` : tableau finding → correctif → test ; Non fait ; Lignes `package.json` proposées ; Scores ; Tests (compteurs) ; Fichiers.
