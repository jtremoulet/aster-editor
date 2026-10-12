# 🏗️ Architecture — Aster Editor

> Comment les paquets s'emboîtent, quels contrats les séparent, et pourquoi. État 0.3.0.

## 🧩 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────┐
│ apps/demo (Angular 22)            e2e/ (Playwright)          │
├──────────────────────────────────────────────────────────────┤
│ @aster-editor/angular   <aster-editor> CVA, signals, DI      │
├───────────────────────────┬──────────────────────────────────┤
│ @aster-editor/ui          │ @aster-editor/word               │
│ toolbar vanilla, widgets, │ importDocx, exportDocx,          │
│ thèmes, menus, a11y       │ normalizeWordHtml, WordPaste     │
├───────────────────────────┴──────────────────────────────────┤
│ @aster-editor/core                                           │
│ createEditor, registre, extensions, recherche, markdown,     │
│ autosave, i18n, events                                       │
├──────────────────────────────────────────────────────────────┤
│ Tiptap 3  →  ProseMirror (@tiptap/pm)                        │
└──────────────────────────────────────────────────────────────┘
```

Sens des dépendances : `angular → ui, word, core` ; `ui → core` ; `word → core`. **Jamais l'inverse.** Le core ne connaît ni la toolbar ni Word, il expose juste des points d'extension (options, registre, événements DOM `aster:*`).

## 📦 Paquets

### `@aster-editor/core`

Responsabilités :

- `createEditor(options)` : instancie Tiptap avec le jeu d'extensions Aster, retourne un `AsterEditor`.
- **Registre de commandes** : chaque action éditable est une `AsterCommand` nommée, avec `run`, `canRun`, `isActive`, clé i18n, icône, raccourci. 48 commandes du contrat + 6 commandes `search.*`. La toolbar et le wrapper Angular ne parlent qu'au registre, jamais à Tiptap directement.
- **Extensions Aster** (`createAsterExtensions`) : `StarterKit` sans `link`, `Link` sécurisé par la politique (`createLinkExtension`), `Image` Aster avec `width`, `align`, NodeView redimensionnable et politique appliquée au parsing (`createImageExtension`), `TableKit` redimensionnable, `TaskList`, `TextAlign`, `Subscript`, `Superscript`, `Highlight`, `TextStyleKit`, `Placeholder`, `CharacterCount`, `Search` (décorations + storage), raccourcis Aster (`createShortcutsExtension`, priorité haute, commandes désactivées avalées). L'upload d'images et le pipeline de collage sont des `editorProps` (`createImageUploadProps`, `createPastePipelineProps`). Pas de sanitizer HTML dédié : le schéma ProseMirror est le filtre, voir `docs/GUIDE_INTEGRATION.md` section sécurité.
- **i18n** : `t(key, params)` avec dictionnaires `fr` et `en` (58 clés), extensibles.
- **Événements** : émetteur typé, `on/off`, vidé à `destroy`.
- **Sérialisation** : `getHTML` (normalisé par `normalizeOutputHtml`, mis en cache par transaction), `setHTML`, `getJSON`, `setJSON`, `getText`, plus `getMarkdown` / `setMarkdown` en fonctions compagnons.
- **Fonctions compagnons** (le contrat `AsterOptions` / `AsterEditor` est figé) : `createAutosave(editor, options)`, `getMarkdown(editor)`, `setMarkdown(editor, md)`, `getSearchStorage(editor)`.
- **Hooks d'extension** : `options.extensions` pour ajouter des extensions Tiptap, `options.commands` pour enregistrer des commandes custom, `options.pasteTransformers` pour chaîner des transformateurs de collage (c'est par là que `word` se branche), événements DOM `aster:search-open` et `aster:image-edit` sur `editor.element` pour que `ui` ouvre ses panneaux sans que le core la connaisse.

Structure :

```
packages/core/src/
├── api/              types publics figés en phase 0 : AsterEditor, AsterOptions, AsterCommand, AsterEvents, toolbar
├── editor/           AsterEditorImpl (cycle de vie, cache HTML, historique), createEditor, émetteur
├── commands/         registre + commandes par domaine (marks, blocks, lists, alignment, links, images, tables, text-style, history, search)
├── extensions/       assemblage Tiptap, link-safety, image (NodeView), image-upload, paste-pipeline, search, shortcuts, autosave
├── html/             normalize-output (HTML stable, bruit de table retiré)
├── markdown/         html-to-markdown, markdown-to-html, getMarkdown / setMarkdown
├── i18n/             createI18n, dictionnaires fr.ts et en.ts
└── index.ts          exports publics uniquement
```

### `@aster-editor/word`

Responsabilités :

- `importDocx(input: DocxInput, options?): Promise<DocxImportResult>` via mammoth (import dynamique), avec une **style map** maison et des post-traitements DOM sur le HTML produit (`docx/postprocess/`) : numérotation des listes, en-têtes de table, images en data URL ou passées au hook `upload`, notes de bas de page, déballage des paragraphes de cellule, paragraphes vides.
- `exportDocx(input: string | AsterDocument, options?): Promise<Blob>` via la lib `docx` (import dynamique) : HTML Aster → document Word, avec `jsonToHtml` pour l'entrée JSON, une numérotation dédiée par liste, images embarquées (data URL ou `fetchImage`), tables avec fusions, propriétés du document, assainissement XML (`sanitize.ts`). `downloadDocx(blob, filename)` pour le navigateur.
- `normalizeWordHtml(html: string, options?): string` : fonction **pure**, sans DOM global, qui prend le HTML du presse-papier Word et rend un HTML propre. Pipeline de passes nommées et testables individuellement (`WORD_PASSES`) :
  1. `stripConditionalComments`
  2. `stripOfficeNamespaces` : `<o:p>`, `<w:*>`, `<v:*>`, `<m:*>`, et les balises actives (`template`, `iframe`, `object`, `embed`, `form`, `svg`, `math`…)
  3. `rebuildLists` : lit `mso-list:lX levelN lfoM` et les `@list` de la feuille de style, reconstruit `<ul>/<ol>` imbriqués avec `type` et `start`
  4. `normalizeHeadings` : `<p class="MsoHeading1">` → `<h1>`, citations
  5. `cleanInlineStyles` : supprime `mso-*`, polices, tailles, conserve gras/italique/souligné/couleur validée si option, déballe les liens hostiles
  6. `normalizeTables` : supprime attributs de layout, détecte les en-têtes (ligne entièrement en gras, jamais `mso-yfti-firstrow`)
  7. `collapseEmptyParagraphs`
  8. `normalizeWhitespace`
- `isWordHtml(html)` et `isGoogleDocsHtml(html)` : détecteurs sur chaîne, en temps linéaire.
- `normalizeGoogleDocsHtml(html)` : pipeline plus court (passes 1, 2, déballage du `<b>` Google, réimbrication des sous-listes, `list-style-type` → `type`, passe 5, `<div>` autour des tables, passes 6 à 8).
- `wordPasteTransformer(options)` : fabrique un `PasteTransformer` (détection Word / Google Docs, normalisation, passthrough sinon, jamais d'exception) à passer dans `AsterOptions.pasteTransformers`. Ce n'est pas une extension Tiptap : le core possède le hook `transformPastedHTML`.

Le parsing HTML se fait avec le `DOMParser` du navigateur (injectable via `parse` pour SSR et tests), et avec jsdom en test. Aucune dépendance à un parseur tiers.

Structure :

```
packages/word/src/
├── docx/             importDocx, style-map, types (DocxInput, DocxImportResult…), postprocess/
├── export/           exportDocx, downloadDocx, jsonToHtml, html-to-docx (blocks, inline, tables, images, context, css, styles, sanitize), docx-module
├── paste/            normalizeWordHtml, passes/, detectors, security.spec
├── google/           normalizeGoogleDocsHtml
├── extension/        wordPasteTransformer (PasteTransformer)
└── index.ts
```

### `@aster-editor/ui`

Responsabilités :

- `createAster(host, options)` : monte thème, toolbar, menu contextuel de table, contrôleurs de vue source et de plein écran, et l'éditeur. `createToolbar(editor, container, config)` rend une toolbar DOM à partir du registre de commandes. Aucune logique d'édition dedans.
- Composants vanilla (`components/`) : `button`, `dropdown` (générique, `menu` ou `dialog`, retourné s'il déborde), `tooltip`, `heading-menu`, `font-menu`, `color-picker`, `table-grid-picker`, `table-context-menu`, `link-dialog`, `image-dialog` (insertion et édition), `search-panel`, `source-view`, `fullscreen`, `special-chars`, `print`. Fonctions fabriques retournant `{ element, update, destroy }`, pas de classes ni de Web Components en V1 pour rester simple à styler.
- Presets `full`, `standard`, `minimal` exprimés en config déclarative (`[['undo', 'redo'], [{ type: 'widget', widget: 'heading' }], …]`), 13 widgets nommés dans `WIDGETS`.
- Thèmes (`themes/`) : `base.css`, `images-tables.css`, `search-source.css`, `print.css`, `light.css`, `night.css`, assemblés par `aster.css`. Tout passe par 30 variables `--aster-*`, contraste AA vérifié par test.
- Icônes : 66 SVG inline en TypeScript, jeu maison sous MIT, 20 × 20, `currentColor`.
- Accessibilité : `role="toolbar"`, `aria-pressed` sur les commandes à état seulement, `aria-label`, roving tabindex, dialogues et menus au clavier, `Échap` partout.

### `@aster-editor/angular`

Responsabilités :

- `AsterEditorComponent` standalone, `ControlValueAccessor`, inputs signals (`toolbar`, `theme`, `locale`, `placeholder`, `readonly`, `config`, `wordPaste`, `ariaLabel`, `ariaLabelledBy`), outputs (`ready`, `changed`, `focused`, `blurred`), `editor()` en signal, `importDocx(file)`. Crée l'éditeur dans `afterNextRender`, le détruit dans `DestroyRef`, le remonte quand `toolbar` change.
- `provideAster(config: Partial<AsterUiOptions>)` avec l'`InjectionToken` `ASTER_CONFIG`.
- `ASTER_UPLOAD_HANDLER` : token pour brancher l'upload d'images sur un service applicatif.
- Compatible SSR : aucun accès au DOM hors `afterNextRender`, `@aster-editor/word` chargé par `import()` au montage seulement.
- Peer deps : `@angular/core`, `common`, `forms` ≥ 20, `@aster-editor/core`, `@aster-editor/ui`. `@aster-editor/word` en peer dependency optionnelle, chargée dynamiquement.

### `apps/demo` et `e2e/`

- `apps/demo` : Angular 22, quatre routes chargées à la demande (`/`, `/form`, `/import`, `/readonly`), sert de banc d'essai manuel et de cible e2e. mammoth sort dans un chunk séparé.
- `e2e/` : Playwright, deux projets Chromium (`playground` sur le bundle esbuild de `scripts/vanilla-playground/`, `demo` sur `ng serve`), 21 scénarios, serveurs lancés par Playwright, captures dans `e2e/output/`.

## 📜 Contrat public du core

Figé en phase 0 dans `packages/core/src/api/`, enrichi depuis sans rupture. Extrait de l'intention, le fichier fait foi (détail champ par champ dans [`docs/API_CORE.md`](./API_CORE.md)) :

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
  disabledCommands?: readonly string[];
}

export interface AsterEditor {
  readonly tiptap: Editor; // porte de sortie, non garantie stable
  readonly commands: CommandRegistry;
  readonly i18n: I18n; // t, getLocale, setLocale, addTranslations, has
  readonly element: HTMLElement;
  readonly contentElement: HTMLElement;
  getHTML(): string;
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
  readonly id: CommandId; // 'bold', 'heading', 'table.insert'
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
.docx ──mammoth + styleMap──► HTML brut ──postprocess──► HTML Aster ──setHTML──► ProseMirror
clipboard Word ──isWordHtml──► normalizeWordHtml (8 passes) ──► HTML Aster ──transformPastedHTML──► ProseMirror
ProseMirror ──getHTML (ou getJSON → jsonToHtml)──► DOMParser ──html-to-docx──► lib docx ──Packer──► Blob .docx
```

Le schéma ProseMirror est la dernière ligne de défense à l'entrée : tout ce qu'il ne connaît pas est jeté. Les normaliseurs visent donc à **préserver l'intention** du document, pas à produire un HTML parfait. À la sortie, `html-to-docx` traverse le DOM bloc par bloc (`blocks.ts`), traduit les marques en propriétés de run (`inline.ts`), donne à chaque liste sa propre numérotation (`registerList` dans `context.ts`), et tout texte passe par `sanitizeXmlText` avant d'entrer dans le XML.

## 🧭 Décisions produit (V1)

Fixées par les revues adverses de 0.3.0 et figées par des tests :

- **Pas de titre dans un item de liste** : `heading` et `paragraph` posent le type sans repli ni bascule ; dans une liste ils répondent `false` sans toucher au document (Tiptap sortait l'item de sa liste avant d'échouer).
- **Pas de table imbriquée** : `table.insert` est refusée dans une table, même si le schéma les tolère au parsing.
- **`clearFormatting` conserve les liens** et ne sort jamais d'une liste, d'une citation ou d'une cellule : un lien est une donnée, pas une mise en forme.
- **`setHTML(…, false)` vide l'historique** : une resynchronisation silencieuse ne doit pas laisser un `undo` rejouer l'ancien document.
- **`setReadOnly` n'émet pas `change`** : désactiver un formulaire ne le salit pas.
- **`insertHTML` est brut** : le pipeline de collage ne s'applique qu'au collage.
- **Politique d'images** : mêmes protocoles que les liens, plus `blob:` et `data:image/` seulement ; appliquée au parsing, pas seulement aux commandes.
- **HTML de sortie stable** : ni `colgroup`, ni `min-width`, ni `colspan="1"`, ni `<figure>` ; les largeurs d'image sont un attribut `width`, l'alignement un `data-align`.
- **Une correspondance de recherche ne traverse pas un bloc**, recherche littérale sans regex.
- **`aria-pressed` seulement sur les commandes à état** ; les boutons ne volent pas le focus au `mousedown`.

## 🎨 Théming

Trente variables définies sur `.aster[data-theme='light']` et `.aster[data-theme='night']`, valeurs de repli sur `.aster` dans `base.css`. Catégories : surfaces, texte, accent, bordures, danger, rayons, espacements, typographie, ombre, focus, tailles, surlignage, sélection. Un intégrateur crée un thème en surchargeant les variables, sans toucher aux classes. Les feuilles des fonctionnalités (`images-tables.css`, `search-source.css`, `print.css`) ne déclarent aucune variable et sont vérifiées par test contre les deux thèmes. Détail dans [`docs/THEMING.md`](./THEMING.md).

## 🏭 Build et publication

- Paquets vanilla : `tsc -p tsconfig.build.json` → `dist/` ESM + `.d.ts`. `exports` avec `"."` et, pour `ui`, `"./themes/*"` servi depuis le dossier `themes/` du paquet.
- Angular : ng-packagr, format APF, `sideEffects: false`.
- Racine : `npm run build` enchaîne core → word → ui → angular, ordre déclaré dans `workspaces`.
- CI GitHub Actions : un job lint + typecheck + tests + build, un job e2e Playwright (Chromium) avec rapport en artefact.
- Publication npm sous l'org `@aster-editor`, hors périmètre de la nuit.

## ⚖️ Licences des dépendances de production

| Paquet                                      | Licence                             |
| ------------------------------------------- | ----------------------------------- |
| @tiptap/*                                   | MIT                                 |
| prosemirror-* via @tiptap/pm                | MIT                                 |
| mammoth                                     | BSD-2-Clause                        |
| jszip (via mammoth)                         | MIT ou GPLv3 au choix, on prend MIT |
| @xmldom/xmldom (via mammoth)                | MIT                                 |
| docx (export .docx, génération de fixtures) | MIT                                 |
| @playwright/test (dev uniquement, e2e)      | Apache-2.0                          |
| @angular/*                                  | MIT                                 |

Toute nouvelle dépendance s'ajoute ici avant d'entrer dans le code.

## ⚠️ Risques techniques identifiés

| Risque                                                       | Mitigation                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| API Tiptap 3 différente de la v2 en mémoire                  | Lire `node_modules/@tiptap/*/dist/*.d.ts`, tester tôt en phase 0          |
| TS 6.0 imposé par Angular 22, outillage pas tous compatibles | Pas de bundler pour les libs, `tsc` pur. Vitest 5 vérifié en phase 0      |
| mammoth et docx en bundle navigateur via Angular CLI         | Import dynamique, chunk séparé vérifié par le budget `initial` de la démo |
| Vite à froid recharge la page au premier `importDocx`        | Documenté dans le guide, `toPass` dans le test e2e de la démo             |
| Conflits git entre agents                                    | Lots sur dossiers disjoints, fichiers partagés réservés à l'orchestrateur |
| Compaction de contexte de l'orchestrateur                    | `docs/JOURNAL.md` mis à jour après chaque lot, lisible à froid            |
