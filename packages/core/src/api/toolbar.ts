import type { CommandId } from './commands.js';

/** Thème visuel. `light` et `night` sont fournis par `ui`, toute autre chaîne est un thème custom. */
export type AsterTheme = 'light' | 'night' | (string & {});

/** Presets de toolbar fournis par `ui`. */
export type ToolbarPreset = 'full' | 'standard' | 'minimal';

/** Bouton simple déclenchant une commande, éventuellement avec des arguments fixes. */
export interface ToolbarButtonItem {
  type?: 'button';
  command: CommandId;
  args?: unknown;
  /** Surcharge de la clé i18n du libellé. */
  labelKey?: string;
  /** Surcharge de l'icône. */
  icon?: string;
}

/** Menu déroulant regroupant plusieurs entrées, ex. niveaux de titre. */
export interface ToolbarDropdownItem {
  type: 'dropdown';
  id: string;
  labelKey: string;
  icon?: string;
  items: readonly ToolbarButtonItem[];
}

/**
 * Composant UI spécialisé fourni par `ui` : sélecteur de couleur, grille de table,
 * dialogue de lien, etc. Identifiants fournis par `ui` : `heading`, `table`, `link`, `image`,
 * `textColor`, `backgroundColor`, `fontFamily`, `fontSize`, `search`, `source`, `fullscreen`,
 * `specialChars`, `print`, `variable`, `outline`, `formatPainter`.
 */
export interface ToolbarWidgetItem {
  type: 'widget';
  widget: string;
}

export type ToolbarItem = CommandId | ToolbarButtonItem | ToolbarDropdownItem | ToolbarWidgetItem;

/** Un groupe = une série de boutons séparés visuellement des autres groupes. */
export type ToolbarGroup = readonly ToolbarItem[];

/** Config de toolbar : un preset nommé, une liste de groupes, ou `false` pour aucune toolbar. */
export type ToolbarConfig = ToolbarPreset | readonly ToolbarGroup[] | false;
