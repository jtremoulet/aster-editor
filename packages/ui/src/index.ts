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
export type { SearchPanelState } from './components/search-panel';
export { createSearchPanel, readSearchState } from './components/search-panel';
export type { SourceView } from './components/source-view';
export {
  SOURCE_TEXTAREA_CLASS,
  SOURCE_VIEW_CLASS,
  createSourceButton,
  createSourceView,
  formatSourceHtml,
  getSourceView,
  releaseSourceView,
  retainSourceView,
} from './components/source-view';
export type { Fullscreen } from './components/fullscreen';
export { OPEN_PANEL_SELECTORS, registerOpenPanelSelector } from './components/fullscreen';
export {
  FULLSCREEN_CLASS,
  createFullscreen,
  createFullscreenButton,
  getFullscreen,
} from './components/fullscreen';
export type { SpecialChar, SpecialCharGroup } from './components/special-chars';
export {
  SPECIAL_CHAR_GROUPS,
  SPECIAL_CHARS_COLUMNS,
  createSpecialChars,
} from './components/special-chars';
export {
  VARIABLE_NAME_PATTERN,
  allowsUnknownVariables,
  createVariableMenu,
  isAcceptableVariableName,
  placeholderText,
  renderVariableEntry,
} from './components/variable-menu';
export type {
  VariableSuggestion,
  VariableSuggestionItem,
  VariableSuggestionPanel,
  VariableSuggestionPanelOptions,
  VariableSuggestionPanelProps,
} from './components/variable-suggestion';
export {
  VARIABLE_SUGGESTION_CHAR,
  VARIABLE_SUGGESTION_PLUGIN_KEY,
  buildSuggestionItems,
  createVariableSuggestion,
  createVariableSuggestionPanel,
  filterVariables,
  insertSuggestedVariable,
} from './components/variable-suggestion';
export type { VariableDialog, VariableEditEventDetail } from './components/variable-dialog';
export { VARIABLE_EDIT_EVENT, createVariableDialog } from './components/variable-dialog';
// --- Lot L18 : bulles contextuelles, menu `/`, sommaire, reproduction de mise en forme
export type { Bubble, BubbleOptions } from './components/bubble';
export { createBubble, selectionReference, virtualReference } from './components/bubble';
export {
  LINK_BUBBLE_URL_MAX_LENGTH,
  createLinkBubble,
  truncateUrl,
} from './components/link-bubble';
export { IMAGE_BUBBLE_SIZES, createImageBubble, widthForRatio } from './components/image-bubble';
export type {
  SlashMenu,
  SlashMenuItem,
  SlashMenuOptions,
  SlashMenuPanel,
  SlashMenuPanelOptions,
  SlashMenuPanelProps,
  SlashWidgetName,
} from './components/slash-menu';
export {
  SLASH_MENU_CHAR,
  SLASH_MENU_PLUGIN_KEY,
  buildSlashItems,
  createSlashMenu,
  createSlashMenuPanel,
  filterSlashItems,
  normalizeQuery,
  runSlashItem,
} from './components/slash-menu';
export { createOutlinePanel } from './components/outline-panel';
export type { FormatPainterButton } from './components/format-painter-button';
export {
  FORMAT_PAINTER_LOCKED_CLASS,
  createFormatPainterButton,
} from './components/format-painter-button';
export type { PrintDocumentOptions, WindowOpener } from './components/print';
export {
  PRINT_CONTENT_CLASS,
  PRINT_CONTENT_STYLES,
  buildPrintDocument,
  createPrintButton,
  printEditor,
} from './components/print';
// --- Lot L26 : mise en page (paragraphe, run, vue page)
export type { NumberFieldOptions, ParsedNumber } from './components/paragraph-layout';
export {
  INDENT_STEP_PT,
  PARAGRAPH_LAYOUT_NODES,
  canEditBlockLayout,
  currentBlockLayout,
  formatNumber,
  parseNumberInput,
  setBlockLayout,
  unsetBlockLayout,
} from './components/paragraph-layout';
export type { LineSpacingState } from './components/line-spacing';
export {
  LINE_SPACING_PRESETS,
  createLineSpacingMenu,
  currentLineSpacing,
} from './components/line-spacing';
export {
  PARAGRAPH_SPACING_ATTRS,
  createParagraphSpacingDialog,
  hasParagraphSpacing,
} from './components/paragraph-spacing-dialog';
export type { IndentDirection } from './components/paragraph-indent';
export {
  createIndentButton,
  currentIndentLeft,
  isInList,
  nextIndentLeft,
} from './components/paragraph-indent';
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
} from './components/paragraph-borders-dialog';
export type { CapsValue } from './components/caps';
export {
  CAPS_OPTIONS,
  CAPS_SET_COMMAND,
  CAPS_UNSET_COMMAND,
  createCapsMenu,
  currentCaps,
} from './components/caps';
export {
  UNDERLINE_STYLES,
  applyUnderlineStyle,
  createUnderlineStyleMenu,
  currentUnderlineStyle,
} from './components/underline-style';
export type { PageViewApi, ResolvedPageSetup } from './components/page-layout-dialog';
export {
  DEFAULT_PAGE_MARGIN_MM,
  PAGE_SIZE_NAMES,
  PAGE_VIEW_CLASS,
  createPageLayoutDialog,
  isPageViewActive,
  pageViewApiOf,
  resolvePageSetup,
} from './components/page-layout-dialog';
export type { ImageAttributes } from './components/image-dialog';
export { heightForWidth, imageAspectRatio, widthForHeight } from './components/image-dialog';
