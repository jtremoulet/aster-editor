# Brief — Lot L44 : vue page et pagination par section (`core/pagination`, `ui/page.css`, dialogue Mise en page)

> Session 4, vague 1. Cible 1h30. Dépend de la convention posée par L41 (en parallèle) : lis `docs/briefs/L41-core-sections.md` sous-lot D. Convention figée par l'orchestrateur pour ne pas t'attendre : **L41 pose sur chaque `hr[data-section-break]` les variables CSS de la section suivante** (`--aster-page-width`, `--aster-page-height`, `--aster-page-margin-top/right/bottom/left/header/footer`, en `mm`), l'hôte garde celles de la section 1. Si le rapport de L41 (dans `docs/JOURNAL.md` quand il sera intégré) nomme les choses autrement, adapte-toi à lui.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `docs/ROADMAP_SESSION4.md`, `packages/core/src/api/layout.ts` (`SectionLayout`, `DocumentLayout.sections`), `core/src/extensions/pagination.ts`, `pagination-controller.ts`, `pagination-measure.ts`, `pagination-layout.ts` (F30 : `paginate(heights, pageHeight, breaks)`), `page-view.ts`, `packages/ui/themes/page.css`, `ui/src/components/page-layout-dialog.ts`, `docs/reviews/R30.md` (findings pagination, tous corrigés).

## Lot

1. **Pagination par segment** (`pagination-layout.ts`, `pagination-controller.ts`, `pagination-measure.ts`) : `paginate()` accepte une hauteur utile **par segment** (liste de `{ start, pageHeight }` où `start` est l'index du premier bloc d'une section) ; un `sectionBreak` force une coupure (comme un saut de page) **sauf** si la section suivante est `continuous` (alors pas de coupure, mais la hauteur utile change au bloc suivant ; approximation documentée) ; les hauteurs utiles viennent des variables CSS posées sur les `hr` (lues par `getComputedStyle` sur l'élément du nœud) ; `data-page-number` continue de compter sur tout le document ; `pageBreakBefore` et `data-page-break` inchangés.
2. **Feuilles par section** (`page.css`) : en vue page, `.ProseMirror` n'est plus une seule feuille de largeur fixe : chaque section est une feuille ? Impossible sans découper le DOM. **Décision figée** : la feuille garde la largeur de la **plus large** section (`max()` des largeurs calculé par le core sur l'hôte : `--aster-page-width-max`, à faire poser par `page-view.ts` ou par ton contrôleur), et chaque `.aster-page-gap` porte en `data-section` l'index de la section qui commence après lui ; le gap qui ouvre une section applique les variables de cette section (`--aster-page-gap-fill` déjà là, plus `--aster-page-width` / `-height` lues sur le `hr` et posées sur le gap). Le bureau montre ainsi des coupures de hauteur différente et un libellé de section (« Section 2 · Letter paysage ») dans la marge haute du gap, i18n `pageView.section`. Documente l'approximation (pas de changement de largeur visible en cours de document).
3. **En-têtes et pieds par section** : à chaque gap qui ouvre une section, afficher l'en-tête `default` de cette section (HTML assaini par `header-footer-sanitize.ts`) en lecture seule dans le gap, et le pied de la section précédente sous le dernier bloc avant le gap ; les conteneurs de l'hôte gardent la section 1 et la dernière section (pied final). `showHeadersFooters: false` les retire tous.
4. **Dialogue « Mise en page » par section** (`page-layout-dialog.ts`, sacrifice n° 1) : affiche « Section n sur N » pour la section du curseur (`getSections` de L41 ou calcul depuis les `sectionBreak`), édite `layout.sections[n - 1].page` et appelle `setPageView({ layout })` avec le tableau mis à jour ; sans sections, comportement actuel.

## Périmètre

✅ `packages/core/src/extensions/pagination*.ts` (+ specs), `page-view.ts` (lignes additives : `--aster-page-width-max`), `i18n/fr.ts`, `en.ts` (clés additives), `packages/ui/themes/page.css`, `packages/ui/src/components/page-layout-dialog.ts` (+ spec), `ui/src/i18n/ui-*.ts`, `ui/src/testing/mock-editor.ts` (additif), `ui/src/themes.spec.ts`. ❌ `api/**`, `section-break.ts`, `tab.ts` (L41), `word`, `angular`.

## Tests

`paginate` par segment (sections de hauteurs utiles différentes, `continuous`, saut de section = coupure, compteur de pages global), contrôleur en jsdom (rects mockés, variables lues sur les `hr` mockés), gaps avec `data-section` et libellé i18n, en-têtes par section assainis, dialogue par section (mock), `themes.spec.ts` (nouvelles règles, variables `--aster-page-width-max`). `cd packages/core && npx vitest run`, `cd packages/ui && npx vitest run --coverage` (jamais `-w`), typecheck, eslint, prettier.

## Pièges

Outil Write ; pas de `\u00a0` ; décorations widget uniquement, jamais de transaction ; `getComputedStyle` sur un `hr` absent (document sans section) → chemin actuel inchangé ; fichiers < 400 lignes ; ne lance ni n'arrête de serveur.

## Rapport attendu

`## Rapport Lot L44` : Fait / Non fait / Décisions / Blocages / Propositions de contrat / Convention finale des variables et classes (pour la doc) / Tests (compteurs) / Fichiers / Points à vérifier en navigateur.
