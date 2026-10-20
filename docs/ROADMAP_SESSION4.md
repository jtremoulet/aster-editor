# 🧭 Plan de la suite — après la 0.5.0 (20 octobre 2026)

> Point de départ : 0.5.0 sur `main` et sur npm, 1 994 tests unitaires, 42 e2e, document client lu et ré-exporté dans son gabarit avec un score de fidélité de 0,889. Le POC CKEditor → Aster démarre chez le client avec cette version.
> Ce plan est un ordre de priorité, pas un engagement de dates : chaque bloc est une session autonome ou une demi-session, et le retour du POC peut le réordonner.

## 1. 🔁 Retours du POC (en continu, dès cette semaine)

- Chaque `.docx` du client qui s'importe ou s'exporte mal entre dans `fixtures/docx/client/` (hors dépôt) et dans le rapport de fidélité ; un ticket par écart, avec le score avant et après.
- Un e2e en navigateur réel par cas client reproduit (la session 3 a montré que jsdom ne suffit pas pour la sérialisation XML).
- Ouverture dans Word réel des exports dans le gabarit : points 18 à 31 de `samples/README.md`. C'est la seule vérification que personne n'a faite.

## 2. 🧱 Session 4 — sections multiples et fidélité restante (une session autonome)

Objectif : faire monter le document client au-dessus de 0,98 dans le gabarit.

1. **Sections conservées dans le corps** : nœud de section Aster (`<hr data-section-break>` porteur de la mise en page de la section précédente : format, orientation, marges, colonnes, en-têtes et pieds), lu par le lecteur, rendu dans la vue page (chaque section avec sa feuille), réécrit à l'export (un `w:sectPr` par section, greffé depuis le gabarit quand il existe). C'est la perte principale sur le document client et sur la fixture 16.
2. **Bordures `nil` et couleurs de bordure** : le writer omet les `tcBorders nil` et ramène `#bfbfbf` à noir ; porter `spacePt` et la couleur exacte dans `BlockBorder` (contrat, additif).
3. **Tabulations** : lire `w:tabs` et les `w:tab` en un nœud inline `tab` (largeur calculée), réécrit à l'export ; aujourd'hui un espace cadratin.
4. **Styles conditionnels de tableau** (première ligne, bandes) approximés en propriétés directes à l'import, conservés via le style du gabarit à l'export.
5. **Bascule du défaut `fidelity: 'styled'`** dans la lib (0.6.0, changement observable pour les intégrateurs vanilla, documenté dans le changelog avec `semantic` comme repli).

Critères : score ≥ 0,98 sur le document client et la fixture 16 dans le gabarit, parties annexes identiques, 0 régression e2e.

## 3. 🧹 Dette technique (une demi-session, à intercaler)

- Fusion `units.ts` / `units-blocks.ts` du lecteur ; export des helpers partagés (`parseMergeField`, `invalidDocx`, `convertBlocks`) au lieu de leur duplication dans `compare/` et `writer/`.
- Fichiers > 400 lignes dans `word/export` (`styles.ts`, `inline.ts`, `blocks.ts`, `tables.ts`, `css.ts`) et specs volumineuses.
- Propositions de contrat en attente : `setPageView` / `getLayout` et événement `pageViewChange` dans `api/editor.ts`, commandes `text.*` standard, `image.setAttributes.height`, `DocumentLayout.defaultParagraph`, `ConverterContext.listCounters`.
- Nœud de note de bas de page dans le core (aujourd'hui une liste finale `data-footnotes`), pour que les notes survivent à l'édition.
- Test de performance manquant : import stylé d'un document de 100 pages < 2 s.

## 4. 🧪 Qualité et distribution (continu)

- Publication par tag et Trusted Publisher (en place depuis la 0.4.3) : `npm run version:set x.y.z`, changelog, `/ship`, tag `vX.Y.Z`.
- E2E sur Firefox et WebKit (projets Playwright supplémentaires) si le client les cible.
- Un e2e « document client complet » dans la CI dès qu'un document publiable existe (anonymisé) ; tant qu'il est hors dépôt, le test reste `skipIf`.

## 5. 🚀 Produit (selon le retour du POC)

- Pagination : coupure à l'intérieur des listes et citations, `keepWithNext`, numéro sur la page 1, impression fidèle (`@page` via une feuille générée).
- Édition des en-têtes et pieds directement dans la vue page (aujourd'hui un panneau séparé dans la démo).
- Export PDF côté navigateur à partir de la vue page (print stylesheet déjà posée).
- Wrappers React et Vue si un autre client l'exige ; le core est framework-agnostic.
- Dépôt public : issues GitHub ouvertes au dev du POC, `CONTRIBUTING.md` à écrire.

## 📎 Ce que ça demande de toi

- Les retours du POC et au moins un `.docx` par écart constaté.
- L'ouverture dans Word réel des exports de la session 3 (checklist), avant de lancer la session 4.
- Le choix de l'ordre entre la session 4 (fidélité) et la dette, selon ce que le client remonte en premier.
