# 🎨 @aster-editor/ui

> Toolbar vanilla, composants accessibles, icônes SVG et thèmes CSS pour Aster Editor. Aucun framework, aucune logique d'édition : tout passe par le registre de commandes du core.

## 📦 Installation

```bash
npm install @aster-editor/core @aster-editor/ui
```

Les thèmes sont servis via l'export `@aster-editor/ui/themes/*.css`.

## 🚀 `createAster`

Point d'entrée recommandé : monte thème, toolbar et éditeur dans un hôte.

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

| Membre            | Type              | Rôle                                                      |
| ----------------- | ----------------- | --------------------------------------------------------- |
| `editor`          | `AsterEditor`     | L'éditeur du core.                                        |
| `toolbar`         | `Toolbar \| null` | `null` si `toolbar: false`.                               |
| `element`         | `HTMLElement`     | Racine `.aster[data-theme]` créée dans l'hôte.            |
| `setTheme(theme)` | `void`            | Change `data-theme` à chaud.                              |
| `destroy()`       | `void`            | Détruit toolbar et éditeur, retire la racine. Idempotent. |

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
];

createAster(host, { toolbar });
```

### Presets

| Preset     | Groupes                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `full`     | `undo redo` · `heading` · `bold italic underline strike subscript superscript code highlight` · `fontFamily fontSize` · `textColor backgroundColor` · `alignLeft alignCenter alignRight alignJustify` · `bulletList orderedList taskList outdent indent` · `link image table` · `blockquote codeBlock horizontalRule` · `clearFormatting` |
| `standard` | Idem sans police, taille, couleurs, indice et exposant.                                                                                                                                                                                                                                                                                   |
| `minimal`  | `bold italic underline` · `bulletList orderedList` · `link`                                                                                                                                                                                                                                                                               |

Exportés : `FULL_PRESET`, `STANDARD_PRESET`, `MINIMAL_PRESET`, `TOOLBAR_PRESETS`, `resolveToolbarConfig(config)`. Tu peux partir d'un preset : `[...STANDARD_PRESET, [{ command: 'insertDate' }]]`.

### Widgets disponibles

Noms exacts pour `{ type: 'widget', widget }`. Un widget n'est rendu que si au moins une de ses commandes requises est enregistrée (sinon `console.warn`).

| Widget            | Composant               | Requiert                 | Comportement                                                                                                            |
| ----------------- | ----------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `heading`         | `createHeadingMenu`     | `heading` ou `paragraph` | Dropdown Paragraphe + Titre 1..6, le déclencheur affiche le niveau actif.                                               |
| `table`           | `createTableGridPicker` | `table.insert`           | Grille 10 × 8 au survol, insère avec `withHeaderRow: true` ; dans un tableau, ajoute les actions `table.*` exécutables. |
| `link`            | `createLinkDialog`      | `link.set`               | Dialogue URL + « nouvel onglet » + OK / Annuler / Supprimer. Prérempli depuis le lien courant.                          |
| `image`           | `createImageDialog`     | `image.insert`           | Dialogue URL + alt, bouton « Depuis un fichier… » si `image.upload` est enregistrée.                                    |
| `textColor`       | `createColorPicker`     | `textColor`              | Palette de 20 couleurs (`COLOR_PALETTE`) + « aucune couleur », aperçu dans le déclencheur.                              |
| `backgroundColor` | `createColorPicker`     | `backgroundColor`        | Idem, lit la couleur du mark `highlight`.                                                                               |
| `fontFamily`      | `createFontFamilyMenu`  | `fontFamily`             | `FONT_FAMILIES` (Arial, Georgia, Times New Roman, Courier New, Verdana, Trebuchet MS) + défaut.                         |
| `fontSize`        | `createFontSizeMenu`    | `fontSize`               | `FONT_SIZES` (10 à 48 px) + défaut.                                                                                     |

Le registre `WIDGETS` et `createWidget(editor, name)` sont exportés. `WIDGETS` est un objet figé : pour un widget maison, construis-le avec `createDropdown` et ajoute-le au DOM de la toolbar (`toolbar.element`) toi-même.

## 🧩 Composants exportés

Tous retournent un `ToolbarWidget` (`{ element, update(), destroy() }`) ou un `HTMLButtonElement`.

| Export                                                                                                                                                                                             | Rôle                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `createCommandButton(editor, item)`                                                                                                                                                                | Bouton lié à une commande : `aria-pressed` ← `isActive`, `disabled` ← `canRun`, tooltip retraduit. `null` si inconnue. |
| `createPlainButton(options?)`                                                                                                                                                                      | `<button type="button">` stylé toolbar (`className`, `icon`, `text`, `toolbarItem`).                                   |
| `createDropdown(options)`                                                                                                                                                                          | Dropdown générique accessible ; `renderPanel(panel, dropdown)` reconstruit le contenu à chaque ouverture.              |
| `createMenuItem(options)`                                                                                                                                                                          | Entrée `menuitem` / `menuitemradio` (`checked`) pour un panneau.                                                       |
| `createCommandDropdown(editor, item)`                                                                                                                                                              | Dropdown à partir d'un `ToolbarDropdownItem`.                                                                          |
| `createHeadingMenu`, `createTableGridPicker`, `createLinkDialog`, `createImageDialog`, `createColorPicker(editor, 'textColor' \| 'backgroundColor')`, `createFontFamilyMenu`, `createFontSizeMenu` | Les widgets ci-dessus.                                                                                                 |
| `tooltipText(label, shortcut?)`, `applyTooltip(el, label, shortcut?)`                                                                                                                              | `title` natif « Libellé (Ctrl+B) » + `aria-label` court.                                                               |
| `formatShortcut(shortcut, mac?)`, `isMacPlatform()`                                                                                                                                                | `Mod-Shift-7` → `Ctrl+Shift+7` ou `⇧⌘7`.                                                                               |
| `isAcceptableUrl(value)`                                                                                                                                                                           | Validation légère du dialogue de lien (non vide, pas `javascript:`/`data:`/`vbscript:`/`file:`).                       |
| `COLOR_PALETTE`, `FONT_FAMILIES`, `FONT_SIZES`, `TABLE_ACTIONS`                                                                                                                                    | Constantes des widgets.                                                                                                |

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

## 🖼️ Icônes

Jeu maison MIT, SVG inline 20 × 20 en `currentColor`, injecté dans `.aster-toolbar__icon`.

| Export                   | Rôle                                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| `getIcon(name)`          | SVG de l'icône. Nom inconnu → icône « ? » visible, jamais une chaîne vide. |
| `hasIcon(name)`          | Vrai si le nom existe.                                                     |
| `iconNameForCommand(id)` | Convention : `table.insert` → `table-insert`, `alignLeft` → `align-left`.  |
| `ICON_NAMES`             | Liste des 58 noms disponibles.                                             |

Noms : une icône par commande standard (`bold`, `heading`, `heading-1` … `heading-6`, `bullet-list`, `table-insert`, `link-set`, `text-color`, `undo`…) plus `chevron-down`, `check`, `close`, `none`.

Résolution de l'icône d'un bouton : `item.icon` explicite → `command.icon` déclaré → convention `iconNameForCommand(id)` → repli. Pour une commande custom, le plus simple est de réutiliser un nom existant (`icon: 'horizontal-rule'`).

**Ajouter une icône** : le jeu est fermé en 0.1.0, il n'y a pas d'API d'enregistrement. Deux options : choisir un nom du jeu, ou remplacer le SVG après montage :

```ts
const button = toolbar.element.querySelector<HTMLElement>('[data-command="insertDate"]');
const icon = button?.querySelector<HTMLElement>('.aster-toolbar__icon');
if (icon) icon.innerHTML = MY_SVG; // SVG 20×20, fill ou stroke en currentColor
```

## 🌍 i18n UI

Les chaînes de la toolbar et des dialogues vivent dans `uiFr` et `uiEn` (clés `ui.*`), enregistrées sur l'éditeur par `createAster` / `createToolbar` via `registerUiTranslations(editor)`. Pour une autre langue, ajoute les mêmes clés :

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
});
```

Clés : `ui.toolbar.label`, `ui.dropdown.open`, `ui.link.*` (`title`, `url`, `newTab`, `ok`, `cancel`, `remove`, `invalid`), `ui.image.*` (`title`, `url`, `alt`, `fromFile`, `ok`, `cancel`), `ui.table.*` (`insert`, `size` avec `{rows}`/`{cols}`, `grid`, `actions`), `ui.color.none`, `ui.color.palette` et les 20 noms de couleurs (`ui.color.black` … `ui.color.lightPurple`), `ui.heading.paragraph`, `ui.heading.label`, `ui.font.*` (`default`, `family`, `sizeDefault`, `size`). Le repli `en` couvre les clés manquantes.

## 🎨 Thèmes

```ts
import '@aster-editor/ui/themes/aster.css'; // base + light + night
```

Ou, pour alléger : `base.css` (structure et composants, obligatoire) + un seul thème (`light.css` ou `night.css`). `base.css` embarque des valeurs de repli : l'éditeur reste utilisable sans thème chargé.

Le thème actif est l'attribut `data-theme` sur `.aster`, posé par `createAster` et changé par `setTheme`. Les variables sont définies sur `.aster[data-theme='light']` et `.aster[data-theme='night']`.

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

| Variable                     | Rôle                                                    | Light                                                           |
| ---------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| `--aster-surface`            | Fond principal (zone de contenu)                        | `#ffffff`                                                       |
| `--aster-surface-2`          | Fond secondaire (toolbar, menus, cellules d'en-tête)    | `#f5f6f8`                                                       |
| `--aster-surface-3`          | Fond de survol et de code inline                        | `#e9ebef`                                                       |
| `--aster-text`               | Texte principal                                         | `#1c1f26`                                                       |
| `--aster-text-muted`         | Texte secondaire (placeholder, libellés)                | `#5f6673`                                                       |
| `--aster-accent`             | Accent (actif, focus, liens, sélection)                 | `#2f5bea`                                                       |
| `--aster-accent-contrast`    | Texte posé sur l'accent                                 | `#ffffff`                                                       |
| `--aster-accent-soft`        | Accent translucide (bouton actif, cellule sélectionnée) | `rgba(47, 91, 234, 0.14)`                                       |
| `--aster-border`             | Bordures (toolbar, tables, champs)                      | `#d6d9e0`                                                       |
| `--aster-border-strong`      | Bordures appuyées (en-tête de table, focus de champ)    | `#a9afbb`                                                       |
| `--aster-danger`             | Actions destructives (supprimer le lien)                | `#c62828`                                                       |
| `--aster-danger-contrast`    | Texte posé sur le danger                                | `#ffffff`                                                       |
| `--aster-radius`             | Rayon des boutons et champs                             | `6px`                                                           |
| `--aster-radius-lg`          | Rayon des panneaux et de l'éditeur                      | `10px`                                                          |
| `--aster-space-1`            | Espacement 1                                            | `4px`                                                           |
| `--aster-space-2`            | Espacement 2                                            | `8px`                                                           |
| `--aster-space-3`            | Espacement 3                                            | `12px`                                                          |
| `--aster-space-4`            | Espacement 4                                            | `16px`                                                          |
| `--aster-font-ui`            | Police de la toolbar et des dialogues                   | `system-ui, -apple-system, 'Segoe UI', …`                       |
| `--aster-font-content`       | Police du contenu éditable                              | `Georgia, 'Times New Roman', serif`                             |
| `--aster-font-mono`          | Police du code                                          | `'JetBrains Mono', Consolas, 'Courier New', …`                  |
| `--aster-font-size-ui`       | Taille de texte de l'UI                                 | `14px`                                                          |
| `--aster-font-size-content`  | Taille de texte du contenu                              | `16px`                                                          |
| `--aster-line-height`        | Interligne du contenu                                   | `1.6`                                                           |
| `--aster-shadow`             | Ombre des panneaux flottants                            | `0 8px 24px rgba(16, 20, 30, 0.14)`                             |
| `--aster-focus-ring`         | Anneau de focus visible                                 | `0 0 0 2px var(--aster-surface), 0 0 0 4px var(--aster-accent)` |
| `--aster-button-size`        | Côté des boutons de toolbar                             | `32px`                                                          |
| `--aster-content-min-height` | Hauteur minimale de la zone de contenu                  | `200px`                                                         |
| `--aster-highlight`          | Fond du mark `highlight` par défaut                     | `#fff176`                                                       |
| `--aster-selection`          | Fond de la sélection de texte                           | `rgba(47, 91, 234, 0.22)`                                       |

Chaque thème pose aussi `color-scheme: light` ou `dark`. Deux variables internes sont posées par les widgets et ne sont pas à définir dans un thème : `--aster-swatch` (couleur d'une pastille) et `--aster-table-grid-cols`.

Anatomie DOM complète, classes d'état et exemple de thème « corporate » dans [`docs/THEMING.md`](../../docs/THEMING.md).

## ♿ Accessibilité

- Toolbar : `role="toolbar"` avec `aria-label` traduit, groupes `role="group"`.
- Boutons : `aria-label` (libellé seul), `title` (libellé + raccourci), `aria-pressed` pour l'état actif, `disabled` + `aria-disabled`.
- Navigation : **roving tabindex**, un seul bouton tabbable à la fois. `←` / `→` entre les boutons, `Home` / `End`, les boutons désactivés sont sautés.
- Dropdowns : `aria-haspopup`, `aria-expanded` ; `↓` ouvre, `Échap` ferme et rend le focus au déclencheur, clic extérieur ferme ; dans un panneau `menu`, `↑` / `↓` entre les `menuitem`, les entrées cochables sont des `menuitemradio` avec `aria-checked`.
- Dialogues (lien, image) : `role="dialog"` avec `aria-label`, champ URL focalisé à l'ouverture, `Entrée` valide, erreurs en `role="alert"` + `aria-invalid`.
- Grille de table : chaque cellule a un `aria-label` « Tableau r × c », taille annoncée en `aria-live="polite"`.
- Pastilles de couleur : `aria-label` et `title` traduits, `aria-checked` sur la couleur courante.
- Focus visible via `--aster-focus-ring`, `prefers-reduced-motion` respecté.
