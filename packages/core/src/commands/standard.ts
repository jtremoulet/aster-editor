import type { AsterCommand, UploadHandler } from '../api';
import type { ResolvedLinkPolicy } from '../extensions/link-safety';
import { ALIGNMENT_COMMANDS } from './alignment';
import { BLOCK_COMMANDS } from './blocks';
import { HISTORY_COMMANDS } from './history';
import { createImageCommands } from './images';
import { createLinkCommands } from './links';
import { LIST_COMMANDS } from './lists';
import { MARK_COMMANDS } from './marks';
import { SEARCH_COMMANDS } from './search';
import { TABLE_COMMANDS } from './tables';
import { TEXT_STYLE_COMMANDS } from './text-style';

/** Ce dont les commandes standard dépendantes de l'éditeur ont besoin. */
export interface StandardCommandsContext {
  readonly linkPolicy: ResolvedLinkPolicy;
  readonly upload: UploadHandler | undefined;
}

/**
 * Toutes les commandes de `STANDARD_COMMAND_IDS`, dans l'ordre du contrat, suivies
 * des commandes supplémentaires `search.*` (hors contrat figé, mais fournies par le
 * core). Les liens et images sont fabriqués par éditeur puisqu'ils dépendent de sa
 * politique et de son hook d'upload ; le reste est partagé et sans état.
 */
export function createStandardCommands(context: StandardCommandsContext): AsterCommand[] {
  return [
    ...MARK_COMMANDS,
    ...BLOCK_COMMANDS,
    ...LIST_COMMANDS,
    ...ALIGNMENT_COMMANDS,
    ...createLinkCommands(context.linkPolicy),
    ...createImageCommands(context.linkPolicy, context.upload),
    ...TABLE_COMMANDS,
    ...TEXT_STYLE_COMMANDS,
    ...HISTORY_COMMANDS,
    ...SEARCH_COMMANDS,
  ];
}
