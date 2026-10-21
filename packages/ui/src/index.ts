/**
 * @aster-editor/ui — point d'entrée public.
 *
 * Toolbar vanilla, composants (dropdown, dialogues, sélecteurs), jeu d'icônes et chaînes
 * UI. Les thèmes CSS sont servis via `@aster-editor/ui/themes/*.css`.
 */
export type {
  AsterUiOptions,
  AsterInstance,
  Toolbar,
  ToolbarWidget,
  WidgetFactory,
} from './types.js';
export { createToolbar, registerUiTranslations } from './toolbar/create-toolbar.js';
export { createAster } from './create-aster.js';
export {
  FULL_PRESET,
  MINIMAL_PRESET,
  STANDARD_PRESET,
  TOOLBAR_PRESETS,
  resolveToolbarConfig,
} from './toolbar/presets.js';
export { WIDGETS, createWidget } from './toolbar/widgets.js';
export { getIcon, hasIcon, iconNameForCommand, ICON_NAMES } from './icons/index.js';
export { uiFr } from './i18n/ui-fr.js';
export { uiEn } from './i18n/ui-en.js';
export { formatShortcut, isMacPlatform } from './utils/shortcut.js';
export { tooltipText, applyTooltip } from './components/tooltip.js';
export { createCommandButton, createPlainButton } from './components/button.js';
export type { Dropdown, DropdownOptions, MenuItemOptions } from './components/dropdown.js';
export { createDropdown, createMenuItem, createCommandDropdown } from './components/dropdown.js';
export { createHeadingMenu } from './components/heading-menu.js';
export {
  createFontFamilyMenu,
  createFontSizeMenu,
  FONT_FAMILIES,
  FONT_SIZES,
} from './components/font-menu.js';
export type { ColorCommand, PaletteColor } from './components/color-picker.js';
export { createColorPicker, COLOR_PALETTE } from './components/color-picker.js';
export { createTableGridPicker, TABLE_ACTIONS } from './components/table-grid-picker.js';
export { createLinkDialog, isAcceptableUrl } from './components/link-dialog.js';
export { createImageDialog } from './components/image-dialog.js';
export type { TableContextMenu } from './components/table-context-menu.js';
export { createTableContextMenu } from './components/table-context-menu.js';
export type { SearchPanelState } from './components/search-panel.js';
export { createSearchPanel, readSearchState } from './components/search-panel.js';
export type { SourceView } from './components/source-view.js';
export {
  SOURCE_TEXTAREA_CLASS,
  SOURCE_VIEW_CLASS,
  createSourceButton,
  createSourceView,
  formatSourceHtml,
  getSourceView,
  releaseSourceView,
  retainSourceView,
} from './components/source-view.js';
export type { Fullscreen } from './components/fullscreen.js';
export { OPEN_PANEL_SELECTORS, registerOpenPanelSelector } from './components/fullscreen.js';
export {
  FULLSCREEN_CLASS,
  createFullscreen,
  createFullscreenButton,
  getFullscreen,
} from './components/fullscreen.js';
export type { SpecialChar, SpecialCharGroup } from './components/special-chars.js';
export {
  SPECIAL_CHAR_GROUPS,
  SPECIAL_CHARS_COLUMNS,
  createSpecialChars,
} from './components/special-chars.js';
export {
  VARIABLE_NAME_PATTERN,
  allowsUnknownVariables,
  createVariableMenu,
  isAcceptableVariableName,
  placeholderText,
  renderVariableEntry,
} from './components/variable-menu.js';
export type {
  VariableSuggestion,
  VariableSuggestionItem,
  VariableSuggestionPanel,
  VariableSuggestionPanelOptions,
  VariableSuggestionPanelProps,
} from './components/variable-suggestion.js';
export {
  VARIABLE_SUGGESTION_CHAR,
  VARIABLE_SUGGESTION_PLUGIN_KEY,
  buildSuggestionItems,
  createVariableSuggestion,
  createVariableSuggestionPanel,
  filterVariables,
  insertSuggestedVariable,
} from './components/variable-suggestion.js';
export type { VariableDialog, VariableEditEventDetail } from './components/variable-dialog.js';
export { VARIABLE_EDIT_EVENT, createVariableDialog } from './components/variable-dialog.js';
// --- Lot L18 : bulles contextuelles, menu `/`, sommaire, reproduction de mise en forme
export type { Bubble, BubbleOptions } from './components/bubble.js';
export { createBubble, selectionReference, virtualReference } from './components/bubble.js';
export {
  LINK_BUBBLE_URL_MAX_LENGTH,
  createLinkBubble,
  truncateUrl,
} from './components/link-bubble.js';
export { IMAGE_BUBBLE_SIZES, createImageBubble, widthForRatio } from './components/image-bubble.js';
export type {
  SlashMenu,
  SlashMenuItem,
  SlashMenuOptions,
  SlashMenuPanel,
  SlashMenuPanelOptions,
  SlashMenuPanelProps,
  SlashWidgetName,
} from './components/slash-menu.js';
export {
  SLASH_MENU_CHAR,
  SLASH_MENU_PLUGIN_KEY,
  buildSlashItems,
  createSlashMenu,
  createSlashMenuPanel,
  filterSlashItems,
  normalizeQuery,
  runSlashItem,
} from './components/slash-menu.js';
export { createOutlinePanel } from './components/outline-panel.js';
export type { FormatPainterButton } from './components/format-painter-button.js';
export {
  FORMAT_PAINTER_LOCKED_CLASS,
  createFormatPainterButton,
} from './components/format-painter-button.js';
export type { PrintDocumentOptions, WindowOpener } from './components/print.js';
export {
  PRINT_CONTENT_CLASS,
  PRINT_CONTENT_STYLES,
  buildPrintDocument,
  createPrintButton,
  printEditor,
} from './components/print.js';
// --- Lot L26 : mise en page (paragraphe, run, vue page)
export type { NumberFieldOptions, ParsedNumber } from './components/paragraph-layout.js';
export {
  INDENT_STEP_PT,
  MAX_BORDER_WIDTH_PT,
  MAX_LINE_HEIGHT_MULTIPLE,
  MAX_PARAGRAPH_PT,
  MIN_BORDER_WIDTH_PT,
  PARAGRAPH_LAYOUT_NODES,
  canEditBlockLayout,
  createCheckbox,
  createNumberField,
  currentBlockLayout,
  formatNumber,
  parseNumberInput,
  setBlockLayout,
  unsetBlockLayout,
} from './components/paragraph-layout.js';
export type { LineSpacingState } from './components/line-spacing.js';
export {
  LINE_SPACING_PRESETS,
  createLineSpacingMenu,
  currentLineSpacing,
} from './components/line-spacing.js';
export {
  PARAGRAPH_SPACING_ATTRS,
  createParagraphSpacingDialog,
  hasParagraphSpacing,
} from './components/paragraph-spacing-dialog.js';
export type { IndentDirection } from './components/paragraph-indent.js';
export {
  createIndentButton,
  currentIndentLeft,
  isInList,
  nextIndentLeft,
} from './components/paragraph-indent.js';
export {
  BORDER_SIDES,
  BORDER_STYLES,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_WIDTH_PT,
  DEFAULT_SHADING_COLOR,
  createParagraphBordersDialog,
  currentBorders,
  hasBordersOrShading,
  isBlockBorder,
  toHexColor,
} from './components/paragraph-borders-dialog.js';
export type { CapsValue } from './components/caps.js';
export {
  CAPS_OPTIONS,
  CAPS_SET_COMMAND,
  CAPS_UNSET_COMMAND,
  createCapsMenu,
  currentCaps,
} from './components/caps.js';
export {
  UNDERLINE_STYLES,
  applyUnderlineStyle,
  createUnderlineStyleMenu,
  currentUnderlineStyle,
} from './components/underline-style.js';
export type { PageViewApi, ResolvedPageSetup } from './components/page-layout-dialog.js';
export {
  DEFAULT_PAGE_MARGIN_MM,
  PAGE_SIZE_NAMES,
  PAGE_VIEW_CLASS,
  createPageLayoutDialog,
  isPageViewActive,
  pageViewApiOf,
  resolvePageSetup,
} from './components/page-layout-dialog.js';
export type { ImageAttributes } from './components/image-dialog.js';
export { heightForWidth, imageAspectRatio, widthForHeight } from './components/image-dialog.js';
