# ✳️ @aster-editor/core

> Moteur d'Aster Editor : `createEditor` sur Tiptap 3 / ProseMirror, registre de commandes typées, i18n, événements, sérialisation HTML et JSON. Aucune UI dedans, aucun framework.

Ce README est le tutoriel. La référence exhaustive du contrat est dans [`docs/API_CORE.md`](../../docs/API_CORE.md).

## 📦 Installation

```bash
npm install @aster-editor/core
```

Le paquet est ESM only et embarque ses dépendances Tiptap. Pour une toolbar et des thèmes, ajoute [`@aster-editor/ui`](../ui/README.md) ; pour Word, [`@aster-editor/word`](../word/README.md).

## 🚀 Minimal

```ts
import { createEditor } from '@aster-editor/core';

const editor = createEditor({
  element: document.querySelector<HTMLElement>('#editor')!,
  content: '<p>Bonjour</p>',
  placeholder: 'Écris quelque chose…',
});

editor.on('change', ({ editor }) => console.log(editor.getHTML()));
editor.commands.run('bold');
editor.destroy();
```

`createEditor` crée un `<div class="aster-content">` dans `element` et y monte le `contenteditable` (`.ProseMirror`). Sans `@aster-editor/ui`, aucun style n'est injecté (`injectCSS: false`) : c'est à toi de styler `.aster-content .ProseMirror`.

## ⚙️ Options (`AsterOptions`)

| Champ               | Type                          | Défaut  | Rôle                                                                                                                                 |
| ------------------- | ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `element`           | `HTMLElement`                 | requis  | Hôte. Le core y ajoute `.aster-content`.                                                                                             |
| `content`           | `string \| AsterDocument`     | `''`    | Contenu initial, HTML ou JSON ProseMirror.                                                                                           |
| `placeholder`       | `string`                      | i18n    | Texte affiché quand le document est vide. Sans valeur, `editor.placeholder` traduit selon la locale.                                 |
| `readOnly`          | `boolean`                     | `false` | Lecture seule au montage.                                                                                                            |
| `locale`            | `AsterLocale`                 | `'fr'`  | Locale initiale. `fr` et `en` fournies ; toute autre chaîne après `i18n.addTranslations`.                                            |
| `autofocus`         | `boolean`                     | `false` | Focus en fin de document au montage.                                                                                                 |
| `extensions`        | `readonly AnyExtension[]`     | `[]`    | Extensions Tiptap ajoutées après le jeu standard, donc prioritaires pour surcharger.                                                 |
| `commands`          | `readonly AsterCommand[]`     | `[]`    | Commandes custom enregistrées au montage. Un `id` existant remplace la commande standard.                                            |
| `pasteTransformers` | `readonly PasteTransformer[]` | `[]`    | Transformateurs de HTML collé, chaînés dans l'ordre.                                                                                 |
| `upload`            | `UploadHandler`               | —       | `(file: File) => Promise<string>` : URL finale d'une image. Sans hook, repli en data URL base64.                                     |
| `linkPolicy`        | `LinkPolicy`                  | voir §  | Protocoles autorisés, cible et `rel` par défaut, autolink.                                                                           |
| `disabledCommands`  | `readonly string[]`           | `[]`    | Commandes standard retirées du registre **et** dont le raccourci clavier est avalé (sinon la liaison native de Tiptap continuerait). |

## 🧰 API de `AsterEditor`

### Propriétés

| Propriété        | Type              | Rôle                                                                          |
| ---------------- | ----------------- | ----------------------------------------------------------------------------- |
| `tiptap`         | `Editor`          | Instance Tiptap. Porte de sortie assumée, pas garantie stable entre mineures. |
| `commands`       | `CommandRegistry` | Registre : `run`, `canRun`, `isActive`, `register`, `list`…                   |
| `i18n`           | `I18n`            | `t`, `getLocale`, `setLocale`, `addTranslations`, `has`.                      |
| `element`        | `HTMLElement`     | L'hôte passé dans les options.                                                |
| `contentElement` | `HTMLElement`     | Le `contenteditable` réel (`.ProseMirror`), utile pour tests et focus.        |

### Contenu

| Méthode                    | Rôle                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `getHTML(): string`        | HTML sémantique stable, sans `colgroup`, `min-width` ni `colspan="1"` sur les tables. `setHTML(getHTML())` est idempotent. |
| `setHTML(html, emit?)`     | Remplace tout le contenu. `emit = false` n'émet pas `change` (utile pour `writeValue` côté formulaire).                    |
| `getJSON(): AsterDocument` | Document JSON ProseMirror (`JSONContent` de Tiptap).                                                                       |
| `setJSON(doc, emit?)`      | Idem avec un document JSON.                                                                                                |
| `getText(): string`        | Texte brut, blocs séparés par `\n`.                                                                                        |
| `insertHTML(html)`         | Insère à la sélection courante, en passant par le schéma.                                                                  |
| `isEmpty(): boolean`       | Vrai pour un document sans contenu. Note : `getHTML()` d'un document vide vaut `<p></p>`, teste `isEmpty()` plutôt.        |
| `getCounts(): AsterCounts` | `{ words, characters }` via `CharacterCount`.                                                                              |

### État

| Méthode                  | Rôle                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `focus(position?)`       | `'start' \| 'end' \| 'all'`, ou la sélection courante sans argument.                                       |
| `blur()`                 |                                                                                                            |
| `isFocused(): boolean`   |                                                                                                            |
| `setReadOnly(value)`     | Émet `readOnlyChange` si la valeur change. En lecture seule, `commands.run` et `canRun` répondent `false`. |
| `isReadOnly(): boolean`  |                                                                                                            |
| `isDestroyed(): boolean` |                                                                                                            |
| `destroy()`              | Émet `destroy`, vide les écouteurs, détruit Tiptap, retire `.aster-content`. Idempotent.                   |

### Événements

| Méthode                   | Rôle                                                                 |
| ------------------------- | -------------------------------------------------------------------- |
| `on(event, handler)`      | Abonne et renvoie une fonction `Unsubscribe`.                        |
| `off(event, handler)`     | Désabonne.                                                           |
| `emit(event, ...payload)` | Réservé aux extensions et aux paquets Aster. Ignoré après `destroy`. |

## 🎛️ Commandes

Le registre est la seule porte d'entrée de la toolbar et du wrapper Angular. `run`, `canRun` et `isActive` sont tolérants : identifiant inconnu, éditeur détruit ou commande qui lève → `false`, jamais d'exception.

```ts
editor.commands.run('bold');
editor.commands.run('heading', { level: 2 });
editor.commands.run('link.set', { href: 'https://example.com', target: '_blank' });
editor.commands.run('table.insert', { rows: 3, cols: 2, withHeaderRow: true });
editor.commands.run('textColor', { color: null }); // null retire le style
editor.commands.canRun('table.deleteRow'); // false hors d'une table
editor.commands.isActive('heading', { level: 2 });
```

Les arguments sont typés par `StandardCommandArgs` : TypeScript refuse `run('heading')` sans `{ level }` et `run('bold', {})`.

### Tableau des 48 commandes standard

Raccourcis au format Tiptap : `Mod` = `Ctrl` sur Windows/Linux, `⌘` sur macOS. Libellés = dictionnaire `fr` (clé `command.<id>`).

| Id                         | Libellé fr                   | Raccourci                 | Arguments                                                                                   |
| -------------------------- | ---------------------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| `bold`                     | Gras                         | `Mod-b`                   | —                                                                                           |
| `italic`                   | Italique                     | `Mod-i`                   | —                                                                                           |
| `underline`                | Souligné                     | `Mod-u`                   | —                                                                                           |
| `strike`                   | Barré                        | `Mod-Shift-s`             | —                                                                                           |
| `subscript`                | Indice                       | —                         | —                                                                                           |
| `superscript`              | Exposant                     | —                         | —                                                                                           |
| `code`                     | Code                         | `Mod-e`                   | —                                                                                           |
| `highlight`                | Surligner                    | `Mod-Shift-h`             | —                                                                                           |
| `clearFormatting`          | Effacer la mise en forme     | —                         | — (retire les marks puis ramène les blocs au paragraphe)                                    |
| `paragraph`                | Paragraphe                   | —                         | —                                                                                           |
| `heading`                  | Titre                        | `Mod-Alt-1` … `Mod-Alt-6` | `{ level: 1 \| 2 \| 3 \| 4 \| 5 \| 6 }`                                                     |
| `blockquote`               | Citation                     | —                         | —                                                                                           |
| `codeBlock`                | Bloc de code                 | —                         | —                                                                                           |
| `horizontalRule`           | Séparateur                   | —                         | —                                                                                           |
| `hardBreak`                | Saut de ligne                | —                         | —                                                                                           |
| `bulletList`               | Liste à puces                | `Mod-Shift-8`             | —                                                                                           |
| `orderedList`              | Liste numérotée              | `Mod-Shift-7`             | —                                                                                           |
| `taskList`                 | Liste de tâches              | —                         | —                                                                                           |
| `indent`                   | Augmenter le retrait         | —                         | — (`listItem` puis `taskItem`)                                                              |
| `outdent`                  | Réduire le retrait           | —                         | —                                                                                           |
| `alignLeft`                | Aligner à gauche             | —                         | — (retire l'attribut ; actif quand aucun alignement explicite)                              |
| `alignCenter`              | Centrer                      | —                         | —                                                                                           |
| `alignRight`               | Aligner à droite             | —                         | —                                                                                           |
| `alignJustify`             | Justifier                    | —                         | —                                                                                           |
| `link.set`                 | Insérer un lien              | `Mod-k`                   | `{ href: string; target?: '_blank' \| '_self'; title?: string }`                            |
| `link.unset`               | Supprimer le lien            | —                         | —                                                                                           |
| `image.insert`             | Insérer une image            | —                         | `{ src: string; alt?: string; title?: string; width?: number }`                             |
| `image.upload`             | Importer une image           | —                         | `{ file: File }` (asynchrone : voir `uploadStart` / `uploadDone`)                           |
| `image.setAttributes`      | Propriétés de l'image        | —                         | `{ alt?: string; title?: string; width?: number; align?: 'left' \| 'center' \| 'right' }`   |
| `table.insert`             | Insérer un tableau           | —                         | `{ rows: number; cols: number; withHeaderRow?: boolean }` (`withHeaderRow` vrai par défaut) |
| `table.delete`             | Supprimer le tableau         | —                         | —                                                                                           |
| `table.addRowBefore`       | Insérer une ligne au-dessus  | —                         | —                                                                                           |
| `table.addRowAfter`        | Insérer une ligne en dessous | —                         | —                                                                                           |
| `table.deleteRow`          | Supprimer la ligne           | —                         | —                                                                                           |
| `table.addColumnBefore`    | Insérer une colonne à gauche | —                         | —                                                                                           |
| `table.addColumnAfter`     | Insérer une colonne à droite | —                         | —                                                                                           |
| `table.deleteColumn`       | Supprimer la colonne         | —                         | —                                                                                           |
| `table.mergeCells`         | Fusionner les cellules       | —                         | —                                                                                           |
| `table.splitCell`          | Scinder la cellule           | —                         | —                                                                                           |
| `table.toggleHeaderRow`    | Ligne d'en-tête              | —                         | —                                                                                           |
| `table.toggleHeaderColumn` | Colonne d'en-tête            | —                         | —                                                                                           |
| `textColor`                | Couleur du texte             | —                         | `{ color: string \| null }`                                                                 |
| `backgroundColor`          | Couleur de fond              | —                         | `{ color: string \| null }`                                                                 |
| `fontFamily`               | Police                       | —                         | `{ family: string \| null }`                                                                |
| `fontSize`                 | Taille                       | —                         | `{ size: string \| null }` (ex. `'14px'`)                                                   |
| `undo`                     | Annuler                      | `Mod-z`                   | —                                                                                           |
| `redo`                     | Rétablir                     | `Mod-Shift-z`, `Mod-y`    | —                                                                                           |
| `selectAll`                | Tout sélectionner            | `Mod-a`                   | —                                                                                           |

Les raccourcis à liaisons multiples (`heading`, `redo`) sont déclarés dans `EXTRA_SHORTCUT_BINDINGS` ; `Tab` / `Shift-Tab` dans les listes et les tables sont gérés nativement par Tiptap. Une commande custom qui déclare un `shortcut` est câblée automatiquement par `collectShortcutBindings`.

## 📡 Événements (`AsterEvents`)

Les handlers reçoivent toujours `editor` dans le payload, pour ne pas fermer sur une instance détruite.

| Événement         | Payload                          | Quand                                                                                                          |
| ----------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ready`           | `{ editor }`                     | Une fois, dans une microtâche après `createEditor` : un `on('ready')` juste après la création est bien appelé. |
| `change`          | `{ editor }`                     | Le document a changé. Pas pour un simple déplacement de sélection.                                             |
| `selectionChange` | `{ editor }`                     | Sélection ou document modifié. Émis aussi après `setHTML(…, false)` : ne t'en sers pas pour `dirty`.           |
| `focus` / `blur`  | `{ editor, event: FocusEvent }`  |                                                                                                                |
| `readOnlyChange`  | `{ editor, readOnly }`           | Après `setReadOnly` si la valeur change.                                                                       |
| `localeChange`    | `{ editor, locale }`             | Après `i18n.setLocale` si la locale change.                                                                    |
| `uploadStart`     | `{ editor, file }`               | Un fichier image part vers le hook `upload`.                                                                   |
| `uploadDone`      | `{ editor, file, src?, error? }` | Après succès (`src`) ou échec (`error`) de l'upload.                                                           |
| `destroy`         | `{ editor }`                     | Juste avant la destruction ; l'éditeur est encore utilisable dans le handler.                                  |

```ts
const off = editor.on('uploadDone', ({ file, error }) => {
  if (error) console.error(`Upload de ${file.name} échoué`, error);
});
off();
```

## 🌍 i18n

`fr` et `en` sont intégrés, `en` est la locale de repli : clé absente → `en` → la clé elle-même, jamais d'exception. L'interpolation utilise `{name}`.

```ts
import { createEditor, en } from '@aster-editor/core';

const editor = createEditor({ element, locale: 'de' });
editor.i18n.addTranslations('de', {
  ...en, // repli lisible pour les clés non traduites
  'command.bold': 'Fett',
  'command.italic': 'Kursiv',
  'editor.placeholder': 'Schreib etwas…',
  'editor.words': '{count} Wörter',
});
editor.i18n.t('command.bold'); // 'Fett'
editor.i18n.setLocale('fr'); // émet localeChange, la toolbar se retraduit
```

Convention de clés : `command.<id>` pour les commandes (`command.table.insert`), `command.heading.level` avec `{level}`, `editor.placeholder`, `editor.words`, `editor.characters`. Les paquets `ui` et `word` ajoutent leurs propres clés (`ui.*`) via `addTranslations`.

## 🔗 Politique de liens (`LinkPolicy`)

Liste blanche de protocoles, pas liste noire : `javascript:` et `data:` sont rejetés parce qu'absents, pas parce qu'on y a pensé. Les URLs relatives passent toujours.

| Champ              | Défaut                               |
| ------------------ | ------------------------------------ |
| `allowedProtocols` | `['http', 'https', 'mailto', 'tel']` |
| `defaultTarget`    | `'_blank'`                           |
| `rel`              | `'noopener noreferrer'`              |
| `autolink`         | `true`                               |

La politique s'applique à `link.set`, au parsing HTML (`setHTML`, collage : un `<a href="javascript:…">` devient du texte simple), au rendu et à l'autolink. `rel` est forcé à la valeur de la politique dès que `target="_blank"`. Les images suivent les mêmes règles, `data:` et `blob:` en plus (repli d'upload et aperçu local).

```ts
import { createEditor, isAllowedHref, resolveLinkPolicy } from '@aster-editor/core';

const editor = createEditor({
  element,
  linkPolicy: { allowedProtocols: ['https'], defaultTarget: '_self' },
});
isAllowedHref('http://example.com', resolveLinkPolicy({ allowedProtocols: ['https'] })); // false
```

## 🖼️ Upload d'images

Collage, glisser-déposer et `image.upload` passent tous par le même chemin : `isImageFile` (tout `image/*` sauf `image/svg+xml`), puis le hook `upload` s'il existe, sinon `readFileAsDataUrl`. L'insertion après un upload asynchrone vérifie `isDestroyed()` : un éditeur démonté pendant l'upload ne lève pas.

```ts
const editor = createEditor({
  element,
  upload: async (file) => {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/uploads', { method: 'POST', body });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { url } = (await response.json()) as { url: string };
    return url;
  },
});
```

En cas de rejet du hook, `uploadDone` porte `error` et l'image n'est pas insérée.

## 📋 Transformateurs de collage

Un `PasteTransformer` reçoit le HTML du presse-papier et un `PasteContext` (`editor`, `plainText`, `event?`), renvoie du HTML. Ils s'enchaînent dans l'ordre, un transformateur qui lève est ignoré. C'est par ce hook que `@aster-editor/word` se branche.

```ts
import type { PasteTransformer } from '@aster-editor/core';
import { wordPasteTransformer } from '@aster-editor/word';

const stripImages: PasteTransformer = (html) => html.replace(/<img[^>]*>/gi, '');

const editor = createEditor({
  element,
  pasteTransformers: [wordPasteTransformer(), stripImages],
});
```

## 🧩 Commandes custom

Une `AsterCommand` enveloppe une ou plusieurs commandes Tiptap. `labelKey` suit la convention `command.<id>`, `icon` est résolu par `ui` (voir son README), `shortcut` est câblé automatiquement.

```ts
import type { AsterCommand } from '@aster-editor/core';
import { createEditor } from '@aster-editor/core';

interface InsertDateArgs {
  format: 'short' | 'long';
}

// `undefined` dans le type : le registre peut appeler `run(id)` sans argument.
const insertDate: AsterCommand<InsertDateArgs | undefined> = {
  id: 'insertDate',
  labelKey: 'command.insertDate',
  icon: 'horizontal-rule', // nom du jeu d'icônes de ui
  shortcut: 'Mod-Shift-d',
  run: (editor, args) => {
    const text = new Date().toLocaleDateString(editor.i18n.getLocale(), {
      dateStyle: args?.format ?? 'short',
    });
    return editor.tiptap.chain().focus().insertContent(text).run();
  },
  canRun: (editor) => !editor.isReadOnly(),
  isActive: () => false,
};

const editor = createEditor({ element, commands: [insertDate] });
editor.i18n.addTranslations('fr', { 'command.insertDate': 'Insérer la date' });
editor.i18n.addTranslations('en', { 'command.insertDate': 'Insert date' });
editor.commands.run('insertDate', { format: 'long' });
```

Remplacer une commande standard : donne le même `id`, elle prend la place de l'original dans le registre et au clavier. Pour la retirer sans la remplacer, `disabledCommands: ['bold']`.

Tu peux aussi enregistrer après coup : `editor.commands.register(command)` / `unregister(id)`. Le raccourci n'est alors pas câblé (les liaisons sont calculées au montage) : passe par `options.commands` si tu en veux un.

## 🧱 Extensions Tiptap custom

`options.extensions` ajoute des extensions après le jeu standard. Le jeu standard : `StarterKit` (sans `link`), `Link` sécurisé, `TaskList` / `TaskItem`, `TableKit`, `TextAlign` (paragraphes et titres), `Image` avec attribut `align` (`data-align`), `Subscript`, `Superscript`, `Highlight` multicolore, `TextStyleKit`, `Placeholder`, `CharacterCount`, raccourcis Aster.

```ts
import { Extension } from '@tiptap/core';
import { createEditor } from '@aster-editor/core';

const Stamp = Extension.create({
  name: 'stamp',
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-t': () => this.editor.commands.insertContent('[stamp]'),
    };
  },
});

const editor = createEditor({ element, extensions: [Stamp] });
```

Une extension dont le nom existe déjà (ex. `image`) remplace la version Aster : à toi de garder les attributs attendus par les commandes standard.

## 🚪 Accès à `editor.tiptap`

`editor.tiptap` est l'instance Tiptap complète, pour les cas que le registre ne couvre pas : `chain()`, `can()`, `isActive()`, `getAttributes()`, `state`, `view`. C'est une porte de sortie assumée, pas une API garantie stable entre versions mineures d'Aster. Si tu t'en sers, encapsule-le dans une `AsterCommand` : ta toolbar et tes raccourcis restent sur le registre.

```ts
editor.tiptap.chain().focus().setTextSelection(1).run();
const { from, to } = editor.tiptap.state.selection;
```

## 🧾 Autres exports utiles

- `STANDARD_COMMAND_IDS`, `MARK_COMMANDS`, `BLOCK_COMMANDS`, `LIST_COMMANDS`, `ALIGNMENT_COMMANDS`, `TABLE_COMMANDS`, `TEXT_STYLE_COMMANDS`, `HISTORY_COMMANDS`, `createLinkCommands(policy)`, `createImageCommands(policy, upload)`, `createStandardCommands(context)`, `defineStandardCommand(id, spec)`, `iconIdFor(id)`.
- `createCommandRegistry(editor)`, `createI18n(locale, editor)`, `interpolate(template, params)`, `fr`, `en`, `FALLBACK_LOCALE`.
- `DEFAULT_LINK_POLICY`, `resolveLinkPolicy`, `createLinkExtension`, `extractScheme`, `isAllowedHref`, `isAllowedImageSrc`.
- `isImageFile`, `readFileAsDataUrl`, `insertImageFile`, `collectImageFiles`, `createImageUploadProps`.
- `applyPasteTransformers`, `createPastePipelineProps`.
- `EXTRA_SHORTCUT_BINDINGS`, `collectShortcutBindings`, `createShortcutsExtension`.
- `createAsterExtensions`, `createImageExtension`, `IMAGE_ALIGNMENTS`, `normalizeOutputHtml`, `CONTENT_CLASS`.
