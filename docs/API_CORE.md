# 📚 Référence API — `@aster-editor/core`

> Référence exhaustive du contrat public défini dans `packages/core/src/api/`. Chaque type, chaque champ, avec la sémantique que la JSDoc du code garantit en 0.5.0. Le fichier source fait foi ; le [README du core](../packages/core/README.md) est le tutoriel.

Le contrat est figé : `ui`, `word` et `angular` codent contre ces types. Tout est réexporté depuis `@aster-editor/core`. Ce qui a été ajouté depuis sans toucher au contrat (recherche `search.*`, reproduction de mise en forme `formatPainter.*`, commandes `text.*`, sommaire `Outline`, Markdown, autosave, NodeViews d'image et de variable, `resolveVariablesHtml`, `setPageView` / `getLayout`, pagination) vit hors de `api/` et est décrit dans le README du core. La session 2 a enrichi le contrat sans rupture : `variables.ts`, `AsterOptions.variables`, `AsterEditor.variables`, `getHTML(options?)`, `variable.insert` / `variable.remove`, `variablesChange`. La session 3 l'a enrichi de la même façon : `layout.ts` (mise en page, partagé avec `word` et `angular`), `AsterOptions.pageView`, `paragraph.setLayout` / `paragraph.unsetLayout`, `PageViewOptions.pagination`.

## 🧭 Index

| Type                                                                                                                                                                                                                                                                                                                                                                                                                                               | Fichier        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `AsterOptions`, `LinkPolicy`, `UploadHandler`                                                                                                                                                                                                                                                                                                                                                                                                      | `options.ts`   |
| `DocumentLayout`, `PageSetup`, `PageMargins`, `PageDimensions`, `PageSizeName`, `PageOrientation`, `HeaderFooterSet`, `HeaderFooterContent`, `DefaultFont`, `ParagraphLayoutAttrs`, `ParagraphLayoutAttrName`, `PARAGRAPH_LAYOUT_ATTR_NAMES`, `BlockBorder`, `BorderSide`, `BorderStyle`, `RunLayoutAttrs`, `DecorationStyle`, `ListLayoutAttrs`, `OrderedListType`, `TableLayoutAttrs`, `CellLayoutAttrs`, `CellVerticalAlign`, `PageViewOptions` | `layout.ts`    |
| `AsterEditor`                                                                                                                                                                                                                                                                                                                                                                                                                                      | `editor.ts`    |
| `AsterCommand`, `CommandRegistry`, `CommandId`, `StandardCommandId`, `STANDARD_COMMAND_IDS`, `StandardCommandArgs`, `CommandArgs`, `CommandRunArgs`, `HeadingLevel`                                                                                                                                                                                                                                                                                | `commands.ts`  |
| `AsterEvents`, `AsterEventName`, `Unsubscribe`                                                                                                                                                                                                                                                                                                                                                                                                     | `events.ts`    |
| `AsterVariable`, `VariableValues`, `VariableResolver`, `VariableSource`, `VariableRenderMode`, `GetHtmlOptions`, `VariableStore`                                                                                                                                                                                                                                                                                                                   | `variables.ts` |
| `AsterDocument`, `AsterCounts`                                                                                                                                                                                                                                                                                                                                                                                                                     | `document.ts`  |
| `I18n`, `AsterLocale`, `AsterDictionary`, `TranslateParams`                                                                                                                                                                                                                                                                                                                                                                                        | `i18n.ts`      |
| `PasteTransformer`, `PasteContext`                                                                                                                                                                                                                                                                                                                                                                                                                 | `paste.ts`     |
| `AsterTheme`, `ToolbarConfig`, `ToolbarPreset`, `ToolbarGroup`, `ToolbarItem`, `ToolbarButtonItem`, `ToolbarDropdownItem`, `ToolbarWidgetItem`                                                                                                                                                                                                                                                                                                     | `toolbar.ts`   |

## ⚙️ `AsterOptions`

Options de `createEditor(options)`. Seul `element` est obligatoire.

| Champ               | Type                          | Obligatoire | Défaut                       | Description                                                                                                                                                                                                                                                                                                     |
| ------------------- | ----------------------------- | ----------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `element`           | `HTMLElement`                 | oui         | —                            | Élément hôte. Le core y crée le conteneur `.aster-content` et le contenteditable.                                                                                                                                                                                                                               |
| `content`           | `string \| AsterDocument`     | non         | `''`                         | Contenu initial, HTML ou document JSON ProseMirror.                                                                                                                                                                                                                                                             |
| `placeholder`       | `string`                      | non         | `editor.placeholder` traduit | Texte affiché quand le document est vide. Fonction de la locale si absent.                                                                                                                                                                                                                                      |
| `readOnly`          | `boolean`                     | non         | `false`                      | Démarre en lecture seule.                                                                                                                                                                                                                                                                                       |
| `locale`            | `AsterLocale`                 | non         | `'fr'`                       | Locale initiale.                                                                                                                                                                                                                                                                                                |
| `autofocus`         | `boolean`                     | non         | `false`                      | Donne le focus (fin de document) au montage.                                                                                                                                                                                                                                                                    |
| `extensions`        | `readonly AnyExtension[]`     | non         | `[]`                         | Extensions Tiptap additionnelles, ajoutées après le jeu standard.                                                                                                                                                                                                                                               |
| `commands`          | `readonly AsterCommand[]`     | non         | `[]`                         | Commandes custom enregistrées au montage, après les standard (même `id` = remplacement).                                                                                                                                                                                                                        |
| `pasteTransformers` | `readonly PasteTransformer[]` | non         | `[]`                         | Transformateurs de collage, dans l'ordre d'application.                                                                                                                                                                                                                                                         |
| `upload`            | `UploadHandler`               | non         | —                            | Hook d'upload d'image. Absent : data URL base64.                                                                                                                                                                                                                                                                |
| `linkPolicy`        | `LinkPolicy`                  | non         | voir `LinkPolicy`            | Politique de sécurité et de comportement des liens, appliquée aussi aux images.                                                                                                                                                                                                                                 |
| `variables`         | `VariableSource`              | non         | `{}`                         | Variables de document (champs de fusion) : déclarations, valeurs, résolveur.                                                                                                                                                                                                                                    |
| `pageView`          | `boolean \| PageViewOptions`  | non         | `false`                      | Vue page au montage : feuille aux dimensions et marges de `layout.page`, en-têtes et pieds `default` en lecture seule, pagination approximative (vraie par défaut, voir `PageViewOptions`). `true` vaut `{}` : A4 portrait, marges 25,4 mm. Une vue page qui lève au montage est ignorée avec un avertissement. |
| `disabledCommands`  | `readonly string[]`           | non         | `[]`                         | Commandes standard désactivées par identifiant : retirées du registre, raccourci avalé.                                                                                                                                                                                                                         |

### `LinkPolicy`

Tous les champs optionnels ; les défauts sont ceux de `DEFAULT_LINK_POLICY`.

| Champ              | Type                  | Défaut                               | Description                                                                                                               |
| ------------------ | --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `allowedProtocols` | `readonly string[]`   | `['http', 'https', 'mailto', 'tel']` | Protocoles acceptés (liste blanche). Tout le reste est rejeté, `javascript:` en premier lieu. Les URLs relatives passent. |
| `defaultTarget`    | `'_blank' \| '_self'` | `'_blank'`                           | Cible des liens créés par `link.set` sans `target` explicite.                                                             |
| `rel`              | `string`              | `'noopener noreferrer'`              | Attribut `rel` forcé sur tout lien `target="_blank"`.                                                                     |
| `autolink`         | `boolean`             | `true`                               | Transformer automatiquement les URLs tapées ou collées en liens.                                                          |

Les sources d'images suivent la même liste, plus `blob:` et `data:image/…` (voir `isAllowedImageSrc` dans le README du core).

### `UploadHandler`

```ts
type UploadHandler = (file: File) => Promise<string>;
```

Reçoit le fichier image, retourne l'URL finale à poser dans `src`. Un rejet émet `uploadDone` avec `error` et n'insère rien (dans `importDocx`, repli base64 avec avertissement).

## 🧰 `AsterEditor`

Instance retournée par `createEditor`. Toute l'API est synchrone sauf mention contraire. Après `destroy()`, aucune méthode ne doit être appelée : les méthodes de contenu (`getHTML`, `setHTML`, `getJSON`, `setJSON`, `getText`, `insertHTML`) lèvent `Error('AsterEditor détruit')`, `on` devient un no-op, et le registre de commandes répond `false`.

### Propriétés (toutes `readonly`)

| Propriété        | Type              | Description                                                                                         |
| ---------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| `tiptap`         | `Editor`          | Instance Tiptap sous-jacente. Porte de sortie assumée, non garantie stable entre versions mineures. |
| `commands`       | `CommandRegistry` | Registre des commandes.                                                                             |
| `i18n`           | `I18n`            | Service de traduction attaché à l'éditeur.                                                          |
| `variables`      | `VariableStore`   | Variables de document (champs de fusion), voir `VariableStore`.                                     |
| `element`        | `HTMLElement`     | Élément hôte passé dans les options.                                                                |
| `contentElement` | `HTMLElement`     | Élément contenteditable réel (`.ProseMirror`), utile pour les tests et le focus.                    |

### Méthodes — contenu

| Signature                                           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getHTML(options?: GetHtmlOptions): string`         | HTML sémantique, stable : `setHTML(getHTML())` est idempotent. Bruit de table (`colgroup`, `min-width`, `colspan="1"`) retiré. Mis en cache tant que le document ne change pas : appeler `getHTML()` à chaque frappe ne coûte qu'une sérialisation par transaction. `options.variables` : `'placeholders'` (défaut, puces `<span data-aster-variable>` conservées) ou `'resolve'` (valeurs substituées en texte brut, `{{nom}}` conservé sans valeur). |
| `setHTML(html: string, emit?: boolean): void`       | Remplace tout le contenu. `emit` (défaut `true`) à `false` n'émet pas `change`, n'entre pas dans l'historique d'annulation **et vide l'historique antérieur** : un `undo` qui suit ne fait rien plutôt que de rejouer sur le nouveau document des étapes qui visaient l'ancien. Mode de `writeValue` côté Angular.                                                                                                                                     |
| `getJSON(): AsterDocument`                          | Document JSON ProseMirror.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `setJSON(doc: AsterDocument, emit?: boolean): void` | Pendant JSON de `setHTML` : mêmes règles pour `emit` (pas de `change`, historique vidé).                                                                                                                                                                                                                                                                                                                                                               |
| `getText(): string`                                 | Texte brut : un seul `\n` entre deux blocs de texte, quelle que soit l'imbrication (cellules de table, items de liste), et un `\n` par saut de ligne (`hardBreak`). Une variable rend sa valeur connue, sinon `{{nom}}`.                                                                                                                                                                                                                               |
| `insertHTML(html: string): void`                    | Insère du HTML à la position courante, en passant par le schéma. Le HTML est inséré **tel quel** : ni les `pasteTransformers` ni le normaliseur Word ne s'appliquent, seule la politique de liens et d'images filtre au parsing. Transforme le HTML avant si besoin. Donne le focus.                                                                                                                                                                   |
| `isEmpty(): boolean`                                | Vrai si le document est vide (`tiptap.isEmpty`).                                                                                                                                                                                                                                                                                                                                                                                                       |
| `getCounts(): AsterCounts`                          | Compteurs de mots et de caractères.                                                                                                                                                                                                                                                                                                                                                                                                                    |

### Méthodes — état

| Signature                                           | Description                                                                                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `focus(position?: 'start' \| 'end' \| 'all'): void` | Donne le focus, **synchrone** : au retour, la vue a le focus DOM et une frappe immédiate l'atteint (Tiptap seul le diffère à la frame suivante). Sans argument, conserve la sélection courante.                                |
| `blur(): void`                                      | Retire le focus.                                                                                                                                                                                                               |
| `isFocused(): boolean`                              |                                                                                                                                                                                                                                |
| `setReadOnly(value: boolean): void`                 | Bascule l'éditabilité. Émet `readOnlyChange` uniquement si la valeur change, et n'émet jamais `change` (sans quoi un formulaire passerait `dirty` à chaque `disabled`). En lecture seule, `run` et `canRun` répondent `false`. |
| `isReadOnly(): boolean`                             |                                                                                                                                                                                                                                |
| `isDestroyed(): boolean`                            | Vrai après `destroy()`.                                                                                                                                                                                                        |
| `destroy(): void`                                   | Émet `destroy`, vide les écouteurs, détruit Tiptap, retire `.aster-content`. Idempotent. Voir l'en-tête de section pour le comportement après destruction.                                                                     |

### Méthodes — événements

| Signature                                                                                | Description                                                                    |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `on<E extends AsterEventName>(event: E, handler: AsterEvents[E]): Unsubscribe`           | Abonne, retourne la fonction de désabonnement. No-op après `destroy()`.        |
| `off<E extends AsterEventName>(event: E, handler: AsterEvents[E]): void`                 | Désabonne.                                                                     |
| `emit<E extends AsterEventName>(event: E, ...payload: Parameters<AsterEvents[E]>): void` | Émet. Réservé aux extensions et aux paquets Aster. Sans effet après `destroy`. |

## 🎛️ Commandes

### `STANDARD_COMMAND_IDS` et `StandardCommandId`

Tuple `as const` des 52 identifiants standard, dans l'ordre : `bold`, `italic`, `underline`, `strike`, `subscript`, `superscript`, `code`, `highlight`, `clearFormatting`, `paragraph`, `heading`, `blockquote`, `codeBlock`, `horizontalRule`, `hardBreak`, `bulletList`, `orderedList`, `taskList`, `indent`, `outdent`, `alignLeft`, `alignCenter`, `alignRight`, `alignJustify`, `link.set`, `link.unset`, `image.insert`, `image.upload`, `image.setAttributes`, `table.insert`, `table.delete`, `table.addRowBefore`, `table.addRowAfter`, `table.deleteRow`, `table.addColumnBefore`, `table.addColumnAfter`, `table.deleteColumn`, `table.mergeCells`, `table.splitCell`, `table.toggleHeaderRow`, `table.toggleHeaderColumn`, `textColor`, `backgroundColor`, `fontFamily`, `fontSize`, `variable.insert`, `variable.remove`, `paragraph.setLayout`, `paragraph.unsetLayout`, `undo`, `redo`, `selectAll`.

`StandardCommandId = (typeof STANDARD_COMMAND_IDS)[number]`. Un identifiant pointé indique un domaine (`table.insert`).

Les six commandes `search.*` (`SEARCH_COMMAND_IDS`, `SearchCommandId`, `SearchCommandArgs` dans `commands/search.ts`), les deux commandes `formatPainter.*` (`FORMAT_PAINTER_COMMAND_IDS`, `FormatPainterCommandId` dans `commands/format-painter.ts`) et les trois commandes `text.*` (`TEXT_LAYOUT_COMMAND_IDS`, `TextLayoutCommandId`, `SetLetterSpacingArgs`, `SetCapsArgs` dans `commands/layout.ts`) sont enregistrées par le core en plus de ces 52 mais restent hors du contrat figé : elles passent par la surcharge libre de `run`. Le registre compte 63 commandes au montage.

### `CommandId`

```ts
type CommandId = StandardCommandId | (string & {});
```

Standard ou custom, avec autocomplétion des standard.

### `HeadingLevel`

```ts
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
```

### `StandardCommandArgs`

Arguments typés des commandes standard qui en prennent. Les commandes absentes de cette table n'en prennent pas.

| Commande                | Arguments                                                                                                                                                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `heading`               | `{ level: HeadingLevel }`                                                                                                                                                                                                                                                                                       |
| `link.set`              | `{ href: string; target?: '_blank' \| '_self'; title?: string }`                                                                                                                                                                                                                                                |
| `image.insert`          | `{ src: string; alt?: string; title?: string; width?: number }`                                                                                                                                                                                                                                                 |
| `image.upload`          | `{ file: File }`                                                                                                                                                                                                                                                                                                |
| `image.setAttributes`   | `{ alt?: string; title?: string; width?: number; align?: 'left' \| 'center' \| 'right' }`                                                                                                                                                                                                                       |
| `table.insert`          | `{ rows: number; cols: number; withHeaderRow?: boolean }`                                                                                                                                                                                                                                                       |
| `textColor`             | `{ color: string \| null }` (`null` retire)                                                                                                                                                                                                                                                                     |
| `backgroundColor`       | `{ color: string \| null }`                                                                                                                                                                                                                                                                                     |
| `fontFamily`            | `{ family: string \| null }`                                                                                                                                                                                                                                                                                    |
| `fontSize`              | `{ size: string \| null }`                                                                                                                                                                                                                                                                                      |
| `variable.insert`       | `{ name: string; label?: string }`                                                                                                                                                                                                                                                                              |
| `paragraph.setLayout`   | `ParagraphLayoutAttrs` : fusionne les attributs donnés dans chaque paragraphe et titre de la sélection (plage par plage, sélection de cellules comprise) ; `null` efface un attribut, un attribut absent est laissé tel quel, une valeur invalide est ignorée (`run` rend `false` s'il ne reste rien de valide) |
| `paragraph.unsetLayout` | `{ attrs?: readonly ParagraphLayoutAttrName[] } \| undefined` : efface les attributs nommés, ou tous sans argument                                                                                                                                                                                              |

### `CommandArgs<K>` et `CommandRunArgs<K>`

```ts
type CommandArgs<K extends CommandId> = K extends keyof StandardCommandArgs
  ? StandardCommandArgs[K]
  : undefined;

type CommandRunArgs<K extends CommandId> = K extends keyof StandardCommandArgs
  ? [args: StandardCommandArgs[K]]
  : [];
```

`CommandArgs` : type d'argument d'une commande, `undefined` si elle n'en prend pas. `CommandRunArgs` : tuple pour `run`/`canRun`/`isActive`, obligatoire si la commande déclare des arguments, absent sinon.

### `AsterCommand<Args = unknown>`

Unité affichée par la toolbar, déclenchée par les raccourcis, appelée par l'intégrateur. Enveloppe une ou plusieurs commandes Tiptap.

| Champ      | Type                                           | Obligatoire | Description                                                                                                                                                                                                                                                        |
| ---------- | ---------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`       | `CommandId` (readonly)                         | oui         | Identifiant unique, convention de `STANDARD_COMMAND_IDS`.                                                                                                                                                                                                          |
| `labelKey` | `string` (readonly)                            | oui         | Clé i18n du libellé, par convention `command.<id>`.                                                                                                                                                                                                                |
| `icon`     | `string` (readonly)                            | non         | Identifiant d'icône résolu par `ui`. Convention : `id` avec les points remplacés par des tirets (`table.insert` → `table-insert`) ; `ui` sait aussi convertir le camelCase (`bulletList` → `bullet-list`).                                                         |
| `shortcut` | `string` (readonly)                            | non         | Raccourci principal au format Tiptap/ProseMirror (`Mod-b`, `Mod-Shift-7`), affiché dans le tooltip. Les commandes à liaisons multiples (`heading` avec `Mod-Alt-1..6`, `redo` avec `Mod-y`) exposent leurs liaisons supplémentaires via `EXTRA_SHORTCUT_BINDINGS`. |
| `run`      | `(editor: AsterEditor, args: Args) => boolean` | oui         | Exécute. Retourne `false` si rien n'a été fait.                                                                                                                                                                                                                    |
| `canRun`   | `(editor: AsterEditor, args: Args) => boolean` | non         | Exécutable dans l'état courant ? Défaut : `true` hors lecture seule.                                                                                                                                                                                               |
| `isActive` | `(editor: AsterEditor, args: Args) => boolean` | non         | « Enfoncée » pour la sélection courante ? Défaut : `false`. `ui` ne pose `aria-pressed` que sur les commandes qui le déclarent.                                                                                                                                    |

### `CommandRegistry`

Seule porte d'entrée pour `ui` et `angular`. `run`, `canRun` et `isActive` sont tolérants : identifiant inconnu, éditeur détruit ou handler qui lève → `false`, jamais d'exception. `run` et `canRun` répondent aussi `false` en lecture seule.

| Signature                                                                                                                             | Description                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `register<Args>(command: AsterCommand<Args>): void`                                                                                   | Ajoute ou remplace (même `id`).                                                                                       |
| `unregister(id: CommandId): void`                                                                                                     | Retire.                                                                                                               |
| `get(id: CommandId): AsterCommand \| undefined`                                                                                       |                                                                                                                       |
| `has(id: CommandId): boolean`                                                                                                         |                                                                                                                       |
| `list(): readonly AsterCommand[]`                                                                                                     | Toutes les commandes, dans l'ordre d'enregistrement.                                                                  |
| `run<K extends StandardCommandId>(id: K, ...args: CommandRunArgs<K>): boolean`                                                        | Surcharge typée pour les standard.                                                                                    |
| `run(id: string, args?: unknown): boolean`                                                                                            | Surcharge libre pour les custom et `search.*`. Un appel standard mal typé (`run('heading')`) tombe dessus et compile. |
| `canRun<K extends StandardCommandId>(id: K, ...args: CommandRunArgs<K>): boolean` / `canRun(id: string, args?: unknown): boolean`     | Mêmes surcharges.                                                                                                     |
| `isActive<K extends StandardCommandId>(id: K, ...args: CommandRunArgs<K>): boolean` / `isActive(id: string, args?: unknown): boolean` | Mêmes surcharges.                                                                                                     |

## 📡 Événements

### `AsterEvents`

Interface des handlers, indexée par nom d'événement. Les handlers reçoivent toujours `editor` dans le payload.

| Événement         | Signature du handler                                                                    | Description                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ready`           | `(payload: { editor: AsterEditor }) => void`                                            | Éditeur monté et prêt. Émis une seule fois, dans une microtâche après `createEditor`, pour qu'un `on('ready')` posé juste après la création soit bien appelé.   |
| `change`          | `(payload: { editor: AsterEditor }) => void`                                            | Le document a changé. Non émis pour un simple déplacement de sélection, ni par `setReadOnly`, ni par `setHTML` / `setJSON(…, false)`.                           |
| `selectionChange` | `(payload: { editor: AsterEditor }) => void`                                            | La sélection a bougé ou le document a changé. La toolbar se resynchronise dessus.                                                                               |
| `focus`           | `(payload: { editor: AsterEditor; event: FocusEvent }) => void`                         |                                                                                                                                                                 |
| `blur`            | `(payload: { editor: AsterEditor; event: FocusEvent }) => void`                         |                                                                                                                                                                 |
| `readOnlyChange`  | `(payload: { editor: AsterEditor; readOnly: boolean }) => void`                         | Après `setReadOnly` si la valeur change.                                                                                                                        |
| `localeChange`    | `(payload: { editor: AsterEditor; locale: AsterLocale }) => void`                       | Après `i18n.setLocale` si la locale change.                                                                                                                     |
| `variablesChange` | `(payload: { editor: AsterEditor; values: VariableValues }) => void`                    | Les valeurs ou les déclarations de variables ont changé (`VariableStore.setValues` / `define`, et `resolve` quand une valeur arrive). `values` = `getValues()`. |
| `uploadStart`     | `(payload: { editor: AsterEditor; file: File }) => void`                                | Une image part vers le hook `upload`. Permet d'afficher un état d'attente.                                                                                      |
| `uploadDone`      | `(payload: { editor: AsterEditor; file: File; src?: string; error?: unknown }) => void` | Après succès (`src`) ou échec (`error`) de l'upload.                                                                                                            |
| `destroy`         | `(payload: { editor: AsterEditor }) => void`                                            | Juste avant la destruction. Après cet événement, toute méthode de l'éditeur est indéfinie (les méthodes de contenu lèvent).                                     |

### `AsterEventName`

```ts
type AsterEventName = keyof AsterEvents;
```

### `Unsubscribe`

```ts
type Unsubscribe = () => void;
```

Renvoyée par `on`.

## 🧩 Variables de document

Types de `variables.ts`. Une variable est une puce inline atomique du document (nœud `variable`, HTML `<span data-aster-variable="nom" data-label="Libellé">{{nom}}</span>`) ; sa valeur vit dans le magasin `AsterEditor.variables`, pas dans le document.

### `AsterVariable`

| Champ         | Type     | Obligatoire | Description                                                                                                              |
| ------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| `name`        | `string` | oui         | Identifiant stable : lettres, chiffres, `_`, `.`, `-` (premier caractère : lettre, chiffre ou `_`). Sensible à la casse. |
| `label`       | `string` | non         | Libellé humain affiché dans la puce et les menus. Par défaut `name`.                                                     |
| `value`       | `string` | non         | Valeur courante. Absente → la puce affiche le libellé.                                                                   |
| `description` | `string` | non         | Aide affichée dans le menu d'insertion.                                                                                  |

Tous les champs sont `readonly`.

### `VariableValues`

```ts
type VariableValues = Readonly<Record<string, string>>;
```

Valeurs par nom de variable.

### `VariableResolver`

```ts
type VariableResolver = (
  name: string,
  editor: AsterEditor,
) => string | undefined | Promise<string | undefined>;
```

Résolveur optionnel, appelé par `VariableStore.resolve()` pour chaque variable présente sans valeur. `undefined` laisse la variable sans valeur.

### `VariableSource`

Configuration dans `AsterOptions.variables`. Tous les champs optionnels et `readonly`.

| Champ          | Type                       | Défaut | Description                                                                                                                                                 |
| -------------- | -------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `variables`    | `readonly AsterVariable[]` | `[]`   | Variables déclarées, proposées dans le menu d'insertion même si absentes du document. Une `value` portée ici est versée dans les valeurs.                   |
| `values`       | `VariableValues`           | `{}`   | Valeurs initiales (appliquées après celles des déclarations).                                                                                               |
| `resolve`      | `VariableResolver`         | —      | Résolveur appelé à la demande (`VariableStore.resolve`) pour les valeurs manquantes.                                                                        |
| `allowUnknown` | `boolean`                  | `true` | Autoriser l'insertion d'une variable non déclarée (saisie libre dans le menu). Vrai par défaut : un document Word importé peut contenir n'importe quel nom. |

### `VariableRenderMode` et `GetHtmlOptions`

```ts
type VariableRenderMode = 'placeholders' | 'resolve';

interface GetHtmlOptions {
  readonly variables?: VariableRenderMode;
}
```

`placeholders` (défaut) : puces conservées, `<span data-aster-variable="nom">{{nom}}</span>`. `resolve` : valeurs substituées en texte brut échappé ; une variable sans valeur garde `{{nom}}`. Mode de `AsterEditor.getHTML` ; `@aster-editor/word` ajoute un troisième mode `fields` pour l'export seulement.

### `VariableStore`

Magasin des variables d'un éditeur (`AsterEditor.variables`). Les puces du document se rafraîchissent à chaque `setValues`.

| Signature                                                                | Description                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list(): readonly AsterVariable[]`                                       | Variables déclarées, puis variables présentes dans le document non déclarées ; `value` renseignée quand connue.                                                                                                                      |
| `getNames(): readonly string[]`                                          | Noms réellement présents dans le document, sans doublon.                                                                                                                                                                             |
| `getValues(): VariableValues`                                            | Valeurs connues.                                                                                                                                                                                                                     |
| `setValues(values: Readonly<Record<string, string \| undefined>>): void` | Fusionne les valeurs, émet `variablesChange`, rafraîchit les puces. `undefined` efface.                                                                                                                                              |
| `define(variables: readonly AsterVariable[]): void`                      | Déclare ou met à jour des variables (libellé, description, valeur), fusion par nom ; émet `variablesChange`.                                                                                                                         |
| `insert(name: string, label?: string): boolean`                          | Insère une puce à la sélection courante. Équivaut à `commands.run('variable.insert', { name })`.                                                                                                                                     |
| `resolve(): Promise<VariableValues>`                                     | Appelle le résolveur pour toutes les variables présentes sans valeur, applique les valeurs obtenues et les renvoie. Sans résolveur, renvoie `getValues()`. Les succès sont appliqués avant qu'un rejet ne fasse rejeter la promesse. |
| `hasUnresolved(): boolean`                                               | Vrai si au moins une variable présente dans le document n'a pas de valeur.                                                                                                                                                           |

L'implémentation du core (`createVariableStore`, type `AsterVariableStore`) ajoute `allowUnknown`, `isDeclared(name)` et `canInsert(name)`, hors contrat : `isAsterVariableStore(store)` et `canInsertVariable(editor, name)` y donnent accès sans supposer que le magasin est celui du core.

## 📄 Document

### `AsterDocument`

```ts
type AsterDocument = JSONContent; // de @tiptap/core
```

Document au format JSON ProseMirror. Format de stockage structuré recommandé quand on ne veut pas dépendre de la sérialisation HTML.

### `AsterCounts`

| Champ        | Type     | Description                                                                          |
| ------------ | -------- | ------------------------------------------------------------------------------------ |
| `words`      | `number` | Nombre de mots au sens Unicode (séquences séparées par des espaces ou ponctuations). |
| `characters` | `number` | Nombre de caractères, espaces compris, hors balisage.                                |

## 🌍 i18n

### `AsterLocale`

```ts
type AsterLocale = 'fr' | 'en' | (string & {});
```

`fr` et `en` sont fournies par le core ; toute autre chaîne est acceptée à condition d'avoir été enregistrée via `I18n.addTranslations`.

### `AsterDictionary`

```ts
type AsterDictionary = Readonly<Record<string, string>>;
```

Dictionnaire plat : clé pointée → chaîne, interpolation `{name}`.

### `TranslateParams`

```ts
type TranslateParams = Readonly<Record<string, string | number>>;
```

### `I18n`

Service attaché à un éditeur. Convention de clés : `command.<id>` (libellés de commandes, `search.*`, `variable.*` et `formatPainter.*` compris), `ui.<composant>.<clé>` (toolbar, dialogues, panneaux), `editor.*` (placeholder, compteurs), `variable.unresolved` (`title` d'une puce sans valeur, `{name}`).

| Signature                                                                 | Description                                                                                                                 |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `getLocale(): AsterLocale`                                                | Locale courante.                                                                                                            |
| `setLocale(locale: AsterLocale): void`                                    | Change la locale à chaud et émet `localeChange` si elle change.                                                             |
| `t(key: string, params?: TranslateParams): string`                        | Traduit. Clé absente → repli sur `en`, puis sur la clé elle-même. Un paramètre absent laisse le marqueur `{name}` en place. |
| `addTranslations(locale: AsterLocale, dictionary: AsterDictionary): void` | Ajoute ou surcharge des traductions. Fusion superficielle. Les dictionnaires exportés (`fr`, `en`) ne sont jamais modifiés. |
| `has(key: string): boolean`                                               | Vrai si la clé existe dans la locale courante ou dans le repli `en`.                                                        |

## 📋 Collage

### `PasteContext`

| Champ       | Type             | Description                                                                 |
| ----------- | ---------------- | --------------------------------------------------------------------------- |
| `editor`    | `AsterEditor`    |                                                                             |
| `plainText` | `string`         | Version texte brut du presse-papier, utile pour les heuristiques.           |
| `event`     | `ClipboardEvent` | Optionnel. Événement d'origine, absent quand le collage est simulé en test. |

### `PasteTransformer`

```ts
type PasteTransformer = (html: string, context: PasteContext) => string;
```

Transformateur de HTML collé. Chaînés dans l'ordre de déclaration, chacun reçoit la sortie du précédent. Retourner la chaîne inchangée si le HTML ne concerne pas le transformateur. Un transformateur qui lève est ignoré par le pipeline. Ne s'applique pas à `insertHTML`.

## 🎨 Toolbar et thème

Ces types vivent dans le core pour que `angular` puisse les typer sans dépendre de `ui` ; leur rendu est fait par `ui`.

### `AsterTheme`

```ts
type AsterTheme = 'light' | 'night' | (string & {});
```

`light` et `night` fournis par `ui`, toute autre chaîne est un thème custom (`data-theme`).

### `ToolbarPreset`

```ts
type ToolbarPreset = 'full' | 'standard' | 'minimal';
```

### `ToolbarButtonItem`

Bouton simple déclenchant une commande, éventuellement avec des arguments fixes.

| Champ      | Type        | Obligatoire | Description                                   |
| ---------- | ----------- | ----------- | --------------------------------------------- |
| `type`     | `'button'`  | non         | Discriminant optionnel.                       |
| `command`  | `CommandId` | oui         | Commande déclenchée.                          |
| `args`     | `unknown`   | non         | Arguments passés à `run`/`canRun`/`isActive`. |
| `labelKey` | `string`    | non         | Surcharge de la clé i18n du libellé.          |
| `icon`     | `string`    | non         | Surcharge de l'icône.                         |

### `ToolbarDropdownItem`

Menu déroulant regroupant plusieurs entrées.

| Champ      | Type                           | Obligatoire | Description           |
| ---------- | ------------------------------ | ----------- | --------------------- |
| `type`     | `'dropdown'`                   | oui         |                       |
| `id`       | `string`                       | oui         | Identifiant du menu.  |
| `labelKey` | `string`                       | oui         | Clé i18n du libellé.  |
| `icon`     | `string`                       | non         | Icône du déclencheur. |
| `items`    | `readonly ToolbarButtonItem[]` | oui         | Entrées du menu.      |

### `ToolbarWidgetItem`

Composant UI spécialisé fourni par `ui`.

| Champ    | Type       | Obligatoire | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------- | ---------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`   | `'widget'` | oui         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `widget` | `string`   | oui         | Identifiants cités par le contrat : `heading`, `table`, `link`, `image`, `textColor`, `backgroundColor`, `fontFamily`, `fontSize`, `search`, `source`, `fullscreen`, `specialChars`, `print`, `variable`. `ui` en reconnaît deux de plus depuis 0.4.0 (`outline`, `formatPainter`) et huit depuis la session 3 (`lineSpacing`, `paragraphSpacing`, `indentIncrease`, `indentDecrease`, `paragraphBorders`, `caps`, `underlineStyle`, `pageLayout`) : 24 au total (`WIDGETS`). |

### `ToolbarItem`, `ToolbarGroup`, `ToolbarConfig`

```ts
type ToolbarItem = CommandId | ToolbarButtonItem | ToolbarDropdownItem | ToolbarWidgetItem;
type ToolbarGroup = readonly ToolbarItem[];
type ToolbarConfig = ToolbarPreset | readonly ToolbarGroup[] | false;
```

Un groupe = une série de boutons séparée visuellement des autres. `false` = aucune toolbar.

## 📐 Mise en page (`layout.ts`)

Contrat de la session 3, partagé par `core` (attributs de paragraphe, marques de run, vue page), `word` (lecture et écriture `.docx`) et `angular`. Principe : tout ce qui vient de Word et que l'éditeur sait représenter devient un attribut ProseMirror sérialisé en `style` inline normalisé ou en `data-docx-*` ; tout ce qu'il ne sait pas représenter reste dans le gabarit `.docx` (hors corps) ou est signalé. Unités : millimètres pour la page, points typographiques (`pt`) pour le texte et les paragraphes, nombre sans unité pour un interligne multiple. Jamais de twips ni d'EMU hors du paquet `word`. Tous les champs sont `readonly`.

### Page

```ts
type PageSizeName = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal';
interface PageDimensions {
  widthMm: number;
  heightMm: number;
}
type PageOrientation = 'portrait' | 'landscape';
```

`PageDimensions` est le format libre en millimètres, quand le document n'utilise pas un format nommé.

#### `PageMargins`

| Champ      | Type     | Description                                             |
| ---------- | -------- | ------------------------------------------------------- |
| `topMm`    | `number` | Marge haute. 25,4 mm par défaut partout.                |
| `rightMm`  | `number` |                                                         |
| `bottomMm` | `number` |                                                         |
| `leftMm`   | `number` |                                                         |
| `headerMm` | `number` | Distance du bord haut à l'en-tête (12,7 mm par défaut). |
| `footerMm` | `number` | Distance du bord bas au pied (12,7 mm par défaut).      |

#### `PageSetup`

| Champ         | Type                             | Défaut       | Description                         |
| ------------- | -------------------------------- | ------------ | ----------------------------------- |
| `size`        | `PageSizeName \| PageDimensions` | `'A4'`       | Format nommé ou libre.              |
| `orientation` | `PageOrientation`                | `'portrait'` | Paysage inverse largeur et hauteur. |
| `margins`     | `PageMargins`                    | 25,4 mm      |                                     |

### En-têtes et pieds

```ts
interface HeaderFooterContent {
  html: string; // fragment HTML stylé, mêmes règles que le corps
}
interface HeaderFooterSet {
  default?: HeaderFooterContent; // toutes les pages
  first?: HeaderFooterContent; // première page si `DocumentLayout.titlePage`
  even?: HeaderFooterContent; // pages paires si le document distingue pair / impair
}
interface DefaultFont {
  family?: string; // style `Normal` résolu
  sizePt?: number;
}
```

### `DocumentLayout`

Mise en page d'un document : ce que l'import `.docx` lit dans la **dernière section** et ce que l'export réécrit (export neuf) ou conserve (export dans le gabarit). Tous les champs sont optionnels : un objet vide = les défauts d'Aster (A4 portrait, 25,4 mm).

| Champ         | Type              | Description                                                                           |
| ------------- | ----------------- | ------------------------------------------------------------------------------------- |
| `page`        | `PageSetup`       |                                                                                       |
| `columns`     | `number`          | Nombre de colonnes de texte, 1 par défaut. Conservé, **non affiché** par la vue page. |
| `defaultFont` | `DefaultFont`     |                                                                                       |
| `lang`        | `string`          | Langue BCP 47, ex. `fr-FR`.                                                           |
| `headers`     | `HeaderFooterSet` |                                                                                       |
| `footers`     | `HeaderFooterSet` |                                                                                       |
| `titlePage`   | `boolean`         | Première page différente (en-tête et pied `first`).                                   |

### Bordures

```ts
type BorderSide = 'top' | 'right' | 'bottom' | 'left' | 'between'; // `between` sépare deux paragraphes bordés consécutifs
type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'double';
interface BlockBorder {
  side: BorderSide;
  style: BorderStyle;
  widthPt: number; // épaisseur en points
  color: string; // `#rrggbb`
}
```

### `ParagraphLayoutAttrs`

Attributs de mise en page d'un paragraphe ou d'un titre. `null` ou absent = hérité du style de l'éditeur. Sérialisation HTML figée, dans cet ordre, uniquement pour les valeurs présentes :

```html
<p
  style="line-height: 1.15; margin-top: 6pt; margin-bottom: 6pt; margin-left: 36pt; margin-right: 0pt; text-indent: 18pt; border-bottom: 1pt solid #000000; background-color: #eeeeee"
  data-docx-style="Normal"
  data-keep-next
  data-page-break-before
></p>
```

| Champ               | Type                             | Sérialisation                                                                                                                                                                                                                                                   |
| ------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lineHeight`        | `number \| null`                 | `line-height: 1.15`, multiple sans unité. Exclusif de `lineHeightPt`, qui l'emporte.                                                                                                                                                                            |
| `lineHeightPt`      | `number \| null`                 | `line-height: 14pt`, exact.                                                                                                                                                                                                                                     |
| `spacingBeforePt`   | `number \| null`                 | `margin-top`                                                                                                                                                                                                                                                    |
| `spacingAfterPt`    | `number \| null`                 | `margin-bottom`                                                                                                                                                                                                                                                 |
| `indentLeftPt`      | `number \| null`                 | `margin-left`                                                                                                                                                                                                                                                   |
| `indentRightPt`     | `number \| null`                 | `margin-right`                                                                                                                                                                                                                                                  |
| `indentFirstLinePt` | `number \| null`                 | `text-indent` ; négatif = retrait suspendu.                                                                                                                                                                                                                     |
| `borders`           | `readonly BlockBorder[] \| null` | `border-<côté>: <pt> <style> <#rrggbb>` par côté ; le côté `between` n'a pas d'équivalent CSS et va dans `data-border-between`.                                                                                                                                 |
| `shading`           | `string \| null`                 | `background-color`, couleur CSS.                                                                                                                                                                                                                                |
| `keepWithNext`      | `boolean \| null`                | `data-keep-next`                                                                                                                                                                                                                                                |
| `pageBreakBefore`   | `boolean \| null`                | `data-page-break-before`                                                                                                                                                                                                                                        |
| `docxStyle`         | `string \| null`                 | `data-docx-style` : identifiant du style Word d'origine (`Heading1`, `Normal`, style personnalisé), posé par l'import et relu par l'export dans le gabarit, qui ne réécrit en propriétés directes que ce qui diffère du style. Jamais interprété par l'éditeur. |

`setHTML(getHTML())` doit conserver chaque attribut à l'identique. `PARAGRAPH_LAYOUT_ATTR_NAMES` est le tuple `as const` des douze noms dans l'ordre de sérialisation ; `ParagraphLayoutAttrName` en est l'union.

### `RunLayoutAttrs` et `DecorationStyle`

Attributs de run portés par la marque `textStyle` en plus de ceux de Tiptap (`fontFamily`, `fontSize`, `color`, `backgroundColor`), sérialisés dans le `style` du `<span>` :

| Champ             | Type                       | Sérialisation                                            |
| ----------------- | -------------------------- | -------------------------------------------------------- |
| `letterSpacingPt` | `number \| null`           | `letter-spacing: 1pt`                                    |
| `caps`            | `'all' \| 'small' \| null` | `text-transform: uppercase` / `font-variant: small-caps` |
| `docxRunStyle`    | `string \| null`           | `data-docx-run-style` : nom du style de caractère Word.  |

`DecorationStyle = 'solid' | 'double' | 'dotted' | 'dashed' | 'wavy'` : style de trait des marques `underline` et `strike`, `style="text-decoration-style: …"`.

### `ListLayoutAttrs` et `OrderedListType`

`OrderedListType = '1' | 'a' | 'A' | 'i' | 'I'` (valeurs de l'attribut HTML `type`). `<ol type="a" start="3" data-docx-num-id="5">`, `<ul data-bullet="–" data-docx-num-id="7">` :

| Champ       | Type                      | Description                                                                                               |
| ----------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `type`      | `OrderedListType \| null` | Format de numérotation.                                                                                   |
| `start`     | `number \| null`          | Premier numéro.                                                                                           |
| `bullet`    | `string \| null`          | Caractère de puce.                                                                                        |
| `docxNumId` | `string \| null`          | Relie la liste à la définition de numérotation du gabarit pour l'export, jamais interprété par l'éditeur. |

### `TableLayoutAttrs`, `CellLayoutAttrs`, `CellVerticalAlign`

Table : `width: 100%` ou `width: 450pt`, `border-collapse` implicite, `data-docx-style`. Cellule : `border-top: 0.5pt solid #000000` (un par côté), `background-color: #rrggbb`, `vertical-align: middle`, `padding: 2pt 4pt`. `colwidth` reste celui de Tiptap.

| Type               | Champ           | Type                                                | Description                                         |
| ------------------ | --------------- | --------------------------------------------------- | --------------------------------------------------- |
| `TableLayoutAttrs` | `width`         | `string \| null`                                    | `100%` ou `450pt`.                                  |
|                    | `borders`       | `readonly BlockBorder[] \| null`                    | Bordures extérieures.                               |
|                    | `docxStyle`     | `string \| null`                                    | Nom du style de tableau Word.                       |
| `CellLayoutAttrs`  | `borders`       | `readonly BlockBorder[] \| null`                    |                                                     |
|                    | `shading`       | `string \| null`                                    | Fond.                                               |
|                    | `verticalAlign` | `CellVerticalAlign \| null`                         | `'top' \| 'middle' \| 'bottom'`.                    |
|                    | `paddingPt`     | `readonly [number, number, number, number] \| null` | Marges internes en points, `top right bottom left`. |

### `PageViewOptions`

Vue page : l'hôte de l'éditeur rend une feuille aux dimensions et marges de `layout.page`, avec les en-têtes et pieds `default` en lecture seule au-dessus et au-dessous du corps. La pagination est **approximative** : des coupures visuelles sont posées là où la hauteur utile de la page est dépassée (blocs insécables, sauts de page explicites respectés), sans garantie d'exactitude avec Word.

| Champ                | Type             | Défaut | Description                                                                              |
| -------------------- | ---------------- | ------ | ---------------------------------------------------------------------------------------- |
| `layout`             | `DocumentLayout` | `{}`   | Mise en page affichée.                                                                   |
| `showHeadersFooters` | `boolean`        | `true` | Afficher les en-têtes et pieds.                                                          |
| `pagination`         | `boolean`        | `true` | Pagination approximative (coupures visuelles, numéros de page). Ajouté par L30, additif. |

## 📝 Propositions de contrat de la session 3

Les lots proposent, l'orchestrateur tranche (`docs/JOURNAL.md`, session 3). État au gel de 0.5.0 :

| Proposition                                                                                           | Origine  | Décision                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PageViewOptions.pagination`                                                                          | L30      | **Acceptée**, additive, dans `layout.ts`.                                                                                                                                                                                     |
| `paragraph.setLayout` / `paragraph.unsetLayout` dans `STANDARD_COMMAND_IDS`                           | phase 0  | **Acceptée** (contrat figé en phase 0).                                                                                                                                                                                       |
| `setPageView(options)` / `getLayout()` dans `api/editor.ts`                                           | L23, L26 | **Différée.** Implémentées sur `AsterEditorImpl`, hors interface `AsterEditor` ; `ui` (`pageViewApiOf`) et `angular` les détectent à l'exécution. À entrer dans le contrat en 0.6 avec le changement de défaut de `fidelity`. |
| `text.setLetterSpacing` / `text.setCaps` / `text.unsetCaps` dans le contrat                           | L23, L26 | **Différée.** Enregistrées comme commandes additives (`TEXT_LAYOUT_COMMAND_IDS`), surcharge libre de `run`.                                                                                                                   |
| `image.setAttributes.height` (hauteur d'image, verrou de proportions)                                 | L26      | **Différée.** Le dialogue d'image de `ui` propose la hauteur et le verrou ; le core accepte `height: null` (effacement) et ignore une hauteur explicite tant que le contrat ne la déclare pas.                                |
| `DocumentLayout.defaultParagraph` (interligne et espacement par défaut du document, pour la vue page) | L24      | **Différée.** Les valeurs des `docDefaults` sont écrites sur chaque bloc qui en diffère ; la vue page n'en a pas eu besoin.                                                                                                   |
| `DocxStyleResolver.docDefaults()`, `TableStyleProps.paragraphDefaults`                                | L24, L25 | **Acceptées** dans le contrat interne du lecteur (`packages/word/src/docx/reader/types.ts`), pas dans `api/` du core.                                                                                                         |

## 🏭 Fabrique

```ts
function createEditor(options: AsterOptions): AsterEditor;
```

Crée un éditeur monté dans `options.element`. Fabrique plutôt que classe exposée : le contrat public est l'interface `AsterEditor`. L'implémentation expose en plus `setPageView` et `getLayout` (voir « Propositions de contrat »).
