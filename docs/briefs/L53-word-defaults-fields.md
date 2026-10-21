# Brief — Lot L53 : défauts de paragraphe lus et écrits, champs Word en en-tête (retours POC n° 2 et 1)

> Session 5 (0.7.0). Cible 1h. Paquet `word` seul.

## Contexte

Monorepo `C:\workspace\aster-editor`, `develop`. Lire `CLAUDE.md`, `packages/core/src/api/layout.ts` (**contrat étendu** : `DocumentLayout.defaultParagraph` : `lineHeight` (multiple), `lineHeightPt`, `spacingBeforePt`, `spacingAfterPt`, mêmes règles que `ParagraphLayoutAttrs`), `packages/word/src/docx/reader/sections.ts` (`defaultFont`, `lang` depuis `docDefaults`), `styles.ts` / `styles-part.ts` (`docDefaults`, style `Normal`), `paragraphs.ts` (≈ ligne 100 : n'écrit `line-height`, `margin-*` que si différent des défauts), `export/styles-page.ts` ou équivalent (`docDefaults` de l'export neuf), `preprocess/fields.ts` (seuls les `MERGEFIELD` deviennent des variables), `reader/runs.ts` (champs : résultat rendu, `w:sdt` lu par son contenu), `writer/header-footer-variables.ts` (résolution des `{{nom}}` dans les en-têtes à l'export), `scripts/generate-fixtures-sections.ts` (modèle de génération, lib `docx` + patch jszip). Un autre lot (L51) ajoute `.js` aux lignes d'import en parallèle : n'y touche pas, écris tes nouveaux imports **avec** `.js`.

## Lot

1. **Retour n° 2 — `defaultParagraph`** : le lecteur renseigne `layout.defaultParagraph` depuis les `docDefaults` de paragraphe de `styles.xml` puis le style `Normal` résolu (`w:spacing w:line` / `w:lineRule` → `lineHeight` multiple (auto) ou `lineHeightPt` (exact / atLeast), `w:before` / `w:after` → pt ; rien si tout vaut le défaut Word : interligne simple, 0 pt). Les paragraphes continuent de ne porter que ce qui diffère (comportement actuel, désormais justifié par le transport des défauts). Export neuf : `docDefaults` écrits depuis `layout.defaultParagraph` (lib `docx` : `styles.default.document.paragraph` ou équivalent, lire `index.d.ts`) ; gabarit : rien (les `docDefaults` du gabarit sont conservés). Comparateur : `section.defaultParagraph` comparé (groupe `section`), pertes mesurées. Tests sur les fixtures 11-19 (valeurs attendues citées), idempotence `import → export neuf → import` du `defaultParagraph`.
2. **Retour n° 1 — champs Word en en-tête** : l'intégrateur voit un champ `TITLE` ou `DOCPROPERTY` (ou un contrôle de contenu) d'un en-tête ressortir en variable `{{Titre}}`. Le code ne convertit que les `MERGEFIELD` : trouve si un chemin produit ce résultat (champ complexe sans `separate`, résultat vide, `w:sdt` avec `w:alias` / `w:tag` / `w:docPartGallery`, texte d'espace réservé `[Titre]`, `w:fldSimple` imbriqué dans un `w:sdt`, champ dans un en-tête passé par `header-footer-variables.ts`), en construisant la **fixture 20** `20-champs-en-tete.docx` (`scripts/generate-fixtures-sections.ts` ou un nouveau script `generate-fixtures-fields.ts`, branché dans `npm run fixtures` : ligne proposée dans le rapport, **tu ne modifies pas `package.json`**) : en-tête avec `TITLE`, `DOCPROPERTY Title`, `DOCPROPERTY Company`, `AUTHOR`, `DATE`, `PAGE`, un contrôle de contenu (`w:sdt` texte brut avec `w:alias="Titre"` et espace réservé), un `MERGEFIELD Nom` et un `{{Societe}}` tapé ; corps avec les mêmes. Attendu figé par les tests : seuls `MERGEFIELD` et `{{nom}}` deviennent des variables, les autres champs rendent leur **résultat** (texte vide → rien, pas de puce), le contrôle de contenu rend son contenu (l'espace réservé est du texte ordinaire, jamais une variable) ; à l'export dans le gabarit, un en-tête non modifié reste identique à l'octet et un en-tête régénéré conserve les champs non-variables (`w:fldSimple` / `fldChar` réécrits ou au moins leur résultat : documente). Si tu trouves le chemin fautif, corrige-le ; sinon, documente que le comportement est déjà celui attendu et que le `.docx` anonymisé est nécessaire (`fixtures/docx/client/`, hors dépôt).
3. Attendus `fixtures/docx/expected/20-*.html` (et régénération si le point 1 change un attendu : diff cité), `fixtures/docx/README.md`, `packages/word/README.md` (tableau lu / écrit : `defaultParagraph`, champs ; une ligne chacun).

## Périmètre

✅ `packages/word/src/**`, `fixtures/docx/20-*.docx`, `fixtures/docx/expected/**`, `fixtures/docx/README.md`, `packages/word/README.md`, `scripts/generate-fixtures-*.ts`. ❌ `core`, `ui`, `angular`, `docs/`, `package.json`, lignes d'import existantes (L51).

## Vérification

`cd packages/word && npx vitest run` (jamais `-w`), `tsc --noEmit`, eslint, prettier ; `node scripts/fidelity-report.ts fixtures/docx/<fixture>.docx` sur 11-20 avant / après (scores dans le rapport, aucun ne baisse). Ne lance ni n'arrête aucun serveur.

## Rapport attendu

`## Rapport Lot L53` : Fait par point (chemin fautif du n° 1 trouvé ou non) / Non fait / Valeurs `defaultParagraph` lues par fixture / Scores / Ligne `package.json` proposée / Fichiers.
