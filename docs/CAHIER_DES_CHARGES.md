# 📋 Cahier des charges — Aster Editor V1

> Ce que la V1 doit faire, ce qu'elle ne fera pas, et comment on sait qu'elle est finie.
> Version cible : **0.1.0** puis incréments pendant la nuit. Date : 2026-10-12.

## 🎯 Finalité

Aster est une lib JavaScript d'édition de texte riche, du calibre de CKEditor, que Joris peut embarquer directement chez ses clients Nebula sans contrainte de licence, et qu'il pourra ouvrir en open source. Priorité absolue de la V1 : **être testable demain matin dans une app Angular 22**, propre, documentée, couverte par des tests.

Ce qui fait la différence d'Aster face à l'existant :

- **Licence MIT** de bout en bout. CKEditor 5 et TinyMCE 7+ sont GPL ou payants, et leur collage Word est premium.
- **Import Word de qualité** : .docx et collage depuis Word produisent un HTML sémantique propre.
- **Framework-agnostic** : moteur et toolbar en TypeScript vanilla, wrappers fins par framework. Angular d'abord, React et Vue ensuite.
- **Angular natif** : signals, standalone, reactive forms, zoneless.

## 👤 Utilisateurs et cas d'usage

| Utilisateur              | Besoin                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Dev Angular intégrateur  | Poser `<aster-editor>` dans un formulaire, récupérer du HTML propre, configurer la toolbar en 3 lignes |
| Utilisateur final métier | Rédiger un contenu riche, coller depuis Word sans tout casser, importer un .docx existant              |
| Joris mainteneur         | Ajouter une extension, un bouton, une langue, un thème sans toucher au cœur                            |

## ✅ Périmètre MoSCoW

### Must — sans ça, pas de V1

**Édition**

- Marks : gras, italique, souligné, barré, indice, exposant, code inline, surlignage.
- Blocs : paragraphe, titres H1 à H6, listes à puces et numérotées imbriquées, citation, bloc de code, séparateur horizontal.
- Liens : création, édition, suppression, ouverture dans nouvel onglet, auto-link au collage d'URL.
- Images : insertion par fichier, par URL, par collage et glisser-déposer. Hook `upload` fourni par l'intégrateur, fallback base64 sinon. Attribut `alt`.
- Tables : insertion avec choix de taille, ajout/suppression lignes et colonnes, fusion/scission de cellules, ligne d'en-tête, navigation Tab.
- Undo/redo avec regroupement intelligent.
- Alignement gauche/centre/droite/justifié.
- Raccourcis clavier standards : Ctrl+B/I/U, Ctrl+Z/Y, Ctrl+K lien, Ctrl+Shift+7/8 listes, Tab dans les listes et tables.
- Placeholder, mode lecture seule, focus/blur programmatiques.

**Contenu**

- `getHTML()` / `setHTML()` produisant un HTML sémantique stable et prévisible, sans classes parasites.
- `getJSON()` / `setJSON()` au format ProseMirror pour stockage structuré.
- `getText()`, `isEmpty()`, compteur de mots et de caractères.
- Événements : `change`, `selectionChange`, `focus`, `blur`, `ready`, `destroy`.

**Word**

- **Import .docx** : titres mappés sur H1-H6, listes à puces et numérotées avec imbrication, gras/italique/souligné, tables avec en-têtes, images embarquées, liens, notes de bas de page converties en liste finale. Rapport d'import listant les avertissements.
- **Collage depuis Word** : détection du HTML Word, reconstruction des listes depuis `mso-list`, nettoyage des styles `mso-*`, des `<o:p>`, des polices et tailles imposées, conservation des tables et de la structure, suppression des commentaires conditionnels.
- **Collage depuis Google Docs** : nettoyage des `<b style="font-weight:normal">` et des spans de style.

**Toolbar et UI**

- Toolbar vanilla configurable par liste de groupes et d'items, avec presets `full`, `standard`, `minimal`.
- Boutons avec état actif/désactivé, tooltips avec raccourci, menus déroulants pour titres, tables, couleurs.
- Thèmes `light` et `night` par variables CSS, surchargeables.
- Accessibilité : rôles ARIA sur la toolbar, navigation clavier dans la toolbar, labels sur tous les boutons.
- i18n : français et anglais, chaînes externalisées, ajout d'une langue par simple objet.

**Angular**

- Composant standalone `<aster-editor>` implémentant `ControlValueAccessor`, compatible reactive forms et template-driven.
- Inputs signals : `config`, `placeholder`, `readonly`, `theme`, `locale`, `toolbar`. Outputs : `ready`, `changed`, `focused`, `blurred`.
- `provideAster(config)` pour la config globale. Fonctionne en zoneless.
- `importDocx(file)` exposé sur le composant.

**Qualité et livrables**

- Tests unitaires sur chaque paquet selon `docs/STRATEGIE_TESTS.md`.
- README par paquet avec exemple minimal, README racine avec quick start Angular.
- Doc d'API rédigée pour `@aster-editor/core` et `@aster-editor/angular`.
- App démo Angular 22 avec : éditeur full, éditeur dans un reactive form, import .docx, vue HTML de sortie, switch de thème et de langue.
- `CHANGELOG.md` et version SemVer tenus.

### Should — si le temps le permet, par ordre de priorité

1. Rechercher / remplacer avec surlignage des occurrences.
2. Vue source HTML éditable avec retour dans l'éditeur.
3. Police, taille de police, couleur de texte, couleur de fond.
4. Redimensionnement d'image à la souris, alignement d'image.
5. Plein écran et impression.
6. Listes de tâches avec cases à cocher.
7. Caractères spéciaux et emojis.
8. Export .docx via la lib `docx`.
9. Autosave via hook `onAutosave` à intervalle configurable.

### Could — bonus

- Import et export markdown.
- Mentions `@` avec source asynchrone.
- Coloration syntaxique dans les blocs de code via lowlight.
- Menu flottant à la sélection, menu `/` en début de ligne.

### Won't — explicitement hors V1

- Collaboration temps réel, suivi des modifications, commentaires.
- Export PDF, correcteur orthographique embarqué.
- Fidélité de mise en page Word au pixel : colonnes, en-têtes et pieds de page, sauts de page, polices exactes.
- Wrappers React et Vue. L'architecture les prépare, on ne les écrit pas.
- Tests e2e graphiques. Prévus pour la V1.1 avec Playwright.

## 🧪 Critères d'acceptation

La V1 est considérée **livrable** quand tous ces points sont vrais :

1. `npm install && npm run check` passe sur machine propre, Node 24.
2. `npm run demo` ouvre le playground, on peut taper, formater, insérer une table et une image, annuler.
3. Dans la démo, un `.docx` des fixtures importé donne des titres, listes, tables et images corrects.
4. Un HTML Word des fixtures collé donne des listes reconstruites et aucun style `mso-*` résiduel.
5. Le composant Angular dans un reactive form reflète la valeur dans les deux sens, `touched`/`dirty` corrects, `disabled` respecté.
6. `getHTML()` sur un contenu complet est stable : `setHTML(getHTML())` est idempotent.
7. Couverture de tests : `word` ≥ 85 %, `core` ≥ 75 %, `ui` ≥ 70 %, `angular` ≥ 70 %.
8. Chaque paquet a un README avec un exemple qui fonctionne tel quel.
9. `CHANGELOG.md` décrit la version, `develop` est vert, `main` n'a pas bougé.

## 📏 Exigences non fonctionnelles

- **Licences** : uniquement MIT, BSD, Apache-2.0 dans l'arbre de dépendances de production.
- **Bundle** : `core + ui` sous 250 kB minifié hors gzip, `word` chargé à la demande par import dynamique car mammoth est lourd.
- **Navigateurs** : deux dernières versions de Chrome, Firefox, Safari, Edge. Pas d'IE.
- **Performance** : document de 50 pages Word importé reste fluide à la frappe.
- **Sécurité** : le HTML entrant est passé par le schéma ProseMirror, qui ne conserve que les nœuds connus. Pas de `<script>`, pas de handlers inline. Les URLs `javascript:` sont rejetées dans les liens.
- **Accessibilité** : toolbar navigable au clavier, contraste AA sur les deux thèmes.

## 🔓 Hypothèses et décisions actées

- Moteur Tiptap 3 sur ProseMirror, pas de réécriture. Décision prise le 2026-10-12 avec Joris.
- UI vanilla pour permettre React et Vue plus tard.
- Angular 22 cible, peerDependency `>=20` tant que l'API utilisée le permet.
- Une seule version SemVer pour tout le monorepo.
- Les fixtures Word réelles fournies par Joris sont la référence de qualité de l'import. En leur absence, des fixtures synthétiques sont générées avec la lib `docx`.
