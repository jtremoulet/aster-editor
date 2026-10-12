# 📚 Référence API — `@aster-editor/core`

> Référence exhaustive du contrat public défini dans `packages/core/src/api/`. Chaque type, chaque champ. Le fichier source fait foi ; le [README du core](../packages/core/README.md) est le tutoriel.

Le contrat est figé : `ui`, `word` et `angular` codent contre ces types. Tout est réexporté depuis `@aster-editor/core`.

## 🧭 Index

| Type                                                                                                                                                                | Fichier       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `AsterOptions`, `LinkPolicy`, `UploadHandler`                                                                                                                       | `options.ts`  |
| `AsterEditor`                                                                                                                                                       | `editor.ts`   |
| `AsterCommand`, `CommandRegistry`, `CommandId`, `StandardCommandId`, `STANDARD_COMMAND_IDS`, `StandardCommandArgs`, `CommandArgs`, `CommandRunArgs`, `HeadingLevel` | `commands.ts` |
| `AsterEvents`, `AsterEventName`, `Unsubscribe`                                                                                                                      | `events.ts`   |
| `AsterDocument`, `AsterCounts`                                                                                                                                      | `document.ts` |
| `I18n`, `AsterLocale`, `AsterDictionary`, `TranslateParams`                                                                                                         | `i18n.ts`     |
| `PasteTransformer`, `PasteContext`                                                                                                                                  | `paste.ts`    |
| `AsterTheme`, `ToolbarConfig`, `ToolbarPreset`, `ToolbarGroup`, `ToolbarItem`, `ToolbarButtonItem`, `ToolbarDropdownItem`, `ToolbarWidgetItem`                      | `toolbar.ts`  |

## ⚙️ `AsterOptions`

Options de `createEditor(options)`. Seul `element` est obligatoire.

| Champ               | Type                          | Obligatoire | Défaut                       | Description                                                                              |
| ------------------- | ----------------------------- | ----------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| `element`           | `HTMLElement`                 | oui         | —                            | Élément hôte. Le core y crée le conteneur `.aster-content` et le contenteditable.        |
| `content`           | `string \| AsterDocument`     | non         | `''`                         | Contenu initial, HTML ou document JSON ProseMirror.                                      |
| `placeholder`       | `string`                      | non         | `editor.placeholder` traduit | Texte affiché quand le document est vide. Fonction de la locale si absent.               |
| `readOnly`          | `boolean`                     | non         | `false`                      | Démarre en lecture seule.                                                                |
| `locale`            | `AsterLocale`                 | non         | `'fr'`                       | Locale initiale.                                                                         |
| `autofocus`         | `boolean`                     | non         | `false`                      | Donne le focus (fin de document) au montage.                                             |
| `extensions`        | `readonly AnyExtension[]`     | non         | `[]`                         | Extensions Tiptap additionnelles, ajoutées après le jeu standard.                        |
| `commands`          | `readonly AsterCommand[]`     | non         | `[]`                         | Commandes custom enregistrées au montage, après les standard (même `id` = remplacement). |
| `pasteTransformers` | `readonly PasteTransformer[]` | non         | `[]`                         | Transformateurs de collage, dans l'ordre d'application.                                  |
| `upload`            | `UploadHandler`               | non         | —                            | Hook d'upload d'image. Absent : data URL base64.                                         |
| `linkPolicy`        | `LinkPolicy`                  | non         | voir `LinkPolicy`            | Politique de sécurité et de comportement des liens.                                      |
| `disabledCommands`  | `readonly string[]`           | non         | `[]`                         | Commandes standard désactivées par identifiant : retirées du registre, raccourci avalé.  |

### `LinkPolicy`

Tous les champs optionnels ; les défauts sont ceux de `DEFAULT_LINK_POLICY`.

| Champ              | Type                  | Défaut                               | Description                                                                                                               |
| ------------------ | --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `allowedProtocols` | `readonly string[]`   | `['http', 'https', 'mailto', 'tel']` | Protocoles acceptés (liste blanche). Tout le reste est rejeté, `javascript:` en premier lieu. Les URLs relatives passent. |
| `defaultTarget`    | `'_blank' \| '_self'` | `'_blank'`                           | Cible des liens créés par `link.set` sans `target` explicite.                                                             |
| `rel`              | `string`              | `'noopener noreferrer'`              | Attribut `rel` forcé sur tout lien `target="_blank"`.                                                                     |
| `autolink`         | `boolean`             | `true`                               | Transformer automatiquement les URLs tapées ou collées en liens.                                                          |

### `UploadHandler`

```ts
type UploadHandler = (file: File) => Promise<string>;
```

Reçoit le fichier image, retourne l'URL finale à poser dans `src`. Un rejet émet `uploadDone` avec `error` et n'insère rien (dans `importDocx`, repli base64 avec avertissement).

## 🧰 `AsterEditor`

Instance retournée par `createEditor`. Toute l'API est synchrone sauf mention contraire. Après `destroy()`, aucune méthode ne doit être appelée.

### Propriétés (toutes `readonly`)

| Propriété        | Type              | Description                                                                                         |
| ---------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| `tiptap`         | `Editor`          | Instance Tiptap sous-jacente. Porte de sortie assumée, non garantie stable entre versions mineures. |
| `commands`       | `CommandRegistry` | Registre des commandes.                                                                             |
| `i18n`           | `I18n`            | Service de traduction attaché à l'éditeur.                                                          |
| `element`        | `HTMLElement`     | Élément hôte passé dans les options.                                                                |
| `contentElement` | `HTMLElement`     | Élément contenteditable réel (`.ProseMirror`), utile pour les tests et le focus.                    |

### Méthodes — contenu

| Signature                                           | Description                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `getHTML(): string`                                 | HTML sémantique, stable : `setHTML(getHTML())` est idempotent. Bruit de table (`colgroup`, `min-width`, `colspan="1"`) retiré. |
| `setHTML(html: string, emit?: boolean): void`       | Remplace tout le contenu. `emit` (défaut `true`) à `false` n'émet pas `change`.                                                |
| `getJSON(): AsterDocument`                          | Document JSON ProseMirror.                                                                                                     |
| `setJSON(doc: AsterDocument, emit?: boolean): void` | Remplace tout le contenu depuis un document JSON. Même sémantique de `emit`.                                                   |
| `getText(): string`                                 | Texte brut, blocs séparés par des sauts de ligne.                                                                              |
| `insertHTML(html: string): void`                    | Insère du HTML à la position courante, en passant par le schéma. Donne le focus.                                               |
| `isEmpty(): boolean`                                | Vrai si le document est vide (`tiptap.isEmpty`).                                                                               |
| `getCounts(): AsterCounts`                          | Compteurs de mots et de caractères.                                                                                            |

### Méthodes — état

| Signature                                           | Description                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `focus(position?: 'start' \| 'end' \| 'all'): void` | Donne le focus ; sans argument, conserve la sélection courante.                          |
| `blur(): void`                                      | Retire le focus.                                                                         |
| `isFocused(): boolean`                              |                                                                                          |
| `setReadOnly(value: boolean): void`                 | Bascule l'éditabilité. Émet `readOnlyChange` uniquement si la valeur change.             |
| `isReadOnly(): boolean`                             |                                                                                          |
| `isDestroyed(): boolean`                            | Vrai après `destroy()`.                                                                  |
| `destroy(): void`                                   | Émet `destroy`, vide les écouteurs, détruit Tiptap, retire `.aster-content`. Idempotent. |

### Méthodes — événements

| Signature                                                                                | Description                                                                    |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `on<E extends AsterEventName>(event: E, handler: AsterEvents[E]): Unsubscribe`           | Abonne, retourne la fonction de désabonnement.                                 |
| `off<E extends AsterEventName>(event: E, handler: AsterEvents[E]): void`                 | Désabonne.                                                                     |
| `emit<E extends AsterEventName>(event: E, ...payload: Parameters<AsterEvents[E]>): void` | Émet. Réservé aux extensions et aux paquets Aster. Sans effet après `destroy`. |

## 🎛️ Commandes

### `STANDARD_COMMAND_IDS` et `StandardCommandId`

Tuple `as const` des 48 identifiants standard, dans l'ordre : `bold`, `italic`, `underline`, `strike`, `subscript`, `superscript`, `code`, `highlight`, `clearFormatting`, `paragraph`, `heading`, `blockquote`, `codeBlock`, `horizontalRule`, `hardBreak`, `bulletList`, `orderedList`, `taskList`, `indent`, `outdent`, `alignLeft`, `alignCenter`, `alignRight`, `alignJustify`, `link.set`, `link.unset`, `image.insert`, `image.upload`, `image.setAttributes`, `table.insert`, `table.delete`, `table.addRowBefore`, `table.addRowAfter`, `table.deleteRow`, `table.addColumnBefore`, `table.addColumnAfter`, `table.deleteColumn`, `table.mergeCells`, `table.splitCell`, `table.toggleHeaderRow`, `table.toggleHeaderColumn`, `textColor`, `backgroundColor`, `fontFamily`, `fontSize`, `undo`, `redo`, `selectAll`.

`StandardCommandId = (typeof STANDARD_COMMAND_IDS)[number]`. Un identifiant pointé indique un domaine (`table.insert`).

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

| Commande              | Arguments                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `heading`             | `{ level: HeadingLevel }`                                                                 |
| `link.set`            | `{ href: string; target?: '_blank' \| '_self'; title?: string }`                          |
| `image.insert`        | `{ src: string; alt?: string; title?: string; width?: number }`                           |
| `image.upload`        | `{ file: File }`                                                                          |
| `image.setAttributes` | `{ alt?: string; title?: string; width?: number; align?: 'left' \| 'center' \| 'right' }` |
| `table.insert`        | `{ rows: number; cols: number; withHeaderRow?: boolean }`                                 |
| `textColor`           | `{ color: string \| null }` (`null` retire)                                               |
| `backgroundColor`     | `{ color: string \| null }`                                                               |
| `fontFamily`          | `{ family: string \| null }`                                                              |
| `fontSize`            | `{ size: string \| null }`                                                                |

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

| Champ      | Type                                           | Obligatoire | Description                                                                                                                                     |
| ---------- | ---------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`       | `CommandId` (readonly)                         | oui         | Identifiant unique, convention de `STANDARD_COMMAND_IDS`.                                                                                       |
| `labelKey` | `string` (readonly)                            | oui         | Clé i18n du libellé, par convention `command.<id>`.                                                                                             |
| `icon`     | `string` (readonly)                            | non         | Identifiant d'icône résolu par `ui`. Convention : points → tirets (`table.insert` → `table-insert`) ; `ui` convertit aussi le camelCase.        |
| `shortcut` | `string` (readonly)                            | non         | Raccourci principal au format Tiptap (`Mod-b`, `Mod-Shift-7`), affiché dans le tooltip. Liaisons supplémentaires via `EXTRA_SHORTCUT_BINDINGS`. |
| `run`      | `(editor: AsterEditor, args: Args) => boolean` | oui         | Exécute. Retourne `false` si rien n'a été fait.                                                                                                 |
| `canRun`   | `(editor: AsterEditor, args: Args) => boolean` | non         | Exécutable dans l'état courant ? Défaut : `true` hors lecture seule.                                                                            |
| `isActive` | `(editor: AsterEditor, args: Args) => boolean` | non         | « Enfoncée » pour la sélection courante ? Défaut : `false`.                                                                                     |

### `CommandRegistry`

Seule porte d'entrée pour `ui` et `angular`. `run`, `canRun` et `isActive` sont tolérants : identifiant inconnu, éditeur détruit ou handler qui lève → `false`, jamais d'exception. `run` et `canRun` répondent aussi `false` en lecture seule.

| Signature                                                                                                                             | Description                                          |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `register<Args>(command: AsterCommand<Args>): void`                                                                                   | Ajoute ou remplace (même `id`).                      |
| `unregister(id: CommandId): void`                                                                                                     | Retire.                                              |
| `get(id: CommandId): AsterCommand \| undefined`                                                                                       |                                                      |
| `has(id: CommandId): boolean`                                                                                                         |                                                      |
| `list(): readonly AsterCommand[]`                                                                                                     | Toutes les commandes, dans l'ordre d'enregistrement. |
| `run<K extends StandardCommandId>(id: K, ...args: CommandRunArgs<K>): boolean`                                                        | Surcharge typée pour les standard.                   |
| `run(id: string, args?: unknown): boolean`                                                                                            | Surcharge libre pour les custom.                     |
| `canRun<K extends StandardCommandId>(id: K, ...args: CommandRunArgs<K>): boolean` / `canRun(id: string, args?: unknown): boolean`     | Mêmes surcharges.                                    |
| `isActive<K extends StandardCommandId>(id: K, ...args: CommandRunArgs<K>): boolean` / `isActive(id: string, args?: unknown): boolean` | Mêmes surcharges.                                    |

## 📡 Événements

### `AsterEvents`

Interface des handlers, indexée par nom d'événement. Les handlers reçoivent toujours `editor` dans le payload.

| Événement         | Signature du handler                                                                    | Description                                                                                |
| ----------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `ready`           | `(payload: { editor: AsterEditor }) => void`                                            | Éditeur monté et prêt. Émis une seule fois, dans une microtâche après `createEditor`.      |
| `change`          | `(payload: { editor: AsterEditor }) => void`                                            | Le document a changé. Non émis pour un simple déplacement de sélection.                    |
| `selectionChange` | `(payload: { editor: AsterEditor }) => void`                                            | La sélection a bougé ou le document a changé. La toolbar se resynchronise dessus.          |
| `focus`           | `(payload: { editor: AsterEditor; event: FocusEvent }) => void`                         |                                                                                            |
| `blur`            | `(payload: { editor: AsterEditor; event: FocusEvent }) => void`                         |                                                                                            |
| `readOnlyChange`  | `(payload: { editor: AsterEditor; readOnly: boolean }) => void`                         | Après `setReadOnly` si la valeur change.                                                   |
| `localeChange`    | `(payload: { editor: AsterEditor; locale: AsterLocale }) => void`                       | Après `i18n.setLocale` si la locale change.                                                |
| `uploadStart`     | `(payload: { editor: AsterEditor; file: File }) => void`                                | Une image part vers le hook `upload`. Permet d'afficher un état d'attente.                 |
| `uploadDone`      | `(payload: { editor: AsterEditor; file: File; src?: string; error?: unknown }) => void` | Après succès (`src`) ou échec (`error`) de l'upload.                                       |
| `destroy`         | `(payload: { editor: AsterEditor }) => void`                                            | Juste avant la destruction. Après cet événement, toute méthode de l'éditeur est indéfinie. |

### `AsterEventName`

```ts
type AsterEventName = keyof AsterEvents;
```

### `Unsubscribe`

```ts
type Unsubscribe = () => void;
```

Renvoyée par `on`.

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

Service attaché à un éditeur. Convention de clés : `command.<id>` (libellés de commandes), `ui.<composant>.<clé>` (toolbar et dialogues), `word.<clé>` (messages d'import Word), `editor.*` (placeholder, compteurs).

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

Transformateur de HTML collé. Chaînés dans l'ordre de déclaration, chacun reçoit la sortie du précédent. Retourner la chaîne inchangée si le HTML ne concerne pas le transformateur. Un transformateur qui lève est ignoré par le pipeline.

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

| Champ    | Type       | Obligatoire | Description                                                                                                          |
| -------- | ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `type`   | `'widget'` | oui         |                                                                                                                      |
| `widget` | `string`   | oui         | Identifiants connus : `heading`, `table`, `link`, `image`, `textColor`, `backgroundColor`, `fontFamily`, `fontSize`. |

### `ToolbarItem`, `ToolbarGroup`, `ToolbarConfig`

```ts
type ToolbarItem = CommandId | ToolbarButtonItem | ToolbarDropdownItem | ToolbarWidgetItem;
type ToolbarGroup = readonly ToolbarItem[];
type ToolbarConfig = ToolbarPreset | readonly ToolbarGroup[] | false;
```

Un groupe = une série de boutons séparée visuellement des autres. `false` = aucune toolbar.

## 🏭 Fabrique

```ts
function createEditor(options: AsterOptions): AsterEditor;
```

Crée un éditeur monté dans `options.element`. Fabrique plutôt que classe exposée : le contrat public est l'interface `AsterEditor`.
