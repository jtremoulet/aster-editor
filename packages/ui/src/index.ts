/**
 * @aster-editor/ui — point d'entrée public.
 *
 * Toolbar vanilla, composants (dropdown, dialogues, sélecteurs), jeu d'icônes et chaînes
 * UI. Les thèmes CSS sont servis via `@aster-editor/ui/themes/*.css`.
 */
export type { AsterUiOptions, AsterInstance, Toolbar, ToolbarWidget, WidgetFactory } from './types';
export { createToolbar, registerUiTranslations } from './toolbar/create-toolbar';
export { createAster } from './create-aster';
export {
  FULL_PRESET,
  MINIMAL_PRESET,
  STANDARD_PRESET,
  TOOLBAR_PRESETS,
  resolveToolbarConfig,
} from './toolbar/presets';
export { WIDGETS, createWidget } from './toolbar/widgets';
export { getIcon, hasIcon, iconNameForCommand, ICON_NAMES } from './icons';
export { uiFr } from './i18n/ui-fr';
export { uiEn } from './i18n/ui-en';
export { formatShortcut, isMacPlatform } from './utils/shortcut';
export { tooltipText, applyTooltip } from './components/tooltip';
export { createCommandButton, createPlainButton } from './components/button';
export type { Dropdown, DropdownOptions, MenuItemOptions } from './components/dropdown';
export { createDropdown, createMenuItem, createCommandDropdown } from './components/dropdown';
export { createHeadingMenu } from './components/heading-menu';
export {
  createFontFamilyMenu,
  createFontSizeMenu,
  FONT_FAMILIES,
  FONT_SIZES,
} from './components/font-menu';
export type { ColorCommand, PaletteColor } from './components/color-picker';
export { createColorPicker, COLOR_PALETTE } from './components/color-picker';
export { createTableGridPicker, TABLE_ACTIONS } from './components/table-grid-picker';
export { createLinkDialog, isAcceptableUrl } from './components/link-dialog';
export { createImageDialog } from './components/image-dialog';
export type { TableContextMenu } from './components/table-context-menu';
export { createTableContextMenu } from './components/table-context-menu';
