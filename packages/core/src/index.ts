/**
 * @aster-editor/core — point d'entrée public.
 *
 * Le contrat (`api/`) est réexporté tel quel. S'y ajoutent la fabrique d'éditeur,
 * les dictionnaires, et les briques utiles aux autres paquets : registre, commandes
 * standard, politique de liens, pipeline de collage, upload d'image, raccourcis.
 */
export * from './api';
export { createEditor } from './editor/create-editor';
export { fr } from './i18n/fr';
export { en } from './i18n/en';
export { createI18n, interpolate, FALLBACK_LOCALE } from './i18n/create-i18n';

export { createCommandRegistry } from './commands/registry';
export { createStandardCommands, type StandardCommandsContext } from './commands/standard';
export { defineStandardCommand, iconIdFor, type StandardCommandSpec } from './commands/define';
export { MARK_COMMANDS } from './commands/marks';
export { BLOCK_COMMANDS } from './commands/blocks';
export { LIST_COMMANDS } from './commands/lists';
export { ALIGNMENT_COMMANDS } from './commands/alignment';
export { createLinkCommands } from './commands/links';
export { createImageCommands } from './commands/images';
export { TABLE_COMMANDS } from './commands/tables';
export { TEXT_STYLE_COMMANDS } from './commands/text-style';
export { HISTORY_COMMANDS } from './commands/history';
export {
  SEARCH_COMMANDS,
  SEARCH_COMMAND_IDS,
  SEARCH_OPEN_EVENT,
  getSearchStorage,
  type SearchCommandArgs,
  type SearchCommandId,
  type SearchOpenEventDetail,
} from './commands/search';
export {
  Search,
  SEARCH_CURRENT_CLASS,
  SEARCH_EXTENSION_NAME,
  SEARCH_MATCH_CLASS,
  findMatches,
  searchPluginKey,
  type SearchMatch,
  type SearchQueryOptions,
  type SearchStorage,
} from './extensions/search';

export {
  FORMAT_PAINTER_CHANGE_EVENT,
  FORMAT_PAINTER_COMMANDS,
  FORMAT_PAINTER_COMMAND_IDS,
  applyFormat,
  clearFormatClipboard,
  getFormatClipboard,
  hasFormatClipboard,
  readFormat,
  wordRangeAt,
  type FormatClipboard,
  type FormatClipboardBlock,
  type FormatPainterCommandId,
} from './commands/format-painter';
export {
  HEADING_ID_PREFIX,
  OUTLINE_EXTENSION_NAME,
  Outline,
  ensureHeadingIds,
  getOutline,
  headingIdNumber,
  scrollToHeading,
  type OutlineEntry,
} from './extensions/outline';

export { createAsterExtensions, type AsterExtensionsContext } from './extensions/aster-extensions';
export {
  DEFAULT_LINK_POLICY,
  createLinkExtension,
  extractScheme,
  isAllowedHref,
  isAllowedImageSrc,
  resolveLinkPolicy,
  type ResolvedLinkPolicy,
} from './extensions/link-safety';
export {
  collectImageFiles,
  createImageUploadProps,
  insertImageFile,
  isImageFile,
  readFileAsDataUrl,
  type ImageUploadProps,
} from './extensions/image-upload';
export {
  applyPasteTransformers,
  createPastePipelineProps,
  type PastePipelineProps,
} from './extensions/paste-pipeline';
export {
  EXTRA_SHORTCUT_BINDINGS,
  collectShortcutBindings,
  createShortcutsExtension,
  type ShortcutBinding,
  type ShortcutsExtensionOptions,
} from './extensions/shortcuts';
export {
  createImageExtension,
  clampImageWidth,
  isImageAlignment,
  parseImageWidth,
  renderImageNodeView,
  ImageNodeView,
  IMAGE_ALIGNMENTS,
  IMAGE_CLASS,
  IMAGE_DEFAULT_DRAG_WIDTH,
  IMAGE_EDIT_EVENT,
  IMAGE_HANDLE_CLASS,
  IMAGE_MIN_WIDTH,
  IMAGE_SELECTED_CLASS,
  type ImageAlignment,
  type ImageEditEventDetail,
} from './extensions/image';
export { toImageAttributes, type ImageAttributeUpdate } from './commands/images';

// --- Mise en page (session 3) --------------------------------------------
export {
  PARAGRAPH_LAYOUT_COMMANDS,
  TAB_COMMANDS,
  TAB_COMMAND_IDS,
  TEXT_LAYOUT_COMMANDS,
  TEXT_LAYOUT_COMMAND_IDS,
  hasLayoutBlockInSelection,
  type InsertTabArgs,
  type SetCapsArgs,
  type SetLetterSpacingArgs,
  type TabCommandId,
  type TextLayoutCommandId,
} from './commands/layout';
// --- Sections et tabulations (session 4, L41) -----------------------------
export {
  SECTION_COMMANDS,
  SECTION_COMMAND_IDS,
  type RemoveSectionBreakArgs,
  type SectionCommandId,
} from './commands/sections';
export {
  SECTION_BREAK_ATTRIBUTE,
  SECTION_BREAK_CLASS,
  SECTION_BREAK_NODE_NAME,
  SECTION_START_ATTRIBUTE,
  SectionBreak,
  SectionBreakNodeView,
  findSectionBreaks,
  getSections,
  isSectionBreak,
  renderSectionBreakNodeView,
  renumberSections,
  sanitizeSectionNumber,
  sectionBreakAttrs,
  sectionBreakPluginKey,
  type SectionRange,
} from './extensions/section-break';
export {
  TAB_ATTRIBUTE,
  TAB_CLASS,
  TAB_NODE_NAME,
  TAB_STOP_ATTRIBUTE,
  TAB_STOP_CSS_VARIABLE,
  TAB_TEXT,
  Tab,
  TabNodeView,
  isTabNode,
  renderTabNodeView,
  sanitizeTabStop,
  tabAttrs,
} from './extensions/tab';
export {
  BORDER_BETWEEN_ATTRIBUTE,
  DOCX_STYLE_ATTRIBUTE,
  KEEP_NEXT_ATTRIBUTE,
  PAGE_BREAK_BEFORE_ATTRIBUTE,
  PARAGRAPH_LAYOUT_EXTENSION_NAME,
  PARAGRAPH_LAYOUT_TYPES,
  ParagraphLayout,
  normalizeParagraphLayoutValue,
  paragraphLayoutDeclarations,
  parseLineHeight,
  parseParagraphLayout,
  renderParagraphLayout,
} from './extensions/paragraph-layout';
export {
  AsterHighlight,
  AsterStrike,
  AsterTextStyle,
  AsterUnderline,
  DECORATED_MARK_TYPES,
  DECORATION_STYLES,
  DOCX_RUN_STYLE_ATTRIBUTE,
  RUN_CAPS,
  RUN_LAYOUT_EXTENSION_NAME,
  RunLayout,
  decorationStyleFromShorthand,
  isCaps,
  isDecorationStyle,
  normalizeStyleColors,
  parseCaps,
  parseDecorationStyle,
  type RunCaps,
} from './extensions/run-layout';
export {
  BULLET_ATTRIBUTE,
  DOCX_NUM_ID_ATTRIBUTE,
  DOCX_NUM_INDENT_ATTRIBUTE,
  LIST_LAYOUT_EXTENSION_NAME,
  ListLayout,
} from './extensions/list-layout';
export {
  AsterTable,
  AsterTableCell,
  AsterTableHeader,
  AsterTableView,
  CELL_VERTICAL_ALIGNS,
  MAX_COLSPAN,
  MAX_ROWSPAN,
  TABLE_ALIGNS,
  TABLE_ALIGN_ATTRIBUTE,
  TABLE_OPTIONS,
  cellLayoutDeclarations,
  createTableExtensions,
  isCellPadding,
  isCellVerticalAlign,
  isTableAlign,
  parseCellPadding,
  parseSpan,
  parseTableAlign,
  parseTableWidth,
  tableAlignFallbackStyle,
  tableLayoutDeclarations,
  tableLayoutHtmlAttributes,
  type CellPadding,
  type TableAlign,
} from './extensions/table-layout';
export {
  SUSPICIOUS_SPEC_MESSAGE,
  createRawStyleSerializer,
  renderRawSpec,
  serializeDocumentHtml,
} from './html/serialize-html';
export {
  DEFAULT_PAGE_MARGIN_MM,
  PAGE_FOOTER_CLASS,
  PAGE_HEADER_CLASS,
  PAGE_SIZES_MM,
  PAGE_VIEW_CLASS,
  PAGE_VIEW_CSS_VARIABLES,
  applyPageView,
  pageViewCssValues,
  resolvePageMetrics,
  resolveSectionLayout,
  sanitizeHeaderFooterHtml,
  type PageMetrics,
  type PageViewHandle,
} from './extensions/page-view';
// --- Pagination approximative de la vue page (session 3, L30) -------------
export { PAGE_VIEW_CHANGE_EVENT, getActivePageView } from './extensions/page-view';
export {
  PAGE_COUNT_ATTRIBUTE,
  PAGE_COUNT_CSS_VARIABLE,
  PAGE_GAP_CLASS,
  PAGE_GAP_FILL_CSS_VARIABLE,
  PAGE_GAP_NUMBER_CLASS,
  PAGE_NUMBER_ATTRIBUTE,
  PAGINATION_DEBOUNCE_MS,
  PAGINATION_EXTENSION_NAME,
  Pagination,
  getPaginationResult,
  isPaginationEnabled,
  measureBlocks,
  measurePagination,
  paginateNow,
  paginationPluginKey,
  usablePageHeightPx,
  type MeasuredBlocks,
  type PaginatedPageViewOptions,
  type PaginationOptions,
} from './extensions/pagination';
export {
  EMPTY_PAGINATION,
  MM_TO_PX,
  cssLengthToPx,
  paginate,
  samePagination,
  type PageGap,
  type PaginationResult,
} from './extensions/pagination-layout';
export {
  CSS_BORDER_SIDES,
  LAYOUT_NUMBER_LIMIT,
  borderDeclarations,
  formatBorderValue,
  formatNumber,
  formatPt,
  isBlockBorder,
  isBorderSide,
  isBorderStyle,
  isLayoutNumber,
  joinDeclarations,
  normalizeColor,
  parseBorderValue,
  parsePt,
  parseSideBorders,
  parseStyleDeclarations,
  readStyleProperty,
  roundLayoutNumber,
  sanitizeBorderSpace,
  sanitizeBorders,
  type CssBorderSide,
} from './extensions/layout-css';
export { normalizeOutputHtml } from './html/normalize-output';
export { CONTENT_CLASS } from './editor/aster-editor';
export {
  getMarkdown,
  setMarkdown,
  htmlToMarkdown,
  markdownToHtml,
  escapeHtml,
  parseInline,
  type HtmlParser,
} from './markdown';
export {
  AUTOSAVE_DEFAULT_INTERVAL,
  createAutosave,
  type Autosave,
  type AutosaveOptions,
} from './extensions/autosave';

// --- Variables de document (champs de fusion) ----------------------------
export {
  Variable,
  VariableNodeView,
  renderVariableNodeView,
  VARIABLE_CLASS,
  VARIABLE_EDIT_EVENT,
  VARIABLE_HTML_ATTRIBUTE,
  VARIABLE_INPUT_RULE,
  VARIABLE_LABEL_ATTRIBUTE,
  VARIABLE_RESOLVED_CLASS,
  VARIABLE_SELECTED_CLASS,
  VARIABLE_UNRESOLVED_CLASS,
  type VariableEditEventDetail,
  type VariableOptions,
} from './extensions/variable';
export {
  VARIABLE_COMMANDS,
  findVariableAtSelection,
  type VariableRange,
} from './commands/variables';
export {
  VARIABLE_NODE_NAME,
  canInsertVariable,
  createVariableStore,
  isAsterVariableStore,
  isValidVariableName,
  variableLabel,
  variableName,
  variablePlaceholder,
  variableText,
  type AsterVariableStore,
} from './editor/variable-store';
export {
  VARIABLE_SELECTOR,
  resolveVariablesHtml,
  type HtmlContainerParser,
  type ResolveVariablesOptions,
} from './html/resolve-variables';
