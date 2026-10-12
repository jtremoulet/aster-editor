# ✳️ @aster-editor/core

> Moteur d'Aster Editor : `createEditor` sur Tiptap 3 / ProseMirror, registre de commandes typées, recherche / remplacement, i18n, événements, sérialisation HTML, JSON et Markdown, autosave. Aucune UI dedans, aucun framework.

Ce README est le tutoriel. La référence exhaustive du contrat est dans [`docs/API_CORE.md`](../../docs/API_CORE.md).

## 📦 Installation

```bash
npm install @aster-editor/core
```

Le paquet est ESM only et embarque ses dépendances Tiptap. Pour une toolbar et des thèmes, ajoute [`@aster-editor/ui`](../ui/README.md) ; pour Word (import, export, collage), [`@aster-editor/word`](../word/README.md).

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

`createEditor` crée un `<div class="aster-content">` dans `element` et y monte le `contenteditable` (`.ProseMirror`). Sans `@aster-editor/ui`, aucun style n'est injecté (`injectCSS: false`) : c'est à toi de styler `.aster-content .ProseMirror`, y compris la `figure.aster-image` des images et les classes `aster-search-match` de la recherche.

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
| `linkPolicy`        | `LinkPolicy`                  | voir §  | Protocoles autorisés, cible et `rel` par défaut, autolink. S'applique aussi aux sources d'images.                                    |
| `disabledCommands`  | `readonly string[]`           | `[]`    | Commandes standard retirées du registre **et** dont le raccourci clavier est avalé (sinon la liaison native de Tiptap continuerait). |

Le contrat `AsterOptions` est figé : ce qui n'y entre pas (autosave, Markdown) est fourni par des **fonctions compagnons** qui prennent l'éditeur en premier argument.

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

| Méthode                    | Rôle                                                                                                                                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getHTML(): string`        | HTML sémantique stable, sans `colgroup`, `min-width` ni `colspan="1"` sur les tables. `setHTML(getHTML())` est idempotent. Mis en cache tant que le document ne change pas : l'appeler à chaque frappe ne coûte qu'une sérialisation par transaction.                                   |
| `setHTML(html, emit?)`     | Remplace tout le contenu. `emit = false` n'émet pas `change`, n'entre pas dans l'historique **et vide l'historique antérieur** (un `undo` qui suit ne fait rien) : c'est le mode de `writeValue` côté formulaire. Avec `emit = true` (défaut), le remplacement est une étape annulable. |
| `getJSON(): AsterDocument` | Document JSON ProseMirror (`JSONContent` de Tiptap).                                                                                                                                                                                                                                    |
| `setJSON(doc, emit?)`      | Idem avec un document JSON, mêmes règles pour `emit`.                                                                                                                                                                                                                                   |
| `getText(): string`        | Texte brut : un seul `\n` entre deux blocs de texte, cellules de table et items de liste compris ; un `\n` par `hardBreak`.                                                                                                                                                             |
| `insertHTML(html)`         | Insère à la sélection courante, en passant par le schéma. HTML **brut, non transformé** : ni `pasteTransformers` ni normaliseur Word ne s'appliquent, seule la politique de liens et d'images filtre. Transforme le HTML avant si besoin. Donne le focus.                               |
| `isEmpty(): boolean`       | Vrai pour un document sans contenu. Note : `getHTML()` d'un document vide vaut `<p></p>`, teste `isEmpty()` plutôt.                                                                                                                                                                     |
| `getCounts(): AsterCounts` | `{ words, characters }` via `CharacterCount`.                                                                                                                                                                                                                                           |

Markdown : `getMarkdown(editor)` et `setMarkdown(editor, markdown, emit?)`, fonctions compagnons, voir plus bas.

### État

| Méthode                  | Rôle                                                                                                                                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `focus(position?)`       | `'start' \| 'end' \| 'all'`, ou la sélection courante sans argument. Synchrone en navigateur : au retour, la vue a le focus DOM (Tiptap seul le diffère à la frame suivante). Sous jsdom, le focus DOM n'est pas forcé.                                                                 |
| `blur()`                 |                                                                                                                                                                                                                                                                                         |
| `isFocused(): boolean`   |                                                                                                                                                                                                                                                                                         |
| `setReadOnly(value)`     | Émet `readOnlyChange` si la valeur change, **jamais `change`** (un formulaire ne passe pas `dirty` parce qu'il a été désactivé). En lecture seule, `commands.run` et `canRun` répondent `false`.                                                                                        |
| `isReadOnly(): boolean`  |                                                                                                                                                                                                                                                                                         |
| `isDestroyed(): boolean` |                                                                                                                                                                                                                                                                                         |
| `destroy()`              | Émet `destroy`, vide les écouteurs, détruit Tiptap, retire `.aster-content`. Idempotent. Ensuite, les méthodes de contenu (`getHTML`, `setHTML`, `getJSON`, `setJSON`, `getText`, `insertHTML`) lèvent `Error('AsterEditor détruit')`, `on` est un no-op et le registre répond `false`. |

### Événements

| Méthode                   | Rôle                                                                 |
| ------------------------- | -------------------------------------------------------------------- |
| `on(event, handler)`      | Abonne et renvoie une fonction `Unsubscribe`. No-op après `destroy`. |
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

Les identifiants standard sont autocomplétés et leurs arguments typés par `StandardCommandArgs` (`run('heading', …)` attend `{ level }`). Le registre garde aussi une surcharge libre `run(id: string, args?: unknown)` pour les commandes custom et `search.*` : `run('heading')` sans argument compile donc par cette surcharge et répond `false` à l'exécution. Vérifie tes arguments, TypeScript ne le fera pas à ta place sur cette surcharge.

### Tableau des 48 commandes standard

Raccourcis au format Tiptap : `Mod` = `Ctrl` sur Windows/Linux, `⌘` sur macOS. Libellés = dictionnaire `fr` (clé `command.<id>`).

| Id                         | Libellé fr                   | Raccourci                 | Arguments                                                                                                                                                              |
| -------------------------- | ---------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bold`                     | Gras                         | `Mod-b`                   | —                                                                                                                                                                      |
| `italic`                   | Italique                     | `Mod-i`                   | —                                                                                                                                                                      |
| `underline`                | Souligné                     | `Mod-u`                   | —                                                                                                                                                                      |
| `strike`                   | Barré                        | `Mod-Shift-s`             | —                                                                                                                                                                      |
| `subscript`                | Indice                       | —                         | —                                                                                                                                                                      |
| `superscript`              | Exposant                     | —                         | —                                                                                                                                                                      |
| `code`                     | Code                         | `Mod-e`                   | —                                                                                                                                                                      |
| `highlight`                | Surligner                    | `Mod-Shift-h`             | —                                                                                                                                                                      |
| `clearFormatting`          | Effacer la mise en forme     | —                         | — (retire les marks sauf `link`, ramène les blocs de texte au paragraphe sans alignement ; liste, citation et cellule restent en place ; impossible sur document vide) |
| `paragraph`                | Paragraphe                   | —                         | — (pose le type sans repli : impossible dans un item de liste ou si le bloc est déjà un paragraphe)                                                                    |
| `heading`                  | Titre                        | `Mod-Alt-1` … `Mod-Alt-6` | `{ level: 1 \| 2 \| 3 \| 4 \| 5 \| 6 }` (idem : pas de bascule, pas de titre dans un item de liste en V1)                                                              |
| `blockquote`               | Citation                     | —                         | —                                                                                                                                                                      |
| `codeBlock`                | Bloc de code                 | —                         | —                                                                                                                                                                      |
| `horizontalRule`           | Séparateur                   | —                         | —                                                                                                                                                                      |
| `hardBreak`                | Saut de ligne                | —                         | —                                                                                                                                                                      |
| `bulletList`               | Liste à puces                | `Mod-Shift-8`             | —                                                                                                                                                                      |
| `orderedList`              | Liste numérotée              | `Mod-Shift-7`             | —                                                                                                                                                                      |
| `taskList`                 | Liste de tâches              | —                         | —                                                                                                                                                                      |
| `indent`                   | Augmenter le retrait         | —                         | — (`listItem` puis `taskItem`)                                                                                                                                         |
| `outdent`                  | Réduire le retrait           | —                         | —                                                                                                                                                                      |
| `alignLeft`                | Aligner à gauche             | —                         | — (retire l'attribut ; actif quand aucun alignement explicite)                                                                                                         |
| `alignCenter`              | Centrer                      | —                         | —                                                                                                                                                                      |
| `alignRight`               | Aligner à droite             | —                         | —                                                                                                                                                                      |
| `alignJustify`             | Justifier                    | —                         | —                                                                                                                                                                      |
| `link.set`                 | Insérer un lien              | `Mod-k`                   | `{ href: string; target?: '_blank' \| '_self'; title?: string }`                                                                                                       |
| `link.unset`               | Supprimer le lien            | —                         | —                                                                                                                                                                      |
| `image.insert`             | Insérer une image            | —                         | `{ src: string; alt?: string; title?: string; width?: number }` (jamais active : pas une bascule ; impossible dans un bloc de code ; `src` soumis à la politique)      |
| `image.upload`             | Importer une image           | —                         | `{ file: File }` (asynchrone : voir `uploadStart` / `uploadDone`)                                                                                                      |
| `image.setAttributes`      | Propriétés de l'image        | —                         | `{ alt?: string; title?: string; width?: number; align?: 'left' \| 'center' \| 'right' }` (sur l'image sélectionnée)                                                   |
| `table.insert`             | Insérer un tableau           | —                         | `{ rows: number; cols: number; withHeaderRow?: boolean }` (`withHeaderRow` vrai par défaut ; impossible dans une table : pas de tables imbriquées en V1)               |
| `table.delete`             | Supprimer le tableau         | —                         | —                                                                                                                                                                      |
| `table.addRowBefore`       | Insérer une ligne au-dessus  | —                         | —                                                                                                                                                                      |
| `table.addRowAfter`        | Insérer une ligne en dessous | —                         | —                                                                                                                                                                      |
| `table.deleteRow`          | Supprimer la ligne           | —                         | —                                                                                                                                                                      |
| `table.addColumnBefore`    | Insérer une colonne à gauche | —                         | —                                                                                                                                                                      |
| `table.addColumnAfter`     | Insérer une colonne à droite | —                         | —                                                                                                                                                                      |
| `table.deleteColumn`       | Supprimer la colonne         | —                         | —                                                                                                                                                                      |
| `table.mergeCells`         | Fusionner les cellules       | —                         | —                                                                                                                                                                      |
| `table.splitCell`          | Scinder la cellule           | —                         | —                                                                                                                                                                      |
| `table.toggleHeaderRow`    | Ligne d'en-tête              | —                         | —                                                                                                                                                                      |
| `table.toggleHeaderColumn` | Colonne d'en-tête            | —                         | —                                                                                                                                                                      |
| `textColor`                | Couleur du texte             | —                         | `{ color: string \| null }`                                                                                                                                            |
| `backgroundColor`          | Couleur de fond              | —                         | `{ color: string \| null }`                                                                                                                                            |
| `fontFamily`               | Police                       | —                         | `{ family: string \| null }`                                                                                                                                           |
| `fontSize`                 | Taille                       | —                         | `{ size: string \| null }` (ex. `'14px'`)                                                                                                                              |
| `undo`                     | Annuler                      | `Mod-z`                   | —                                                                                                                                                                      |
| `redo`                     | Rétablir                     | `Mod-Shift-z`, `Mod-y`    | —                                                                                                                                                                      |
| `selectAll`                | Tout sélectionner            | `Mod-a`                   | —                                                                                                                                                                      |

Les raccourcis à liaisons multiples (`heading`, `redo`) sont déclarés dans `EXTRA_SHORTCUT_BINDINGS` (7 liaisons) ; `Tab` / `Shift-Tab` dans les listes et les tables sont gérés nativement par Tiptap. Une commande custom qui déclare un `shortcut` est câblée automatiquement par `collectShortcutBindings`.

### Les 6 commandes de recherche (`search.*`)

Enregistrées par `createStandardCommands` en plus des 48 du contrat (54 commandes au total), mais **hors de `STANDARD_COMMAND_IDS`** : leurs identifiants sont dans `SEARCH_COMMAND_IDS` et leurs arguments dans `SearchCommandArgs` (`{ query: string; replacement?: string; caseSensitive?: boolean }`, tous lus de façon tolérante : `run('search.next')` sans argument marche).

| Id                  | Libellé fr                | Raccourci | Comportement                                                                                                                                                                                          |
| ------------------- | ------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search.open`       | Rechercher                | `Mod-f`   | Avec `query`, lance la recherche (surlignage, sélection de la première correspondance après le curseur) ; émet toujours `aster:search-open` sur `editor.element`. Active quand une requête est posée. |
| `search.next`       | Correspondance suivante   | —         | Cycle vers la suivante, après avoir appliqué `query` si fournie. `canRun` : requête fournie ou correspondances existantes.                                                                            |
| `search.previous`   | Correspondance précédente | —         | Idem vers l'arrière.                                                                                                                                                                                  |
| `search.replace`    | Remplacer                 | —         | Remplace la correspondance courante par `replacement` (vide par défaut) puis passe à la suivante.                                                                                                     |
| `search.replaceAll` | Tout remplacer            | —         | Remplace toutes les correspondances en une transaction (annulable d'un seul `undo`).                                                                                                                  |
| `search.clear`      | Effacer la recherche      | —         | Efface requête et surlignages. `canRun` : une requête est posée.                                                                                                                                      |

```ts
editor.commands.run('search.open', { query: 'aster' });
editor.commands.run('search.next');
editor.commands.run('search.replaceAll', {
  query: 'aster',
  replacement: 'Aster',
  caseSensitive: true,
});
editor.commands.run('search.clear');
```

## 🔍 Recherche / remplacement (`Search`)

L'extension `Search` fait partie du jeu standard. Son état vit dans `editor.tiptap.storage.search` (`SearchStorage` : `query`, `caseSensitive`, `matches`, `currentIndex`), lu par `getSearchStorage(editor)`. Un plugin ProseMirror décore chaque correspondance avec la classe `aster-search-match` et la courante avec `aster-search-match--current` (stylées par `search-source.css` de `ui`). Recherche littérale, insensible à la casse par défaut, sans regex ; une correspondance ne traverse jamais une frontière de bloc ; le document modifié recalcule les correspondances et garde comme courante la première qui commence à la position mappée de l'ancienne.

`search.open` émet l'événement DOM `aster:search-open` (`SEARCH_OPEN_EVENT`, `bubbles`) avec `{ query? }` (`SearchOpenEventDetail`) : c'est ce qu'écoute le panneau de `ui` pour s'ouvrir sur `Mod-f`. Sans `ui`, branche ton propre panneau dessus :

```ts
import { SEARCH_OPEN_EVENT, getSearchStorage } from '@aster-editor/core';
import type { SearchOpenEventDetail } from '@aster-editor/core';

editor.element.addEventListener(SEARCH_OPEN_EVENT, (event) => {
  const detail = (event as CustomEvent<SearchOpenEventDetail>).detail;
  console.log('ouvrir le panneau avec', detail.query);
});
const { matches, currentIndex } = getSearchStorage(editor);
```

Exports bas niveau : `findMatches(doc, query, caseSensitive?)`, `searchPluginKey`, `SEARCH_EXTENSION_NAME`, `SEARCH_MATCH_CLASS`, `SEARCH_CURRENT_CLASS`, types `SearchMatch`, `SearchStorage`, `SearchQueryOptions`.

## 📝 Markdown

Aller-retour GFM, sans dépendance, en fonctions compagnons :

```ts
import { getMarkdown, setMarkdown, htmlToMarkdown, markdownToHtml } from '@aster-editor/core';

const markdown = getMarkdown(editor); // htmlToMarkdown(editor.getHTML())
setMarkdown(editor, '# Titre\n\n- [x] fait\n- [ ] à faire', false); // comme setHTML : emit = false → silencieux, hors historique
const html = markdownToHtml('**gras** et <u>souligné</u>');
const back = htmlToMarkdown(html);
```

Couvert : titres, paragraphes, listes imbriquées et tâches, citations, blocs de code (fences), règles, tables, liens, images, gras, italique, barré, surligné (`==`), code inline, sauts de ligne. Ce que Markdown ne représente pas (souligné, indice, exposant, `span style` de couleur, police ou taille) est conservé en **HTML inline** à l'aller, et seule cette liste blanche (`<u>`, `<sub>`, `<sup>`, `<br>`, `<span style>`) est relue au retour ; tout autre HTML du Markdown est échappé, le schéma filtre ensuite. `htmlToMarkdown(html, parse?)` accepte un `HtmlParser` (`(html) => ParentNode`) pour un environnement sans `document`. `escapeHtml` et `parseInline` sont exportés aussi.

## 💾 Autosave (`createAutosave`)

```ts
import { createAutosave } from '@aster-editor/core';

const autosave = createAutosave(editor, {
  interval: 1500, // 2000 par défaut (AUTOSAVE_DEFAULT_INTERVAL)
  onSave: async (html) => {
    await fetch('/api/articles/42', { method: 'PUT', body: html });
  },
  onError: (error) => console.error('Autosave échoué', error),
});
window.addEventListener('beforeunload', () => {
  if (autosave.isDirty()) void autosave.flush();
});
```

| Option     | Type                                      | Défaut | Rôle                                                                                                                              |
| ---------- | ----------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `onSave`   | `(html: string) => Promise<void> \| void` | requis | Reçoit le HTML à persister. Une promesse rejetée laisse le document « sale », réessayé au cycle suivant.                          |
| `interval` | `number`                                  | `2000` | Inactivité avant sauvegarde (mode `debounce`), ou période de vérification.                                                        |
| `debounce` | `boolean`                                 | `true` | `true` : sauvegarde `interval` ms après la dernière modification. `false` : vérification à intervalle fixe, sauvegarde si changé. |
| `onError`  | `(error: unknown) => void`                | —      | Appelé quand une sauvegarde déclenchée par le minuteur échoue.                                                                    |

Retour `Autosave` : `flush()` (sauvegarde immédiate si sale, rejette si `onSave` échoue), `isDirty()`, `destroy()` (arrête les minuteurs sans sauvegarder, appelé aussi à `editor.destroy()`). Le contenu initial sert de référence : seul un `change` suivi d'un HTML différent du dernier HTML sauvegardé déclenche `onSave` ; `setHTML(…, false)` n'émet pas `change`, donc ne salit pas.

## 🖼️ Images

L'extension `Image` d'Aster (`createImageExtension(policy)`) ajoute à celle de Tiptap :

- un attribut `width` numérique, lu depuis `width` ou `style="width: Npx"`, sérialisé en attribut `width` seulement ;
- un attribut `align` (`'left' | 'center' | 'right'`, `IMAGE_ALIGNMENTS`), sérialisé en `data-align` ;
- un **NodeView** vanilla : `<figure class="aster-image" contenteditable="false"><img><div class="aster-image__handle"></figure>`. La poignée redimensionne à la souris (largeur bornée entre `IMAGE_MIN_WIDTH` = 40 px et la largeur du conteneur, une seule étape d'historique au `mouseup`, `figure.aster-image--resizing` pendant le drag) ; la sélection pose `aster-image--selected` ; le double-clic sélectionne le nœud et émet l'événement DOM `aster:image-edit` (`IMAGE_EDIT_EVENT`, `bubbles`) avec `{ pos }` (`ImageEditEventDetail`), que le dialogue de `ui` écoute pour passer en mode édition. Poignée et double-clic sont inertes en lecture seule.

`getHTML()` passe par `renderHTML`, pas par le NodeView : la sortie reste un `<img src alt title width data-align>` nu et stable. Les styles de la figure sont dans `images-tables.css` de `ui`.

```ts
import { IMAGE_EDIT_EVENT, type ImageEditEventDetail } from '@aster-editor/core';

editor.element.addEventListener(IMAGE_EDIT_EVENT, (event) => {
  const { pos } = (event as CustomEvent<ImageEditEventDetail>).detail;
  const node = editor.tiptap.state.doc.nodeAt(pos);
  console.log(node?.attrs['src']);
  editor.commands.run('image.setAttributes', { width: 320, align: 'center', alt: 'Schéma' });
});
```

## 📋 Tables

`TableKit` avec `resizable: true` et `cellMinWidth: 48` : les colonnes se redimensionnent à la souris (`column-resize-handle`, curseur `resize-cursor`, styles dans `images-tables.css`). Les largeurs sont stockées dans `colwidth` et sérialisées… puis retirées par `normalizeOutputHtml` : `getHTML()` ne contient ni `colgroup`, ni `min-width`, ni `colspan="1"`, pour un HTML stable d'une session à l'autre. Pas de tables imbriquées en V1 : `table.insert` répond `false` dans une table, même si le schéma les tolère au parsing.

## 📡 Événements (`AsterEvents`)

Les handlers reçoivent toujours `editor` dans le payload, pour ne pas fermer sur une instance détruite.

| Événement         | Payload                          | Quand                                                                                                                  |
| ----------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ready`           | `{ editor }`                     | Une fois, dans une microtâche après `createEditor` : un `on('ready')` juste après la création est bien appelé.         |
| `change`          | `{ editor }`                     | Le document a changé. Pas pour un simple déplacement de sélection, ni pour `setReadOnly`, ni pour `setHTML(…, false)`. |
| `selectionChange` | `{ editor }`                     | Sélection ou document modifié. Émis aussi après `setHTML(…, false)` : ne t'en sers pas pour `dirty`.                   |
| `focus` / `blur`  | `{ editor, event: FocusEvent }`  |                                                                                                                        |
| `readOnlyChange`  | `{ editor, readOnly }`           | Après `setReadOnly` si la valeur change.                                                                               |
| `localeChange`    | `{ editor, locale }`             | Après `i18n.setLocale` si la locale change.                                                                            |
| `uploadStart`     | `{ editor, file }`               | Un fichier image part vers le hook `upload`.                                                                           |
| `uploadDone`      | `{ editor, file, src?, error? }` | Après succès (`src`) ou échec (`error`) de l'upload.                                                                   |
| `destroy`         | `{ editor }`                     | Juste avant la destruction ; l'éditeur est encore utilisable dans le handler.                                          |

```ts
const off = editor.on('uploadDone', ({ file, error }) => {
  if (error) console.error(`Upload de ${file.name} échoué`, error);
});
off();
```

## 🌍 i18n

`fr` et `en` sont intégrés (58 clés chacun), `en` est la locale de repli : clé absente → `en` → la clé elle-même, jamais d'exception. L'interpolation utilise `{name}`.

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

Convention de clés : `command.<id>` pour les 54 commandes (`command.table.insert`, `command.search.open`), `command.heading.level` avec `{level}`, `editor.placeholder`, `editor.words`, `editor.characters`. Le paquet `ui` ajoute ses propres clés (`ui.*`) via `addTranslations`.

## 🔗 Politique de liens et d'images (`LinkPolicy`)

Liste blanche de protocoles, pas liste noire : `javascript:` et `data:` sont rejetés parce qu'absents, pas parce qu'on y a pensé. Les URLs relatives passent toujours.

| Champ              | Défaut                               |
| ------------------ | ------------------------------------ |
| `allowedProtocols` | `['http', 'https', 'mailto', 'tel']` |
| `defaultTarget`    | `'_blank'`                           |
| `rel`              | `'noopener noreferrer'`              |
| `autolink`         | `true`                               |

La politique s'applique à `link.set`, au parsing HTML (`setHTML`, `insertHTML`, collage : un `<a href="javascript:…">` devient du texte simple), au rendu et à l'autolink. `rel` est forcé à la valeur de la politique dès que `target="_blank"`. Les entités HTML (`&#115;`, `&#x73;`, `&colon;`) et les invisibles Unicode glissés dans le schéma (U+00AD, U+2060, tabulations…) sont décodés ou retirés avant la vérification.

Les images suivent les mêmes règles via `isAllowedImageSrc`, avec deux tolérances : `blob:` (aperçu local) et `data:image/…` (repli d'upload) ; `data:text/html` ou tout autre type MIME est rejeté comme `javascript:`. `image.insert` refuse une source non autorisée, et un `<img>` interdit disparaît au parsing (`createImageExtension` applique la politique dans `parseHTML`).

```ts
import {
  createEditor,
  isAllowedHref,
  isAllowedImageSrc,
  resolveLinkPolicy,
} from '@aster-editor/core';

const editor = createEditor({
  element,
  linkPolicy: { allowedProtocols: ['https'], defaultTarget: '_self' },
});
isAllowedHref('http://example.com', resolveLinkPolicy({ allowedProtocols: ['https'] })); // false
isAllowedImageSrc('data:text/html,hello', resolveLinkPolicy()); // false
isAllowedImageSrc('blob:https://app/123', resolveLinkPolicy()); // true
```

## 🖼️ Upload d'images

Collage, glisser-déposer et `image.upload` passent tous par le même chemin : `isImageFile` (tout `image/*` sauf `image/svg+xml`), puis le hook `upload` s'il existe, sinon `readFileAsDataUrl`. L'insertion après un upload asynchrone vérifie `isDestroyed()` : un éditeur démonté pendant l'upload ne lève pas. Un hook qui résout autre chose qu'une chaîne est traité comme un échec.

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

Un `PasteTransformer` reçoit le HTML du presse-papier et un `PasteContext` (`editor`, `plainText`, `event?`), renvoie du HTML. Ils s'enchaînent dans l'ordre, un transformateur qui lève est ignoré. C'est par ce hook que `@aster-editor/word` se branche. Ils ne s'appliquent **pas** à `insertHTML`.

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

`options.extensions` ajoute des extensions après le jeu standard. Le jeu standard (`createAsterExtensions`) : `StarterKit` (sans `link`, titres 1-6), `Link` sécurisé, `TaskList` / `TaskItem` imbriqués, `TableKit` redimensionnable, `TextAlign` (paragraphes et titres, sans alignement par défaut), `Image` Aster (`align`, `width`, NodeView), `Subscript`, `Superscript`, `Highlight` multicolore, `TextStyleKit`, `Placeholder` (fonction de la locale), `CharacterCount`, `Search`, raccourcis Aster.

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

`editor.tiptap` est l'instance Tiptap complète, pour les cas que le registre ne couvre pas : `chain()`, `can()`, `isActive()`, `getAttributes()`, `state`, `view`, `storage`. C'est une porte de sortie assumée, pas une API garantie stable entre versions mineures d'Aster. Si tu t'en sers, encapsule-le dans une `AsterCommand` : ta toolbar et tes raccourcis restent sur le registre.

```ts
editor.tiptap.chain().focus().setTextSelection(1).run();
const { from, to } = editor.tiptap.state.selection;
```

## 🧾 Autres exports utiles

Tout ce qui suit est dans `packages/core/src/index.ts` :

- **Contrat** (`api/`) : `STANDARD_COMMAND_IDS` et tous les types (`AsterEditor`, `AsterOptions`, `AsterCommand`, `CommandRegistry`, `AsterEvents`, `AsterDocument`, `AsterCounts`, `I18n`, `PasteTransformer`, `ToolbarConfig`…).
- **Commandes** : `MARK_COMMANDS`, `BLOCK_COMMANDS`, `LIST_COMMANDS`, `ALIGNMENT_COMMANDS`, `TABLE_COMMANDS`, `TEXT_STYLE_COMMANDS`, `HISTORY_COMMANDS`, `SEARCH_COMMANDS`, `SEARCH_COMMAND_IDS`, `createLinkCommands(policy)`, `createImageCommands(policy, upload)`, `createStandardCommands(context)`, `defineStandardCommand(id, spec)`, `iconIdFor(id)`, `toImageAttributes`, `getSearchStorage`, `SEARCH_OPEN_EVENT`.
- **Recherche** : `Search`, `findMatches`, `searchPluginKey`, `SEARCH_EXTENSION_NAME`, `SEARCH_MATCH_CLASS`, `SEARCH_CURRENT_CLASS`.
- **Markdown** : `getMarkdown`, `setMarkdown`, `htmlToMarkdown`, `markdownToHtml`, `escapeHtml`, `parseInline`.
- **Autosave** : `createAutosave`, `AUTOSAVE_DEFAULT_INTERVAL`.
- **i18n et registre** : `createCommandRegistry(editor)`, `createI18n(locale, editor)`, `interpolate(template, params)`, `fr`, `en`, `FALLBACK_LOCALE`.
- **Liens et images** : `DEFAULT_LINK_POLICY`, `resolveLinkPolicy`, `createLinkExtension`, `extractScheme`, `isAllowedHref`, `isAllowedImageSrc`, `createImageExtension`, `ImageNodeView`, `renderImageNodeView`, `parseImageWidth`, `clampImageWidth`, `isImageAlignment`, `IMAGE_ALIGNMENTS`, `IMAGE_CLASS`, `IMAGE_SELECTED_CLASS`, `IMAGE_HANDLE_CLASS`, `IMAGE_EDIT_EVENT`, `IMAGE_MIN_WIDTH`, `IMAGE_DEFAULT_DRAG_WIDTH`.
- **Upload et collage** : `isImageFile`, `readFileAsDataUrl`, `insertImageFile`, `collectImageFiles`, `createImageUploadProps`, `applyPasteTransformers`, `createPastePipelineProps`.
- **Raccourcis et assemblage** : `EXTRA_SHORTCUT_BINDINGS`, `collectShortcutBindings`, `createShortcutsExtension`, `createAsterExtensions`, `normalizeOutputHtml`, `CONTENT_CLASS`.
