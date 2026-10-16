# 📜 Changelog

Toutes les évolutions notables de ce projet sont documentées ici.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versionnage : [SemVer](https://semver.org/lang/fr/).
Une seule version pour tout le monorepo.

## [Unreleased]

## [0.4.0] - 2026-10-16

Modèles de documents et champs de fusion : variables de bout en bout (éditeur, import et export Word, Angular), fidélité Word à l'export, parité d'usage (bulles, menu `/`, sommaire, format painter), 5 revues adverses et leurs correctifs.

### Added

- **core** : contrat des variables (`AsterVariable`, `VariableStore`, `VariableSource`, `GetHtmlOptions`), nœud `variable` avec puce (libellé, valeur, états résolue / non résolue, double-clic → `aster:variable-edit`), règle de saisie `{{nom}}`, commandes `variable.insert` / `variable.remove`, `editor.variables` (`list`, `getNames`, `getValues`, `setValues`, `define`, `resolve`, `hasUnresolved`), `getHTML({ variables: 'resolve' })` et `resolveVariablesHtml()` pur, événement `variablesChange`, extension `Outline` (`getOutline`, `scrollToHeading`, ids de titres `aster-h-n` à la demande), commandes `formatPainter.copy` / `paste` (`Mod-Shift-c` / `Mod-Shift-v`, verrou).
- **ui** : widget `variable` (menu des variables déclarées et présentes, création contrôlée), menu de suggestion `{{` (navigation clavier, a11y `aria-activedescendant`, flip), dialogue de puce (libellé, valeur, suppression), bulle de lien (URL, modifier inline, supprimer), bulle d'image (alignement, largeurs 25/50/100 %, modifier, supprimer), menu `/` (blocs, listes, citation, code, séparateur, table, image, lien, variable), widgets `outline` et `formatPainter`, options `createAster` `variableSuggestion` / `linkBubble` / `imageBubble` / `slashMenu`, feuilles `variables.css` et `bubbles.css`, sélecteurs de panneaux ouverts extensibles pour le plein écran.
- **word** : import des variables depuis `{{nom}}`, champs de fusion Word (`fldSimple` et champs complexes) et contrôles de contenu (`w:sdt`), par prétraitement XML avant mammoth, `DocxImportResult.variables`, options `variables.detect` / `pattern`, passe de collage `{{nom}}` ; export `variables.mode` `placeholders` / `resolve` / `fields` (`MERGEFIELD`, valeur connue en résultat de champ), en-têtes et pieds de page avec numéros de page, sauts de page, table des matières, notes de bas de page réelles, titres numérotés, largeurs de colonnes, taille de page, orientation, marges, langue, police et styles de titres par défaut.
- **angular** : inputs `variables`, `variableValues`, `variableResolver`, `allowUnknownVariables`, `variableSuggestion`, output `variablesChanged`, signal `variableNames`, méthodes `getHTML(options)`, `resolveVariables()`, `exportDocx(options)` ; page démo « Modèle » (import d'un modèle, formulaire généré, aperçu résolu, trois exports).
- Fixtures `08-variables-braces`, `09-variables-mergefields`, `10-variables-content-controls` et presse-papier `word-365-variables` ; échantillon `samples/export-fidelite-complet.docx` avec checklist d'ouverture dans Word ; panneau Variables dans le playground.

### Changed

- **core** : `variableName()` rend `''` pour un nom invalide (nœud inerte) ; `resolve()` applique les succès avant de rejeter ; `list()` n'a plus qu'une source de valeurs.
- **word** : `importDocx` réécrit l'archive avant mammoth dès qu'elle contient un champ ou un contrôle (coût mesuré 29 ms sur 5 Mo).
- Dépendances : `@tiptap/suggestion` et `@floating-ui/dom` (MIT), `jszip` déclaré explicitement (MIT) ; versions Tiptap épinglées en exact.

### Fixed

- **ui** : Entrée dans le menu `{{` coupait le paragraphe (plugin enregistré derrière les keymaps Tiptap) ; Échap en plein écran ignorait les panneaux de variables ; focus et libellés du dialogue de puce ; sommaire dupliqué à l'ouverture ; valeur vide invisible.
- **core** : valeur effacée ressuscitée par `define` ; `setJSON` avec un nom hostile créait une puce.

## [0.3.0] - 2026-10-13

Fonctionnalités « should » et « could », export .docx, e2e Playwright, et 5 lots de correctifs issus de revues adverses (54 findings).

### Added

- **core** : recherche / remplacement (extension `Search`, commandes `search.*`, `Mod-f`), markdown aller-retour (`getMarkdown` / `setMarkdown`, `htmlToMarkdown` / `markdownToHtml`), `createAutosave` (debounce, `flush`, `isDirty`), politique d'images appliquée au parsing (`createImageExtension`), cache de `getHTML()` par transaction, erreurs explicites après `destroy()`.
- **ui** : panneau de recherche, vue source HTML, plein écran, caractères spéciaux et emojis, impression, menu contextuel de table clampé dans le viewport, panneaux retournés quand ils débordent, icônes centralisées (`search`, `source`, `fullscreen`, `special-chars`, `print`…), feuilles `search-source.css` et `print.css`, test de contraste WCAG automatisé sur les thèmes, méthodes `toggleSource` / `isSourceView` / `setFullscreen` / `isFullscreen` sur `AsterInstance`.
- **word** : `exportDocx` (mapping complet HTML → docx, numérotation dédiée par liste, images, tables, métadonnées), `downloadDocx`, `jsonToHtml`, `importDocx` accepte `ArrayBufferView` (`DocxInput`), suite de tests sécurité sur le normaliseur de collage.
- **angular** : inputs `ariaLabel` / `ariaLabelledBy`, titres de routes et labels dans la démo.
- **e2e** : 21 tests Playwright (16 playground vanilla, 5 démo Angular), job CI dédié.
- Playground : bouton « Exporter .docx ».

### Changed

- **core** : `setReadOnly()` n'émet plus `change` ; `setHTML` / `setJSON(…, false)` sont hors historique et vident l'historique d'annulation ; `paragraph` / `heading` n'ont plus d'effet de bord quand ils échouent (pas de titre dans un item de liste en V1, `heading` n'est plus une bascule) ; `table.insert` refusé dans une table ; `clearFormatting` conserve les liens et ne sort plus des listes ; `getText()` un seul séparateur entre blocs ; `focus()` synchrone en navigateur ; `insertHTML` documenté comme brut.
- **ui** : `aria-pressed` seulement sur les commandes à état ; les boutons ne volent plus le focus au `mousedown` ; les menus se ferment au `focusout` ; clés i18n `ui.dropdown.open` et `ui.table.insert` retirées ; règles CSS des tables et images regroupées dans `images-tables.css`.
- **word** : `mso-yfti-firstrow` n'est plus un marqueur d'en-tête de table (seules les lignes entièrement en gras sont promues) ; balises actives (`template`, `iframe`, `object`, `embed`, `form`, `svg`, `math`…) supprimées au collage ; liens relatifs ou à schéma hostile déballés ; couleurs validées ; `start` posé pour les listes alpha et romaines.
- **angular** : `writeValue` idempotent et non annulable, `touched` non posé lors d'un clic dans la toolbar, chargement de `@aster-editor/word` hors SSR.

### Fixed

- **word** : deux regex quadratiques exploitables au collage (`isWordHtml`, `parseListFormats` : 2 Mo → 137 s, désormais < 1 ms) ; `importDocx(null)` ; hook `upload` non-string ; espaces autour des images inline ; marqueurs `c.` / `1.1.` / overrides `lfo` ; Google Docs `list-style-type` et `div` autour des tables ; HTML tronqué ; export : caractères de contrôle qui corrompaient le .docx, NBSP écrasés, `<ol start>` ignoré, compteurs de sous-listes partagés, `<br>` terminal, `href` non encodés, `hsl()` et `font-size` en % ou mots-clés.
- **ui** : Échap en plein écran depuis l'éditeur, `getIcon('constructor')`, focus perdu à la fermeture des menus, vue source laissée en lecture seule à la destruction de la toolbar, contraste du surlignage en thème night.
- **angular** : validateur de la démo refusant une image seule, erreur affichée sur le mauvais `touched`, `importDocx` après destruction, chemin des fixtures selon le dossier d'exécution.
- **core** : test `image-upload` instable (timers remplacés par une attente de condition), entités et invisibles dans les URL (`&colon;`, U+00AD, U+2060).

## [0.2.0] - 2026-10-12

Testable dans Angular 22 : composant `<aster-editor>`, app démo, images et tables avancées.

### Added

- **angular** : `AsterEditorComponent` standalone, zoneless, `ControlValueAccessor` complet (reactive forms et `ngModel`), inputs signals `toolbar` / `theme` / `locale` / `placeholder` / `readonly` / `config` / `wordPaste`, outputs `ready` / `changed` / `focused` / `blurred`, `importDocx()` avec chargement différé de `@aster-editor/word`, `provideAster()`, tokens `ASTER_CONFIG` et `ASTER_UPLOAD_HANDLER`. 19 tests.
- **demo** : app Angular 22 avec 4 pages (playground, reactive form, import Word, lecture seule), bundle initial 269 kB, mammoth en chunk séparé.
- **core** : images redimensionnables à la souris (NodeView `figure.aster-image`), alignables, éditables au double-clic (`aster:image-edit`), colonnes de table redimensionnables avec HTML stable.
- **ui** : dialogue image en mode édition (alt, titre, largeur, alignement), menu contextuel de table monté par `createAster`, feuille `images-tables.css`.
- Docs : README racine et par paquet, `docs/GUIDE_INTEGRATION.md`, `docs/THEMING.md`, `docs/API_CORE.md`.

### Fixed

- **ui** : bouton Lien toujours grisé (`canRun` testé avec un href vide).
- Config : `noPropertyAccessFromIndexSignature` aligné entre le tsconfig Angular et la base ; dépendances CommonJS de mammoth déclarées pour le build démo.

## [0.1.0] - 2026-10-12

Première version utilisable en vanilla : moteur, toolbar, import Word. Pas encore de wrapper Angular.

### Added

- **core** : `createEditor` sur Tiptap 3, registre de 48 commandes standard typées, i18n fr/en, événements, politique de liens sécurisée, upload d'images avec repli base64, pipeline de transformateurs de collage, raccourcis clavier.
- **word** : `importDocx` via mammoth (style map Aster, post-traitements, notes de bas de page, hook upload) et `normalizeWordHtml` / `normalizeGoogleDocsHtml` en 8 passes pures, `wordPasteTransformer`.
- **ui** : `createToolbar` avec presets `full` / `standard` / `minimal`, composants accessibles (dropdown, dialogues lien et image, sélecteurs couleur, police, titres, grille de table), 58 icônes SVG, thèmes `light` et `night`, `createAster`.
- **angular** : squelette de lib ng-packagr, composant à venir en 0.2.0.
- Monorepo npm workspaces, TypeScript 6.0, Vitest 5, Angular 22, CI GitHub Actions, playground vanilla (`npm run playground`), fixtures .docx et HTML de collage.
- Documents de cadrage : cahier des charges, architecture, stratégie de tests, roadmap de la nuit, template de brief agent, journal, REX.
