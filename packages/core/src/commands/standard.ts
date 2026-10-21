import type { AsterCommand, UploadHandler } from '../api/index.js';
import type { ResolvedLinkPolicy } from '../extensions/link-safety.js';
import { ALIGNMENT_COMMANDS } from './alignment.js';
import { BLOCK_COMMANDS } from './blocks.js';
import { FORMAT_PAINTER_COMMANDS } from './format-painter.js';
import { HISTORY_COMMANDS } from './history.js';
import { createImageCommands } from './images.js';
import { PARAGRAPH_LAYOUT_COMMANDS, TAB_COMMANDS, TEXT_LAYOUT_COMMANDS } from './layout.js';
import { createLinkCommands } from './links.js';
import { LIST_COMMANDS } from './lists.js';
import { MARK_COMMANDS } from './marks.js';
import { SEARCH_COMMANDS } from './search.js';
import { SECTION_COMMANDS } from './sections.js';
import { TABLE_COMMANDS } from './tables.js';
import { TEXT_STYLE_COMMANDS } from './text-style.js';
import { VARIABLE_COMMANDS } from './variables.js';

/** Ce dont les commandes standard dépendantes de l'éditeur ont besoin. */
export interface StandardCommandsContext {
  readonly linkPolicy: ResolvedLinkPolicy;
  readonly upload: UploadHandler | undefined;
}

/**
 * Toutes les commandes de `STANDARD_COMMAND_IDS`, dans l'ordre du contrat, suivies
 * des commandes supplémentaires `search.*`, `formatPainter.*`, `text.*` et `section.*`
 * (hors contrat figé, mais fournies par le core). Les liens et images sont fabriqués par éditeur
 * puisqu'ils dépendent de sa politique et de son hook d'upload ; le reste est partagé
 * et sans état.
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
    ...VARIABLE_COMMANDS,
    ...PARAGRAPH_LAYOUT_COMMANDS,
    ...HISTORY_COMMANDS,
    ...SEARCH_COMMANDS,
    ...FORMAT_PAINTER_COMMANDS,
    ...TEXT_LAYOUT_COMMANDS,
    ...TAB_COMMANDS,
    ...SECTION_COMMANDS,
  ];
}
