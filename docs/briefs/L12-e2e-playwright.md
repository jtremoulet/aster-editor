# Brief — Lot L12 : tests e2e Playwright sur le playground vanilla et la démo Angular

> Rédigé à 23:58. Cible 1h. Prévu « V1.1 » au cahier des charges, avancé car le temps le permet.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/STRATEGIE_TESTS.md`, `scripts/vanilla-playground.mjs`, `scripts/vanilla-playground/main.ts` et `index.html`, `apps/demo/src/app/pages/*.ts`, `packages/ui/src/components/*.ts` (classes CSS et attributs `data-command`, `data-toolbar-item`). **L'orchestrateur a installé `@playwright/test` et le navigateur Chromium** avant de te lancer, et ajouté les scripts `e2e` et `e2e:ui` au `package.json` racine.

## Lot

Dossier `e2e/` à la racine :

- `playwright.config.ts` : deux projets, `playground` (baseURL `http://127.0.0.1:4300`, `webServer: node scripts/vanilla-playground.mjs`) et `demo` (baseURL `http://localhost:4200`, `webServer: npx ng serve demo --port 4200`), Chromium seulement, `reuseExistingServer: true`, traces on first retry, captures dans `e2e/output/` (gitignoré par l'orchestrateur).
- `e2e/fixtures.ts` : helpers `editor(page)` (locator `.ProseMirror`), `toolbarButton(page, commandId)` (`[data-command="…"]`), `getHtml(page)` (`page.evaluate(() => window.aster.editor.getHTML())` sur le playground ; sur la démo, via le bouton « HTML » et le `<pre>`), `pasteHtml(page, html)` (via `page.evaluate` et `view.pasteHTML` sur le playground).
- `e2e/playground.spec.ts` : (1) saisie + gras au clavier `Control+B` + vérif HTML ; (2) titre via le menu Titres ; (3) liste à puces via bouton + `Enter` + `Tab` imbrication ; (4) lien via dialogue (remplir l'URL, OK, vérif `<a href>`) ; (5) table via la grille 3×2 puis `Tab` entre cellules ; (6) collage Word depuis `fixtures/word-html/word-365-list-nested.html` (lire le fichier côté Node dans le test) → `<ul>` imbriquée et zéro `mso-` ; (7) import .docx via `page.setInputFiles('#docx', 'fixtures/docx/01-headings-lists.docx')` → `<h1>Titre principal</h1>` présent ; (8) thème night → `data-theme="night"` et couleur de fond changée ; (9) lecture seule → boutons `disabled` ; (10) navigation clavier dans la toolbar (`ArrowRight` déplace le focus) ; (11) undo après frappe.
- `e2e/demo.spec.ts` : (1) `/` rend `aster-editor` et la toolbar `full` ; (2) `/form` : frappe → `dirty`, `Tab` → `touched`, bouton Envoyer → payload JSON contient `<p>` ; désactiver → `contenteditable="false"` ; (3) `/import` : `setInputFiles` du .docx → titre importé dans l'éditeur ; (4) `/readonly` : pas de toolbar, `contenteditable="false"` ; (5) changement de thème et de langue sur `/`.
- Captures `toHaveScreenshot` : **non** (pas de baseline stable cette nuit), mais une capture `page.screenshot` de chaque page dans `e2e/output/` pour le bilan.

## Périmètre

✅ `e2e/**`. ❌ tout le reste (si une page ou un composant manque d'un hook stable pour être testé, propose un `data-testid` dans le rapport, ne le pose pas toi-même). Aucune dépendance (déjà installée).

## Points d'attention

TS strict, zéro `any`, JSDoc FR, outil Write. Lancer : `npx playwright test --project=playground` puis `--project=demo`. Les deux serveurs peuvent déjà tourner (playground sur 4300, démo sur 4200) : `reuseExistingServer` les réutilise. Si le serveur Angular n'est pas lancé, Playwright le démarre (prévoir `timeout: 120000` pour le `webServer`). Les tests doivent passer **3 fois de suite** sans flake avant de rendre.

## Ordre de sacrifice

Démo (5) et (2), puis playground (10) et (5).

## Rapport attendu

Structure imposée `## Rapport Lot L12` + liste des `data-testid` proposés.
