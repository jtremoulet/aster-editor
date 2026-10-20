# Brief — Relecteur adverse, session 3 (R23 à R29)

> Un relecteur par lot intégré, lancé dès l'intégration, en **lecture seule** sur le code. Il écrit uniquement un fichier de rapport `docs/reviews/R<lot>.md` et des scripts jetables dans son scratchpad. Cible 30 min.

## Mission

Casser le lot. Chaque finding doit être **prouvé** par un test, un script ou une commande reproductible (collée dans le rapport), classé bloquant / majeur / mineur, avec le correctif suggéré en une phrase. Un finding sans preuve est retiré.

## Angles obligatoires

1. **Idempotence** : `setHTML(getHTML())` sur chaque attribut du contrat (`packages/core/src/api/layout.ts`), seul et cumulé, dans `<p>`, `<h2>`, cellule, item de liste. Pour `word` : `import → export → import` sur chaque fixture 11-17.
2. **Contrat** : la sérialisation HTML produite correspond au caractère près à celle de `layout.ts` ; tout écart entre ce que `word` produit et ce que `core` parse est bloquant.
3. **Entrées hostiles** : XML malformé, `styles.xml` absent, `basedOn` cyclique, `numbering.xml` sans `abstractNum`, `w:sz` non numérique, couleurs `auto`, tailles énormes (`w:spacing w:line="2000000"`), tableau 1 000 lignes, `vMerge` sans `restart`, image sans relation, `r:id` inconnu, `.docx` sans `_rels/.rels`. Rien ne doit lever hors `invalid-docx` ; mesurer le temps (ReDoS, quadratique).
4. **Sécurité** : `style` inline parsé : `url(`, `expression(`, `javascript:` dans `href`, `on*` dans les en-têtes rendus par la vue page, `data-docx-style` avec guillemets, noms de police avec `<`. Le HTML produit par `word` passé à `setHTML` ne doit jamais exécuter de script.
5. **Non-régression** : mode `semantic` bit à bit identique à 0.4.3 sur les fixtures 01-10 (`expected/`), variables (08-10) sur le chemin `styled`, 1 262 tests d'origine verts.
6. **Périmètre et conventions** : fichiers touchés hors périmètre du brief, `any`, chaînes non i18n, commentaires en anglais, fichiers > 400 lignes, dépendances ajoutées.

## Fichiers en cours de modification par d'autres agents

L'orchestrateur te donne la liste dans le message de lancement : ne les relis pas, ils bougent.

## Rapport

`docs/reviews/R<lot>.md` : tableau des findings (id, sévérité, fichier:ligne, preuve, correctif), puis « Ce qui tient » (trois lignes), puis « Dette proposée ». Termine ton message par `## Rapport R<lot>` avec le même tableau.
