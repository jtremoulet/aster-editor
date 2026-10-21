# Brief — Lot L54 : en-têtes et pieds éditables dans le dialogue « Mise en page » (retour POC n° 8)

> Session 5 (0.7.0). Cible 1h. Paquets `ui` et `angular`.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `packages/core/src/api/layout.ts` (`HeaderFooterSet` : `default` / `first` / `even`, `HeaderFooterContent.html`, `SectionLayout`, invariant : `layout.headers` / `footers` = dernière section), `packages/ui/src/components/page-layout-dialog.ts` (+ spec : section du curseur, `withSectionPage`, recopie au premier niveau), `packages/core/src/extensions/header-footer-sanitize.ts` (assainisseur, exporté du core ?), `packages/angular/src/lib/aster-editor.component.ts` (`layout`, `layoutChanged`, relecture via `pageViewChange`), `apps/demo/src/app/pages/template.page.ts` (panneau En-tête / Pied : édite `sections[0].headers` et le pied de la dernière section), `docs/JOURNAL.md` session 4 (décisions vue page). Un autre lot (L51) ajoute `.js` aux lignes d'import en parallèle : n'y touche pas, écris tes nouveaux imports **avec** `.js` ; un autre (L52) modifie `page.css`, `pagination-sections.ts`, `search-*.ts` et `image-dialog.ts` : n'y touche pas (tes styles vont dans un bloc **nouveau** de la feuille du dialogue de mise en page, ou dans un fichier CSS dédié si la feuille est partagée : lire `themes/`).

## Lot

1. **Dialogue « Mise en page »** : une section « En-tête et pied » pour la section courante du curseur (celle déjà affichée « Section n sur N ») avec, pour l'en-tête et le pied, un champ par type présent ou activable : `default` toujours, `first` si `titlePage` (case à cocher « Première page différente » posant `titlePage`), `even` si « Pages paires différentes » (case). Chaque champ est un **éditeur de texte riche minimal** : une zone `contenteditable` **sans** Tiptap (le dialogue est vanilla) acceptant le collage de texte, Entrée = nouveau paragraphe, et dont la valeur est le HTML **assaini** par l'assainisseur des en-têtes du core (`<p>`, `<strong>`, `<em>`, `<span data-aster-variable>`, variables `{{nom}}` tapées converties en puces si une fonction du core le permet, sinon laissées en texte : documente). Vide = en-tête retiré (`default: undefined` ou `{ html: '' }` : suivre ce que le lecteur / writer attendent, lire `header-footer-graft.ts` et `export/header-footer.ts`, et le cas « en-tête vidé » de la 0.5 : `template-section-missing`).
2. **Application** : « Appliquer » écrit `sections[n].headers` / `footers` (et `titlePage`) de la section courante via `withSectionPage` étendu (`withSectionLayout`), recopie au premier niveau quand c'est la dernière section du corps (invariant), puis `setPageView` → `pageViewChange` → Angular `layoutChanged` (déjà en place : vérifie par test). i18n fr / en : `ui.pageLayout.header`, `footer`, `headerFirst`, `headerEven`, `titlePage`, `evenPages`, `headersHint`.
3. **Angular** : rien de nouveau dans l'API si `layoutChanged` relaie déjà ; sinon lignes minimales citées. Démo : le panneau En-tête / Pied de la page Modèle reste (il sert de banc d'essai), une phrase dans son libellé renvoie au dialogue.
4. Tests : `page-layout-dialog.spec.ts` (champs présents selon la section, assainissement d'un `<script>` et d'un `onclick`, vide → retiré, `first` activé → `titlePage`, recopie premier niveau, section intermédiaire non recopiée), spec Angular (une modification via le dialogue est relayée par `layoutChanged`), e2e `sections.spec.ts` : **un scénario ajouté** (fixture 18 : éditer l'en-tête de la section 2 via le dialogue → la coupure « Section 2 » affiche le nouveau texte ; export dans le gabarit → `header` régénéré contient le texte) : ajoute-le dans un **nouveau fichier** `e2e/headers-dialog.spec.ts` (projet `playground`, `testMatch` à étendre) pour ne pas croiser L52 sur `sections.spec.ts`.

## Périmètre

✅ `packages/ui/src/components/page-layout-dialog.ts` (+ spec, découpe en `page-layout-headers.ts` si > 400 lignes), `packages/ui/src/i18n/ui-fr.ts`, `ui-en.ts`, `packages/ui/src/testing/mock-editor.ts`, `packages/ui/themes/page.css` **bloc nouveau à la fin uniquement** (ou fichier dédié), `packages/angular/src/lib/**` (lignes minimales), `apps/demo/src/app/pages/template.page.ts` (+ spec, libellé), `e2e/headers-dialog.spec.ts`, `e2e/playwright.config.ts` (testMatch seulement). ❌ `core` (sauf export d'un assainisseur déjà existant dans `index.ts` : ligne citée), `word`, `docs/`, `e2e/sections.spec.ts`, lignes d'import existantes (L51).

## Vérification

`cd packages/ui && npx vitest run` (jamais `-w`), `npx ng test aster-angular --watch=false`, `npx ng test demo --watch=false`, `npm run typecheck`, eslint, prettier ; `npx playwright test -c e2e/playwright.config.ts --project=playground headers-dialog.spec.ts`. Serveurs 4200 / 4300 : lance-les avec `npm run playground` / `npm run demo` **seulement s'ils ne répondent pas**, ne stoppe jamais un serveur que tu n'as pas lancé.

## Rapport attendu

`## Rapport Lot L54` : Fait par point / Non fait / Décisions (vide = retiré ?, variables dans l'éditeur minimal) / Tests (compteurs) / Fichiers.
