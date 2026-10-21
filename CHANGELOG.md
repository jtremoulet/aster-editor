# 📜 Changelog

Toutes les évolutions notables de ce projet sont documentées ici.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versionnage : [SemVer](https://semver.org/lang/fr/).
Une seule version pour tout le monorepo.

## [Unreleased]

## [0.7.0] - 2026-10-21

Réponse aux huit retours de l'intégrateur qui a mis la 0.6.0 en essai à la place de CKEditor : l'aperçu à l'écran se rapproche du document (en-têtes et pieds sur chaque page, défauts de paragraphe et police du document appliqués), les en-têtes et pieds s'éditent dans le dialogue « Mise en page », la recherche défile et ne recouvre plus le texte, les paquets s'importent en Node pur, et un contrôle de contenu lié aux propriétés du document n'est plus pris pour une variable. Session 5 : 4 lots, 2 revues adverses (15 findings, 0 bloquant, 5 majeurs, 14 corrigés avec test, 1 en attente du document du retour n° 1), 2 lots de correctifs.

### Added

- **core** : contrat `DocumentLayout.defaultParagraph` (interligne et espacements des `docDefaults`) ; en vue page, **en-tête et pied sur chaque coupure** (pied de la page qui se termine, en-tête de la page qui commence), variantes `first` (première page d'une section `titlePage`) et `even` (pages paires) calculées par la pagination, en-tête `first` sur l'hôte ; variables `--aster-page-font-family`, `--aster-page-font-size`, `--aster-page-default-line-height`, `--aster-page-default-spacing-before` / `-after` posées depuis `layout.defaultFont` et `layout.defaultParagraph` ; événement DOM `aster:page-view-last-page`.
- **ui** : dialogue « Mise en page » : section **« En-tête et pied »** de la section courante (champs `default`, `first` si « Première page différente », `even` si « Pages paires différentes »), éditeur riche minimal sans Tiptap (`rich-field`), HTML assaini par le core, écrit dans `layout.sections[n]` avec recopie au premier niveau pour la dernière section ; bandeau de recherche **dans le flux** (il pousse le document au lieu de le recouvrir) ; classes `.aster--page-defaults`, règles de repli de police, interligne, espacements et marges de cellule (`0 5.4pt` sans `paddingPt`) en vue page ; 10 clés i18n.
- **word** : `layout.defaultParagraph` lu depuis les `docDefaults` puis le style `Normal`, écrit dans les `docDefaults` de l'export neuf, comparé (`section.defaultParagraph`) ; fixture 20 (champs `TITLE`, `DOCPROPERTY`, `AUTHOR`, `DATE`, `PAGE`, contrôle de contenu lié, `MERGEFIELD`, `{{nom}}` en en-tête et dans le corps) à 1 dans le gabarit.
- **outillage** : `scripts/add-js-extensions.mjs` (codemod et `--check` dans `npm run lint`), étape « import ESM en Node pur » dans `npm run smoke:install`, `scripts/generate-fixtures-fields.ts`.
- **e2e** : `search.spec.ts` (bandeau, défilement dans quatre configurations), `headers-dialog.spec.ts` (édition d'un en-tête de section et export dans le gabarit).

### Changed

- **core, word, ui** : tous les imports relatifs portent l'extension `.js` : les paquets s'importent désormais en Node sans bundler (Vitest sans `server.deps.inline`, SSR). En 0.6.0 : `ERR_UNSUPPORTED_DIR_IMPORT` / `ERR_MODULE_NOT_FOUND`.
- **core** : `searchPluginKey` est typé `PluginKey<SearchPluginState>` (était `DecorationSet`) ; sur une section `titlePage` sans en-tête `first`, la page 1 affiche `default` (Word la laisse vide : écart assumé pour qu'un `layout` imposé avec `headers.default` seul reste visible).
- **ui** : dans le dialogue, un type d'en-tête masqué est conservé (`first` suit `titlePage` comme dans Word ; `even` n'est retiré que si « Pages paires différentes » était cochée à l'ouverture puis décochée) ; la valeur d'un champ est normalisée en point fixe (styles réduits aux propriétés typographiques et de boîte, `class` et `inherit` retirés) et un champ non modifié laisse son jeu strictement identique ; le widget `search` n'utilise plus `.aster-dropdown` (déclencheur `.aster-search-panel__trigger`, panneau `div.aster-search-panel[role=dialog]` inséré avant le contenu) ; bande d'en-tête et de pied jamais inférieure à une ligne (`max(…, 1.4em)`), l'en-tête peut empiéter sur la première ligne quand la marge haute égale la distance d'en-tête (Word pousse le corps, pas la vue page : documenté).
- **word** : un contrôle de contenu `w:sdt` lié aux propriétés du document (`w:dataBinding` vers `coreProperties`, `extended-properties`, `customProperties`, ou sans `w:tag`) n'est plus une variable : Word le remplit, il rend son contenu ou son espace réservé en texte ; un contrôle lié à un XML personnalisé avec `w:tag` nommé reste une variable (contrat de la session 2), comme un contrôle non lié avec `w:alias` seul. Le lecteur retranche désormais interligne et espacements contre les `docDefaults` **puis** le style `Normal` (ce que transporte `defaultParagraph`) et écrit explicitement le défaut Word sur un paragraphe qui n'en a pas quand le document en a un ; `w:before` / `w:after` négatifs et `w:line` ≤ 0 ignorés, `lineRule` inconnu ignoré, `atLeast` non transporté dans `defaultParagraph` (par paragraphe, il reste lu comme un interligne exact : à distinguer au contrat).
- **démo** : le panneau En-tête / Pied de la page Modèle édite l'en-tête affiché sur la page 1 (`first` quand la section 1 a une première page différente) ; toolbar `full` sur la page Modèle (le widget `pageLayout` n'est pas dans le preset `standard`).

### Fixed

- **core** : « suivant » / « précédent » de la recherche ne défilaient pas quand le focus était dans le champ du panneau (`scrollToSelection` de ProseMirror ignore un `focusNode` hors éditeur) : le plugin fait défiler la correspondance courante lui-même, au centre et seulement si elle n'est pas visible ; en-tête et pied visibles sur une seule page quand la marge haute approchait la distance d'en-tête ; en-tête et pied absents des coupures d'un document à une section.
- **ui** : boutons radio collés dans le dialogue d'image.
- **word** : un contrôle de contenu lié ressortait en variable `{{Titre}}` à l'import et dans l'en-tête résolu à l'export (retour POC n° 1).

## [0.6.0] - 2026-10-21

Sections multiples conservées de bout en bout (import, vue page, export dans le gabarit), tabulations, bordures à espace et couleur exactes, alignement des tableaux, styles de tableau conditionnels à l'import ; le chemin stylé devient le défaut. Document client à **0,995** dans son gabarit (0,889 en 0.5.0), fixtures 11-16, 18 et 19 à 1. Session 4 : 16 lots d'agents, 4 revues adverses (33 findings, 31 corrigés, 2 reportés en décision), 4 lots de correctifs, e2e WebKit.

### Added

- **core** : contrat `DocumentLayout.sections` (`SectionLayout` : page, colonnes, en-têtes et pieds, `titlePage`, `start`), nœud `sectionBreak` (`<hr data-section-break="n">`, renuméroté 1..n à chaque édition, jamais vide ni imbriqué), nœud `tab` (`<span data-tab="" data-stop="36pt" data-align="center" data-leader="dot">`, Backspace en une frappe, refusé dans un bloc de code), `BlockBorder.spacePt` (`padding-<côté>`), `TableLayoutAttrs.align` (`data-align`), `TableLayoutAttrs.look` (`data-docx-look`, drapeaux `w:tblLook`), commandes `section.insertBreak` / `section.removeBreak` / `section.renumber` et `text.insertTab`, vue page **par section** (l'hôte porte la section 1, chaque saut porte le format de la suivante, pied de l'hôte = dernière section du corps), pagination par segments de hauteur utile avec coupures de section libellées (« Section 2 · Letter paysage », en-tête et pied de la section), `setPageView` / `getLayout` / `getSectionLayout` au contrat, événement `pageViewChange`, `image.setAttributes.height`, `getText()` rend `\t` pour une tabulation, option `AsterOptions.tabKey` (`'focus'` par défaut : la touche Tab quitte l'éditeur comme en 0.5 ; `'insert'` : elle insère une tabulation).
- **ui** : dialogue « Mise en page » par section (« Section n sur N », sélection à cheval signalée), classes `.aster-page-gap--section`, variables `--aster-page-width-max` et `--aster-page-height-total`, points de suite des tabulations (`.aster-tab[data-leader]`).
- **word** : lecteur : `layout.sections[]` (en-têtes hérités type par type, `titlePage` propre à la section), sauts de section dans le corps, tabulations avec taquet résolu (position, alignement, points de suite, taquets de style de paragraphe et de tableau), `w:space` et couleurs exactes des bordures, `nil` explicite, `w:jc` des tableaux, styles de tableau conditionnels (`tblStylePr` × `tblLook`, défaut Word `0x04A0`, bandes, `insideH` / `insideV`), cache des parties d'en-tête ; export neuf par sections (`<hr data-section-break>` → `w:sectPr` avec page, colonnes, type, en-têtes et pieds propres) ; **greffe des sections dans le gabarit** (`w:sectPr` intermédiaires repris à l'octet par index puis par propriétés, références héritées des sections abandonnées, en-tête ou pied régénéré type par type), `w:tab` + `w:tabs` (alignement, points de suite, position plafonnée), `padding-*` → `w:space` (plafonné à 31), bordures `nil` sur les paragraphes, `data-align` → `w:jc`, `data-docx-look` → `w:tblLook` (dans le gabarit, les fonds, gras et bordures directs égaux au style conditionnel sont retirés : le tableau suit de nouveau son style dans Word) ; comparateur : `paragraph.tabs`, `table.align`, `table.conditional` (style de tableau résolu comme le lecteur, un fond ou un gras conditionnel posé en direct vaut celui du style) ; test de performance (100 pages en < 2 s) ; fixtures 18 (trois sections) et 19 (tabulations, bordures, style conditionnel).
- **e2e** : `sections.spec.ts` (sections, dialogue par section, tabulations, export gabarit à trois `w:sectPr`), projets Playwright `playground-webkit` (11/11) et `playground-firefox` (sondé au démarrage, retiré si Firefox ne se lance pas, `ASTER_E2E_FIREFOX=1` le force).

### Changed

- **word** : **`importDocx` lit en `fidelity: 'styled'` par défaut** (le lecteur OOXML, HTML stylé avec `style` inline et `data-docx-*`). Migration : `importDocx(file, { fidelity: 'semantic' })` retrouve exactement la sortie mammoth de la 0.5 ; les attendus sémantiques sont dans `fixtures/docx/expected/semantic/`. `styleMap` n'a d'effet qu'en `semantic`. Un corps terminé par un saut de section ou un tableau reçoit un `<p></p>` final (idempotent avec l'éditeur) ; `tblLook` absent vaut `0x04A0` comme dans Word ; le comparateur ne compare plus `w:space` sur les bordures de tableau (Word ne l'applique pas) ; les modules `export/` et `reader/` sont découpés sous 400 lignes (API inchangée) ; `<ol>` émet `data-docx-num-id` avant `type` et `colwidth` est posé sur toutes les lignes (idempotence stricte avec l'éditeur sur les fixtures 01, 02, 06-10) ; `units.ts` et `units-blocks.ts` fusionnés (attributs numériques stricts : hexadécimal et exposants rejetés partout).
- **core** : un HTML commençant par un saut de section, à sauts adjacents ou imbriqués n'est plus rendu verbatim (paragraphe inséré, saut imbriqué rétrogradé en `<hr>`), mais `setHTML(getHTML())` reste strictement idempotent ; `setContent` porte la méta `asterSetContent` ; `height` d'image normalisé comme `width`.
- **angular** : le composant écoute `pageViewChange` du contrat au lieu de l'événement DOM (qui reste émis) ; `importFidelity` ne force plus de valeur et suit le défaut de la lib (`styled`).
- **démo** : le panneau En-tête / Pied de la page Modèle édite l'en-tête de la première section et le pied de la dernière, ce que la vue page affiche.

### Fixed

- **core** : un clic pendant un redessin de la pagination était **perdu** (le redessin réécrivait dans le DOM la sélection périmée avant que ProseMirror relise celle du clic), `undo` juste après `setHTML(html, true)` défaisait le chargement, pied de l'hôte et largeur max figés après un saut ajouté ou retiré ; renumérotation des sauts sur collage ou déplacement, sections vides atteignables, Tab scindant un bloc de code, `sections` non tableau retirant la vue page, numéro de section non borné, NodeView de saut et pagination désynchronisés sur des numéros hors ordre, dialogue tronquant `sections`, dialogue sans effet sans saut, libellé de section chevauchant l'en-tête, pied de l'hôte suivant `layout.sections.length` au lieu du corps.
- **word** : règle de la dernière section divergente entre export neuf et gabarit, `w:pos` hors `xsd:int` (Word « contenu illisible »), options `page` / `header` / `footer` limitées à la dernière section, `titlePg` hérité à tort, `margin: auto` sans `w:jc`, `nil` conditionnel jamais appliqué, taquets négatifs, `w:sz="0"` lu différemment sur paragraphe et cellule, `PartStore.has()` ignorant les parties créées pendant la greffe (second en-tête écrasé).

## [0.5.0] - 2026-10-20

Fidélité de mise en page Word : l'utilisateur voit le document tel qu'il est, modifie ce qu'il modifie, sauvegarde dans son gabarit. Pagination approximative, en-têtes et pieds, rapport de fidélité. 17 lots d'agents, 6 revues adverses (73 findings corrigés), 2 bugs trouvés en navigateur réel.

### Added

- **core** : contrat de mise en page (`DocumentLayout`, `ParagraphLayoutAttrs` et sa sérialisation HTML figée, `RunLayoutAttrs`, `ListLayoutAttrs`, `TableLayoutAttrs`, `CellLayoutAttrs`, `PageViewOptions`), extensions `ParagraphLayout` (12 attributs sur paragraphes et titres), `RunLayout` (espacement, casse, style de caractère, styles de trait sur souligné et barré), `ListLayout`, `TableLayout` (largeur, bordures, fonds, alignement vertical, marges de cellule), `AsterHorizontalRule` (`data-page-break` conservé), commandes `paragraph.setLayout` / `paragraph.unsetLayout` (52 commandes standard) et `text.setLetterSpacing` / `text.setCaps` / `text.unsetCaps`, option `pageView` (feuille aux dimensions et marges du document, en-têtes et pieds assainis), **pagination approximative** (coupures visuelles par décorations, « Page n sur N », sauts explicites, blocs insécables, sans transaction), `editor.setPageView()` / `editor.getLayout()` (hors contrat), sérialiseur HTML verbatim (`getHTML()` n'altère plus les styles inline).
- **ui** : widgets `lineSpacing`, `paragraphSpacing`, `indentIncrease` / `indentDecrease`, `paragraphBorders`, `caps`, `underlineStyle`, `pageLayout` (24 widgets), `themes/page.css` (bureau, feuille, en-têtes et pieds, coupures, impression), variables `--aster-page-*`, dialogue d'image avec hauteur et verrou de proportions, 85 icônes, 180 clés i18n.
- **word** : **lecteur OOXML** (`fidelity: 'styled'`) : styles résolus (docDefaults, `basedOn`, thème, styles de tableau), runs (champs simples et complexes, liens, symboles, sauts), paragraphes stylés, tableaux (grille, bordures effectives, fusions, imbrication), listes depuis `numbering.xml`, images DrawingML et VML (`mc:AlternateContent`), notes, en-têtes et pieds hérités entre sections, mise en page des sections, objets non représentables signalés (`DocxImportResult.lost`) ; `DocxImportResult.layout` et `template` ; **export dans le gabarit** (`DocxExportOptions.template`) : corps greffé, relations, médias, numérotations et styles réutilisés ou ajoutés, propriétés directes égales au style supprimées, réconciliation contre les docDefaults, notes, titres numérotés, table des matières actualisée, variables des en-têtes résolues, en-tête ou pied modifié régénéré, repli en export neuf ; `DocxExportOptions.layout` pour l'export neuf ; **rapport de fidélité** `compareDocx` et `npm run fidelity` (propriétés effectives, parties à l'octet, score pondéré) ; codes d'avertissement `image-skipped`, `object-lost`, `reader`, `template-invalid`, `template-style-missing`, `template-numbering-fallback`, `template-section-missing`.
- **angular** : inputs `importFidelity`, `exportInTemplate`, `pageView`, `layout`, output `layoutChanged`, signals `importedTemplate`, `layout`, `lostObjects`, méthode `compareWithTemplate()` ; page démo « Modèle » avec vue page, panneau En-tête / Pied éditable, rapport de fidélité, objets non représentables, téléchargement dans le gabarit ; page « Import » avec choix du chemin et mise en page lue.
- Fixtures de mise en page 11-17 (`scripts/generate-fixtures-layout.ts`), attendus du chemin stylé, `fixtures/docx/client/` hors dépôt pour les documents clients, e2e `fidelity.spec.ts` (42 tests e2e), 1 971 tests unitaires.

### Changed

- **core** : `getHTML()` sérialise les couleurs en `#rrggbb` minuscules et sans `;` final (0.4 rendait `rgb(…)`) ; un `<span style>` sans attribut `textStyle` résolu ne produit plus de `<span>` vide ; `paragraph.setLayout` ignore les valeurs invalides au lieu d'effacer ; `colspan` plafonné à 63 et `rowspan` à 1 000 au parse ; attribut `data-docx-num-indent` conservé.
- **ui** : `indentIncrease` / `indentDecrease` remplacent `indent` / `outdent` dans les presets `full` et `standard` ; bornes Word sur retraits, espacements, interlignes, bordures et marges de page.
- **word** : l'export conserve l'espace finale d'un paragraphe ; un `.docx` importé en `styled` ne charge pas mammoth ; le défaut de `fidelity` dans `importDocx` reste `semantic` (le composant Angular, la démo et le playground utilisent `styled`), bascule prévue en 0.6.

### Fixed

- **core** : XSS par `java\tscript:` dans l'assainisseur des en-têtes de la vue page, assainissement itératif plafonné, commandes de mise en page sur toutes les cellules d'une `CellSelection`, garde `suspiciousAttributes` du sérialiseur, nombres de mise en page bornés.
- **word** : déclaration XML doublée dans Chromium (prétraitement des champs, greffe, en-têtes) qui vidait le chemin stylé des documents à champs de fusion et invalidait l'export dans le gabarit ; `gridSpan` géant, `w:sym` hors Unicode, champ `HYPERLINK` jamais fermé, nom de police injectant du CSS, chaînes de styles quadratiques, compteurs de listes à travers les tableaux, zones de texte avec image, gabarit de 50 Mo.

## [0.4.3] - 2026-10-20

### Fixed

- **word** : l'import `.docx` conserve les paragraphes vides (lignes laissées par Entrée) : un aller-retour export → import perdait chaque saut de ligne de l'auteur. mammoth ne les ignore plus et la passe `stripEmptyParagraphs` ne s'applique qu'avec la nouvelle option `emptyParagraphs: 'drop'` de `DocxImportOptions`, qui retrouve l'ancien nettoyage des lignes vides de Word. Conséquence visible : un document vide importe en `<p></p>` (un `.docx` a toujours au moins un paragraphe) au lieu d'une chaîne vide.
- **core** : test de non-régression sur la conservation des paragraphes vides par `setHTML(getHTML())`.

## [0.4.2] - 2026-10-19

### Fixed

- **core, ui** : les dépendances Tiptap repassent en intervalles caret (`^3.31.4`). L'épinglage exact de la 0.4.1 faisait installer jusqu'à quatre copies de `@tiptap/core` chez un consommateur (Tiptap résout ses propres dépendances en caret vers 3.32), donc des plugins ProseMirror dupliqués. Le lockstep se garantit par le lockfile du monorepo, pas par les intervalles publiés.
- `smoke:install` vérifie désormais qu'une seule copie physique de `@tiptap/core` est installée.

## [0.4.1] - 2026-10-19

Préparation de la publication npm sous le scope `@aster-editor`.

### Added

- Métadonnées de publication dans les quatre paquets (`publishConfig.access: public`, `repository`, `homepage`, `bugs`, `keywords`, `engines`, `LICENSE` embarqué), `@aster-editor/word` déclaré peer optionnel d'`angular`.
- `scripts/release.mjs` (`npm run release` / `release:dry`) : publication dans l'ordre des dépendances, Angular depuis sa sortie ng-packagr, garde-fous version unique / peers / tag, reprise après échec partiel.
- `scripts/set-version.mjs` (`npm run version:set`) : version unique et peers `^<version>` réécrits.
- `scripts/smoke-install.mjs` (`npm run smoke:install`) : installation à blanc des tarballs dans un projet vierge, résolution des `exports`, typecheck et bundle vanilla, composant Angular compilé par `ngc`.
- Workflow `release.yml` : publication sur tag `v*` par publication de confiance npm (OIDC, provenance), mode simulation manuel.
- `docs/PUBLICATION.md` : compte, organisation, première publication manuelle, rituel de release, dépannage.

### Changed

- **core** : dépendances Tiptap épinglées en version exacte (`3.31.4`), comme `ui`, pour garantir le lockstep chez les consommateurs.
- Peer dependencies `@aster-editor/*` passées de `>=0.0.1` à `^0.4.1`.

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
- **word (export)** : appels de note dans les en-têtes, pieds ou notes (Word les refuse) → exposant + `footnote-not-allowed` ; `colspan` démesuré faisait tourner l'export indéfiniment (borné à 63 colonnes, `table-span-clamped`) ; nom de champ de fusion avec blanc non cité ; valeurs multi-lignes et blancs aplatis ; valeur non chaîne rejetait l'export ; motif avec drapeau sticky ; `footer.align` ignoré pour le numéro de page ; collision de clés de notes ; marges hors page (`page-margins-clamped`).

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
