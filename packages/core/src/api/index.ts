/**
 * Contrat public du core. Figé en phase 0 : les paquets `ui`, `word` et `angular`
 * codent contre ces types. Toute modification passe par l'orchestrateur.
 */
export type {
  AsterCommand,
  CommandArgs,
  CommandId,
  CommandRegistry,
  CommandRunArgs,
  HeadingLevel,
  StandardCommandArgs,
  StandardCommandId,
} from './commands.js';
export { STANDARD_COMMAND_IDS } from './commands.js';
export type { AsterCounts, AsterDocument } from './document.js';
export type { AsterEditor } from './editor.js';
export type { AsterEventName, AsterEvents, Unsubscribe } from './events.js';
export type { AsterDictionary, AsterLocale, I18n, TranslateParams } from './i18n.js';
export type { AsterOptions, LinkPolicy, UploadHandler } from './options.js';
export type {
  BlockBorder,
  BorderSide,
  BorderStyle,
  CellLayoutAttrs,
  CellVerticalAlign,
  DecorationStyle,
  DefaultFont,
  DefaultParagraph,
  DocumentLayout,
  HeaderFooterContent,
  HeaderFooterSet,
  ListLayoutAttrs,
  OrderedListType,
  PageDimensions,
  PageMargins,
  PageOrientation,
  PageSetup,
  PageSizeName,
  PageViewOptions,
  ParagraphLayoutAttrName,
  ParagraphLayoutAttrs,
  RunLayoutAttrs,
  SectionBreakAttrs,
  SectionLayout,
  SectionStart,
  TabAlign,
  TabAttrs,
  TabLeader,
  TableLook,
  TableLookFlag,
  TableLayoutAttrs,
} from './layout.js';
export { PARAGRAPH_LAYOUT_ATTR_NAMES } from './layout.js';
export type { PasteContext, PasteTransformer } from './paste.js';
export type {
  AsterVariable,
  GetHtmlOptions,
  VariableRenderMode,
  VariableResolver,
  VariableSource,
  VariableStore,
  VariableValues,
} from './variables.js';
export type {
  AsterTheme,
  ToolbarButtonItem,
  ToolbarConfig,
  ToolbarDropdownItem,
  ToolbarGroup,
  ToolbarItem,
  ToolbarPreset,
  ToolbarWidgetItem,
} from './toolbar.js';
export { TABLE_LOOK_FLAGS } from './layout.js';
