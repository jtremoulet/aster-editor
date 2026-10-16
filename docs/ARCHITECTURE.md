# 🏗️ Architecture — Aster Editor

> Comment les paquets s'emboîtent, quels contrats les séparent, et pourquoi. État 0.4.0.

## 🧩 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────┐
│ apps/demo (Angular 22)            e2e/ (Playwright)          │
├──────────────────────────────────────────────────────────────┤
│ @aster-editor/angular   <aster-editor> CVA, signals, DI      │
├───────────────────────────┬──────────────────────────────────┤
│ @aster-editor/ui          │ @aster-editor/word               │
│ toolbar vanilla, widgets, │ importDocx (prétraitement XML),  │
│ thèmes, menus, bulles,    │ exportDocx (fidélité Word),      │
│ suggestion {{, menu /     │ normalizeWordHtml, WordPaste     │
├───────────────────────────┴──────────────────────────────────┤
│ @aster-editor/core                                           │
│ createEditor, registre, extensions, variables, recherche,    │
│ sommaire, pinceau, markdown, autosave, i18n, events          │
├──────────────────────────────────────────────────────────────┤
│ Tiptap 3  →  ProseMirror (@tiptap/pm)                        │
└──────────────────────────────────────────────────────────────┘
```

Sens des dépendances : `angular → ui, word, core` ; `ui → core` ; `word → core`. **Jamais l'inverse.** Le core ne connaît ni la toolbar ni Word, il expose juste des points d'extension (options, registre, événements DOM `aster:*`).

## 📦 Paquets

### `@aster-editor/core`

Responsabilités :

- `createEditor(options)` : instancie Tiptap avec le jeu d'extensions Aster, retourne un `AsterEditor`.
- **Registre de commandes** : chaque action éditable est une `AsterCommand` nommée, avec `run`, `canRun`, `isActive`, clé i18n, icône, raccourci. 50 commandes du contrat (`variable.insert` / `variable.remove` compris) + 6 commandes `search.*` + 2 commandes `formatPainter.*`. La toolbar et le wrapper Angular ne parlent qu'au registre, jamais à Tiptap directement.
- **Extensions Aster** (`createAsterExtensions`) : `StarterKit` sans `link`, `Link` sécurisé par la politique (`createLinkExtension`), `Image` Aster avec `width`, `align`, NodeView redimensionnable et politique appliquée au parsing (`createImageExtension`), `Variable` (nœud inline atomique, NodeView lié au magasin, règle de saisie `{{nom}}`), `TableKit` redimensionnable, `TaskList`, `TextAlign`, `Subscript`, `Superscript`, `Highlight`, `TextStyleKit`, `Placeholder`, `CharacterCount`, `Search` (décorations + storage), `Outline` (attribut `id` des titres), raccourcis Aster (`createShortcutsExtension`, priorité haute, commandes désactivées avalées). L'upload d'images et le pipeline de collage sont des `editorProps` (`createImageUploadProps`, `createPastePipelineProps`). Pas de sanitizer HTML dédié : le schéma ProseMirror est le filtre, voir `docs/GUIDE_INTEGRATION.md` section sécurité.
- **Variables de document** : le magasin `editor.variables` (`createVariableStore`) porte déclarations, valeurs et résolveur ; les puces ne stockent que `name` et `label`, la valeur vit dans le magasin et le NodeView se rafraîchit sur `variablesChange`. `getHTML({ variables: 'resolve' })` délègue à `resolveVariablesHtml`, fonction pure réutilisable hors éditeur ; `getText()` rend la valeur ou `{{nom}}`. Le core ne convertit jamais un `{{nom}}` chargé ou collé : c'est le rôle de `word`.
- **i18n** : `t(key, params)` avec dictionnaires `fr` et `en` (63 clés), extensibles.
- **Événements** : émetteur typé, `on/off`, vidé à `destroy`. `variablesChange` s'ajoute aux événements de 0.3.0.
- **Sérialisation** : `getHTML` (normalisé par `normalizeOutputHtml`, mis en cache par transaction), `setHTML`, `getJSON`, `setJSON`, `getText`, plus `getMarkdown` / `setMarkdown` en fonctions compagnons.
- **Fonctions compagnons** (le contrat `AsterOptions` / `AsterEditor` est figé) : `createAutosave(editor, options)`, `getMarkdown(editor)`, `setMarkdown(editor, md)`, `getSearchStorage(editor)`, `getOutline(editor)`, `scrollToHeading(editor, pos)`, `getFormatClipboard(editor)`, `resolveVariablesHtml(html, values)`.
- **Hooks d'extension** : `options.extensions` pour ajouter des extensions Tiptap, `options.commands` pour enregistrer des commandes custom, `options.pasteTransformers` pour chaîner des transformateurs de collage (c'est par là que `word` se branche), événements DOM `aster:search-open`, `aster:image-edit`, `aster:variable-edit` et `aster:format-painter-change` sur `editor.element` pour que `ui` ouvre ses panneaux et reflète l'état sans que le core la connaisse.

Structure :

```
packages/core/src/
├── api/              types publics figés en phase 0 : AsterEditor, AsterOptions, AsterCommand, AsterEvents, variables, toolbar
├── editor/           AsterEditorImpl (cycle de vie, cache HTML, historique), createEditor, émetteur, variable-store
├── commands/         registre + commandes par domaine (marks, blocks, lists, alignment, links, images, tables, text-style, history, search, variables, format-painter)
├── extensions/       assemblage Tiptap, link-safety, image (NodeView), variable (NodeView, règle de saisie), outline, image-upload, paste-pipeline, search, shortcuts, autosave
├── html/             normalize-output (HTML stable, bruit de table retiré), resolve-variables (substitution pure)
├── markdown/         html-to-markdown, markdown-to-html, getMarkdown / setMarkdown
├── i18n/             createI18n, dictionnaires fr.ts et en.ts
└── index.ts          exports publics uniquement
```

### `@aster-editor/word`

Responsabilités :

- `importDocx(input: DocxInput, options?): Promise<DocxImportResult>` en trois temps : **prétraitement XML** (`docx/preprocess/`) de l'archive avec `jszip` dès qu'une partie texte contient un champ ou un contrôle de contenu — les `MERGEFIELD` (`w:fldSimple` et champs complexes `w:fldChar`) et les `w:sdt` à `w:tag` / `w:alias` sont réécrits en runs `{{nom}}`, les `{{nom}}` des en-têtes et pieds sont collectés sans réécriture —, puis **mammoth** (import dynamique) avec une style map maison, puis **post-traitements DOM** (`docx/postprocess/`) sur le HTML produit : numérotation des listes, en-têtes de table, images en data URL ou passées au hook `upload`, notes de bas de page, déballage des paragraphes de cellule, paragraphes vides, et pose des puces `<span data-aster-variable>` avec les libellés et valeurs collectés (`DocxImportResult.variables`). Le prétraitement ne lève jamais : en cas d'échec, import sans lui et avertissement `variables-preprocess-failed`.
- `exportDocx(input: string | AsterDocument, options?): Promise<Blob>` via la lib `docx` (import dynamique) : HTML Aster → document Word, avec `jsonToHtml` pour l'entrée JSON, une numérotation dédiée par liste, images embarquées (data URL ou `fetchImage`), tables avec fusions et largeurs de colonnes, variables en trois modes (`placeholders`, `resolve`, `fields` → `MERGEFIELD`), en-têtes et pieds de page avec numéros de page, sauts de page, table des matières (`TOC`, `w:updateFields`), notes de bas de page réelles (`footnotes.xml`), titres numérotés, styles de titres, mise en page (format, orientation, marges bornées), langue, police par défaut, propriétés du document, assainissement XML (`sanitize.ts`). `downloadDocx(blob, filename)` pour le navigateur.
- `normalizeWordHtml(html: string, options?): string` : fonction **pure**, sans DOM global, qui prend le HTML du presse-papier Word et rend un HTML propre. Pipeline de passes nommées et testables individuellement (`WORD_PASSES`) :
  1. `stripConditionalComments`
  2. `stripOfficeNamespaces` : `<o:p>`, `<w:*>`, `<v:*>`, `<m:*>`, et les balises actives (`template`, `iframe`, `object`, `embed`, `form`, `svg`, `math`…)
  3. `rebuildLists` : lit `mso-list:lX levelN lfoM` et les `@list` de la feuille de style, reconstruit `<ul>/<ol>` imbriqués avec `type` et `start`
  4. `normalizeHeadings` : `<p class="MsoHeading1">` → `<h1>`, citations
  5. `cleanInlineStyles` : supprime `mso-*`, polices, tailles, conserve gras/italique/souligné/couleur validée si option, déballe les liens hostiles
  6. `normalizeTables` : supprime attributs de layout, détecte les en-têtes (ligne entièrement en gras, jamais `mso-yfti-firstrow`)
  7. `collapseEmptyParagraphs`
  8. `normalizeWhitespace`
  9. `wrapVariables` : `{{nom}}` en texte → `<span data-aster-variable>`, hors `<pre>` / `<code>`, après recollage des textes adjacents ; le moteur (`wrapVariablePlaceholders`) est partagé avec le post-traitement de l'import
- `isWordHtml(html)` et `isGoogleDocsHtml(html)` : détecteurs sur chaîne, en temps linéaire.
- `normalizeGoogleDocsHtml(html)` : pipeline plus court (passes 1, 2, déballage du `<b>` Google, réimbrication des sous-listes, `list-style-type` → `type`, passe 5, `<div>` autour des tables, passes 6 à 9).
- `wordPasteTransformer(options)` : fabrique un `PasteTransformer` (détection Word / Google Docs, normalisation, passthrough sinon, jamais d'exception) à passer dans `AsterOptions.pasteTransformers`. Ce n'est pas une extension Tiptap : le core possède le hook `transformPastedHTML`.

Le parsing HTML se fait avec le `DOMParser` du navigateur (injectable via `parse` pour SSR et tests), et avec jsdom en test. Le XML du prétraitement passe par `DOMParser` / `XMLSerializer` (injectables, `XmlCodec`). Aucune dépendance à un parseur tiers.

Structure :

```
packages/word/src/
├── docx/             importDocx, style-map, types (DocxInput, DocxImportResult, DocxVariableOptions…)
│   ├── preprocess/   variables (orchestration jszip), fields (MERGEFIELD), content-controls (w:sdt), names, xml-utils
│   └── postprocess/  normalize-lists, normalize-tables, normalize-images, footnotes, variables, unwrap-cell-paragraphs, strip-empty-paragraphs
├── export/           exportDocx, downloadDocx, jsonToHtml, html-to-docx (blocks, inline, tables, images, variables, header-footer, toc, footnotes, column-widths, context, css, styles, sanitize), docx-module
├── paste/            normalizeWordHtml, passes/ (9 passes dont variables), detectors, security.spec
├── google/           normalizeGoogleDocsHtml
├── extension/        wordPasteTransformer (PasteTransformer)
└── index.ts
```

### `@aster-editor/ui`

Responsabilités :

- `createAster(host, options)` : monte thème, toolbar, menu contextuel de table, dialogue et suggestion `{{` des variables, bulles de lien et d'image, menu `/`, contrôleurs de vue source et de plein écran, et l'éditeur. Chaque extra est conditionné à la commande du core qu'il requiert (`variable.insert`, `link.set`, `image.setAttributes`) et désactivable par option. `createToolbar(editor, container, config)` rend une toolbar DOM à partir du registre de commandes. Aucune logique d'édition dedans.
- Composants vanilla (`components/`) : `button`, `dropdown` (générique, `menu` ou `dialog`, retourné s'il déborde), `tooltip`, `heading-menu`, `font-menu`, `color-picker`, `table-grid-picker`, `table-context-menu`, `link-dialog`, `image-dialog` (insertion et édition), `search-panel`, `source-view`, `fullscreen` (avec `OPEN_PANEL_SELECTORS` pour qu'Échap ferme un panneau avant de quitter), `special-chars`, `print`, `variable-menu`, `variable-suggestion` (plugin `@tiptap/suggestion` placé en tête des plugins pour passer avant les keymaps), `variable-dialog`, `bubble` (générique, positionné par `@floating-ui/dom`), `link-bubble`, `image-bubble`, `slash-menu` (second plugin `@tiptap/suggestion`), `outline-panel`, `format-painter-button`. Fonctions fabriques retournant `{ element, update, destroy }`, pas de classes ni de Web Components en V1 pour rester simple à styler. Les panneaux flottants sont montés dans `editor.element` en `position: fixed` pour hériter des variables du thème.
- Presets `full`, `standard`, `minimal` exprimés en config déclarative (`[['undo', 'redo'], [{ type: 'widget', widget: 'heading' }], …]`), 16 widgets nommés dans `WIDGETS`.
- Thèmes (`themes/`) : `base.css`, `images-tables.css`, `search-source.css`, `print.css`, `variables.css`, `bubbles.css`, `light.css`, `night.css`, assemblés par `aster.css`. Tout passe par 30 variables `--aster-*`, contraste AA vérifié par test.
- Icônes : 77 SVG inline en TypeScript, jeu maison sous MIT, 20 × 20, `currentColor`.
- Accessibilité : `role="toolbar"`, `aria-pressed` sur les commandes à état seulement, `aria-label`, roving tabindex, dialogues et menus au clavier, panneaux `listbox` avec `aria-activedescendant` sur le contenteditable, `Échap` partout.

### `@aster-editor/angular`

Responsabilités :

- `AsterEditorComponent` standalone, `ControlValueAccessor`, inputs signals (`toolbar`, `theme`, `locale`, `placeholder`, `readonly`, `config`, `wordPaste`, `ariaLabel`, `ariaLabelledBy`, `variables`, `variableValues`, `variableResolver`, `allowUnknownVariables`, `variableSuggestion`), outputs (`ready`, `changed`, `focused`, `blurred`, `variablesChanged`), signals `editor()` et `variableNames()`, méthodes `getHTML(options?)`, `resolveVariables()`, `importDocx(file)` (déclare les variables trouvées), `exportDocx(options?)` (transmet les valeurs du magasin). Crée l'éditeur dans `afterNextRender`, le détruit dans `DestroyRef`, le remonte quand `toolbar` change en conservant contenu, déclarations et valeurs de variables.
- `provideAster(config: Partial<AsterUiOptions>)` avec l'`InjectionToken` `ASTER_CONFIG`.
- `ASTER_UPLOAD_HANDLER` : token pour brancher l'upload d'images sur un service applicatif.
- Compatible SSR : aucun accès au DOM hors `afterNextRender`, `@aster-editor/word` chargé par `import()` au montage seulement.
- Peer deps : `@angular/core`, `common`, `forms` ≥ 20, `@aster-editor/core`, `@aster-editor/ui`. `@aster-editor/word` en peer dependency optionnelle, chargée dynamiquement.

### `apps/demo` et `e2e/`

- `apps/demo` : Angular 22, cinq routes chargées à la demande (`/`, `/form`, `/import`, `/readonly`, `/template`), sert de banc d'essai manuel et de cible e2e. mammoth et `docx` sortent dans des chunks séparés. La page `/template` est l'implémentation de référence du tour « modèle de document » (import, formulaire généré, aperçu résolu, trois exports).
- `e2e/` : Playwright, deux projets Chromium (`playground` sur le bundle esbuild de `scripts/vanilla-playground/`, avec `playground.spec.ts` et `variables.spec.ts` ; `demo` sur `ng serve`, `demo.spec.ts`), serveurs lancés par Playwright, captures dans `e2e/output/`.

## 📜 Contrat public du core

Figé en phase 0 dans `packages/core/src/api/`, enrichi depuis sans rupture (session 2 : `variables`, `getHTML(options?)`, `variablesChange`, `variable.*`). Extrait de l'intention, le fichier fait foi (détail champ par champ dans [`docs/API_CORE.md`](./API_CORE.md)) :

```ts
export interface AsterOptions {
  element: HTMLElement;
  content?: string | AsterDocument; // HTML ou JSON ProseMirror
  placeholder?: string;
  readOnly?: boolean;
  locale?: AsterLocale; // 'fr' | 'en' | string
  autofocus?: boolean;
  extensions?: readonly AnyExtension[]; // extensions Tiptap additionnelles
  commands?: readonly AsterCommand[]; // commandes custom
  pasteTransformers?: readonly PasteTransformer[]; // (html, ctx) => html
  upload?: UploadHandler; // (file) => Promise<string>
  linkPolicy?: LinkPolicy; // liens et images
  variables?: VariableSource; // déclarations, valeurs, résolveur, allowUnknown
  disabledCommands?: readonly string[];
}

export interface AsterEditor {
  readonly tiptap: Editor; // porte de sortie, non garantie stable
  readonly commands: CommandRegistry;
  readonly i18n: I18n; // t, getLocale, setLocale, addTranslations, has
  readonly variables: VariableStore; // list, getNames, getValues, setValues, define, insert, resolve, hasUnresolved
  readonly element: HTMLElement;
  readonly contentElement: HTMLElement;
  getHTML(options?: GetHtmlOptions): string; // { variables: 'placeholders' | 'resolve' }
  setHTML(html: string, emit?: boolean): void; // emit=false : silencieux, hors historique, historique vidé
  getJSON(): AsterDocument;
  setJSON(doc: AsterDocument, emit?: boolean): void;
  getText(): string;
  insertHTML(html: string): void; // brut : pas de pasteTransformers
  isEmpty(): boolean;
  getCounts(): AsterCounts;
  focus(position?: 'start' | 'end' | 'all'): void; // synchrone
  blur(): void;
  isFocused(): boolean;
  setReadOnly(value: boolean): void; // readOnlyChange, jamais change
  isReadOnly(): boolean;
  isDestroyed(): boolean;
  on<E extends AsterEventName>(event: E, handler: AsterEvents[E]): Unsubscribe;
  off<E extends AsterEventName>(event: E, handler: AsterEvents[E]): void;
  emit<E extends AsterEventName>(event: E, ...payload: Parameters<AsterEvents[E]>): void;
  destroy(): void; // ensuite les méthodes de contenu lèvent
}

export interface AsterCommand<Args = unknown> {
  readonly id: CommandId; // 'bold', 'heading', 'table.insert', 'variable.insert'
  readonly labelKey: string; // clé i18n
  readonly icon?: string; // id d'icône, résolu par ui
  readonly shortcut?: string; // 'Mod-b'
  run(editor: AsterEditor, args: Args): boolean;
  canRun?(editor: AsterEditor, args: Args): boolean;
  isActive?(editor: AsterEditor, args: Args): boolean;
}
```

## 🔄 Pipelines Word

```
.docx ──jszip: préprocess XML (MERGEFIELD, w:sdt → {{nom}})──► .docx réécrit ──mammoth + styleMap──► HTML brut ──postprocess (puces, listes, tables, notes…)──► HTML Aster + variables ──setHTML + define──► ProseMirror
clipboard Word ──isWordHtml──► normalizeWordHtml (9 passes, {{nom}} → puce) ──► HTML Aster ──transformPastedHTML──► ProseMirror
ProseMirror ──getHTML (ou getJSON → jsonToHtml)──► DOMParser ──html-to-docx (variables selon mode, en-têtes, TOC, notes)──► lib docx ──Packer──► Blob .docx
```

Le schéma ProseMirror est la dernière ligne de défense à l'entrée : tout ce qu'il ne connaît pas est jeté. Les normaliseurs visent donc à **préserver l'intention** du document, pas à produire un HTML parfait. Le prétraitement XML n'ouvre l'archive que si une partie contient une balise de champ ou de contrôle (29 ms mesurés sur 5 Mo) et laisse intact tout le reste du XML (`HYPERLINK`, `PAGE`, `TOC`, mise en page). À la sortie, `html-to-docx` traverse le DOM bloc par bloc (`blocks.ts`), traduit les marques en propriétés de run (`inline.ts`), découpe le texte brut sur le motif des variables (`variables.ts`), donne à chaque liste sa propre numérotation (`registerList` dans `context.ts`), et tout texte passe par `sanitizeXmlText` avant d'entrer dans le XML.

## 🧭 Décisions produit

Fixées par les revues adverses de 0.3.0 et 0.4.0 et figées par des tests :

- **Pas de titre dans un item de liste** : `heading` et `paragraph` posent le type sans repli ni bascule ; dans une liste ils répondent `false` sans toucher au document (Tiptap sortait l'item de sa liste avant d'échouer).
- **Pas de table imbriquée** : `table.insert` est refusée dans une table, même si le schéma les tolère au parsing.
- **`clearFormatting` conserve les liens** et ne sort jamais d'une liste, d'une citation ou d'une cellule : un lien est une donnée, pas une mise en forme.
- **`setHTML(…, false)` vide l'historique** : une resynchronisation silencieuse ne doit pas laisser un `undo` rejouer l'ancien document.
- **`setReadOnly` n'émet pas `change`** : désactiver un formulaire ne le salit pas.
- **`insertHTML` est brut** : le pipeline de collage ne s'applique qu'au collage.
- **Politique d'images** : mêmes protocoles que les liens, plus `blob:` et `data:image/` seulement ; appliquée au parsing, pas seulement aux commandes.
- **HTML de sortie stable** : ni `colgroup`, ni `min-width`, ni `colspan="1"`, ni `<figure>` ; les largeurs d'image sont un attribut `width`, l'alignement un `data-align` ; les variables un `<span data-aster-variable>` avec `{{nom}}` en texte ; les titres n'ont d'`id` que si le sommaire a été utilisé ou si le HTML en avait.
- **Une correspondance de recherche ne traverse pas un bloc**, recherche littérale sans regex.
- **`aria-pressed` seulement sur les commandes à état** ; les boutons ne volent pas le focus au `mousedown`.
- **La valeur d'une variable n'est pas dans le document** : une seule source de vérité, le magasin ; un nom invalide rend le nœud inerte (`variableName()` → `''`) ; le core ne convertit jamais un `{{nom}}` chargé ou collé, seules la règle de saisie et `word` le font ; une valeur est du texte, jamais du HTML.
- **`resolve()` applique les succès avant de rejeter** : un résolveur qui échoue sur une variable ne fait pas perdre les autres.
- **Champs de fusion sans marques** : en mode `fields`, `w:fldSimple` ne porte pas de propriétés de run ; c'est documenté plutôt que contourné par un champ complexe.
- **Word fait les calculs** : numéros de page, table des matières et numérotation des titres sont des champs et des styles mis à jour par Word à l'ouverture, pas des valeurs écrites par l'export.

## 🎨 Théming

Trente variables définies sur `.aster[data-theme='light']` et `.aster[data-theme='night']`, valeurs de repli sur `.aster` dans `base.css`. Catégories : surfaces, texte, accent, bordures, danger, rayons, espacements, typographie, ombre, focus, tailles, surlignage, sélection. Un intégrateur crée un thème en surchargeant les variables, sans toucher aux classes. Les feuilles des fonctionnalités (`images-tables.css`, `search-source.css`, `print.css`, `variables.css`, `bubbles.css`) ne déclarent aucune variable et sont vérifiées par test contre les deux thèmes. Détail dans [`docs/THEMING.md`](./THEMING.md).

## 🏭 Build et publication

- Paquets vanilla : `tsc -p tsconfig.build.json` → `dist/` ESM + `.d.ts`. `exports` avec `"."` et, pour `ui`, `"./themes/*"` servi depuis le dossier `themes/` du paquet.
- Angular : ng-packagr, format APF, `sideEffects: false`.
- Racine : `npm run build` enchaîne core → word → ui → angular, ordre déclaré dans `workspaces`.
- CI GitHub Actions : un job lint + typecheck + tests + build, un job e2e Playwright (Chromium) avec rapport en artefact.
- Publication npm sous l'org `@aster-editor`, hors périmètre de la nuit.

## ⚖️ Licences des dépendances de production

| Paquet                                              | Licence                             |
| --------------------------------------------------- | ----------------------------------- |
| @tiptap/\* (dont @tiptap/suggestion)                | MIT                                 |
| prosemirror-\* via @tiptap/pm                       | MIT                                 |
| @floating-ui/dom (bulles, `ui`)                     | MIT                                 |
| mammoth                                             | BSD-2-Clause                        |
| jszip (prétraitement XML de `word`, et via mammoth) | MIT ou GPLv3 au choix, on prend MIT |
| @xmldom/xmldom (via mammoth)                        | MIT                                 |
| docx (export .docx, génération de fixtures)         | MIT                                 |
| @playwright/test (dev uniquement, e2e)              | Apache-2.0                          |
| @angular/\*                                         | MIT                                 |

Toute nouvelle dépendance s'ajoute ici avant d'entrer dans le code.

## ⚠️ Risques techniques identifiés

| Risque                                                       | Mitigation                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| API Tiptap 3 différente de la v2 en mémoire                  | Lire `node_modules/@tiptap/*/dist/*.d.ts`, tester tôt en phase 0          |
| TS 6.0 imposé par Angular 22, outillage pas tous compatibles | Pas de bundler pour les libs, `tsc` pur. Vitest 5 vérifié en phase 0      |
| mammoth et docx en bundle navigateur via Angular CLI         | Import dynamique, chunk séparé vérifié par le budget `initial` de la démo |
| Vite à froid recharge la page au premier `importDocx`        | Documenté dans le guide, `toPass` dans le test e2e de la démo             |
| Plugins `@tiptap/suggestion` enregistrés après les keymaps   | Placés en tête de la liste des plugins, figé par test (Entrée dans `{{`)  |
| Motif de variables fourni par l'intégrateur (ReDoS)          | Documenté comme à sa charge, motif recompilé sans `y`, `<pre>` exclus     |
| Conflits git entre agents                                    | Lots sur dossiers disjoints, fichiers partagés réservés à l'orchestrateur |
| Compaction de contexte de l'orchestrateur                    | `docs/JOURNAL.md` mis à jour après chaque lot, lisible à froid            |
