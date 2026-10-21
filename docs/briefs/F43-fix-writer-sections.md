# Brief — Lot F43 : correctifs de la revue R43 (export et greffe des sections, tabulations)

> Session 4. Cible 45 min. Lancé **après L45a** (fichiers `export/css.ts` et `styles.ts` découpés, `units.ts` fusionné) : pars du code tel qu'il est sur `develop`. Lis `CLAUDE.md`, `docs/reviews/R43.md` (specs jetables du relecteur dans `C:\Users\Joris\AppData\Local\Temp\claude\C--workspace\6da28716-9c97-4474-a9ce-9218f14ae4a9\scratchpad\r43a.spec.ts` … `r43d.spec.ts`, à copier dans ton scratchpad), `docs/briefs/L43-writer-sections.md`, `packages/core/src/api/layout.ts` (**contrat étendu** : `TabAttrs.align` → `data-align`, `TabAttrs.leader` → `data-leader`, dans cet ordre après `data-stop`).

## Lot

Corriger R43-01 à R43-08, chaque correctif accompagné d'un test qui reproduit la preuve du relecteur :

1. **R43-01** : une seule règle « quelle `SectionLayout` pour quel segment » partagée par l'export neuf et la greffe (`sectionLayoutOf` exportée du module `export/sections.ts` ou d'un module commun) : dernier segment = `sections[dernier].headers/footers ?? layout.headers/footers` quand `sections.length === segments.length`, sinon `layout.*` ; `template-section-missing` suit la même règle.
2. **R43-02** : position de taquet plafonnée (31 680 twips, max Word) ou ignorée au-delà ; jamais un `w:pos` hors `xsd:int`.
3. **R43-03** : `options.page` / `pageSize` en repli pour une section intermédiaire sans `section.page` ; `options.header` / `footer` en repli `default` pour chaque section (portée des options explicites = tout le document, comme en 0.5 ; documente-le dans la JSDoc de `DocxExportOptions`).
4. **R43-04** : le numéro de segment de `splitSections` (positionnel, 1..k) est transmis à la greffe ; les deux chemins numérotent 1..k quel que soit l'attribut du `hr`.
5. **R43-05** : `data-align` et `data-leader` du `<span data-tab>` → `w:tabs` avec `w:val` (`left`/`center`/`right`/`decimal`) et `w:leader` (`dot`/`hyphen`/`underscore`) ; taquets dédoublonnés par position + alignement ; fixture 19 : `center 4536`, `right 7938`, `decimal` restitués (score mesuré dans le rapport : `node scripts/fidelity-report.ts fixtures/docx/19-tabulations-bordures.docx`). Le lecteur (F42, en parallèle) émettra ces attributs : écris tes tests avec du HTML construit à la main, pas via `importDocx` de la 19.
6. **R43-06** : `titlePg` jamais transmis par héritage (`collectPending` / `completeFromPending`).
7. **R43-07** : `spacePt` plafonné à 31 dans `borderOptions` (+ avertissement `reader`/`export` existant le plus proche).
8. **R43-08** : `margin: auto` → `center` ; `margin[3]`/`margin[1]`/`margin[0]` résolus comme proposé.

R43-09 (`rStyle` sur lien) : **oui si** < 15 min : ne poser `rStyle Lienhypertexte` que si le run importé le portait (`data-docx-run-style`) ; sinon dette. R43-10 (tailles) : non, sauf si ton découpage est trivial.

## Périmètre

✅ `packages/word/src/export/**`, `packages/word/src/docx/writer/**`, `packages/word/src/docx/types.ts` / `export/types.ts` (JSDoc seulement), specs, `fixtures/docx/README.md` (score de la 19). ❌ `reader/**`, `compare/**` (F42 y travaille), `core`, `ui`, `docs/`.

## Vérification

`cd packages/word && npx vitest run` (jamais `-w`), `npx tsc --noEmit`, `npx eslint src`, `npx prettier --write src`. Idempotence `import → export gabarit → import` sur 11-19 conservée (HTML et `layout` égaux).

## Rapport attendu

`## Rapport Lot F43` : tableau finding → correctif → test ; Non fait ; Scores avant → après (19, client) ; Tests (compteurs) ; Fichiers.
