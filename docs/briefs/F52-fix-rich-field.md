# Brief — Lot F52 : correctifs de la revue R52 (éditeur minimal des en-têtes, variantes, défauts)

> Session 5. Cible 40 min. Lis `CLAUDE.md`, `docs/reviews/R52.md` (preuves à reproduire **en tests**), `docs/briefs/L54-dialog-headers.md`, `docs/briefs/L52-page-view-poc.md`.

## Lot

1. **R52-01** : `normalizeFieldHtml` déballe un `<div>` (ou `td`, `li` nu) qui contient un bloc au lieu de le renommer, re-parse avant de sérialiser ; `read → set → read` est un point fixe et la valeur appliquée est identique au rendu `sanitizeHeaderFooterHtml` (test d'égalité sur dix formes).
2. **R52-02** : un bloc stylé (bordure, fond), un `<hr>`, un paragraphe vide **entre** deux blocs comptent comme contenu visible ; un jeu d'en-têtes n'est réécrit que si le champ a été modifié (drapeau `input` / `keydown` / `paste`) ; « Appliquer » sans édition laisse `headers` / `footers` strictement identiques (même référence).
3. **R52-03** : un type masqué (`first` quand `titlePage` est décoché, `even` quand « Pages paires » est décochée) **conserve** `original[type]` (le lecteur lit `first` indépendamment de `w:titlePg` ; seul `titlePage` porte le choix, comme Word) ; `headersHint` le dit. Test : `{headers:{default, first}, titlePage:false}` → Appliquer à vide → `first` conservé.
4. **R52-04** : `normalizeFieldHtml` retire les déclarations `inherit` et déballe les `<span>` sans attribut (fusion de paragraphes Chromium) ; retire aussi `class` et `style="position…"` étrangers (dette citée).
5. **R52-05** : première page d'une section `titlePage` → `first ?? default` (jamais `even`), doc et code alignés.
6. **R52-06** : bornes testées sur la valeur arrondie (`<= 0` → `null`) dans `page-view-defaults.ts`.
7. **R52-07** : dialogue `min-width: min(520px, 90vw)`, colonnes en `flex-wrap`.
8. `rich-field.spec.ts` propre (y loger 1, 2, 4).

## Périmètre

✅ `packages/ui/src/components/rich-field.ts`, `page-layout-headers.ts`, `page-layout-dialog.ts` (lignes R52-02/03), i18n ui, `page.css` (bloc du dialogue), specs ; `packages/core/src/extensions/page-view-variants.ts`, `page-view-defaults.ts`, specs. ❌ `api/**`, `word`, `angular`, `docs/`.

## Vérification

`cd packages/ui && npx vitest run`, `cd packages/core && npx vitest run` (jamais `-w`), `tsc`, eslint, prettier ; `npx playwright test -c e2e/playwright.config.ts --project=playground headers-dialog.spec.ts`.

## Rapport attendu

`## Rapport Lot F52` : tableau finding → correctif → test ; Non fait ; Tests (compteurs) ; Fichiers.
