# Brief — Lot L47 : e2e sections et multi-navigateurs (Firefox, WebKit)

> Session 4, vague 3 (après F41, L45b et la vérification du playground). Cible 1h. Un seul agent e2e à la fois.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `e2e/playwright.config.ts` (projets `playground` et `demo`, serveurs réutilisés), `e2e/fixtures.ts`, `e2e/fidelity.spec.ts` (42 tests verts en Chromium), `scripts/vanilla-playground/main.ts` (`window.aster`, `window.asterImportDocx`, export dans le gabarit), `packages/core/src/api/layout.ts` (`sections`, `SectionBreakAttrs`, `TabAttrs`), `packages/core/src/extensions/section-break.ts`, `pagination-sections.ts`, `packages/ui/themes/page.css` (`.aster-page-gap--section`, variables `--aster-page-*` sur l'hôte et sur chaque `hr.aster-section-break`), `packages/ui/src/components/page-layout-dialog.ts` (« Section n sur N »), `docs/JOURNAL.md` session 4. Les navigateurs Firefox et WebKit de Playwright sont **déjà installés** (`npx playwright install` interdit).

## Lot

1. **Nouveau `e2e/sections.spec.ts`** (projet `playground`) :
   - Import de `fixtures/docx/18-sections-triple.docx` : deux `hr[data-section-break]` numérotés 1 et 2, hôte en vue page avec `--aster-page-width` de la section 1 (`210mm`), le premier `hr` porte `--aster-page-width: 279.4mm` (Letter paysage) et `data-section-start="nextPage"`, le second `data-section-start="continuous"` ; au moins un `.aster-page-gap--section` avec le libellé « Section 2 » ; en-tête de section visible (« Section 2 »), pied « Pied 3 » dans le pied de l'hôte (pied = dernière section).
   - Dialogue « Mise en page » curseur dans la section 2 → titre « Section 2 sur 3 », format Letter ; passer en A4 → le `hr` 1 porte `210mm`, l'hôte inchangé.
   - `getHTML()` relu par `setHTML` : identique (idempotence en vrai navigateur) ; `section.insertBreak` au milieu de la section 1 → trois `hr` renumérotés 1, 2, 3 ; undo → deux.
   - Tabulations : import de `19-tabulations-bordures.docx` → `span[data-tab]` avec `data-stop`, `getText()` contient `\t` ; Tab dans une cellule insère un `span[data-tab]` (ou déplace : lire le comportement réel dans `tab.ts`) ; Backspace le retire en une frappe.
   - Export dans le gabarit après import de 18 : téléchargement, lecture `jszip`, `word/document.xml` contient 3 `w:sectPr`, `header2.xml` ou équivalent identique à l'octet.
2. **Multi-navigateurs** : dans `e2e/playwright.config.ts`, deux projets supplémentaires `playground-firefox` (`devices['Desktop Firefox']`) et `playground-webkit` (`devices['Desktop Safari']`) sur `fidelity.spec.ts` + `sections.spec.ts` uniquement (les specs de base restent Chromium : durée). Chaque échec spécifique à un navigateur est un **bug à documenter** : `test.fixme` conditionné à `browserName` avec la preuve (message, capture) dans le rapport, pas de correctif dans les paquets.
3. **Démo** (projet `demo`, `sections.spec.ts`) : page « Modèle », exemple stylé → charger la fixture 18 via l'input de fichier de la page Import puis « Modèle » si le flux existe (lire `apps/demo/src/app/pages/*.ts`) ; sinon scénario minimal : la vue page affiche un `.aster-page-gap--section` après import de 18 sur la page Import.

Règles : pas de `waitForTimeout`, pas de `data-testid`, chaque test indépendant. Ajoute `sections.spec` aux `testMatch`. `e2e/README.md` mis à jour s'il existe.

## Périmètre

✅ `e2e/sections.spec.ts`, `e2e/fixtures.ts` (additif), `e2e/playwright.config.ts`, `e2e/README.md`. ❌ tout le reste. Un bug trouvé dans `core`, `ui`, `word`, `angular`, démo ou playground : **ne corrige pas**, `test.fixme` + preuve dans le rapport.

## Vérification

`npm run e2e` (serveurs 4200 et 4300 déjà lancés : ne les stoppe jamais) deux fois verts, durée totale par projet ; `npx tsc -p e2e/tsconfig.json --noEmit`, `npx eslint e2e`, `npx prettier --write e2e`.

## Rapport attendu

`## Rapport Lot L47` : Fait par scénario / Non fait / Bugs trouvés par navigateur (avec preuve) / Durées / Fichiers.
