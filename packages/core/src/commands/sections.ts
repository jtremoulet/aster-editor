import { NodeSelection, TextSelection, type Transaction } from '@tiptap/pm/state';
import type { AsterCommand, AsterEditor } from '../api';
import {
  SECTION_BREAK_NODE_NAME,
  findSectionBreaks,
  isSectionBreak,
  renumberSections,
  sanitizeSectionNumber,
} from '../extensions/section-break';
import { iconIdFor } from './define';

/** Identifiants des commandes de section, enregistrées en plus de `STANDARD_COMMAND_IDS`. */
export const SECTION_COMMAND_IDS = [
  'section.insertBreak',
  'section.removeBreak',
  'section.renumber',
] as const;

export type SectionCommandId = (typeof SECTION_COMMAND_IDS)[number];

/** Arguments de `section.removeBreak` : numéro du saut à retirer, sinon celui de la sélection. */
export interface RemoveSectionBreakArgs {
  section?: number;
}

/** Lecture tolérante des arguments : la toolbar peut appeler `run` sans arguments. */
function readArgs(args: unknown): RemoveSectionBreakArgs {
  return typeof args === 'object' && args !== null ? (args as RemoveSectionBreakArgs) : {};
}

function defineSectionCommand(
  id: SectionCommandId,
  spec: Pick<AsterCommand, 'run' | 'canRun'>,
): AsterCommand {
  const command: AsterCommand = {
    id,
    labelKey: `command.${id}`,
    icon: iconIdFor(id),
    run: spec.run,
  };
  if (spec.canRun) command.canRun = spec.canRun;
  return command;
}

/**
 * Position de premier niveau juste après le bloc qui contient la sélection : fin du bloc
 * de profondeur 1, ou fin du nœud sélectionné quand la sélection est un nœud de premier
 * niveau.
 */
function afterCurrentBlock(tr: Transaction): number {
  const { selection } = tr;
  const { $from } = selection;
  if ($from.depth === 0) {
    return selection instanceof NodeSelection ? $from.pos + selection.node.nodeSize : $from.pos;
  }
  return $from.after(1);
}

/** Vrai si la sélection est un nœud `sectionBreak`. */
function isSectionBreakSelected(editor: AsterEditor): boolean {
  const { selection } = editor.tiptap.state;
  return selection instanceof NodeSelection && isSectionBreak(selection.node);
}

/**
 * Position du saut visé par `section.removeBreak` : le saut numéro `section` des arguments,
 * sinon le saut sélectionné, sinon le premier saut de premier niveau après le bloc courant
 * (celui qui clôt la section courante), sinon le dernier saut avant (la dernière section
 * n'a pas de saut de fin : on retire celui qui l'ouvre). `null` sans saut.
 */
function targetBreakPos(editor: AsterEditor, args: RemoveSectionBreakArgs): number | null {
  const { state } = editor.tiptap;
  const breaks = findSectionBreaks(state.doc);
  if (breaks.length === 0) {
    return null;
  }
  if (args.section !== undefined) {
    const wanted = sanitizeSectionNumber(args.section);
    return breaks.find(({ node }) => node.attrs['section'] === wanted)?.pos ?? null;
  }
  const { selection } = state;
  if (selection instanceof NodeSelection && isSectionBreak(selection.node)) {
    return selection.from;
  }
  const after = afterCurrentBlock(state.tr);
  const next = breaks.find(({ pos }) => pos >= after);
  if (next) {
    return next.pos;
  }
  const previous = breaks[breaks.length - 1];
  return previous ? previous.pos : null;
}

/**
 * Commandes de section, hors contrat (comme `search.*`) :
 *
 * - `section.insertBreak` : insère un `sectionBreak` après le bloc de premier niveau
 *   courant, numéroté (sauts avant + 1), renumérote les suivants et place le curseur au
 *   début du bloc suivant (un paragraphe est créé s'il n'y en a pas) ;
 * - `section.removeBreak { section? }` : retire un saut (voir `targetBreakPos`) et
 *   renumérote ;
 * - `section.renumber` : renumérote les sauts 1..n dans l'ordre du document ; `false` si
 *   rien ne change.
 *
 * `canRun` est faux en lecture seule (registre) et quand la sélection est elle-même un
 * saut pour `insertBreak` (pas de section vide).
 */
export const SECTION_COMMANDS: readonly AsterCommand[] = [
  defineSectionCommand('section.insertBreak', {
    run: (editor) => {
      if (isSectionBreakSelected(editor)) {
        return false;
      }
      return editor.tiptap
        .chain()
        .focus()
        .command(({ tr, state }) => {
          const type = state.schema.nodes[SECTION_BREAK_NODE_NAME];
          const paragraph = state.schema.nodes['paragraph'];
          if (!type || !paragraph) {
            return false;
          }
          const pos = afterCurrentBlock(tr);
          const before = findSectionBreaks(tr.doc).filter((entry) => entry.pos < pos).length;
          const node = type.create({ section: before + 1 });
          tr.insert(pos, node);
          const afterBreak = pos + node.nodeSize;
          const following = tr.doc.nodeAt(afterBreak);
          if (!following || !following.isTextblock) {
            tr.insert(afterBreak, paragraph.create());
          }
          tr.setSelection(TextSelection.create(tr.doc, afterBreak + 1));
          renumberSections(tr);
          tr.scrollIntoView();
          return true;
        })
        .run();
    },
    canRun: (editor) => !isSectionBreakSelected(editor),
  }),
  defineSectionCommand('section.removeBreak', {
    run: (editor, args) => {
      const pos = targetBreakPos(editor, readArgs(args));
      if (pos === null) {
        return false;
      }
      return editor.tiptap
        .chain()
        .focus()
        .command(({ tr }) => {
          const node = tr.doc.nodeAt(pos);
          if (!node || !isSectionBreak(node)) {
            return false;
          }
          tr.delete(pos, pos + node.nodeSize);
          tr.setSelection(TextSelection.near(tr.doc.resolve(pos), -1));
          renumberSections(tr);
          return true;
        })
        .run();
    },
    canRun: (editor, args) => targetBreakPos(editor, readArgs(args)) !== null,
  }),
  defineSectionCommand('section.renumber', {
    run: (editor) => editor.tiptap.commands.command(({ tr }) => renumberSections(tr)),
    canRun: (editor) => findSectionBreaks(editor.tiptap.state.doc).length > 0,
  }),
];
