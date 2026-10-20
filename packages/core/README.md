# ✳️ @aster-editor/core

> Moteur d'Aster Editor : `createEditor` sur Tiptap 3 / ProseMirror, registre de commandes typées, variables de document (champs de fusion), recherche / remplacement, sommaire, reproduction de mise en forme, mise en page des paragraphes et des runs (session 3), vue page avec pagination approximative, i18n, événements, sérialisation HTML, JSON et Markdown, autosave. Aucune UI dedans, aucun framework.

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

`createEditor` crée un `<div class="aster-content">` dans `element` et y monte le `contenteditable` (`.ProseMirror`). Sans `@aster-editor/ui`, aucun style n'est injecté (`injectCSS: false`) : c'est à toi de styler `.aster-content .ProseMirror`, y compris la `figure.aster-image` des images, les puces `span.aster-variable` des variables et les classes `aster-search-match` de la recherche.

## ⚙️ Options (`AsterOptions`)

| Champ               | Type                          | Défaut  | Rôle                                                                                                                                                                                                          |
| ------------------- | ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `element`           | `HTMLElement`                 | requis  | Hôte. Le core y ajoute `.aster-content`.                                                                                                                                                                      |
| `content`           | `string \| AsterDocument`     | `''`    | Contenu initial, HTML ou JSON ProseMirror.                                                                                                                                                                    |
| `placeholder`       | `string`                      | i18n    | Texte affiché quand le document est vide. Sans valeur, `editor.placeholder` traduit selon la locale.                                                                                                          |
| `readOnly`          | `boolean`                     | `false` | Lecture seule au montage.                                                                                                                                                                                     |
| `locale`            | `AsterLocale`                 | `'fr'`  | Locale initiale. `fr` et `en` fournies ; toute autre chaîne après `i18n.addTranslations`.                                                                                                                     |
| `autofocus`         | `boolean`                     | `false` | Focus en fin de document au montage.                                                                                                                                                                          |
| `extensions`        | `readonly AnyExtension[]`     | `[]`    | Extensions Tiptap ajoutées après le jeu standard, donc prioritaires pour surcharger.                                                                                                                          |
| `commands`          | `readonly AsterCommand[]`     | `[]`    | Commandes custom enregistrées au montage. Un `id` existant remplace la commande standard.                                                                                                                     |
| `pasteTransformers` | `readonly PasteTransformer[]` | `[]`    | Transformateurs de HTML collé, chaînés dans l'ordre.                                                                                                                                                          |
| `upload`            | `UploadHandler`               | —       | `(file: File) => Promise<string>` : URL finale d'une image. Sans hook, repli en data URL base64.                                                                                                              |
| `linkPolicy`        | `LinkPolicy`                  | voir §  | Protocoles autorisés, cible et `rel` par défaut, autolink. S'applique aussi aux sources d'images.                                                                                                             |
| `variables`         | `VariableSource`              | `{}`    | Variables de document : déclarations, valeurs initiales, résolveur, `allowUnknown`. Voir « Variables de document ».                                                                                           |
| `pageView`          | `boolean \| PageViewOptions`  | `false` | Vue page au montage : feuille aux dimensions et marges de `layout.page`, en-têtes et pieds en lecture seule, pagination approximative. `true` = A4 portrait, marges 25,4 mm. Voir « Vue page et pagination ». |
| `disabledCommands`  | `readonly string[]`           | `[]`    | Commandes standard retirées du registre **et** dont le raccourci clavier est avalé (sinon la liaison native de Tiptap continuerait).                                                                          |

Le contrat `AsterOptions` est figé : ce qui n'y entre pas (autosave, Markdown, sommaire, reproduction de mise en forme) est fourni par des **fonctions compagnons** qui prennent l'éditeur en premier argument. La session 3 l'a enrichi sans rupture (`pageView`, commandes `paragraph.*`, types de `api/layout.ts`).

## 🧰 API de `AsterEditor`

### Propriétés

| Propriété        | Type              | Rôle                                                                          |
| ---------------- | ----------------- | ----------------------------------------------------------------------------- |
| `tiptap`         | `Editor`          | Instance Tiptap. Porte de sortie assumée, pas garantie stable entre mineures. |
| `commands`       | `CommandRegistry` | Registre : `run`, `canRun`, `isActive`, `register`, `list`…                   |
| `i18n`           | `I18n`            | `t`, `getLocale`, `setLocale`, `addTranslations`, `has`.                      |
| `variables`      | `VariableStore`   | Magasin des variables de document, voir « Variables de document ».            |
| `element`        | `HTMLElement`     | L'hôte passé dans les options.                                                |
| `contentElement` | `HTMLElement`     | Le `contenteditable` réel (`.ProseMirror`), utile pour tests et focus.        |

### Contenu

| Méthode                    | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getHTML(options?)`        | HTML sémantique stable, sans `colgroup`, `min-width` ni `colspan="1"` sur les tables. `setHTML(getHTML())` est idempotent, attributs de mise en page compris (sérialisation verbatim, voir « Sérialiseur HTML verbatim »). Mis en cache tant que le document ne change pas : l'appeler à chaque frappe ne coûte qu'une sérialisation par transaction. `{ variables: 'resolve' }` substitue les valeurs connues aux puces (texte brut échappé, `{{nom}}` conservé sans valeur) ; `'placeholders'` (défaut) garde les `<span data-aster-variable>`. |
| `setHTML(html, emit?)`     | Remplace tout le contenu. `emit = false` n'émet pas `change`, n'entre pas dans l'historique **et vide l'historique antérieur** (un `undo` qui suit ne fait rien) : c'est le mode de `writeValue` côté formulaire. Avec `emit = true` (défaut), le remplacement est une étape annulable.                                                                                                                                                                                                                                                           |
| `getJSON(): AsterDocument` | Document JSON ProseMirror (`JSONContent` de Tiptap).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `setJSON(doc, emit?)`      | Idem avec un document JSON, mêmes règles pour `emit`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `getText(): string`        | Texte brut : un seul `\n` entre deux blocs de texte, cellules de table et items de liste compris ; un `\n` par `hardBreak`. Une puce de variable rend sa valeur si elle est connue, sinon `{{nom}}`.                                                                                                                                                                                                                                                                                                                                              |
| `insertHTML(html)`         | Insère à la sélection courante, en passant par le schéma. HTML **brut, non transformé** : ni `pasteTransformers` ni normaliseur Word ne s'appliquent, seule la politique de liens et d'images filtre. Transforme le HTML avant si besoin. Donne le focus.                                                                                                                                                                                                                                                                                         |
| `isEmpty(): boolean`       | Vrai pour un document sans contenu. Note : `getHTML()` d'un document vide vaut `<p></p>`, teste `isEmpty()` plutôt.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `getCounts(): AsterCounts` | `{ words, characters }` via `CharacterCount`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

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

### Tableau des 52 commandes standard

Raccourcis au format Tiptap : `Mod` = `Ctrl` sur Windows/Linux, `⌘` sur macOS. Libellés = dictionnaire `fr` (clé `command.<id>`). Les deux commandes `paragraph.*` sont celles de la session 3.

| Id                         | Libellé fr                            | Raccourci                 | Arguments                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bold`                     | Gras                                  | `Mod-b`                   | —                                                                                                                                                                                                                     |
| `italic`                   | Italique                              | `Mod-i`                   | —                                                                                                                                                                                                                     |
| `underline`                | Souligné                              | `Mod-u`                   | —                                                                                                                                                                                                                     |
| `strike`                   | Barré                                 | `Mod-Shift-s`             | —                                                                                                                                                                                                                     |
| `subscript`                | Indice                                | —                         | —                                                                                                                                                                                                                     |
| `superscript`              | Exposant                              | —                         | —                                                                                                                                                                                                                     |
| `code`                     | Code                                  | `Mod-e`                   | —                                                                                                                                                                                                                     |
| `highlight`                | Surligner                             | `Mod-Shift-h`             | —                                                                                                                                                                                                                     |
| `clearFormatting`          | Effacer la mise en forme              | —                         | — (retire les marks sauf `link`, ramène les blocs de texte au paragraphe sans alignement ; liste, citation et cellule restent en place ; impossible sur document vide)                                                |
| `paragraph`                | Paragraphe                            | —                         | — (pose le type sans repli : impossible dans un item de liste ou si le bloc est déjà un paragraphe)                                                                                                                   |
| `heading`                  | Titre                                 | `Mod-Alt-1` … `Mod-Alt-6` | `{ level: 1 \| 2 \| 3 \| 4 \| 5 \| 6 }` (idem : pas de bascule, pas de titre dans un item de liste en V1)                                                                                                             |
| `blockquote`               | Citation                              | —                         | —                                                                                                                                                                                                                     |
| `codeBlock`                | Bloc de code                          | —                         | —                                                                                                                                                                                                                     |
| `horizontalRule`           | Séparateur                            | —                         | —                                                                                                                                                                                                                     |
| `hardBreak`                | Saut de ligne                         | —                         | —                                                                                                                                                                                                                     |
| `bulletList`               | Liste à puces                         | `Mod-Shift-8`             | —                                                                                                                                                                                                                     |
| `orderedList`              | Liste numérotée                       | `Mod-Shift-7`             | —                                                                                                                                                                                                                     |
| `taskList`                 | Liste de tâches                       | —                         | —                                                                                                                                                                                                                     |
| `indent`                   | Augmenter le retrait                  | —                         | — (`listItem` puis `taskItem`)                                                                                                                                                                                        |
| `outdent`                  | Réduire le retrait                    | —                         | —                                                                                                                                                                                                                     |
| `alignLeft`                | Aligner à gauche                      | —                         | — (retire l'attribut ; actif quand aucun alignement explicite)                                                                                                                                                        |
| `alignCenter`              | Centrer                               | —                         | —                                                                                                                                                                                                                     |
| `alignRight`               | Aligner à droite                      | —                         | —                                                                                                                                                                                                                     |
| `alignJustify`             | Justifier                             | —                         | —                                                                                                                                                                                                                     |
| `link.set`                 | Insérer un lien                       | `Mod-k`                   | `{ href: string; target?: '_blank' \| '_self'; title?: string }`                                                                                                                                                      |
| `link.unset`               | Supprimer le lien                     | —                         | —                                                                                                                                                                                                                     |
| `image.insert`             | Insérer une image                     | —                         | `{ src: string; alt?: string; title?: string; width?: number }` (jamais active : pas une bascule ; impossible dans un bloc de code ; `src` soumis à la politique)                                                     |
| `image.upload`             | Importer une image                    | —                         | `{ file: File }` (asynchrone : voir `uploadStart` / `uploadDone`)                                                                                                                                                     |
| `image.setAttributes`      | Propriétés de l'image                 | —                         | `{ alt?: string; title?: string; width?: number; align?: 'left' \| 'center' \| 'right' }` (sur l'image sélectionnée)                                                                                                  |
| `table.insert`             | Insérer un tableau                    | —                         | `{ rows: number; cols: number; withHeaderRow?: boolean }` (`withHeaderRow` vrai par défaut ; impossible dans une table : pas de tables imbriquées en V1)                                                              |
| `table.delete`             | Supprimer le tableau                  | —                         | —                                                                                                                                                                                                                     |
| `table.addRowBefore`       | Insérer une ligne au-dessus           | —                         | —                                                                                                                                                                                                                     |
| `table.addRowAfter`        | Insérer une ligne en dessous          | —                         | —                                                                                                                                                                                                                     |
| `table.deleteRow`          | Supprimer la ligne                    | —                         | —                                                                                                                                                                                                                     |
| `table.addColumnBefore`    | Insérer une colonne à gauche          | —                         | —                                                                                                                                                                                                                     |
| `table.addColumnAfter`     | Insérer une colonne à droite          | —                         | —                                                                                                                                                                                                                     |
| `table.deleteColumn`       | Supprimer la colonne                  | —                         | —                                                                                                                                                                                                                     |
| `table.mergeCells`         | Fusionner les cellules                | —                         | —                                                                                                                                                                                                                     |
| `table.splitCell`          | Scinder la cellule                    | —                         | —                                                                                                                                                                                                                     |
| `table.toggleHeaderRow`    | Ligne d'en-tête                       | —                         | —                                                                                                                                                                                                                     |
| `table.toggleHeaderColumn` | Colonne d'en-tête                     | —                         | —                                                                                                                                                                                                                     |
| `textColor`                | Couleur du texte                      | —                         | `{ color: string \| null }`                                                                                                                                                                                           |
| `backgroundColor`          | Couleur de fond                       | —                         | `{ color: string \| null }`                                                                                                                                                                                           |
| `fontFamily`               | Police                                | —                         | `{ family: string \| null }`                                                                                                                                                                                          |
| `fontSize`                 | Taille                                | —                         | `{ size: string \| null }` (ex. `'14px'`)                                                                                                                                                                             |
| `variable.insert`          | Insérer une variable                  | —                         | `{ name: string; label?: string }` (remplace la sélection par une puce ; refusé si le nom est invalide, non déclaré avec `allowUnknown: false`, ou dans un bloc de code)                                              |
| `variable.remove`          | Supprimer la variable                 | —                         | — (la puce sélectionnée ou collée au curseur ; `canRun` et `isActive` disent s'il y en a une)                                                                                                                         |
| `paragraph.setLayout`      | Mise en page du paragraphe            | —                         | `ParagraphLayoutAttrs` : fusionne les attributs donnés dans chaque paragraphe et titre de la sélection (cellules et items compris), `null` efface un attribut, une valeur invalide est ignorée. Voir « Mise en page » |
| `paragraph.unsetLayout`    | Effacer la mise en page du paragraphe | —                         | `{ attrs?: ParagraphLayoutAttrName[] } \| undefined` : efface les attributs nommés, ou tous sans argument                                                                                                             |
| `undo`                     | Annuler                               | `Mod-z`                   | —                                                                                                                                                                                                                     |
| `redo`                     | Rétablir                              | `Mod-Shift-z`, `Mod-y`    | —                                                                                                                                                                                                                     |
| `selectAll`                | Tout sélectionner                     | `Mod-a`                   | —                                                                                                                                                                                                                     |

Les raccourcis à liaisons multiples (`heading`, `redo`) sont déclarés dans `EXTRA_SHORTCUT_BINDINGS` (7 liaisons) ; `Tab` / `Shift-Tab` dans les listes et les tables sont gérés nativement par Tiptap. Une commande custom qui déclare un `shortcut` est câblée automatiquement par `collectShortcutBindings`.

### Les 6 commandes de recherche (`search.*`)

Enregistrées par `createStandardCommands` en plus des 52 du contrat, mais **hors de `STANDARD_COMMAND_IDS`** : leurs identifiants sont dans `SEARCH_COMMAND_IDS` et leurs arguments dans `SearchCommandArgs` (`{ query: string; replacement?: string; caseSensitive?: boolean }`, tous lus de façon tolérante : `run('search.next')` sans argument marche). Avec les deux commandes `formatPainter.*` et les trois commandes `text.*` (voir plus bas), le registre compte **63 commandes** au montage (`editor.commands.list().length`).

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

## 🧩 Variables de document (champs de fusion)

Une variable est une **puce** inline et atomique dans le document : un nom stable (`client.nom`), un libellé optionnel, et une valeur courante qui vit dans le magasin `editor.variables`, pas dans le document. Syntaxe canonique partout (texte, HTML, Word) : `{{nom}}`.

### Contrat (`AsterVariable`, `VariableSource`, `VariableStore`)

| Type / champ                           | Rôle                                                                                                                                                                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AsterVariable`                        | `{ name, label?, value?, description? }`. `name` : lettres, chiffres, `_`, `.`, `-`, sensible à la casse (`isValidVariableName`). `label` est affiché dans la puce et les menus, `description` dans le menu d'insertion.                                                |
| `VariableValues`                       | `Readonly<Record<string, string>>`, valeurs par nom.                                                                                                                                                                                                                    |
| `VariableResolver`                     | `(name, editor) => string \| undefined \| Promise<string \| undefined>`, appelé par `resolve()` pour chaque variable présente sans valeur.                                                                                                                              |
| `VariableSource` (`options.variables`) | `variables` (déclarées, proposées dans le menu même absentes du document), `values` (initiales), `resolve` (résolveur), `allowUnknown` (vrai par défaut : un `.docx` importé peut contenir n'importe quel nom ; `false` → `variable.insert` refuse un nom non déclaré). |
| `VariableRenderMode`                   | `'placeholders'` (défaut, puces conservées) ou `'resolve'` (valeurs substituées), pour `getHTML({ variables })`.                                                                                                                                                        |

```ts
const editor = createEditor({
  element,
  content: '<p>Bonjour <span data-aster-variable="client.nom">{{client.nom}}</span></p>',
  variables: {
    variables: [
      { name: 'client.nom', label: 'Client' },
      { name: 'ref', label: 'Référence' },
    ],
    values: { ref: '2026-042' },
    resolve: async (name) => {
      const response = await fetch(`/api/variables/${encodeURIComponent(name)}`);
      return response.ok ? ((await response.json()) as { value: string }).value : undefined;
    },
    allowUnknown: false,
  },
});
```

### Le magasin (`editor.variables`)

| Méthode                | Rôle                                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getNames()`           | Noms **réellement présents** dans le document, par parcours des nœuds `variable`, sans doublon.                                                                                                                                                                           |
| `list()`               | Variables déclarées puis présentes non déclarées, chacune avec `value` si connue. Une seule source de valeurs : une déclaration qui porte `value` la verse dans le magasin puis l'oublie.                                                                                 |
| `getValues()`          | Copie des valeurs connues.                                                                                                                                                                                                                                                |
| `setValues(values)`    | Fusionne (`undefined` efface une valeur), émet `variablesChange`, les puces se rafraîchissent.                                                                                                                                                                            |
| `define(variables)`    | Déclare ou met à jour libellé, description, valeur ; fusion par nom ; émet `variablesChange`. Un `define` sans `value` ne ressuscite pas une valeur effacée.                                                                                                              |
| `insert(name, label?)` | Équivaut à `commands.run('variable.insert', { name, label })`.                                                                                                                                                                                                            |
| `resolve()`            | Appelle le résolveur pour toutes les variables présentes sans valeur, applique les valeurs obtenues (les succès sont conservés même si une résolution rejette, puis la promesse rejette avec la première erreur), rend `getValues()`. Sans résolveur, rend `getValues()`. |
| `hasUnresolved()`      | Vrai si une variable présente n'a pas de valeur.                                                                                                                                                                                                                          |

```ts
editor.variables.getNames(); // ['client.nom']
editor.variables.list(); // déclarées + présentes, avec `value` si connue
editor.variables.getValues(); // { ref: '2026-042' }
editor.variables.setValues({ 'client.nom': 'ACME', ref: undefined }); // undefined efface
editor.variables.define([{ name: 'ville', label: 'Ville', description: 'Siège social' }]);
editor.variables.insert('ville'); // = commands.run('variable.insert', { name: 'ville' })
editor.variables.hasUnresolved(); // true tant que `ville` n'a pas de valeur
const values: VariableValues = await editor.variables.resolve(); // appelle `resolve` pour les manquantes
```

### Commandes et règle de saisie

`variable.insert` et `variable.remove` font partie du contrat (voir le tableau des commandes). Taper `{{nom}}` au clavier crée la puce (règle de saisie `VARIABLE_INPUT_RULE`, nom validé : `{{a b}}` reste du texte). En revanche, un `{{nom}}` **chargé ou collé** en texte brut n'est pas converti par le core : c'est le rôle de `@aster-editor/word` (import `.docx` et collage) ou de ton propre prétraitement.

```ts
editor.commands.run('variable.insert', { name: 'client.nom', label: 'Client' });
editor.commands.canRun('variable.insert', { name: 'a b' }); // false : nom invalide
editor.commands.isActive('variable.remove'); // vrai si une puce est sélectionnée ou collée au curseur
editor.commands.run('variable.remove');
```

### HTML et événements

- **HTML figé** : `<span data-aster-variable="nom" data-label="Libellé">{{nom}}</span>`. Le texte `{{nom}}` est dans la sortie pour rester lisible hors éditeur, et ignoré à la relecture (nœud atomique). Un `span` au nom invalide n'est pas reconnu, et un nœud au nom invalide injecté via `setJSON` est inerte : absent de `getNames`, exporté sans attribut.
- **Puce** (NodeView `VariableNodeView`) : `span.aster-variable[data-name]` avec `aster-variable--resolved` (texte = valeur, `title` = `{{nom}}`) ou `aster-variable--unresolved` (texte = libellé ou nom, `title` traduit `variable.unresolved`), `aster-variable--selected` quand elle est sélectionnée. Le NodeView s'abonne à `variablesChange` et `localeChange`, et se désabonne quand la puce quitte le document.
- **Double-clic** sur une puce (hors lecture seule) : le nœud est sélectionné puis l'événement DOM `aster:variable-edit` (`VARIABLE_EDIT_EVENT`, `bubbles`) part de `view.dom` avec `{ pos, name }` (`VariableEditEventDetail`). C'est ce qu'écoute le dialogue de `ui` ; sans `ui`, branche le tien :

```ts
editor.element.addEventListener(VARIABLE_EDIT_EVENT, (event) => {
  const { pos, name } = (event as CustomEvent<VariableEditEventDetail>).detail;
  const value = window.prompt(`Valeur de {{${name}}} (position ${pos})`);
  if (value !== null) editor.variables.setValues({ [name]: value });
});
```

- **`variablesChange`** (`{ editor, values }`) est émis par `setValues`, `define` et `resolve` quand une valeur arrive.

### `resolveVariablesHtml` hors éditeur

`getHTML({ variables: 'resolve' })` repose sur `resolveVariablesHtml(html, values, options?)`, fonction pure exportée : utile côté serveur ou sur un HTML stocké, sans monter d'éditeur. Les valeurs sont insérées comme **nœuds texte**, jamais via `innerHTML` : une valeur contenant du HTML est échappée. Un HTML sans `data-aster-variable` est renvoyé tel quel sans passer par le DOM ; `options.parse` (`HtmlContainerParser`) injecte un parseur dans un environnement sans `DOMParser`.

```ts
const stored = '<p>Bonjour <span data-aster-variable="client.nom">{{client.nom}}</span></p>';
resolveVariablesHtml(stored, { 'client.nom': 'ACME <b>' });
// '<p>Bonjour ACME &lt;b&gt;</p>' ; sans valeur, `{{client.nom}}` reste en texte
```

Exports bas niveau : `Variable` (extension), `VariableNodeView`, `renderVariableNodeView`, `createVariableStore`, `isAsterVariableStore`, `canInsertVariable`, `isValidVariableName`, `variableName`, `variableLabel`, `variablePlaceholder`, `variableText`, `findVariableAtSelection`, `VARIABLE_COMMANDS`, `VARIABLE_NODE_NAME`, `VARIABLE_SELECTOR`, `VARIABLE_CLASS`, `VARIABLE_RESOLVED_CLASS`, `VARIABLE_UNRESOLVED_CLASS`, `VARIABLE_SELECTED_CLASS`, `VARIABLE_HTML_ATTRIBUTE`, `VARIABLE_LABEL_ATTRIBUTE`, `VARIABLE_INPUT_RULE`, types `VariableOptions`, `AsterVariableStore`, `VariableRange`, `ResolveVariablesOptions`.

## 🧭 Sommaire (`Outline`)

L'extension `Outline` du jeu standard ajoute aux titres un attribut `id` parsé depuis le HTML et sérialisé tel quel (ancres internes). **Aucun `id` n'est posé automatiquement** : un document qui n'utilise pas le sommaire garde un HTML nu. `getOutline(editor)` renvoie les titres dans l'ordre (`OutlineEntry` : `level`, `text`, `pos`, `id`) et attribue au passage un `id` stable `aster-h-<n>` (`HEADING_ID_PREFIX`) à ceux qui n'en ont pas, hors historique ; les `id` importés (`id="intro"`) sont conservés, un doublon est renuméroté. `scrollToHeading(editor, pos)` place le curseur au début du titre et le fait défiler, `false` si la position ne porte plus un titre.

```ts
const entries = getOutline(editor); // [{ level, text, pos, id }], ids `aster-h-n` posés au passage
const first = entries[0];
if (first) scrollToHeading(editor, first.pos);
```

Autres exports : `ensureHeadingIds(editor)`, `headingIdNumber(id)`, `OUTLINE_EXTENSION_NAME`. Le widget `outline` de `ui` est un dropdown branché dessus.

## 🖌️ Reproduction de mise en forme (`formatPainter.*`)

Deux commandes hors contrat figé, comme `search.*` (`FORMAT_PAINTER_COMMAND_IDS`, `FormatPainterCommandId`) :

| Id                    | Libellé fr                 | Raccourci     | Comportement                                                                                                                                                                                                                                                                                                                           |
| --------------------- | -------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatPainter.copy`  | Copier la mise en forme    | `Mod-Shift-c` | Mémorise les marques du texte au curseur (marques en attente comprises) ou du premier texte sélectionné, et le type + attributs du bloc parent (`readFormat`). Active tant que le presse-papier est chargé.                                                                                                                            |
| `formatPainter.paste` | Appliquer la mise en forme | `Mod-Shift-v` | Applique le presse-papier (`applyFormat`) : les marques remplacent celles de la sélection (le lien est conservé) ; sur une sélection vide, au mot sous le curseur, ou en marques en attente s'il n'y a pas de mot ; chaque bloc couvert prend le type et les attributs mémorisés en gardant son `id`. `canRun` : presse-papier chargé. |

Le presse-papier reste chargé après `paste` : c'est le widget `formatPainter` de `ui` qui le vide après un clic simple et le garde après un double-clic (verrou). Sans presse-papier, `Mod-Shift-v` suit son cours (collage sans mise en forme du navigateur). Le chargement et le vidage émettent l'événement DOM `aster:format-painter-change` (`FORMAT_PAINTER_CHANGE_EVENT`) sur `editor.element`.

```ts
editor.commands.run('formatPainter.copy'); // Mod-Shift-c
hasFormatClipboard(editor); // true
editor.commands.run('formatPainter.paste'); // Mod-Shift-v
editor.element.addEventListener(FORMAT_PAINTER_CHANGE_EVENT, () => {
  console.log(hasFormatClipboard(editor));
});
```

Autres exports : `getFormatClipboard`, `clearFormatClipboard`, `readFormat`, `applyFormat`, `wordRangeAt`, `FORMAT_PAINTER_COMMANDS`, types `FormatClipboard`, `FormatClipboardBlock`.

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

`TableKit` pour la ligne, `AsterTable`, `AsterTableCell` et `AsterTableHeader` (celles de Tiptap plus les attributs de mise en page, voir plus bas) avec `resizable: true` et `cellMinWidth: 48` : les colonnes se redimensionnent à la souris (`column-resize-handle`, curseur `resize-cursor`, styles dans `images-tables.css`). Les largeurs sont stockées dans `colwidth` et sérialisées… puis le bruit est retiré par `normalizeOutputHtml` : `getHTML()` ne contient ni `colgroup`, ni `min-width`, ni `colspan="1"`, pour un HTML stable d'une session à l'autre. `colspan` est borné à 63 et `rowspan` à 1 000 à l'analyse (`MAX_COLSPAN`, `MAX_ROWSPAN`) : un `colspan="1000000"` venu d'un `.docx` hostile faisait allouer une grille de 4 Go. Pas de tables imbriquées **par la commande** : `table.insert` répond `false` dans une table ; le schéma les accepte au parsing et l'import Word en produit.

## 📐 Mise en page (session 3)

Le contrat `api/layout.ts` décrit ce que l'import Word sait apporter et que l'éditeur sait représenter : des attributs de paragraphe, des attributs de run, de liste, de tableau et de cellule, chacun avec une **sérialisation HTML exacte** (`style` inline normalisé dans un ordre figé, attributs `data-*`), et un `DocumentLayout` pour la page. Unités : points typographiques (`pt`) pour le texte et les paragraphes, millimètres pour la page, nombre sans unité pour un interligne multiple ; couleurs en `#rrggbb` minuscules. `setHTML(getHTML())` conserve chaque attribut à l'identique (idempotence stricte, vérifiée sur les fixtures Word 11-17).

### Attributs de paragraphe (`ParagraphLayoutAttrs`, extension `ParagraphLayout`)

Portés par `paragraph` et `heading`, tous `null` par défaut (hérités du style de l'éditeur). Déclarations émises dans cet ordre, après le `text-align` de `TextAlign`, uniquement pour les valeurs présentes ; puis les attributs `data-*` dans l'ordre `data-border-between`, `data-docx-style`, `data-keep-next`, `data-page-break-before` :

| Attribut            | Type            | Sérialisé                                                                                    | Exemple                                                                                   |
| ------------------- | --------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `lineHeight`        | `number`        | `line-height: 1.15` (multiple, sans unité ; `115%` relu comme `1.15`)                        | `<p style="line-height: 1.15">`                                                           |
| `lineHeightPt`      | `number`        | `line-height: 14pt` (exact ; l'emporte sur `lineHeight`)                                     | `<p style="line-height: 14pt">`                                                           |
| `spacingBeforePt`   | `number`        | `margin-top: 6pt`                                                                            | `<p style="margin-top: 6pt">`                                                             |
| `spacingAfterPt`    | `number`        | `margin-bottom: 6pt`                                                                         | `<p style="margin-bottom: 6pt">`                                                          |
| `indentLeftPt`      | `number`        | `margin-left: 36pt`                                                                          | `<p style="margin-left: 36pt">`                                                           |
| `indentRightPt`     | `number`        | `margin-right: 12pt`                                                                         | `<p style="margin-right: 12pt">`                                                          |
| `indentFirstLinePt` | `number`        | `text-indent: 18pt` (négatif = retrait suspendu)                                             | `<p style="margin-left: 36pt; text-indent: -18pt">`                                       |
| `borders`           | `BlockBorder[]` | `border-<côté>: <épaisseur>pt <style> #rrggbb` par côté ; `between` en `data-border-between` | `<p style="border-bottom: 1pt solid #000000" data-border-between="0.5pt dashed #808080">` |
| `shading`           | `string`        | `background-color: #eeeeee`                                                                  | `<p style="background-color: #eeeeee">`                                                   |
| `keepWithNext`      | `boolean`       | `data-keep-next` (présent = vrai)                                                            | `<h2 data-keep-next>`                                                                     |
| `pageBreakBefore`   | `boolean`       | `data-page-break-before`                                                                     | `<h1 data-page-break-before>`                                                             |
| `docxStyle`         | `string`        | `data-docx-style` (identifiant du style Word, jamais interprété par l'éditeur)               | `<p data-docx-style="Citation">`                                                          |

`PARAGRAPH_LAYOUT_ATTR_NAMES` (12 noms, dans l'ordre de sérialisation) et `ParagraphLayoutAttrName` sont exportés. Les nombres sont arrondis à deux décimales et bornés à ±100 000 (`LAYOUT_NUMBER_LIMIT`) : `1e307` ne sérialise jamais `Infinitypt`. `BlockBorder` = `{ side: 'top' | 'right' | 'bottom' | 'left' | 'between', style: 'solid' | 'dashed' | 'dotted' | 'double', widthPt, color }`. Un `<p>` ou un `<li>` importé de Word peut porter en plus `data-docx-num-indent` (extension `ListLayout`, hors contrat) : son retrait vient du niveau de numérotation, l'export ne le réécrit pas.

### Marques de run (`RunLayoutAttrs`, extension `RunLayout`)

Sur la marque `textStyle`, après les attributs de `TextStyleKit` (`color`, `background-color`, `font-family`, `font-size`, dans l'ordre `background-color, color, font-family, font-size, letter-spacing, …`) ; sur `underline` et `strike`, un style de trait :

| Attribut          | Marque                | Sérialisé                                                                        | Exemple                                                                                  |
| ----------------- | --------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `letterSpacingPt` | `textStyle`           | `letter-spacing: 1pt`                                                            | `<span style="letter-spacing: 1pt">`                                                     |
| `caps`            | `textStyle`           | `text-transform: uppercase` (`all`) ou `font-variant: small-caps` (`small`)      | `<span style="font-variant: small-caps">`                                                |
| `docxRunStyle`    | `textStyle`           | `data-docx-run-style` (un `<span data-docx-run-style>` sans `style` est accepté) | `<span data-docx-run-style="Code">`                                                      |
| `decorationStyle` | `underline`, `strike` | `text-decoration-style: double \| dotted \| dashed \| wavy` (`solid` implicite)  | `<u style="text-decoration-style: double">`, `<s style="text-decoration-style: double">` |

Les couleurs de `textStyle` et de `highlight` sont normalisées en `#rrggbb` minuscules au rendu (`setColor('#FF0000')` sort `color: #ff0000`, `rgb(255, 0, 0)` aussi). Un `<span style>` dont **aucun** attribut de `textStyle` ne se résout (`text-decoration: underline`, `mso-*` d'un collage Word) n'est plus accepté comme marque : Tiptap créait un `<span>` vide qui disparaissait à la relecture. Les marques s'imbriquent dans un ordre figé, `<span><strong><em><s><u><sup>`, le même que celui du lecteur Word.

### Listes et tableaux (`ListLayoutAttrs`, `TableLayoutAttrs`, `CellLayoutAttrs`)

- Listes (`ListLayout`) : `orderedList` a `type` et `start` de Tiptap (`<ol type="a" start="3">`) plus `docxNumId` (`data-docx-num-id`) ; `bulletList` reçoit `bullet` (`data-bullet="–"`) et `docxNumId`. Rien n'est interprété par l'éditeur : ces attributs relient la liste à la numérotation du gabarit Word.
- Tableau (`AsterTable`) : `width` (`style="width: 100%"` ou `width: 450pt` ; les pixels sont ignorés, c'est la largeur que Tiptap calcule lui-même depuis les `colwidth`), `borders` (`border-top: 0.5pt solid #000000`, un par côté), `docxStyle` (`data-docx-style="TableGrid"`). Tant qu'aucune colonne n'est redimensionnée, la largeur du contrat est celle affichée ; dès qu'une colonne porte un `colwidth`, la largeur calculée par Tiptap prime en édition (`AsterTableView`).
- Cellule (`AsterTableCell`, `AsterTableHeader`) : `borders`, `shading` (`background-color`), `verticalAlign` (`vertical-align: top | middle | bottom`), `paddingPt` (`padding: 2pt 4pt 2pt 4pt`, quadruplet `top right bottom left`). Exemple complet : `<td colspan="2" style="border-top: 0.5pt solid #000000; background-color: #d9e2f3; vertical-align: middle; padding: 4pt 4pt 4pt 4pt">`.
- Saut de page : `AsterHorizontalRule` conserve `<hr data-page-break>` (l'import Word le produit pour `w:br w:type="page"`, l'export le relit, la vue page le dessine en coupure de feuille) ; un `<hr>` nu reste un séparateur.

### Commandes `paragraph.*` et `text.*`

`paragraph.setLayout` et `paragraph.unsetLayout` sont dans le contrat (`STANDARD_COMMAND_IDS`) ; `text.setLetterSpacing`, `text.setCaps` et `text.unsetCaps` sont additives comme `search.*` (`TEXT_LAYOUT_COMMAND_IDS`, `TextLayoutCommandId`, arguments `SetLetterSpacingArgs` et `SetCapsArgs`, surcharge libre de `run`). Toutes parcourent la sélection **plage par plage** : une sélection de cellules (`CellSelection`) applique la commande à chaque cellule, pas seulement à la cellule d'ancrage (revue R23).

```ts
editor.commands.run('paragraph.setLayout', {
  lineHeight: 1.5,
  spacingAfterPt: 6,
  indentLeftPt: 36,
  indentFirstLinePt: -18, // retrait suspendu
  borders: [{ side: 'bottom', style: 'solid', widthPt: 1, color: '#000000' }],
  shading: '#eeeeee',
  keepWithNext: true,
});
editor.commands.run('paragraph.setLayout', { shading: null }); // null efface un attribut
editor.commands.run('paragraph.setLayout', { lineHeight: 'abc' as unknown as number }); // false : valeur invalide ignorée, rien d'effacé
editor.commands.run('paragraph.unsetLayout', { attrs: ['borders', 'shading'] });
editor.commands.run('paragraph.unsetLayout'); // tout
editor.commands.run('text.setLetterSpacing', { pt: 1.5 });
editor.commands.run('text.setCaps', { caps: 'small' });
editor.commands.isActive('text.setCaps', { caps: 'small' }); // true
editor.commands.run('text.unsetCaps');
editor.commands.run('text.setLetterSpacing', { pt: null }); // retire ; une marque textStyle vidée est supprimée
```

`canRun('paragraph.setLayout')` est vrai dès que la sélection touche un paragraphe ou un titre éditable (`hasLayoutBlockInSelection`), avec des arguments vides ou au moins une valeur valide ; les valeurs sont normalisées (nombres arrondis et bornés, couleurs `#rrggbb`, bordures mal formées filtrées, `false` et chaîne vide valent `null`). Pas de raccourci : ce sont des commandes de menu, câblées par les widgets de `ui`.

## 📄 Vue page et pagination

La vue page rend le `.ProseMirror` comme une feuille aux dimensions et marges de `layout.page` (`A4` par défaut, formats `A3`, `A4`, `A5`, `Letter`, `Legal` ou `{ widthMm, heightMm }`, orientation, marges, distances d'en-tête et de pied), avec les en-têtes et pieds `default` en lecture seule au-dessus et au-dessous du corps. Le core ne fait que poser des classes, des variables CSS et des conteneurs ; la feuille de style est `page.css` de `ui`.

```ts
const editor = createEditor({
  element,
  pageView: { layout, pagination: true, showHeadersFooters: true }, // ou `true` : A4 portrait, 25,4 mm
});
```

Ce que `applyPageView` pose : la classe `aster--page-view` sur l'hôte (`editor.element`) ; les huit variables `PAGE_VIEW_CSS_VARIABLES` (`--aster-page-width`, `--aster-page-height`, `--aster-page-margin-top/right/bottom/left`, `--aster-page-margin-header`, `--aster-page-margin-footer`, en `mm`) calculées par `resolvePageMetrics(layout)` (valeurs absurdes, négatives ou au-delà de 10 000 mm ramenées aux défauts : jamais `Infinitymm`) ; deux conteneurs `div.aster-page-header` / `div.aster-page-footer` (`contenteditable="false"`) avant et après `contentElement`, remplis avec `layout.headers.default.html` / `footers.default.html` passés par `sanitizeHeaderFooterHtml` (liste blanche stricte de balises et d'attributs, `href` / `src` limités à `http`, `https`, `mailto`, `tel`, `data:image/`, caractères de contrôle retirés avant le test, `style` sans `url(`, `expression(` ni `\`, imbrication plafonnée à 64 niveaux, pile explicite plutôt que récursion). `showHeadersFooters: false` n'insère aucun conteneur.

À chaud, l'implémentation expose `setPageView(options: boolean | PageViewOptions)` (`false` retire tout, idempotent) et `getLayout(): DocumentLayout | null`, **hors du contrat `AsterEditor`** pour l'instant (proposition de contrat de L23 et L26, voir `docs/API_CORE.md`) : `ui` les détecte à l'exécution via `pageViewApiOf(editor)` et le widget `pageLayout` se désactive si elles manquent. Une vue page qui lève au montage (mise en page hostile) est ignorée avec un avertissement, l'éditeur se monte quand même. `getActivePageView(contentElement)` rend les options actives, et l'événement DOM `aster:page-view-change` (`PAGE_VIEW_CHANGE_EVENT`, sans bulle) est émis sur `contentElement` à l'activation et au retrait.

**Pagination approximative** (extension `Pagination`, toujours montée, inerte hors vue page ou avec `pagination: false` ; répartie en `pagination.ts` (extension et API), `pagination-measure.ts`, `pagination-controller.ts` et `pagination-layout.ts`, tout étant réexporté depuis `@aster-editor/core`) : un plugin ProseMirror mesure la hauteur rendue des blocs de premier niveau, en lot (`measureBlocks` : alignement DOM / document puis lectures de rectangles, aucune écriture ; un saut de page explicite mesure 0, la coupure qui le suit prend sa place), et pose en **décorations widget** (jamais dans le document, jamais dans `getHTML()`, aucun `change` émis) une coupure `div.aster-page-gap[data-page-number][data-page-count]` avec le libellé « Page n sur N » (`pageView.page`, `pageView.of` de l'i18n) avant chaque bloc qui dépasse la hauteur utile (`usablePageHeightPx` : hauteur de page moins marges, lue dans les variables `--aster-page-*`, 96 / 25,4 px par mm). Recalcul débouncé (`PAGINATION_DEBOUNCE_MS` = 150 ms) puis à la frame suivante, jamais dans un `dispatch` ; redimensionnement de la feuille observé. Sauts de page explicites (`<hr data-page-break>`, ou un nœud `pageBreak` d'intégrateur) forcés ; tableaux et listes **entiers** à la page suivante ; `--aster-page-count` sur l'hôte et `--aster-page-gap-fill` (espace libre en bas de la page précédente) sur chaque coupure, pour que `page.css` étire la feuille et dessine la bande de bureau. 4 000 paragraphes se paginent en 11 ms. **Aucune garantie d'exactitude avec Word** : césure, polices de substitution, interlignes « au moins », veuves et orphelines, `keepWithNext`, tableaux coupés ne sont pas simulés ; le nombre de pages est un ordre de grandeur. `getPaginationResult(editor)` rend `{ gaps, pageCount }` (`PaginationResult`), `paginateNow(editor)` mesure sans attendre (tests, feuille de style changée), `paginate(heights, usableHeight, forcedBreaks)` est la fonction pure.

## 🧾 Sérialiseur HTML verbatim

`getHTML()` ne passe plus par `tiptap.getHTML()` : le `DOMSerializer` de ProseMirror pose `style` via `element.style.cssText`, et le moteur CSS (navigateur ou jsdom) réécrit la valeur : couleurs en `rgb()`, `;` final, longhands repliés en raccourcis (`margin: 6pt 6pt 36pt 0pt`, dans un ordre faux sous jsdom). Le contrat de mise en page fige une sérialisation exacte que le paquet `word` relit. `serializeDocumentHtml(doc)` rend donc les `DOMOutputSpec` lui-même (`renderRawSpec`, `createRawStyleSerializer(schema)`), en posant chaque `style` par `setAttribute` verbatim ; tout le reste (structure, trous de contenu, marques) suit la sémantique de `renderSpec`, puis `normalizeOutputHtml` retire le bruit de table. Effet de bord assumé : les couleurs sortent en `#rrggbb`, plus en `rgb()`. La garde de ProseMirror contre un `toDOM` qui renverrait un tableau sorti tel quel des attributs (vecteur XSS : `<img onerror>` décrit par un JSON stocké) est reprise à l'identique (`SUSPICIOUS_SPEC_MESSAGE`).

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
| `variablesChange` | `{ editor, values }`             | Après `variables.setValues`, `define`, ou `resolve` quand une valeur arrive. `values` = `getValues()` à cet instant.   |
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

`fr` et `en` sont intégrés (70 clés chacun, mêmes clés dans les deux), `en` est la locale de repli : clé absente → `en` → la clé elle-même, jamais d'exception. L'interpolation utilise `{name}`.

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

Convention de clés : `command.<id>` pour les 63 commandes (`command.table.insert`, `command.search.open`, `command.variable.insert`, `command.formatPainter.copy`, `command.paragraph.setLayout`, `command.text.setCaps`), `command.heading.level` avec `{level}`, `editor.placeholder`, `editor.words`, `editor.characters`, `variable.unresolved` avec `{name}` (`title` d'une puce sans valeur), `pageView.page` et `pageView.of` (libellé « Page n sur N » de la pagination). Le paquet `ui` ajoute ses propres clés (`ui.*`) via `addTranslations`.

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

`options.extensions` ajoute des extensions après le jeu standard. Le jeu standard (`createAsterExtensions`, 28 entrées, 64 extensions une fois les kits aplatis) : `StarterKit` (sans `link`, `underline`, `strike` ni `horizontalRule`, titres 1-6), `AsterStrike` et `AsterUnderline` (style de trait), `AsterHorizontalRule` (`data-page-break`), `Link` sécurisé, `TaskList` / `TaskItem` imbriqués, tables redimensionnables (`TableKit`, `AsterTable`, `AsterTableCell`, `AsterTableHeader`), `TextAlign` (paragraphes et titres, sans alignement par défaut), `ParagraphLayout`, `ListLayout`, `Image` Aster (`align`, `width`, NodeView), `Subscript`, `Superscript`, `AsterHighlight` multicolore, `TextStyleKit` sans son `textStyle`, `AsterTextStyle`, `RunLayout`, `Variable` (puces liées au magasin de l'éditeur), `Placeholder` (fonction de la locale), `CharacterCount`, `Search`, `Outline` (`id` des titres), `Pagination`, raccourcis Aster.

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

- **Contrat** (`api/`) : `STANDARD_COMMAND_IDS`, `PARAGRAPH_LAYOUT_ATTR_NAMES` et tous les types (`AsterEditor`, `AsterOptions`, `AsterCommand`, `CommandRegistry`, `AsterEvents`, `AsterDocument`, `AsterCounts`, `I18n`, `PasteTransformer`, `ToolbarConfig`, `AsterVariable`, `VariableSource`, `VariableStore`, `VariableValues`, `VariableResolver`, `VariableRenderMode`, `GetHtmlOptions`, et ceux de `layout.ts` : `DocumentLayout`, `PageSetup`, `PageMargins`, `PageDimensions`, `PageSizeName`, `PageOrientation`, `HeaderFooterSet`, `HeaderFooterContent`, `DefaultFont`, `ParagraphLayoutAttrs`, `ParagraphLayoutAttrName`, `BlockBorder`, `BorderSide`, `BorderStyle`, `RunLayoutAttrs`, `DecorationStyle`, `ListLayoutAttrs`, `OrderedListType`, `TableLayoutAttrs`, `CellLayoutAttrs`, `CellVerticalAlign`, `PageViewOptions`).
- **Commandes** : `MARK_COMMANDS`, `BLOCK_COMMANDS`, `LIST_COMMANDS`, `ALIGNMENT_COMMANDS`, `TABLE_COMMANDS`, `TEXT_STYLE_COMMANDS`, `HISTORY_COMMANDS`, `SEARCH_COMMANDS`, `SEARCH_COMMAND_IDS`, `VARIABLE_COMMANDS`, `FORMAT_PAINTER_COMMANDS`, `FORMAT_PAINTER_COMMAND_IDS`, `PARAGRAPH_LAYOUT_COMMANDS`, `TEXT_LAYOUT_COMMANDS`, `TEXT_LAYOUT_COMMAND_IDS`, `hasLayoutBlockInSelection`, `createLinkCommands(policy)`, `createImageCommands(policy, upload)`, `createStandardCommands(context)`, `defineStandardCommand(id, spec)`, `iconIdFor(id)`, `toImageAttributes`, `getSearchStorage`, `SEARCH_OPEN_EVENT`, `FORMAT_PAINTER_CHANGE_EVENT`.
- **Mise en page** : `ParagraphLayout`, `parseParagraphLayout`, `renderParagraphLayout`, `paragraphLayoutDeclarations`, `normalizeParagraphLayoutValue`, `parseLineHeight`, `DOCX_STYLE_ATTRIBUTE`, `KEEP_NEXT_ATTRIBUTE`, `PAGE_BREAK_BEFORE_ATTRIBUTE`, `BORDER_BETWEEN_ATTRIBUTE`, `RunLayout`, `AsterTextStyle`, `AsterHighlight`, `AsterUnderline`, `AsterStrike`, `RUN_CAPS`, `DECORATION_STYLES`, `isCaps`, `isDecorationStyle`, `parseCaps`, `parseDecorationStyle`, `normalizeStyleColors`, `DOCX_RUN_STYLE_ATTRIBUTE`, `ListLayout`, `DOCX_NUM_ID_ATTRIBUTE`, `BULLET_ATTRIBUTE`, `DOCX_NUM_INDENT_ATTRIBUTE`, `AsterTable`, `AsterTableCell`, `AsterTableHeader`, `AsterTableView`, `createTableExtensions`, `MAX_COLSPAN`, `MAX_ROWSPAN`, `parseSpan`, `parseTableWidth`, `parseCellPadding`, `tableLayoutDeclarations`, `cellLayoutDeclarations` (`AsterHorizontalRule` n'est pas exporté : il est câblé par `createAsterExtensions`), et les helpers CSS de `layout-css` (`normalizeColor`, `parsePt`, `formatPt`, `parseStyleDeclarations`, `sanitizeBorders`, `borderDeclarations`, `isLayoutNumber`, `LAYOUT_NUMBER_LIMIT`…).
- **Vue page et pagination** : `applyPageView`, `resolvePageMetrics`, `pageViewCssValues`, `sanitizeHeaderFooterHtml`, `getActivePageView`, `PAGE_VIEW_CLASS`, `PAGE_HEADER_CLASS`, `PAGE_FOOTER_CLASS`, `PAGE_VIEW_CSS_VARIABLES`, `PAGE_SIZES_MM`, `DEFAULT_PAGE_MARGIN_MM`, `PAGE_VIEW_CHANGE_EVENT`, `Pagination`, `getPaginationResult`, `paginateNow`, `measureBlocks`, `measurePagination`, `usablePageHeightPx`, `isPaginationEnabled`, `paginate`, `samePagination`, `cssLengthToPx`, `MM_TO_PX`, `EMPTY_PAGINATION`, `PAGE_GAP_CLASS`, `PAGE_GAP_NUMBER_CLASS`, `PAGE_NUMBER_ATTRIBUTE`, `PAGE_COUNT_ATTRIBUTE`, `PAGE_COUNT_CSS_VARIABLE`, `PAGE_GAP_FILL_CSS_VARIABLE`, `PAGINATION_DEBOUNCE_MS`, `paginationPluginKey`, types `PageMetrics`, `PageViewHandle`, `PaginationResult`, `PageGap`, `PaginatedPageViewOptions`.
- **Sérialisation** : `serializeDocumentHtml`, `createRawStyleSerializer`, `renderRawSpec`, `SUSPICIOUS_SPEC_MESSAGE`, `normalizeOutputHtml`.
- **Recherche** : `Search`, `findMatches`, `searchPluginKey`, `SEARCH_EXTENSION_NAME`, `SEARCH_MATCH_CLASS`, `SEARCH_CURRENT_CLASS`.
- **Variables** : `Variable`, `createVariableStore`, `resolveVariablesHtml`, `findVariableAtSelection`, `isValidVariableName`, `variablePlaceholder`, `VARIABLE_EDIT_EVENT`, `VARIABLE_SELECTOR` et le reste de la liste de la section « Variables de document ».
- **Sommaire et pinceau** : `Outline`, `getOutline`, `scrollToHeading`, `ensureHeadingIds`, `headingIdNumber`, `HEADING_ID_PREFIX`, `OUTLINE_EXTENSION_NAME`, `getFormatClipboard`, `hasFormatClipboard`, `clearFormatClipboard`, `readFormat`, `applyFormat`, `wordRangeAt`.
- **Markdown** : `getMarkdown`, `setMarkdown`, `htmlToMarkdown`, `markdownToHtml`, `escapeHtml`, `parseInline`.
- **Autosave** : `createAutosave`, `AUTOSAVE_DEFAULT_INTERVAL`.
- **i18n et registre** : `createCommandRegistry(editor)`, `createI18n(locale, editor)`, `interpolate(template, params)`, `fr`, `en`, `FALLBACK_LOCALE`.
- **Liens et images** : `DEFAULT_LINK_POLICY`, `resolveLinkPolicy`, `createLinkExtension`, `extractScheme`, `isAllowedHref`, `isAllowedImageSrc`, `createImageExtension`, `ImageNodeView`, `renderImageNodeView`, `parseImageWidth`, `clampImageWidth`, `isImageAlignment`, `IMAGE_ALIGNMENTS`, `IMAGE_CLASS`, `IMAGE_SELECTED_CLASS`, `IMAGE_HANDLE_CLASS`, `IMAGE_EDIT_EVENT`, `IMAGE_MIN_WIDTH`, `IMAGE_DEFAULT_DRAG_WIDTH`.
- **Upload et collage** : `isImageFile`, `readFileAsDataUrl`, `insertImageFile`, `collectImageFiles`, `createImageUploadProps`, `applyPasteTransformers`, `createPastePipelineProps`.
- **Raccourcis et assemblage** : `EXTRA_SHORTCUT_BINDINGS`, `collectShortcutBindings`, `createShortcutsExtension`, `createAsterExtensions`, `CONTENT_CLASS`.
