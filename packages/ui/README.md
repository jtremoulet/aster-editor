# 🎨 @aster-editor/ui

> Toolbar vanilla, composants accessibles (menus, dialogues, recherche, vue source, plein écran, caractères spéciaux, impression), 66 icônes SVG et thèmes CSS pour Aster Editor. Aucun framework, aucune logique d'édition : tout passe par le registre de commandes du core.

## 📦 Installation

```bash
npm install @aster-editor/core @aster-editor/ui
```

Les thèmes sont servis via l'export `@aster-editor/ui/themes/*.css`.

## 🚀 `createAster`

Point d'entrée recommandé : monte thème, toolbar, menu contextuel de table et éditeur dans un hôte.

```ts
import '@aster-editor/ui/themes/aster.css';
import { createAster } from '@aster-editor/ui';

const instance = createAster(document.querySelector<HTMLElement>('#editor')!, {
  toolbar: 'standard',
  theme: 'light',
  locale: 'fr',
  content: '<p>Bonjour</p>',
});

instance.editor.on('change', ({ editor }) => console.log(editor.getHTML()));
instance.setTheme('night');
instance.toggleSource(); // vue source HTML
instance.setFullscreen(true);
instance.destroy();
```

```ts
function createAster(host: HTMLElement, options?: AsterUiOptions): AsterInstance;
```

### Options (`AsterUiOptions`)

Toutes les `AsterOptions` du core (section « Options » du [README core](../core/README.md)) sauf `element`, plus :

| Champ     | Type            | Défaut       | Rôle                                                             |
| --------- | --------------- | ------------ | ---------------------------------------------------------------- |
| `toolbar` | `ToolbarConfig` | `'standard'` | Preset, liste de groupes, ou `false` pour aucune toolbar.        |
| `theme`   | `AsterTheme`    | `'light'`    | `'light'`, `'night'` ou le nom d'un thème custom (`data-theme`). |

### Résultat (`AsterInstance`)

| Membre                 | Type              | Rôle                                                                                                                                                                                                                                                       |
| ---------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editor`               | `AsterEditor`     | L'éditeur du core.                                                                                                                                                                                                                                         |
| `toolbar`              | `Toolbar \| null` | `null` si `toolbar: false`.                                                                                                                                                                                                                                |
| `element`              | `HTMLElement`     | Racine `.aster[data-theme]` créée dans l'hôte.                                                                                                                                                                                                             |
| `setTheme(theme)`      | `void`            | Change `data-theme` à chaud.                                                                                                                                                                                                                               |
| `toggleSource()`       | `void`            | Bascule entre l'éditeur et la vue source HTML (`<textarea class="aster-source">`). Pendant la vue source, l'éditeur est en lecture seule et la toolbar désactivée ; le retour applique le HTML modifié. Sans effet si l'éditeur est déjà en lecture seule. |
| `isSourceView()`       | `boolean`         |                                                                                                                                                                                                                                                            |
| `setFullscreen(value)` | `void`            | Ajoute ou retire `aster--fullscreen` sur `.aster` (position fixe plein écran). `Échap` quitte.                                                                                                                                                             |
| `isFullscreen()`       | `boolean`         |                                                                                                                                                                                                                                                            |
| `destroy()`            | `void`            | Quitte le plein écran et la vue source, détruit menu contextuel, toolbar et éditeur, retire la racine. Idempotent.                                                                                                                                         |

`createAster` monte aussi le **menu contextuel de table** (clic droit dans un tableau) dès que le core expose `table.delete`, même sans toolbar.

Structure DOM produite :

```html
<div class="aster" data-theme="light">
  <div class="aster__toolbar"><div class="aster-toolbar" role="toolbar">…</div></div>
  <div class="aster__content">
    <div class="aster-content"><div class="ProseMirror">…</div></div>
  </div>
</div>
```

## 🧰 `createToolbar`

Pour monter la toolbar toi-même, sur un éditeur créé par `createEditor` :

```ts
function createToolbar(
  editor: AsterEditor,
  container: HTMLElement,
  config?: ToolbarConfig,
): Toolbar;
```

```ts
import { createEditor } from '@aster-editor/core';
import { createToolbar } from '@aster-editor/ui';

const editor = createEditor({ element: contentHost });
const toolbar = createToolbar(editor, toolbarHost, 'minimal');
toolbar.update(); // resynchronise à la main (automatique sur selectionChange, readOnlyChange, localeChange)
toolbar.destroy();
```

`createToolbar` enregistre aussi les chaînes UI (`registerUiTranslations`) sur l'éditeur. Les items dont la commande n'existe pas sont ignorés avec un `console.warn`. Un preset inconnu tombe sur `standard` avec un avertissement.

### Config déclarative (`ToolbarConfig`)

`ToolbarConfig = 'full' | 'standard' | 'minimal' | readonly ToolbarGroup[] | false`. Un groupe est un tableau d'items séparé visuellement des autres. Un item est :

| Forme                                                                      | Rendu                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `'bold'` (chaîne = `CommandId`)                                            | Bouton de commande, icône et libellé par convention.                    |
| `{ command, args?, labelKey?, icon? }` (`ToolbarButtonItem`)               | Bouton avec arguments fixes, libellé et icône surchargés.               |
| `{ type: 'dropdown', id, labelKey, icon?, items }` (`ToolbarDropdownItem`) | Menu déroulant générique dont chaque entrée est un `ToolbarButtonItem`. |
| `{ type: 'widget', widget }` (`ToolbarWidgetItem`)                         | Composant spécialisé fourni par `ui`, voir ci-dessous.                  |

```ts
import type { ToolbarGroup } from '@aster-editor/core';
import { createAster } from '@aster-editor/ui';

const toolbar: readonly ToolbarGroup[] = [
  ['undo', 'redo'],
  [{ type: 'widget', widget: 'heading' }],
  ['bold', 'italic', { command: 'highlight', icon: 'text-color' }],
  [
    {
      type: 'dropdown',
      id: 'titles',
      labelKey: 'command.heading',
      icon: 'heading',
      items: [
        { command: 'heading', args: { level: 2 }, labelKey: 'command.heading.level' },
        { command: 'heading', args: { level: 3 } },
        { command: 'paragraph' },
      ],
    },
  ],
  [
    { type: 'widget', widget: 'link' },
    { type: 'widget', widget: 'table' },
  ],
  [
    { type: 'widget', widget: 'search' },
    { type: 'widget', widget: 'specialChars' },
    { type: 'widget', widget: 'print' },
    { type: 'widget', widget: 'source' },
    { type: 'widget', widget: 'fullscreen' },
  ],
];

createAster(host, { toolbar });
```

### Presets

Groupes réels de `toolbar/presets.ts` (`·` sépare les groupes, les noms entre crochets sont des widgets) :

| Preset     | Groupes                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `full`     | `undo redo` · `[heading]` · `bold italic underline strike subscript superscript code highlight` · `[fontFamily] [fontSize]` · `[textColor] [backgroundColor]` · `alignLeft alignCenter alignRight alignJustify` · `bulletList orderedList taskList outdent indent` · `[link] [image] [table]` · `blockquote codeBlock horizontalRule` · `clearFormatting` · `[search] [specialChars] [print] [source] [fullscreen]` (11 groupes, 36 items) |
| `standard` | `undo redo` · `[heading]` · `bold italic underline strike code highlight` · `alignLeft alignCenter alignRight alignJustify` · `bulletList orderedList taskList outdent indent` · `[link] [image] [table]` · `blockquote codeBlock horizontalRule` · `clearFormatting` (8 groupes, 25 items : ni police, taille, couleurs, indice, exposant, ni le dernier groupe de `full`)                                                                |
| `minimal`  | `bold italic underline` · `bulletList orderedList` · `[link]` (3 groupes, 6 items)                                                                                                                                                                                                                                                                                                                                                         |

Exportés : `FULL_PRESET`, `STANDARD_PRESET`, `MINIMAL_PRESET`, `TOOLBAR_PRESETS`, `resolveToolbarConfig(config)`. Tu peux partir d'un preset : `[...STANDARD_PRESET, [{ command: 'insertDate' }]]`.

### Widgets disponibles

Noms exacts pour `{ type: 'widget', widget }`, registre `WIDGETS`. Un widget n'est rendu que si au moins une de ses commandes requises est enregistrée (sinon `console.warn`) ; les quatre derniers n'en requièrent aucune.

| Widget            | Composant                | Requiert                 | Comportement                                                                                                                                                                                                                     |
| ----------------- | ------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `heading`         | `createHeadingMenu`      | `heading` ou `paragraph` | Dropdown Paragraphe + Titre 1..6, le déclencheur affiche le niveau actif.                                                                                                                                                        |
| `table`           | `createTableGridPicker`  | `table.insert`           | Grille 10 × 8 au survol, insère avec `withHeaderRow: true` ; dans un tableau, ajoute les actions `table.*` exécutables (`TABLE_ACTIONS`, 11 entrées).                                                                            |
| `link`            | `createLinkDialog`       | `link.set`               | Dialogue URL + « nouvel onglet » + OK / Annuler / Supprimer. Prérempli depuis le lien courant.                                                                                                                                   |
| `image`           | `createImageDialog`      | `image.insert`           | Dialogue URL + alt, bouton « Depuis un fichier… » si `image.upload` est enregistrée. En **mode édition** (ouvert par `aster:image-edit`, double-clic sur une image) : alt, titre, largeur, alignement via `image.setAttributes`. |
| `textColor`       | `createColorPicker`      | `textColor`              | Palette de 20 couleurs (`COLOR_PALETTE`) + « aucune couleur », aperçu dans le déclencheur.                                                                                                                                       |
| `backgroundColor` | `createColorPicker`      | `backgroundColor`        | Idem, lit la couleur du mark `highlight`.                                                                                                                                                                                        |
| `fontFamily`      | `createFontFamilyMenu`   | `fontFamily`             | `FONT_FAMILIES` (Arial, Georgia, Times New Roman, Courier New, Verdana, Trebuchet MS) + défaut.                                                                                                                                  |
| `fontSize`        | `createFontSizeMenu`     | `fontSize`               | `FONT_SIZES` (10, 12, 14, 16, 18, 24, 32, 48 px) + défaut.                                                                                                                                                                       |
| `search`          | `createSearchPanel`      | `search.open`            | Panneau `dialog` rechercher / remplacer : requête, compteur `n / total`, précédent / suivant, respecter la casse, remplacement, Remplacer / Tout remplacer / Fermer. S'ouvre aussi sur `Mod-f` (`aster:search-open`).            |
| `source`          | `createSourceButton`     | —                        | Bouton `aria-pressed` qui bascule la vue source HTML. Reste actif pendant la vue source (le reste de la toolbar est grisé) ; désactivé si l'éditeur était déjà en lecture seule.                                                 |
| `fullscreen`      | `createFullscreenButton` | —                        | Bouton `aria-pressed` plein écran, icône `fullscreen` / `fullscreen-exit`. Toujours actif, lecture seule comprise.                                                                                                               |
| `specialChars`    | `createSpecialChars`     | —                        | Dropdown `dialog` à onglets (`SPECIAL_CHAR_GROUPS` : 27 symboles dont l'espace insécable, 20 emojis), grille de 7 colonnes (`SPECIAL_CHARS_COLUMNS`), insertion via `insertHTML` échappé.                                        |
| `print`           | `createPrintButton`      | —                        | Bouton qui imprime le document (`printEditor`) dans une fenêtre vierge avec une feuille embarquée. Toujours actif.                                                                                                               |

`createWidget(editor, name)` est exporté. `WIDGETS` est un objet figé : pour un widget maison, construis-le avec `createDropdown` et ajoute-le au DOM de la toolbar (`toolbar.element`) toi-même.

## 🧩 Composants exportés

Tous retournent un `ToolbarWidget` (`{ element, update(), destroy() }`) ou un `HTMLButtonElement`.

| Export                                                                                                                                                                                             | Rôle                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createCommandButton(editor, item)`                                                                                                                                                                | Bouton lié à une commande : `aria-pressed` ← `isActive` (seulement si la commande le déclare), `disabled` ← `canRun`, tooltip retraduit. `null` si inconnue.                                                                             |
| `createPlainButton(options?)`                                                                                                                                                                      | `<button type="button">` stylé toolbar (`className`, `icon`, `text`, `toolbarItem`). Le `mousedown` est neutralisé : cliquer ne vole pas le focus à l'éditeur.                                                                           |
| `createDropdown(options)`                                                                                                                                                                          | Dropdown générique accessible ; `renderPanel(panel, dropdown)` reconstruit le contenu à chaque ouverture ; `panelRole` `menu` (défaut) ou `dialog`.                                                                                      |
| `createMenuItem(options)`                                                                                                                                                                          | Entrée `menuitem` / `menuitemradio` (`checked`) pour un panneau.                                                                                                                                                                         |
| `createCommandDropdown(editor, item)`                                                                                                                                                              | Dropdown à partir d'un `ToolbarDropdownItem`.                                                                                                                                                                                            |
| `createHeadingMenu`, `createTableGridPicker`, `createLinkDialog`, `createImageDialog`, `createColorPicker(editor, 'textColor' \| 'backgroundColor')`, `createFontFamilyMenu`, `createFontSizeMenu` | Les widgets de base ci-dessus.                                                                                                                                                                                                           |
| `createSearchPanel(editor)`, `readSearchState(editor)`                                                                                                                                             | Panneau de recherche ; `readSearchState` lit `{ query, caseSensitive, total, current }` (`SearchPanelState`) dans le storage du core, état vide si l'extension manque.                                                                   |
| `createSourceButton(editor)`, `createFullscreenButton(editor)`, `createSpecialChars(editor)`, `createPrintButton(editor, open?)`                                                                   | Les widgets `source`, `fullscreen`, `specialChars`, `print`.                                                                                                                                                                             |
| `createTableContextMenu(editor)`                                                                                                                                                                   | Menu contextuel de table (`TableContextMenu` : `open(x, y)`, `close()`, `isOpen()`), monté par `createAster`.                                                                                                                            |
| `printEditor(editor, open?)`, `buildPrintDocument(html, { title, lang, styles? })`                                                                                                                 | Impression : ouvre une fenêtre (`WindowOpener`, `window.open` par défaut, `false` si bloquée), y écrit le document avec `PRINT_CONTENT_STYLES` dans `.aster-print` (`PRINT_CONTENT_CLASS`), appelle `print()`, ferme après `afterprint`. |
| `tooltipText(label, shortcut?)`, `applyTooltip(el, label, shortcut?)`                                                                                                                              | `title` natif « Libellé (Ctrl+B) » + `aria-label` court.                                                                                                                                                                                 |
| `formatShortcut(shortcut, mac?)`, `isMacPlatform()`                                                                                                                                                | `Mod-Shift-7` → `Ctrl+Shift+7` ou `⇧⌘7`.                                                                                                                                                                                                 |
| `isAcceptableUrl(value)`                                                                                                                                                                           | Validation légère du dialogue de lien (non vide, pas `javascript:`/`data:`/`vbscript:`/`file:`).                                                                                                                                         |
| `COLOR_PALETTE`, `FONT_FAMILIES`, `FONT_SIZES`, `TABLE_ACTIONS`, `SPECIAL_CHAR_GROUPS`, `SPECIAL_CHARS_COLUMNS`                                                                                    | Constantes des widgets.                                                                                                                                                                                                                  |

Exemple de dropdown maison branché sur une commande custom :

```ts
import { createDropdown, createMenuItem } from '@aster-editor/ui';

const stamp = createDropdown({
  editor,
  labelKey: 'command.insertDate',
  icon: 'horizontal-rule',
  renderPanel: (panel, dropdown) => {
    for (const format of ['short', 'long'] as const) {
      panel.append(
        createMenuItem({
          text: format,
          onSelect: () => {
            editor.commands.run('insertDate', { format });
            dropdown.close(false);
            editor.focus();
          },
        }),
      );
    }
  },
});
toolbar.element.append(stamp.element);
```

## 🧾 Vue source et plein écran

Deux contrôleurs partagés par éditeur, utilisés par `createAster` (`toggleSource`, `setFullscreen`) et par les widgets `source` et `fullscreen` :

| Export                            | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getSourceView(editor)`           | `SourceView` partagé : `enter()` masque le contenu, ajoute un `<textarea class="aster-source">` avec le HTML formaté, pose `aster--source` sur `.aster` et passe l'éditeur en **lecture seule** (ce qui désactive la toolbar) ; `exit()` **remet l'édition** (`setReadOnly(false)`) et applique le HTML s'il a changé ; `destroy()` quitte sans appliquer et remet aussi l'édition. `textarea`, `isActive()`, `toggle()`, `onChange(listener)`. |
| `retainSourceView(editor)`        | Comme `getSourceView`, mais compte l'utilisateur : chaque `retain` appelle `releaseSourceView(view)` à sa destruction, et le dernier détruit le contrôleur. `createAster` et chaque bouton `source` le font : `toolbar.destroy()` pendant la vue source la quitte et rend l'édition.                                                                                                                                                            |
| `releaseSourceView(view)`         | Libère un contrôleur obtenu par `retainSourceView`.                                                                                                                                                                                                                                                                                                                                                                                             |
| `createSourceView(editor)`        | Fabrique brute, sans partage. `SOURCE_VIEW_CLASS` (`aster--source`), `SOURCE_TEXTAREA_CLASS` (`aster-source`).                                                                                                                                                                                                                                                                                                                                  |
| `getFullscreen(editor)`           | `Fullscreen` partagé : `set(true)` pose `aster--fullscreen` (`FULLSCREEN_CLASS`) sur `.aster` (position fixe plein écran via CSS), `Échap` quitte, `toggle()`, `isActive()`, `onChange(listener)`, `destroy()` quitte et libère. `createFullscreen(editor)` est la fabrique brute.                                                                                                                                                              |
| `formatSourceHtml(html, indent?)` | Indentation par bloc du HTML sérialisé, utilisée par la vue source ; `<pre>` copié tel quel.                                                                                                                                                                                                                                                                                                                                                    |

## 🖼️ Icônes

Jeu maison MIT, SVG inline 20 × 20 en `currentColor`, injecté dans `.aster-toolbar__icon`.

| Export                   | Rôle                                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| `getIcon(name)`          | SVG de l'icône. Nom inconnu → icône « ? » visible, jamais une chaîne vide. |
| `hasIcon(name)`          | Vrai si le nom existe dans le jeu (`constructor`, `toString`… → `false`).  |
| `iconNameForCommand(id)` | Convention : `table.insert` → `table-insert`, `alignLeft` → `align-left`.  |
| `ICON_NAMES`             | Liste des 66 noms disponibles.                                             |

Noms : une icône par commande standard (`bold`, `heading`, `heading-1` … `heading-6`, `bullet-list`, `table-insert`, `link-set`, `text-color`, `undo`…), `chevron-down`, `check`, `close`, `none`, et celles des widgets 0.3.0 : `search`, `search-previous`, `search-next`, `source`, `fullscreen`, `fullscreen-exit`, `special-chars`, `print`.

Résolution de l'icône d'un bouton : `item.icon` explicite → `command.icon` déclaré → convention `iconNameForCommand(id)` → repli. Chaque candidat passe par `hasIcon` : un `item.icon` inconnu ne masque pas l'icône de la commande. Pour une commande custom, le plus simple est de réutiliser un nom existant (`icon: 'horizontal-rule'`). Les commandes `search.*` n'ont pas d'icône par convention (`search-open` n'existe pas) : passe par le widget `search` plutôt que par un bouton `'search.open'` nu.

**Ajouter une icône** : le jeu est fermé en 0.3.0, il n'y a pas d'API d'enregistrement. Deux options : choisir un nom du jeu, ou remplacer le SVG après montage :

```ts
const button = toolbar.element.querySelector<HTMLElement>('[data-command="insertDate"]');
const icon = button?.querySelector<HTMLElement>('.aster-toolbar__icon');
if (icon) icon.innerHTML = MY_SVG; // SVG 20×20, fill ou stroke en currentColor
```

## 🌍 i18n UI

Les chaînes de la toolbar et des dialogues vivent dans `uiFr` et `uiEn` (76 clés `ui.*` chacun), enregistrées sur l'éditeur par `createAster` / `createToolbar` via `registerUiTranslations(editor)`. Pour une autre langue, ajoute les mêmes clés :

```ts
import { createAster, uiEn } from '@aster-editor/ui';

const { editor } = createAster(host, { locale: 'de' });
editor.i18n.addTranslations('de', {
  ...uiEn,
  'ui.toolbar.label': 'Formatierungsleiste',
  'ui.link.title': 'Link',
  'ui.link.url': 'URL',
  'ui.link.newTab': 'In neuem Tab öffnen',
  'ui.link.ok': 'OK',
  'ui.link.cancel': 'Abbrechen',
  'ui.link.remove': 'Link entfernen',
  'ui.search.title': 'Suchen und ersetzen',
});
```

Clés : `ui.toolbar.label` · `ui.link.*` (`title`, `url`, `newTab`, `ok`, `cancel`, `remove`, `invalid`) · `ui.image.*` (`title`, `url`, `alt`, `fromFile`, `ok`, `cancel`, `edit`, `apply`, `titleAttr`, `width`, `widthAuto`, `align`, `align.left` / `center` / `right`) · `ui.table.*` (`size` avec `{rows}` / `{cols}`, `grid`, `actions`, `contextMenu`) · `ui.color.none`, `ui.color.palette` et les 20 noms de couleurs (`ui.color.black` … `ui.color.lightPurple`) · `ui.heading.paragraph`, `ui.heading.label` · `ui.font.*` (`default`, `family`, `sizeDefault`, `size`) · `ui.search.*` (`title`, `query`, `replacement`, `caseSensitive`, `count` avec `{current}` / `{total}`, `previous`, `next`, `replace`, `replaceAll`, `close`) · `ui.source.*` (`label`, `toggle`) · `ui.fullscreen.*` (`enter`, `exit`) · `ui.specialChars.*` (`title`, `symbols`, `emojis`, `nbsp`, `insert` avec `{char}`) · `ui.print.*` (`label`, `documentTitle`). Le repli `en` couvre les clés manquantes ; `uiFr` et `uiEn` ont exactement les mêmes clés (vérifié par test).

## 🎨 Thèmes

```ts
import '@aster-editor/ui/themes/aster.css'; // tout-en-un
```

`aster.css` importe, dans l'ordre, les sept feuilles du dossier `themes/` :

| Feuille             | Contenu                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `base.css`          | Structure, toolbar, dropdowns, dialogues, mise en forme du contenu. Obligatoire. Valeurs de repli des variables. |
| `images-tables.css` | `figure.aster-image` (sélection, poignée, alignement), poignées de colonnes des tables, menu contextuel.         |
| `search-source.css` | Surlignage des correspondances, panneau de recherche, vue source, plein écran.                                   |
| `print.css`         | Panneau des caractères spéciaux et règles `@media print` de la page hôte.                                        |
| `light.css`         | Thème clair : les 30 variables sur `.aster[data-theme='light']`.                                                 |
| `night.css`         | Thème sombre : les mêmes 30 variables sur `.aster[data-theme='night']`.                                          |

Pour alléger : `base.css` + un seul thème, plus les feuilles des fonctionnalités que tu utilises. `base.css` embarque des valeurs de repli : l'éditeur reste utilisable sans thème chargé, mais sans `images-tables.css` les images n'ont ni poignée ni alignement visibles.

Le thème actif est l'attribut `data-theme` sur `.aster`, posé par `createAster` et changé par `setTheme`.

### Thème custom

Copie `light.css`, change le sélecteur, surcharge ce que tu veux. Tout est variable `--aster-*`, aucune classe à toucher :

```css
.aster[data-theme='corporate'] {
  --aster-accent: #0b7a75;
  --aster-accent-soft: rgba(11, 122, 117, 0.14);
  --aster-font-content: 'Inter', system-ui, sans-serif;
  --aster-radius-lg: 4px;
}
```

```ts
createAster(host, { theme: 'corporate' });
```

### Variables `--aster-*` (liste complète, lue dans `light.css`)

| Variable                     | Rôle                                                                    | Light                                                           |
| ---------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| `--aster-surface`            | Fond principal (zone de contenu)                                        | `#ffffff`                                                       |
| `--aster-surface-2`          | Fond secondaire (toolbar, menus, cellules d'en-tête)                    | `#f5f6f8`                                                       |
| `--aster-surface-3`          | Fond de survol et de code inline                                        | `#e9ebef`                                                       |
| `--aster-text`               | Texte principal                                                         | `#1c1f26`                                                       |
| `--aster-text-muted`         | Texte secondaire (placeholder, libellés)                                | `#5f6673`                                                       |
| `--aster-accent`             | Accent (actif, focus, liens, sélection)                                 | `#2f5bea`                                                       |
| `--aster-accent-contrast`    | Texte posé sur l'accent                                                 | `#ffffff`                                                       |
| `--aster-accent-soft`        | Accent translucide (bouton actif, cellule sélectionnée)                 | `rgba(47, 91, 234, 0.14)`                                       |
| `--aster-border`             | Bordures (toolbar, tables, champs)                                      | `#d6d9e0`                                                       |
| `--aster-border-strong`      | Bordures appuyées (en-tête de table, focus de champ)                    | `#a9afbb`                                                       |
| `--aster-danger`             | Actions destructives (supprimer le lien)                                | `#c62828`                                                       |
| `--aster-danger-contrast`    | Texte posé sur le danger                                                | `#ffffff`                                                       |
| `--aster-radius`             | Rayon des boutons et champs                                             | `6px`                                                           |
| `--aster-radius-lg`          | Rayon des panneaux et de l'éditeur                                      | `10px`                                                          |
| `--aster-space-1`            | Espacement 1                                                            | `4px`                                                           |
| `--aster-space-2`            | Espacement 2                                                            | `8px`                                                           |
| `--aster-space-3`            | Espacement 3                                                            | `12px`                                                          |
| `--aster-space-4`            | Espacement 4                                                            | `16px`                                                          |
| `--aster-font-ui`            | Police de la toolbar et des dialogues                                   | `system-ui, -apple-system, 'Segoe UI', …`                       |
| `--aster-font-content`       | Police du contenu éditable                                              | `Georgia, 'Times New Roman', serif`                             |
| `--aster-font-mono`          | Police du code et de la vue source                                      | `'JetBrains Mono', Consolas, 'Courier New', …`                  |
| `--aster-font-size-ui`       | Taille de texte de l'UI                                                 | `14px`                                                          |
| `--aster-font-size-content`  | Taille de texte du contenu                                              | `16px`                                                          |
| `--aster-line-height`        | Interligne du contenu                                                   | `1.6`                                                           |
| `--aster-shadow`             | Ombre des panneaux flottants                                            | `0 8px 24px rgba(16, 20, 30, 0.14)`                             |
| `--aster-focus-ring`         | Anneau de focus visible                                                 | `0 0 0 2px var(--aster-surface), 0 0 0 4px var(--aster-accent)` |
| `--aster-button-size`        | Côté des boutons de toolbar                                             | `32px`                                                          |
| `--aster-content-min-height` | Hauteur minimale de la zone de contenu et de la vue source              | `200px`                                                         |
| `--aster-highlight`          | Fond du mark `highlight` par défaut et des correspondances de recherche | `#fff176`                                                       |
| `--aster-selection`          | Fond de la sélection de texte                                           | `rgba(47, 91, 234, 0.22)`                                       |

Chaque thème pose aussi `color-scheme: light` ou `dark`. Deux variables internes sont posées par les widgets et ne sont pas à définir dans un thème : `--aster-swatch` (couleur d'une pastille) et `--aster-table-grid-cols`.

**Test de contraste** (`themes.spec.ts`) : pour `light` et `night`, sept paires doivent atteindre WCAG AA (≥ 4,5 : 1) : `text` sur `surface`, `surface-2`, `surface-3` et `highlight`, `text-muted` sur `surface`, `accent-contrast` sur `accent`, `danger-contrast` sur `danger`. Le test vérifie aussi que toute `var(--aster-*)` utilisée dans une feuille est définie dans les deux thèmes, et que les deux thèmes déclarent exactement les mêmes variables. Si tu ajoutes un thème au dépôt, ajoute-le à `THEMES` du test.

Anatomie DOM complète, classes d'état et exemple de thème « corporate » dans [`docs/THEMING.md`](../../docs/THEMING.md).

## ♿ Accessibilité

- Toolbar : `role="toolbar"` avec `aria-label` traduit, groupes `role="group"`.
- Boutons : `aria-label` (libellé seul), `title` (libellé + raccourci), `disabled` + `aria-disabled`. `aria-pressed` n'est posé que sur les boutons à bascule, c'est-à-dire les commandes qui déclarent `isActive` (`bold`, `alignLeft`…) et les widgets `source` / `fullscreen` ; `undo`, `horizontalRule` ou une commande custom sans `isActive` n'en ont pas. Le `mousedown` des boutons ne vole pas le focus à l'éditeur.
- Navigation : **roving tabindex**, un seul bouton tabbable à la fois. `←` / `→` entre les boutons, `Home` / `End`, les boutons désactivés sont sautés.
- Dropdowns : `aria-haspopup`, `aria-expanded` ; `↓` ouvre, `Échap` ferme et rend le focus au déclencheur, un second clic sur le déclencheur aussi, clic extérieur ou focus sorti du dropdown (`focusout`, `Tab`) ferment ; dans un panneau `menu`, `↑` / `↓` entre les `menuitem`, les entrées des commandes à état sont des `menuitemradio` avec `aria-checked`, les autres de simples `menuitem`. Un panneau qui déborderait à droite du viewport reçoit `aster-dropdown__panel--flip` (aligné sur le bord droit du déclencheur). Si le dropdown se désactive alors que son panneau a le focus (lecture seule, vue source), le focus revient à l'éditeur.
- Dialogues (lien, image, recherche, caractères spéciaux) : `role="dialog"` avec `aria-label`, premier champ focalisé à l'ouverture, `Entrée` valide, erreurs en `role="alert"` + `aria-invalid`. Dans la recherche, `Entrée` / `Shift+Entrée` naviguent, `Échap` efface le surlignage comme « Fermer », le compteur est en `aria-live="polite"`.
- Caractères spéciaux : onglets `role="tablist"` / `tab` (`aria-selected`, `←` / `→`, `Home` / `End`), grille parcourue aux quatre flèches, chaque cellule a un `aria-label` « Insérer … ».
- Grille de table : chaque cellule a un `aria-label` « Tableau r × c », taille annoncée en `aria-live="polite"`, navigation `←` / `→` dans la ligne et `↑` / `↓` entre les lignes (`↓` depuis la dernière ligne passe aux actions `table.*`).
- Menu contextuel de table : ouvert au clic droit, ramené dans le viewport, fermé à `Échap`, au clic extérieur, en lecture seule et quand la sélection quitte le tableau ; focus rendu à l'éditeur à la fermeture.
- Vue source : `<textarea aria-label>` (`ui.source.label`), `spellcheck="false"`, focalisé à l'entrée ; le reste de la toolbar est grisé par la lecture seule, le bouton `source` reste actif.
- Plein écran : `Échap` quitte, écouté en phase de capture sur `.aster` (ProseMirror consomme la touche sinon) ; un dropdown ou un menu contextuel ouvert est fermé en priorité.
- Pastilles de couleur : `aria-label` et `title` traduits, `aria-checked` sur la couleur courante.
- Impression : la fenêtre reçoit `lang` de la locale courante et un `<title>` traduit.
- Focus visible via `--aster-focus-ring`, `prefers-reduced-motion` respecté.
