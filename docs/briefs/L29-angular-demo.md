# Brief — Lot L29 : fidélité Word dans `@aster-editor/angular` et la démo

> Session 3, vague 2. Envoyé après intégration de L23-L27. Cible 1h30.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION3.md`, **`packages/core/src/api/layout.ts`**, `packages/word/src/docx/types.ts` (`DocxImportResult.layout` / `template` / `lost`, `fidelity`), `packages/word/src/export/types.ts` (`DocxExportOptions.template` / `layout`), `packages/word/src/docx/compare/types.ts` (`compareDocx`, `FidelityReport`), `packages/angular/src/lib/aster-editor.component.ts` + spec + README (636 lignes : extrais la logique Word dans `lib/word.ts` si tu dépasses 700, en gardant l'API publique), `apps/demo/src/app/pages/template.page.ts` (page « Modèle »), `apps/demo/src/app/pages/import.page.ts`, `packages/ui/src/create-aster.ts` (`pageView`, dialogue « Mise en page »).

## Lot

### Composant

- `importDocx(file)` : conserve `result.template`, `result.layout` et `result.lost` dans des signals `importedTemplate()`, `layout()`, `lostObjects()` ; applique `layout` à la vue page si `pageView` est actif (`editor.setPageView({ layout })`). Input `importFidelity: 'styled' | 'semantic' | undefined` (défaut : celui de `word`, donc `styled`).
- `exportDocx(options)` : si `options.template` est absent et qu'un gabarit importé existe, l'utilise (`template: importedTemplate()`), sauf `options.template === null`… **non** : `DocxInput | undefined` seulement ; ajoute un input `exportInTemplate: boolean` (défaut `true`) qui gouverne ce comportement, documente. Sans gabarit : `layout: layout()` transmis.
- Input `pageView: boolean | PageViewOptions | undefined` → option `createAster` ; output `layoutChanged: DocumentLayout` quand le dialogue « Mise en page » change la vue (événement DOM ou méthode du core selon ce que L23 a livré : lis son rapport dans `docs/JOURNAL.md`).
- Méthode `compareWithTemplate(): Promise<FidelityReport | null>` : export dans le gabarit puis `compareDocx(template, exported)` ; `null` sans gabarit. Import dynamique de `word` comme `exportDocx`.
- Tests : `importDocx` conserve gabarit et layout, `exportDocx` passe `template` par défaut et le retire avec `exportInTemplate=false`, `pageView` transmis, `compareWithTemplate` avec `compareDocx` mocké.

### Démo

- Page « Modèle » : case « Vue page » (liée à `pageView`), zone « En-tête / Pied » affichant `layout().headers?.default?.html` et `footers` en lecture seule sous l'éditeur si la vue page est inactive, bouton « Rapport de fidélité » → `compareWithTemplate()` → tableau (groupe, propriété, conservé/total, exemples) + score, liste « Objets non représentables » depuis `lostObjects()` ; bouton « Télécharger (gabarit) » qui exporte dans le gabarit, les boutons existants gardant l'export neuf.
- Page « Import » : sélecteur `styled` / `semantic` et affichage de `layout.page` (format, orientation, marges).
- Fixtures servies : copie `fixtures/docx/13-styles-nommes.docx` et `16-sections.docx` dans `apps/demo/public/samples/` (ton périmètre) avec un bouton « Charger l'exemple stylé ».
- Tests de page (création, rendu du rapport avec un `compareWithTemplate` mocké, liste des objets perdus).

### README du paquet

Section « Fidélité Word » : import stylé, vue page, export dans le gabarit, rapport de fidélité, limites (pas de pagination, objets non représentables).

## Périmètre

✅ `packages/angular/src/**`, `packages/angular/README.md`, `apps/demo/src/**`, `apps/demo/public/samples/**`. ❌ tout le reste (`angular.json` : propose si besoin).

## Vérification

`npx prettier --write packages/angular apps/demo`, `npx eslint packages/angular apps/demo`, `npm run typecheck`, `npx ng test aster-angular --watch=false`, `npx ng test demo --watch=false`, `npx ng build demo` (budget initial : `word` reste en chunk lazy). Vérifie la page Modèle dans un navigateur **sans arrêter le serveur de l'orchestrateur** : lance `npx ng serve demo --port 4201` si 4200 est pris, et arrête **uniquement** celui que tu as lancé. Pièges : outil Write, pas de `\u00a0`, signals Angular 22, zoneless, `strictTemplates`.

## Rapport attendu

`## Rapport Lot L29` : Fait / Non fait / Décisions / Blocages / Propositions de contrat / Changements `angular.json` proposés / Tests / Fichiers / Points à vérifier.
