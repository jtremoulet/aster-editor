# 🌅 Bilan de la nuit — Aster Editor 0.3.0

> Nuit du 12 au 13 octobre 2026, 22:04 → 01:10. Branche `develop`, 37 commits, `main` intacte.
> À lire en 5 minutes. Le détail est dans [`docs/JOURNAL.md`](./docs/JOURNAL.md), le process dans [`docs/REX.md`](./docs/REX.md).

## ✅ Ce qui est livré

Une lib d'édition riche **testable dans Angular 22 dès maintenant**, en trois versions successives sur `develop` :

| Version | Heure | Contenu                                                                                                                                                                                                      |
| ------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1.0   | 23:23 | Moteur core (48 commandes, i18n fr/en, liens sûrs, upload), toolbar vanilla (3 presets, 58 icônes, thèmes light/night), import .docx, collage Word et Google Docs                                            |
| 0.2.0   | 23:53 | Composant Angular `<aster-editor>` (CVA, signals, zoneless), app démo 4 pages, images redimensionnables, tables redimensionnables, menu contextuel, docs complètes                                           |
| 0.3.0   | 01:05 | Recherche/remplacement, vue source, plein écran, markdown, autosave, caractères spéciaux, impression, **export .docx**, **21 e2e Playwright**, 5 lots de correctifs issus de 5 revues adverses (54 findings) |

### Critères d'acceptation du cahier des charges

| #   | Critère                                                                | État                                                            |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | `npm install && npm run check` vert sur machine propre                 | ✅ vérifié en local, CI GitHub Actions configurée (check + e2e) |
| 2   | Démo : taper, formater, table, image, annuler                          | ✅ vérifié en navigateur réel et par e2e                        |
| 3   | Import .docx des fixtures : titres, listes, tables, images             | ✅ vérifié en navigateur (bundle mammoth) et par e2e            |
| 4   | Collage Word : listes reconstruites, zéro `mso-`                       | ✅ vérifié par 6 fixtures, e2e, et suite sécurité               |
| 5   | Reactive form : valeur bidirectionnelle, `touched`/`dirty`, `disabled` | ✅ 30 tests Angular + e2e                                       |
| 6   | `setHTML(getHTML())` idempotent                                        | ✅ testé y compris tables redimensionnées et images             |
| 7   | Couverture : word ≥ 85, core ≥ 75, ui ≥ 70, angular ≥ 70               | ✅ word 98 %, core 95 %, ui 98 %, angular 94 %                  |
| 8   | README par paquet avec exemple qui compile                             | ✅ exemples typecheckés contre les sources                      |
| 9   | Changelog, `develop` vert, `main` intacte                              | ✅                                                              |

### Should et Could

Tous les « should » du cahier des charges sont livrés (recherche, vue source, polices et couleurs, redimensionnement d'image, plein écran, impression, listes de tâches, caractères spéciaux, export .docx, autosave). Côté « could » : markdown import/export livré ; mentions, coloration syntaxique et menu flottant non faits.

## 📊 Chiffres

| Mesure                     | Valeur                                                        |
| -------------------------- | ------------------------------------------------------------- |
| Tests unitaires            | **882** (core 363, word 281, ui 188, angular 30, démo 20)     |
| Tests e2e Playwright       | **21** (16 playground vanilla, 5 démo Angular), 6 s           |
| Code TypeScript hors tests | 13 200 lignes, 222 fichiers `.ts`                             |
| Tests                      | 10 500 lignes                                                 |
| CSS                        | 1 200 lignes (6 feuilles)                                     |
| Documentation              | 3 700 lignes de markdown                                      |
| Bundle démo initial        | 269 kB, mammoth en chunk séparé                               |
| Agents lancés              | 16 lots d'implémentation + 5 revues, 0 fichier hors périmètre |

## 🧪 Comment tester en 5 minutes

```bash
cd C:\workspace\aster-editor
npm install
npm run check          # lint + typecheck + 882 tests
npm run demo           # http://localhost:4200 — 4 pages Angular
npm run playground     # http://127.0.0.1:4300 — vanilla, sans framework
npm run e2e            # 21 tests Playwright (serveurs réutilisés s'ils tournent)
```

Dans la démo : colle un passage depuis Word ou Google Docs, importe un `.docx` sur la page Import, teste le formulaire réactif, puis dans le playground exporte un `.docx` et **ouvre-le dans Word** (seul contrôle que je n'ai pas pu faire : le rendu Word réel, uniquement l'aller-retour via mammoth et la structure XML).

## ⚠️ À vérifier par toi

1. **Ouvrir un .docx exporté dans Word réel** : puces sur 9 niveaux, numérotation qui repart à 1 par liste, style Citation, image inline, bordures de table.
2. **Déposer 1 ou 2 .docx clients anonymisés** dans `fixtures/docx/` (voir le README du dossier) : les fixtures sont synthétiques, la fidélité sur des vrais documents est à mesurer.
3. **Décisions produit prises en ton nom** pendant la nuit, toutes réversibles : pas de titre dans un item de liste, pas de table imbriquée, `clearFormatting` conserve les liens, `data:image/svg+xml` accepté dans `<img>` mais SVG refusé à l'upload, liens relatifs déballés au collage Word.
4. **`focus()` synchrone en navigateur** via une détection d'environnement (`Range.prototype.getClientRects`) : pris pour tenir le contrat et une course e2e, à réexaminer en V1.1.
5. Le remontage de l'éditeur Angular au changement de `toolbar` perd l'historique d'annulation (documenté).

## 🚧 Hors V1, prêt pour la suite

- Contrat d'API : 10 propositions additives différées (`getMarkdown` sur `AsterEditor`, `autosave` dans les options, `search.*` dans `STANDARD_COMMAND_IDS`, `width/align: null`, événements `imageEdit`/`sourceViewChange`…). Voir `docs/JOURNAL.md`, entrées L6, L7, L11.
- `data-testid` sur la démo et la toolbar pour découpler les e2e des libellés français.
- Wrappers React et Vue : `createAster` est prêt, le wrapper Angular fait 380 lignes et sert de modèle.
- Publication npm sous `@aster-editor/*` : builds verts, `exports` en place, pas encore publié.
- Collaboration, suivi des modifications, commentaires : hors cahier des charges.

## 🔁 Le process, en une phrase

Cadrage écrit avec toi en 30 minutes, contrat d'API figé en 15 minutes, puis 16 agents sur des lots disjoints et 5 relecteurs adverses, intégrés un par un avec check, revue, commit et journal. 0.2.0 testable dans Angular 1h20 après le GO, contre 7h prévues. Les leçons sont dans [`docs/REX.md`](./docs/REX.md).
