# Brief — Lot L17 : variables dans `@aster-editor/angular` et page démo « Modèle »

> Session 2, vague 2. Envoyé après intégration de L13-L16. Cible 1h30.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION2.md`, `packages/core/src/api/variables.ts`, `packages/angular/src/lib/aster-editor.component.ts` + spec + README, `apps/demo/src/app/pages/import.page.ts` (dropzone existante), `packages/word/src/index.ts` (`importDocx` → `result.variables`, `exportDocx` → `options.variables`), `packages/ui/src/types.ts` (`variableSuggestion`).

## Lot

### Composant
- Inputs : `variables: readonly AsterVariable[] | undefined` (déclarations), `variableValues: VariableValues | undefined`, `variableResolver: VariableResolver | undefined`, `allowUnknownVariables: boolean | undefined`, `variableSuggestion: boolean | undefined` → fusionnés dans `options.variables` et `variableSuggestion` de `createAster`. À chaud : `variableValues` → `editor.variables.setValues`, `variables` → `define`.
- Output `variablesChanged: VariableValues` (sur `variablesChange`), et `variableNames` en signal calculé (`editor.variables.getNames()` rafraîchi sur `change` et `variablesChange`).
- Méthodes : `getHTML(options?)` (délègue), `resolveVariables()` (délègue `editor.variables.resolve()`), `exportDocx(options?: DocxExportOptions)` (import dynamique de `word`, applique `variables.values` depuis le store si non fournis, retourne le `Blob`), `importDocx` existant : après import, `define(result.variables)` et appliquer les valeurs connues.
- Tests : inputs à chaud, output, `exportDocx` avec un `exportDocx` mocké (`vi.mock('@aster-editor/word')`), `importDocx` déclare les variables trouvées.

### Démo : page `/template` « Modèle »
1. Dropzone `.docx` (réutilise le pattern de `/import`) ou bouton « Charger l'exemple » (fixture servie depuis `apps/demo/public/samples/08-variables-braces.docx` — copie le fichier là, c'est dans ton périmètre).
2. Après import : formulaire généré depuis `variableNames()` (un champ texte par variable, libellé depuis `editor.variables.list()`), bouton « Appliquer » → `variableValues`, indicateur « n variables sans valeur ».
3. Aperçu : onglet « Puces » (éditeur), onglet « Résolu » (HTML `getHTML({ variables: 'resolve' })` rendu dans un `<div class="aster-content">` en lecture seule).
4. Export : « Télécharger résolu » (`variables.mode = 'resolve'`), « Télécharger avec champs Word » (`'fields'`), « Télécharger modèle » (`'placeholders'`).
5. Test de page (création, exemple chargé via `fetch` mocké ou `it.skip` documenté, formulaire rendu).
Navigation : lien « Modèle » dans `app.html`, route avec `title`.

### README du paquet
Section « Variables et modèles » : inputs/outputs, exemple complet formulaire + export.

## Périmètre

✅ `packages/angular/src/**`, `packages/angular/README.md`, `apps/demo/src/**`, `apps/demo/public/samples/**`. ❌ tout le reste (`angular.json` : propose si besoin).

## Vérification

`npx prettier --write packages/angular apps/demo`, `npx eslint packages/angular apps/demo`, `npm run typecheck`, `npx ng test aster-angular --watch=false`, `npx ng test demo --watch=false`, `npx ng build demo` (budget 1 MB initial : `word` reste en chunk lazy). Pièges : outil Write, pas de `\u00a0`, Angular 22 signals (`input()`, `output()`, `effect`, `computed`), zoneless, `strictTemplates`.

## Rapport attendu

`## Rapport Lot L17` : Fait / Non fait / Décisions / Blocages / Propositions de contrat / Changements angular.json proposés / Tests / Fichiers / Points à vérifier.
