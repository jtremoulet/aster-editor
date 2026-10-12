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
} from './commands';
export { STANDARD_COMMAND_IDS } from './commands';
export type { AsterCounts, AsterDocument } from './document';
export type { AsterEditor } from './editor';
export type { AsterEventName, AsterEvents, Unsubscribe } from './events';
export type { AsterDictionary, AsterLocale, I18n, TranslateParams } from './i18n';
export type { AsterOptions, LinkPolicy, UploadHandler } from './options';
export type { PasteContext, PasteTransformer } from './paste';
export type {
  AsterTheme,
  ToolbarButtonItem,
  ToolbarConfig,
  ToolbarDropdownItem,
  ToolbarGroup,
  ToolbarItem,
  ToolbarPreset,
  ToolbarWidgetItem,
} from './toolbar';
