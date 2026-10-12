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
export { normalizeOutputHtml } from './html/normalize-output';
export { CONTENT_CLASS } from './editor/aster-editor';
