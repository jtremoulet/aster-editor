# 🏗️ Architecture — Aster Editor

> Comment les paquets s'emboîtent, quels contrats les séparent, et pourquoi.

## 🧩 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────┐
│ apps/demo (Angular 22)                                       │
├──────────────────────────────────────────────────────────────┤
│ @aster-editor/angular   <aster-editor> CVA, signals, DI      │
├───────────────────────────┬──────────────────────────────────┤
│ @aster-editor/ui          │ @aster-editor/word               │
│ toolbar vanilla, thèmes   │ importDocx, normalizeWordHtml,   │
│ menus, tooltips, a11y     │ extension WordPaste              │
├───────────────────────────┴──────────────────────────────────┤
│ @aster-editor/core                                           │
│ createEditor, registre de commandes, extensions, i18n, events│
├──────────────────────────────────────────────────────────────┤
│ Tiptap 3  →  ProseMirror (@tiptap/pm)                        │
└──────────────────────────────────────────────────────────────┘
```

Sens des dépendances : `angular → ui, word, core` ; `ui → core` ; `word → core`. **Jamais l'inverse.** Le core ne connaît ni la toolbar ni Word, il expose juste des points d'extension.

## 📦 Paquets

### `@aster-editor/core`

Responsabilités :

- `createEditor(options)` : instancie Tiptap avec le jeu d'extensions Aster, retourne un `AsterEditor`.
- **Registre de commandes** : chaque action éditable est une `AsterCommand` nommée, avec `run`, `canRun`, `isActive`, clé i18n, icône, raccourci. La toolbar et le wrapper Angular ne parlent qu'au registre, jamais à Tiptap directement.
- **Extensions Aster** : enveloppes fines des extensions Tiptap avec la config Aster par défaut, plus les extensions maison : `Shortcuts`, `LinkSafety` qui rejette `javascript:`, `ImageUpload` avec hook, `HtmlSanitizeOnPaste`.
- **i18n** : `t(key, params)` avec dictionnaires `fr` et `en`, extensibles.
- **Événements** : émetteur typé, `on/off`.
- **Sérialisation** : `getHTML`, `setHTML`, `getJSON`, `setJSON`, `getText`.
- **Hooks d'extension** : `options.extensions` pour ajouter des extensions Tiptap, `options.commands` pour enregistrer des commandes custom, `options.pasteTransformers` pour chaîner des transformateurs de collage. C'est par ce dernier hook que `word` se branche.

Structure :

```
packages/core/src/
├── api/              types publics figés en phase 0 : AsterEditor, AsterOptions, AsterCommand, AsterEvents
├── editor/           createEditor, cycle de vie, events
├── commands/         registre + commandes standard groupées par domaine (marks, blocks, lists, links, images, tables, history)
├── extensions/       extensions Tiptap configurées + extensions maison
├── i18n/             t(), dictionnaires fr.ts et en.ts
├── html/             helpers de sérialisation et sanitization légère
└── index.ts          exports publics uniquement
```

### `@aster-editor/word`

Responsabilités :

- `importDocx(input: File | ArrayBuffer, options?): Promise<DocxImportResult>` via mammoth, avec une **style map** maison et des post-traitements sur le HTML produit : numérotation des listes, en-têtes de table, images en data URL ou passées au hook `upload`, notes de bas de page.
- `normalizeWordHtml(html: string, options?): string` : fonction **pure**, sans DOM global, qui prend le HTML du presse-papier Word et rend un HTML propre. Pipeline de passes nommées et testables individuellement :
  1. `stripConditionalComments`
  2. `stripOfficeNamespaces` : `<o:p>`, `<w:*>`, `<v:*>`
  3. `rebuildLists` : lit `mso-list:lXX levelY`, reconstruit `<ul>/<ol>` imbriqués, détecte puces vs numéros via le marqueur
  4. `normalizeHeadings` : `<p class="MsoHeading1">` → `<h1>`
  5. `cleanInlineStyles` : supprime `mso-*`, polices, tailles, conserve gras/italique/souligné/couleur si option
  6. `normalizeTables` : supprime attributs de layout, détecte en-têtes
  7. `collapseEmptyParagraphs`
  8. `normalizeWhitespace`
- `isWordHtml(html)` et `isGoogleDocsHtml(html)` : détecteurs.
- `normalizeGoogleDocsHtml(html)` : pipeline plus court.
- Extension Tiptap `WordPaste` qui branche tout ça sur `transformPastedHTML`, exportée pour `core.options.pasteTransformers`.

Le parsing HTML se fait avec le `DOMParser` du navigateur, et avec jsdom en test. Aucune dépendance à un parseur tiers.

Structure :

```
packages/word/src/
├── docx/             importDocx, styleMap, postprocess/
├── paste/            normalizeWordHtml, passes/, detectors
├── google/           normalizeGoogleDocsHtml
├── extension/        WordPaste (Tiptap)
└── index.ts
```

### `@aster-editor/ui`

Responsabilités :

- `createToolbar(editor, container, config)` : rend une toolbar DOM à partir du registre de commandes. Aucune logique d'édition dedans.
- Composants vanilla : `Button`, `Dropdown`, `ColorPicker`, `TableGridPicker`, `LinkDialog`, `Tooltip`. Classes TypeScript légères, pas de framework, pas de Web Components en V1 pour rester simple à styler.
- Presets `full`, `standard`, `minimal` exprimés en config déclarative : `[['bold','italic'], ['heading'], ...]`.
- Thèmes : `themes/light.css`, `themes/night.css`, `base.css`. Tout passe par des variables `--aster-*`.
- Icônes : SVG inline en TypeScript, jeu minimal maison sous MIT, 24px, `currentColor`.
- Accessibilité : `role="toolbar"`, `aria-pressed`, `aria-label`, flèches gauche/droite entre boutons.

### `@aster-editor/angular`

Responsabilités :

- `AsterEditorComponent` standalone, `ControlValueAccessor`, inputs signals, outputs. Crée l'éditeur dans `afterNextRender`, le détruit dans `DestroyRef`.
- `provideAster(config: Partial<AsterGlobalConfig>)` avec `InjectionToken`.
- `AsterUploadHandler` token pour brancher l'upload d'images sur un service applicatif.
- Compatible SSR : aucun accès au DOM hors `afterNextRender`.
- Peer deps : `@angular/core >= 20`, `@aster-editor/core`, `@aster-editor/ui`. `@aster-editor/word` en dépendance optionnelle chargée dynamiquement.

## 📜 Contrat public du core

Figé en phase 0 dans `packages/core/src/api/`. Extrait de l'intention, le fichier fait foi :

```ts
export interface AsterOptions {
  element: HTMLElement;
  content?: string | AsterDocument; // HTML ou JSON ProseMirror
  placeholder?: string;
  readOnly?: boolean;
  locale?: AsterLocale; // 'fr' | 'en' | string
  extensions?: AnyExtension[]; // extensions Tiptap additionnelles
  commands?: AsterCommand[]; // commandes custom
  pasteTransformers?: PasteTransformer[]; // (html, ctx) => html
  upload?: (file: File) => Promise<string>;
  linkPolicy?: LinkPolicy;
}

export interface AsterEditor {
  readonly tiptap: Editor; // porte de sortie, non garantie stable
  readonly commands: CommandRegistry;
  getHTML(): string;
  setHTML(html: string, emit?: boolean): void;
  getJSON(): AsterDocument;
  setJSON(doc: AsterDocument, emit?: boolean): void;
  getText(): string;
  isEmpty(): boolean;
  getCounts(): { words: number; characters: number };
  focus(position?: 'start' | 'end'): void;
  blur(): void;
  setReadOnly(value: boolean): void;
  isReadOnly(): boolean;
  setLocale(locale: AsterLocale): void;
  t(key: string, params?: Record<string, string | number>): string;
  on<E extends keyof AsterEvents>(event: E, handler: AsterEvents[E]): () => void;
  destroy(): void;
}

export interface AsterCommand {
  id: string; // 'bold', 'heading', 'table.insert'
  labelKey: string; // clé i18n
  icon?: string; // id d'icône, résolu par ui
  shortcut?: string; // 'Mod-B'
  run(editor: AsterEditor, args?: unknown): boolean;
  canRun?(editor: AsterEditor, args?: unknown): boolean;
  isActive?(editor: AsterEditor, args?: unknown): boolean;
}
```

## 🔄 Pipeline Word

```
.docx ──mammoth + styleMap──► HTML brut ──postprocess──► HTML Aster ──setHTML──► ProseMirror
clipboard Word ──isWordHtml──► normalizeWordHtml (8 passes) ──► HTML Aster ──transformPastedHTML──► ProseMirror
```

Le schéma ProseMirror est la dernière ligne de défense : tout ce qu'il ne connaît pas est jeté. Les normaliseurs visent donc à **préserver l'intention** du document, pas à produire un HTML parfait.

## 🎨 Théming

Variables définies sur `.aster` et redéfinies sur `.aster[data-theme="night"]`. Catégories : couleurs de surface, de texte, d'accent, bordures, rayons, espacements, typographie du contenu. Un intégrateur crée un thème en surchargeant les variables, sans toucher aux classes.

## 🏭 Build et publication

- Paquets vanilla : `tsc -p tsconfig.build.json` → `dist/` ESM + `.d.ts` + CSS copié. `exports` avec `"."` et `"./themes/*.css"`.
- Angular : ng-packagr, format APF, `sideEffects: false`.
- Racine : `npm run build` enchaîne core → word → ui → angular, ordre déclaré dans `workspaces`.
- Publication npm sous l'org `@aster-editor`, hors périmètre de la nuit.

## ⚖️ Licences des dépendances de production

| Paquet                                         | Licence                             |
| ---------------------------------------------- | ----------------------------------- |
| @tiptap/*                                      | MIT                                 |
| prosemirror-* via @tiptap/pm                   | MIT                                 |
| mammoth                                        | BSD-2-Clause                        |
| jszip (via mammoth)                            | MIT ou GPLv3 au choix, on prend MIT |
| @xmldom/xmldom (via mammoth)                   | MIT                                 |
| docx (should, export + génération de fixtures) | MIT                                 |
| @angular/*                                     | MIT                                 |

Toute nouvelle dépendance s'ajoute ici avant d'entrer dans le code.

## ⚠️ Risques techniques identifiés

| Risque                                                       | Mitigation                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| API Tiptap 3 différente de la v2 en mémoire                  | Lire `node_modules/@tiptap/*/dist/*.d.ts`, tester tôt en phase 0          |
| TS 6.0 imposé par Angular 22, outillage pas tous compatibles | Pas de bundler pour les libs, `tsc` pur. Vitest 5 vérifié en phase 0      |
| mammoth en bundle navigateur via Angular CLI                 | Vérifier le champ `browser` du package en phase 0, import dynamique       |
| Conflits git entre agents                                    | Lots sur dossiers disjoints, fichiers partagés réservés à l'orchestrateur |
| Compaction de contexte de l'orchestrateur                    | `docs/JOURNAL.md` mis à jour après chaque lot, lisible à froid            |
