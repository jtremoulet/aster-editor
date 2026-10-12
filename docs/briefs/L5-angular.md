# Brief — Lot L5 : `@aster-editor/angular`, composant et app démo

> Rédigé pendant la vague 1, envoyé après intégration de L1 et L4. Cible 2h.

## Contexte

Tu travailles sur **Aster Editor**, éditeur de texte riche MIT basé sur Tiptap 3, monorepo npm à `C:\workspace\aster-editor` (Windows). Lis dans l'ordre, intégralement : `CLAUDE.md`, `docs/ARCHITECTURE.md` (section `@aster-editor/angular`), `docs/STRATEGIE_TESTS.md`, `docs/CAHIER_DES_CHARGES.md` (section Angular et démo), puis `packages/core/src/api/**` (contrat), `packages/core/src/index.ts`, `packages/ui/src/index.ts`, `packages/ui/src/types.ts` (`createAster`, `AsterUiOptions`, `AsterInstance`), `packages/word/src/index.ts` (`importDocx`, `wordPasteTransformer`). Ces paquets sont **implémentés et testés**, tu les consommes via les alias TypeScript `@aster-editor/*` (paths vers les sources, déjà configurés).

Branche `develop`, tout installé, `npm run check` vert. Aucune commande git modifiant l'état. D'autres agents travaillent en parallèle dans `packages/core` et `packages/ui` sur des fichiers précis (tables/images avancées, recherche, vue source) : ne touche à rien hors de ton périmètre.

## Lot

### `packages/angular/src/`

- `lib/aster-editor.component.ts` : `AsterEditorComponent`, selector `aster-editor`, standalone, `ChangeDetectionStrategy.OnPush`, fonctionne **sans zone.js** (la démo est zoneless). Implémente `ControlValueAccessor` (fourni via `NG_VALUE_ACCESSOR`, `multi: true`). Inputs signals (`input()`) : `toolbar: ToolbarConfig` (défaut `'standard'`), `theme: AsterTheme` (défaut `'light'`), `locale: AsterLocale` (défaut `'fr'`), `placeholder: string`, `readonly: boolean` (défaut `false`), `config: Partial<AsterUiOptions>` pour tout le reste (extensions, commandes, `linkPolicy`, `pasteTransformers`…), `wordPaste: boolean` (défaut `true` : ajoute `wordPasteTransformer()` de `@aster-editor/word`). Outputs (`output()`) : `ready: AsterEditor`, `changed: string` (HTML), `focused: void`, `blurred: void`. Méthodes publiques : `editor(): AsterEditor | null` (signal), `importDocx(file: File): Promise<DocxImportResult>` qui charge `@aster-editor/word` en **import dynamique** (`await import('@aster-editor/word')`), importe, fait `setHTML`, propage `changed`, retourne le résultat. Montage dans `afterNextRender` (SSR-safe, aucun accès DOM en constructeur), destruction via `DestroyRef`. Le hôte est le conteneur de `createAster`, importé depuis `@aster-editor/ui`. CVA : `writeValue(html)` → `setHTML(html ?? '', false)` sans émettre ; `registerOnChange` branché sur l'événement `change` avec `getHTML()` ; `registerOnTouched` sur `blur` ; `setDisabledState` → `setReadOnly`. Si `writeValue` arrive avant le montage, mémorise la valeur et applique-la au montage. Les changements d'inputs à chaud (`effect`) : `theme` → `setTheme`, `locale` → `i18n.setLocale`, `readonly` → `setReadOnly` (sauf si désactivé par le formulaire), `placeholder` → recrée pas l'éditeur, applique via `editor.tiptap` si possible sinon documente la limite. Changement de `toolbar` → remonte l'instance en conservant le contenu.
- `lib/provide-aster.ts` : `ASTER_CONFIG` (`InjectionToken<Partial<AsterUiOptions>>`) et `provideAster(config)` retournant des `EnvironmentProviders` ; le composant fusionne `ASTER_CONFIG` puis `config` input puis inputs dédiés.
- `lib/tokens.ts` : `ASTER_UPLOAD_HANDLER: InjectionToken<UploadHandler>` optionnel, branché sur `options.upload`.
- `public-api.ts` : exporte le composant, `provideAster`, les tokens, et ré-exporte les types utiles du core (`AsterEditor`, `ToolbarConfig`, `AsterTheme`, `AsterLocale`, `UploadHandler`).
- Tests dans `lib/*.spec.ts` (TestBed, Vitest via `ng test aster-angular --watch=false`) : création et destruction, `writeValue` sans émission, `registerOnChange` appelé à la frappe (`editor.setHTML(..., true)` ou `tiptap.commands.insertContent`), `touched` au blur, `setDisabledState`, reactive form complet (`FormControl` ↔ `getHTML`), `provideAster` + `ASTER_UPLOAD_HANDLER` propagés, changement d'inputs à chaud, `importDocx` avec une fixture (`fixtures/docx/01-headings-lists.docx` lue via `readFileSync` dans un `File`).

### `apps/demo/src/`

Remplace le contenu généré (`app.html` boilerplate, `app.css`, `app.spec.ts` à adapter). App zoneless (déjà configurée), routing. Pages :

1. `/` **Playground** : `<aster-editor>` full, sélecteurs thème/langue/toolbar, case lecture seule, compteur de mots, bouton « HTML » qui affiche `getHTML()` dans un `<pre>`, bouton « JSON ».
2. `/form` **Reactive form** : titre + `<aster-editor formControlName="body">` + checkbox désactivé + affichage `value`, `dirty`, `touched`, `valid` (validateur requis sur le HTML non vide, à écrire avec `isEmpty` ou en comparant à `<p></p>`), bouton submit qui affiche le payload.
3. `/import` **Import Word** : zone de dépôt + `<input type="file">` `.docx`, appel `importDocx`, liste des avertissements, éditeur avec le résultat, et un bloc « Coller depuis Word » expliquant que le collage est nettoyé automatiquement.
4. `/readonly` **Lecture seule** : contenu riche figé.
   Navigation simple en haut, styles sobres dans `styles.css`. Les thèmes Aster : `@import '@aster-editor/ui/themes/aster.css';` dans `apps/demo/src/styles.css` ; si la résolution échoue, utilise le chemin relatif `../../../packages/ui/themes/aster.css` et signale-le. Un test par page (`ng test demo --watch=false`), au minimum création + présence de `aster-editor`.

Mets à jour `README.md` de `packages/angular` (crée-le) avec un exemple complet d'intégration et la liste des inputs/outputs.

## Périmètre

✅ `packages/angular/src/**`, `packages/angular/README.md`, `apps/demo/src/**`. ❌ `angular.json`, `package.json` (tous), lockfile, `tsconfig*`, `packages/core`, `packages/ui`, `packages/word`, `docs/`, `fixtures/`, `.github/`, aucune dépendance. Si `angular.json` doit changer (styles, assets), propose le changement dans le rapport.

## Points d'attention

- Angular 22 : `input()`, `output()`, `inject()`, `afterNextRender`, `DestroyRef`, `effect`. Pas de `@Input()` décorateur, pas de `ngOnInit` pour le DOM. `strictTemplates` actif.
- TS 6.0 strict, zéro `any`, `explicit-module-boundary-types`, JSDoc FR, code EN.
- Pas de `zone.js` : les outputs déclenchent la CD naturellement, les mises à jour internes passent par des signals.
- Vérification avant rendu : `npx prettier --write packages/angular apps/demo`, `npx eslint packages/angular apps/demo`, `npm run typecheck`, `npx ng test aster-angular --watch=false`, `npx ng test demo --watch=false`, `npx ng build demo` (doit passer, budget bundle initial 1 MB : si mammoth n'est pas en chunk séparé le budget casse, l'import dynamique est obligatoire), `npx ng build aster-angular`.

## Définition de fini

Composant CVA complet et testé ; `provideAster` et tokens ; `importDocx` dynamique ; 4 pages démo fonctionnelles ; `ng build demo` et `ng build aster-angular` verts ; couverture ≥ 70 % sur la lib ; README du paquet.

## Temps et repli

2h. Sacrifier dans l'ordre : page `/readonly`, changement à chaud de `toolbar`, test `importDocx` dans la lib (garder la page démo).

## Rapport attendu

Structure imposée (voir `docs/BRIEF_AGENT.md`).
