import type { AsterCommand, AsterEditor } from '../api';
import { SEARCH_EXTENSION_NAME, type SearchStorage } from '../extensions/search';
import { iconIdFor } from './define';

/** Nom de l'événement DOM émis sur `editor.element` par `search.open` ; `ui` l'écoute pour ouvrir son panneau. */
export const SEARCH_OPEN_EVENT = 'aster:search-open';

/** Détail de l'événement `aster:search-open` : requête demandée, si fournie. */
export interface SearchOpenEventDetail {
  readonly query?: string;
}

/** Arguments des commandes `search.*`. Seule `query` est requise par le contrat, les autres sont optionnelles. */
export interface SearchCommandArgs {
  query: string;
  replacement?: string;
  caseSensitive?: boolean;
}

/** Identifiants des commandes de recherche, enregistrées en plus de `STANDARD_COMMAND_IDS`. */
export const SEARCH_COMMAND_IDS = [
  'search.open',
  'search.next',
  'search.previous',
  'search.replace',
  'search.replaceAll',
  'search.clear',
] as const;

export type SearchCommandId = (typeof SEARCH_COMMAND_IDS)[number];

/** État de recherche d'un éditeur, lu dans le storage Tiptap. */
export function getSearchStorage(editor: AsterEditor): SearchStorage {
  return editor.tiptap.storage[SEARCH_EXTENSION_NAME];
}

/**
 * Lecture tolérante des arguments : les raccourcis et la toolbar appellent `run` sans
 * arguments, le contrat les type pourtant comme requis. On accepte donc `undefined`.
 */
function readArgs(args: unknown): Partial<SearchCommandArgs> {
  return typeof args === 'object' && args !== null ? (args as Partial<SearchCommandArgs>) : {};
}

/** Applique la requête des arguments si elle diffère de la courante. Retourne `false` si Tiptap a refusé. */
function syncQuery(editor: AsterEditor, args: Partial<SearchCommandArgs>): boolean {
  if (args.query === undefined) return true;
  const storage = getSearchStorage(editor);
  const caseSensitive = args.caseSensitive === true;
  if (storage.query === args.query && storage.caseSensitive === caseSensitive) return true;
  return editor.tiptap.commands.setSearchQuery(args.query, { caseSensitive });
}

function hasMatches(editor: AsterEditor): boolean {
  return getSearchStorage(editor).matches.length > 0;
}

function defineSearchCommand(
  id: SearchCommandId,
  spec: Pick<AsterCommand<SearchCommandArgs>, 'run' | 'canRun' | 'isActive'> & {
    shortcut?: string;
  },
): AsterCommand<SearchCommandArgs> {
  const command: AsterCommand<SearchCommandArgs> = {
    id,
    labelKey: `command.${id}`,
    icon: iconIdFor(id),
    run: spec.run,
  };
  if (spec.shortcut) Object.assign(command, { shortcut: spec.shortcut });
  if (spec.canRun) command.canRun = spec.canRun;
  if (spec.isActive) command.isActive = spec.isActive;
  return command;
}

/**
 * Commandes Aster de recherche / remplacement. Elles enveloppent les commandes Tiptap
 * de l'extension `Search` et passent par le registre comme les autres : raccourci,
 * lecture seule et tolérance aux erreurs sont donc gérés uniformément.
 *
 * - `search.open` (`Mod-f`) : avec `query`, lance la recherche ; dans tous les cas émet
 *   `aster:search-open` sur `editor.element` pour que l'UI affiche son panneau.
 * - `search.next` / `search.previous` : naviguent, en appliquant `query` d'abord si fournie.
 * - `search.replace` / `search.replaceAll` : remplacent par `replacement` (vide par défaut).
 * - `search.clear` : efface la requête et les surlignages.
 */
export const SEARCH_COMMANDS: readonly AsterCommand[] = [
  defineSearchCommand('search.open', {
    shortcut: 'Mod-f',
    run: (editor, args) => {
      const parsed = readArgs(args);
      if (!syncQuery(editor, parsed)) return false;
      const detail: SearchOpenEventDetail =
        parsed.query === undefined ? {} : { query: parsed.query };
      editor.element.dispatchEvent(new CustomEvent(SEARCH_OPEN_EVENT, { bubbles: true, detail }));
      return true;
    },
    isActive: (editor) => getSearchStorage(editor).query.length > 0,
  }),
  defineSearchCommand('search.next', {
    run: (editor, args) => syncQuery(editor, readArgs(args)) && editor.tiptap.commands.nextMatch(),
    canRun: (editor, args) => readArgs(args).query !== undefined || hasMatches(editor),
  }),
  defineSearchCommand('search.previous', {
    run: (editor, args) =>
      syncQuery(editor, readArgs(args)) && editor.tiptap.commands.previousMatch(),
    canRun: (editor, args) => readArgs(args).query !== undefined || hasMatches(editor),
  }),
  defineSearchCommand('search.replace', {
    run: (editor, args) => {
      const parsed = readArgs(args);
      return (
        syncQuery(editor, parsed) && editor.tiptap.commands.replaceCurrent(parsed.replacement ?? '')
      );
    },
    canRun: (editor, args) => readArgs(args).query !== undefined || hasMatches(editor),
  }),
  defineSearchCommand('search.replaceAll', {
    run: (editor, args) => {
      const parsed = readArgs(args);
      return (
        syncQuery(editor, parsed) && editor.tiptap.commands.replaceAll(parsed.replacement ?? '')
      );
    },
    canRun: (editor, args) => readArgs(args).query !== undefined || hasMatches(editor),
  }),
  defineSearchCommand('search.clear', {
    run: (editor) => editor.tiptap.commands.clearSearch(),
    canRun: (editor) => getSearchStorage(editor).query.length > 0,
  }),
];
