# Brief — Lot L32 : e2e Playwright de la session 3 (fidélité Word, vue page, pagination)

> Session 3, après L29 et F27. Cible 1h. Un seul agent, aucun autre lot e2e en même temps.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `e2e/playwright.config.ts` (projets `playground` et `demo`, serveurs réutilisés s'ils tournent), `e2e/fixtures.ts`, `e2e/playground.spec.ts`, `e2e/variables.spec.ts`, `e2e/demo.spec.ts` (style des tests existants, 35 verts), `scripts/vanilla-playground/main.ts` (import stylé, `window.aster`, export dans le gabarit après import), `apps/demo/src/app/pages/template.page.ts` (page « Modèle » : vue page, en-têtes et pieds, rapport de fidélité, objets perdus, export gabarit), `packages/ui/themes/page.css` (classes `aster--page-view`, `.aster-page-gap`, `.aster-page-header`).

## Lot

Nouveau fichier `e2e/fidelity.spec.ts` (projets `playground` et `demo`), scénarios :

1. **Import stylé** (playground) : `setInputFiles` avec `fixtures/docx/13-styles-nommes.docx` → le contenu contient un `h1[data-docx-style="Heading1"]`, un `p[data-docx-style="Citation"]` avec `border-left`, un span coloré `#00b050` ; `window.aster.editor.getHTML()` relu par `setHTML` reste identique (idempotence en vrai navigateur, pas jsdom).
2. **Vue page** (playground) : après l'import, l'hôte porte `aster--page-view`, `--aster-page-width` vaut `210mm`, `.aster-page-header` / `.aster-page-footer` existent ; le dialogue « Mise en page » de la toolbar change le format en Letter → `--aster-page-width` `215.9mm` ; décocher « Vue page » retire la classe.
3. **Pagination** (playground) : `setHTML` de 80 paragraphes en vue page A4 → au moins 3 `.aster-page-gap`, le premier porte `data-page-number="2"`, `--aster-page-count` ≥ 3 sur l'hôte ; insérer `<hr data-page-break>` après le 2e paragraphe → un gap juste après lui ; taper dans un paragraphe ne change ni le nombre de gaps ni `getHTML()` (pas de widget sérialisé).
4. **Export dans le gabarit** (playground) : après l'import de la fixture 13, cliquer « Exporter .docx » → `page.waitForEvent('download')`, lire le fichier avec `jszip` (dépendance déjà présente à la racine), vérifier que `word/styles.xml` est identique à l'octet à celui de la fixture et que `word/document.xml` contient `w:pStyle w:val="Citation"`.
5. **Objets perdus et avertissements** (playground) : import de `17-objets-perdus.docx` → le journal du playground (`#log` ou équivalent, lire `main.ts`) mentionne `object-lost` et le texte « Texte dans la zone de texte » est dans le contenu.
6. **Page « Modèle »** (demo) : charger l'exemple stylé, cocher « Vue page », vérifier en-tête et pied affichés, cliquer « Rapport de fidélité » → un score affiché (`/0[.,]\d{3}|1[.,]000/`), tableau avec au moins une ligne ; modifier l'en-tête dans le panneau dédié → `layoutChanged` reflété (le HTML de l'en-tête affiché change) ; « Télécharger (gabarit) » → téléchargement `.docx` non vide.
7. **Document client** (playground) : `test.skip` si `fixtures/docx/client/Modele_Demo_DER.docx` est absent ; import sans erreur console, 8 `table`, 14 puces de variables, export gabarit → `word/footer1.xml` identique à l'octet.

Règles : pas de `waitForTimeout` (attentes sur sélecteurs, `toHaveCount`, `waitForFunction`), `data-testid` interdits (on lit le DOM réel), chaque test indépendant (recharge la page). Ajoute `fidelity.spec` au `testMatch` de `playwright.config.ts` si nécessaire et une ligne dans `e2e/README.md` s'il existe.

## Périmètre

✅ `e2e/fidelity.spec.ts`, `e2e/fixtures.ts` (helpers additifs), `e2e/playwright.config.ts` (testMatch), `e2e/README.md`. ❌ tout le reste. Si un scénario révèle un bug dans `core`, `ui`, `word`, `angular` ou la démo : **ne corrige pas**, isole-le en `test.fixme` avec la preuve dans ton rapport.

## Vérification

`npm run e2e` (lance ses serveurs si 4200/4300 ne répondent pas ; **ne stoppe jamais** un serveur que tu n'as pas lancé) trois fois de suite verts, durée totale indiquée ; `npx tsc -p e2e/tsconfig.json --noEmit`, `npx eslint e2e`, `npx prettier --write e2e`.

## Rapport attendu

`## Rapport Lot L32` : Fait par scénario / Non fait / Bugs trouvés (avec preuve) / Durées / Fichiers.
